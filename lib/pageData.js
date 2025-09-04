import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, jsonLoad, jsonSave, svgNoPoster, saveDeviceCode, loadDeviceCode } from './util.js';
import { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, PAGE_TTL, PROG_TTL, SHOWS_LIMIT_FULL, MOVIES_LIMIT_FULL, MAX_SHOWS_PROGRESS_CALLS, PAGE_CACHE_FILE, HIST_FILE, DATA_DIR } from './config.js';
import { headers as traktHeaders, deviceCode as traktDeviceCode, refreshToken as traktRefreshToken, historyChunk as traktHistoryChunk, enrichShowsWithProgressOptimized, showProgressWatched, userStats, get as traktGet, loadToken as traktTokenLoad, saveToken as traktTokenSave, ensureValidToken, hasValidCredentials } from './trakt.js';
import { sendProgress, sendCompletion, hasActiveConnections } from './progressTracker.js';
import { getCachedMeta } from './tmdb.js';

function mergeShow(agg, item) {
  const show = item.show; if (!show) return;
  const ids  = show.ids || {}; const tid = ids.trakt; if (!tid) return;
  let cur = agg.find(x => x.show?.ids?.trakt === tid);
  if (!cur) { cur = { show, episodes:0, plays:0, last_watched_at:null }; agg.push(cur); }
  cur.episodes += 1;
  cur.plays += 1;
  const wa = item.watched_at || null;
  if (wa && (!cur.last_watched_at || new Date(wa) > new Date(cur.last_watched_at))) cur.last_watched_at = wa;
}
function mergeMovie(agg, item) {
  const movie = item.movie; if (!movie) return;
  const ids  = movie.ids || {}; const tid = ids.trakt; if (!tid) return;
  let cur = agg.find(x => x.movie?.ids?.trakt === tid);
  if (!cur) { cur = { movie, plays:0, last_watched_at:null }; agg.push(cur); }
  cur.plays += 1;
  const wa = item.watched_at || null;
  if (wa && (!cur.last_watched_at || new Date(wa) > new Date(cur.last_watched_at))) cur.last_watched_at = wa;
}

// Convert watched shows data to history format
function convertWatchedToHistoryFormat(watchedShows) {
  console.log(`[pageData] Converting ${watchedShows.length} watched shows to history format`);
  const historyShows = [];
  
  for (const watchedItem of watchedShows) {
    const { show, plays, last_watched_at, seasons } = watchedItem;
    
    if (!show || !show.ids || !show.ids.trakt) {
      continue;
    }
    
    // Calculate total unique episodes watched
    let totalEpisodes = 0;
    if (Array.isArray(seasons)) {
      for (const season of seasons) {
        if (Array.isArray(season.episodes)) {
          totalEpisodes += season.episodes.length; // Each episode in the array = 1 watched episode
        }
      }
    }
    
    // Create the history format entry
    const historyEntry = {
      show,
      episodes: totalEpisodes,
      plays: plays || 0,
      last_watched_at: last_watched_at || null
    };
    
    historyShows.push(historyEntry);
  }
  
  console.log(`[pageData] Converted ${historyShows.length} shows with total episodes count`);
  return historyShows;
}

// Convert watched movies data to history format
function convertWatchedMoviesToHistoryFormat(watchedMovies) {
  console.log(`[pageData] Converting ${watchedMovies.length} watched movies to history format`);
  const historyMovies = [];
  
  for (const watchedItem of watchedMovies) {
    const { movie, plays, last_watched_at } = watchedItem;
    
    if (!movie || !movie.ids || !movie.ids.trakt) {
      continue;
    }
    
    const historyEntry = {
      movie: movie,
      plays: plays || 1,
      last_watched_at: last_watched_at || null
    };
    
    historyMovies.push(historyEntry);
  }
  
  console.log(`[pageData] Converted ${historyMovies.length} movies with plays count`);
  return historyMovies;
}

// Page cache helpers
async function pageCacheLoad() {
  const js = await jsonLoad(PAGE_CACHE_FILE);
  if (!js) return { hit:false };
  const st = await fsp.stat(PAGE_CACHE_FILE).catch(()=>null);
  const age = st ? Math.floor((Date.now()-st.mtimeMs)/1000) : 0;
  if (age > PAGE_TTL) return { hit:false, age };
  return { hit:true, age, data:js };
}
async function pageCacheSave(data) { await jsonSave(PAGE_CACHE_FILE, data); }

/**
 * Invalide le cache de la page pour forcer un refresh
 */
export async function invalidatePageCache() {
  try {
    await fsp.unlink(PAGE_CACHE_FILE);
    console.log('[pageData] invalidated page cache');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[pageData] failed to invalidate page cache:', error.message);
    }
  }
}

/**
 * Met à jour uniquement les données d'une série spécifique dans le cache
 * @param {number} traktId - ID Trakt de la série
 * @param {Object} headers - Headers avec token d'authentification  
 */
export async function updateShowInCache(traktId, headers) {
  try {
    // 1. Charger le cache existant
    const cached = await pageCacheLoad();
    if (!cached.hit || !cached.data) {
      console.log('[pageData] no cache to update, skipping');
      return;
    }
    
    // 2. Trouver la série dans showsRows et showsUnseenRows
    const { showsRows = [], showsUnseenRows = [] } = cached.data;
    const allRows = [...showsRows, ...showsUnseenRows];
    const targetRow = allRows.find(row => row.ids?.trakt === traktId);
    
    if (!targetRow) {
      console.log(`[pageData] show ${traktId} not found in cache, skipping`);
      return;
    }
    
    console.log(`[pageData] updating show ${targetRow.title} in cache`);
    
    // 3. Enrichir uniquement cette série avec les nouvelles données de progression (depuis l'API)
    // Note: invalidateProgressCache est déjà appelé par markEpisodeWatched dans trakt.js
    await enrichShowsWithProgressOptimized([targetRow], { updateMissing: true });
    
    // 4. Sauvegarder le cache modifié
    await pageCacheSave(cached.data);
    console.log(`[pageData] updated cache for show: ${targetRow.title}`);
    
  } catch (error) {
    console.warn('[pageData] failed to update show in cache:', error.message);
    // En cas d'erreur, on peut fallback sur l'invalidation complète
    await invalidatePageCache();
  }
}

// Master cache
async function masterLoad() {
  const js = await jsonLoad(HIST_FILE);
  if (!js) return { last_sync_at:null, shows:[], movies:[] };
  return js;
}
async function masterSave(js) { await jsonSave(HIST_FILE, js); }

export async function buildPageData(req, { forceRefreshOnce=false, allowFull=false } = {}) {
  // Vérifier les credentials Trakt en premier
  if (!hasValidCredentials()) {
    console.log('[pageData] Missing Trakt credentials, skipping data fetch');
    return { 
      devicePrompt: null, 
      cacheHit: false, 
      shows: [], 
      movies: [], 
      stats: null,
      needsSetup: true 
    };
  }


  // IMPORTANT: Vérifier le token AVANT le cache pour détecter les tokens invalides
  let ACCESS_TOKEN = null;
  
  try {
    // Vérifier d'abord le token du fichier 
    const validToken = await ensureValidToken();
    if (validToken?.access_token) {
      ACCESS_TOKEN = validToken.access_token;
      // Mettre à jour la session si elle existe
      if (req.session) {
        req.session.trakt = validToken;
      }
    } else {
      // Fallback sur le token de session
      let sessionTok = req.session?.trakt || null;
      if (!ACCESS_TOKEN && sessionTok?.refresh_token) {
        const ref = await traktRefreshToken(sessionTok.refresh_token, TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET);
        if (ref && ref.access_token) { 
          if (req.session) req.session.trakt = ref; 
          ACCESS_TOKEN = ref.access_token; 
          await traktTokenSave(ref); 
        }
      }
      if (!ACCESS_TOKEN) {
        const saved = await traktTokenLoad();
        if (saved?.access_token) { 
          if (req.session) req.session.trakt = saved; 
          ACCESS_TOKEN = saved.access_token; 
        }
      }
    }
  } catch (tokenError) {
    console.log('[pageData] Token validation failed, needs re-authentication:', tokenError.message);
    
    // Générer un nouveau device code pour permettre la reconnexion
    let devicePrompt = null;
    try {
      // Try to get device_code from session first, then from persistent storage
      let deviceCodeData = req.session.device_code;
      
      if (!deviceCodeData) {
        deviceCodeData = await loadDeviceCode();
        if (deviceCodeData) {
          // Restore to session
          req.session.device_code = deviceCodeData;
        }
      }
      
      // If still no device_code, create a new one
      if (!deviceCodeData) {
        const dc = await traktDeviceCode();
        if (dc?.device_code) {
          deviceCodeData = { ...dc, _client_id:TRAKT_CLIENT_ID, _client_secret:TRAKT_CLIENT_SECRET };
          req.session.device_code = deviceCodeData;
          // Persist to disk
          await saveDeviceCode(deviceCodeData);
        }
      }
      
      if (deviceCodeData) {
        devicePrompt = {
          device_code: deviceCodeData.device_code,
          user_code: deviceCodeData.user_code,
          verification_url: deviceCodeData.verification_url,
          expires_in: deviceCodeData.expires_in,
          interval: deviceCodeData.interval
        };
      }
    } catch (error) {
      console.error('[pageData] Failed to generate device code for re-authentication:', error.message);
    }
    
    return { 
      devicePrompt,
      cacheHit: false, 
      shows: [], 
      movies: [], 
      stats: null,
      needsSetup: false,
      needsAuth: true
    };
  }

  // Si pas de token valide, générer un device code pour la reconnexion
  if (!ACCESS_TOKEN) {
    console.log('[pageData] No valid access token available, generating device code for re-authentication');
    
    // Générer un nouveau device code pour permettre la reconnexion
    let devicePrompt = null;
    try {
      // Try to get device_code from session first, then from persistent storage
      let deviceCodeData = req.session.device_code;
      
      if (!deviceCodeData) {
        deviceCodeData = await loadDeviceCode();
        if (deviceCodeData) {
          // Restore to session
          req.session.device_code = deviceCodeData;
        }
      }
      
      // If still no device_code, create a new one
      if (!deviceCodeData) {
        const dc = await traktDeviceCode();
        if (dc?.device_code) {
          deviceCodeData = { ...dc, _client_id:TRAKT_CLIENT_ID, _client_secret:TRAKT_CLIENT_SECRET };
          req.session.device_code = deviceCodeData;
          // Persist to disk
          await saveDeviceCode(deviceCodeData);
        }
      }
      
      if (deviceCodeData) {
        devicePrompt = {
          device_code: deviceCodeData.device_code,
          user_code: deviceCodeData.user_code,
          verification_url: deviceCodeData.verification_url,
          expires_in: deviceCodeData.expires_in,
          interval: deviceCodeData.interval
        };
      }
    } catch (error) {
      console.error('[pageData] Failed to generate device code for re-authentication:', error.message);
    }
    
    return { 
      devicePrompt,
      cacheHit: false, 
      shows: [], 
      movies: [], 
      stats: null,
      needsSetup: false,
      needsAuth: true
    };
  }

  // Maintenant vérifier le cache APRÈS avoir validé le token
  if (!forceRefreshOnce && ACCESS_TOKEN) {
    const pc = await pageCacheLoad();
    if (pc.hit) return { devicePrompt:null, cacheHit:true, cacheAge:pc.age, ...pc.data };
  }

  // Device flow prompt
  let devicePrompt = null;
  if (!ACCESS_TOKEN) {
    // Try to get device_code from session first, then from persistent storage
    let deviceCodeData = req.session.device_code;
    
    if (!deviceCodeData) {
      deviceCodeData = await loadDeviceCode();
      if (deviceCodeData) {
        // Restore to session
        req.session.device_code = deviceCodeData;
      }
    }
    
    // If still no device_code, create a new one
    if (!deviceCodeData) {
      try {
        const dc = await traktDeviceCode();
        if (dc?.device_code) {
          deviceCodeData = { ...dc, _client_id:TRAKT_CLIENT_ID, _client_secret:TRAKT_CLIENT_SECRET };
          req.session.device_code = deviceCodeData;
          // Persist to disk
          await saveDeviceCode(deviceCodeData);
        }
      } catch (error) {
        console.error('[pageData] Failed to generate device code:', error.message);
        // Return an error state so the frontend can show appropriate message
        return { 
          devicePrompt: null, 
          cacheHit: false, 
          cacheAge: 0, 
          showsRows: [], 
          moviesRows: [], 
          showsUnseenRows: [], 
          moviesUnseenRows: [],
          authError: 'Unable to connect to Trakt. Please check your API credentials.'
        };
      }
    }
    
    devicePrompt = deviceCodeData || null;
    return { devicePrompt, cacheHit:false, cacheAge:0, showsRows:[], moviesRows:[], showsUnseenRows:[], moviesUnseenRows:[] };
  }

  // Wrapper try-catch global pour capturer les erreurs d'authentification
  try {
    const headers = traktHeaders(ACCESS_TOKEN);
    let stats = null;
    try {
      stats = await userStats(headers, 'me');
    } catch { /* noop */ }
  let master = await masterLoad();
  const doFull = allowFull || !master.last_sync_at;

  if (doFull) {
    // FULL
    if (hasActiveConnections()) {
      sendProgress('shows', 'active', 'Récupération de l\'historique des séries...', 10);
    }
    
    // OPTIMIZED: Use /sync/watched/shows instead of historyChunk pagination
    if (hasActiveConnections()) {
      sendProgress('shows', 'active', 'Récupération optimisée des séries...', 10);
    }
    
    console.log('[pageData] OPTIMIZED: Using watched shows data instead of historyChunk');
    const watchedShows = await traktGet('/sync/watched/shows');
    master.shows = convertWatchedToHistoryFormat(watchedShows);
    
    // Calculate maxDate from converted shows
    let maxDate = null;
    for (const show of master.shows) {
      if (show.last_watched_at && (!maxDate || new Date(show.last_watched_at) > new Date(maxDate))) {
        maxDate = show.last_watched_at;
      }
    }
    
    if (hasActiveConnections()) {
      sendProgress('shows', 'active', `Données optimisées: ${master.shows.length} séries`, 25);
    }
    
    if (hasActiveConnections()) {
      sendProgress('shows', 'completed', `${master.shows.length} séries récupérées`, 40);
      sendProgress('movies', 'active', 'Récupération de l\'historique des films...', 40);
    }
    
    // MOVIES - OPTIMIZED: Use watched movies data instead of historyChunk
    console.log('[pageData] OPTIMIZED: Using watched movies data for full sync');
    const watchedMovies = await traktGet('/sync/watched/movies', headers);
    master.movies = convertWatchedMoviesToHistoryFormat(watchedMovies);
    
    // Update maxDate from movies
    for (const movieItem of master.movies) {
      if (movieItem.last_watched_at && (!maxDate || new Date(movieItem.last_watched_at) > new Date(maxDate))) {
        maxDate = movieItem.last_watched_at;
      }
    }
    
    if (hasActiveConnections()) {
      sendProgress('movies', 'active', `Films optimisés: ${master.movies.length} films`, 50);
    }
    
    if (hasActiveConnections()) {
      sendProgress('movies', 'completed', `${master.movies.length} films récupérés`, 60);
    }
    
    master.last_sync_at = maxDate || nowIso();
  } else {
    // INCREMENTAL - OPTIMIZED: Use watched data and filter by date
    const since = master.last_sync_at;
    console.log(`[pageData] OPTIMIZED: Using watched shows data for incremental update since ${since}`);
    
    const watchedShows = await traktGet('/sync/watched/shows');
    const sinceDate = new Date(since);
    let maxDate = new Date(since);
    
    // Filter watched shows that have been updated since the last sync
    const updatedShows = watchedShows.filter(item => {
      const lastWatched = item.last_watched_at || item.last_updated_at;
      return lastWatched && new Date(lastWatched) > sinceDate;
    });
    
    console.log(`[pageData] Found ${updatedShows.length} shows updated since ${since}`);
    
    // Convert and merge updated shows
    const updatedHistoryShows = convertWatchedToHistoryFormat(updatedShows);
    for (const historyShow of updatedHistoryShows) {
      // Remove existing entry if any, then add the updated one
      const existingIndex = master.shows.findIndex(s => s.show?.ids?.trakt === historyShow.show?.ids?.trakt);
      if (existingIndex >= 0) {
        master.shows[existingIndex] = historyShow;
      } else {
        master.shows.push(historyShow);
      }
      
      // Update maxDate
      if (historyShow.last_watched_at && new Date(historyShow.last_watched_at) > maxDate) {
        maxDate = new Date(historyShow.last_watched_at);
      }
    }
    
    // MOVIES - OPTIMIZED: Use watched movies data and filter by date
    console.log(`[pageData] OPTIMIZED: Using watched movies data for incremental update since ${since}`);
    const watchedMovies = await traktGet('/sync/watched/movies', headers);
    
    // Filter movies updated since the last sync date
    const filteredMovies = watchedMovies.filter(watchedItem => {
      return watchedItem.last_watched_at && new Date(watchedItem.last_watched_at) > new Date(since);
    });
    
    console.log(`[pageData] Found ${filteredMovies.length} movies updated since ${since}`);
    const recentMovies = convertWatchedMoviesToHistoryFormat(filteredMovies);
    
    // Merge into existing movies
    for (const movieItem of recentMovies) {
      mergeMovie(master.movies, { movie: movieItem.movie, watched_at: movieItem.last_watched_at });
      if (movieItem.last_watched_at && new Date(movieItem.last_watched_at) > maxDate) {
        maxDate = new Date(movieItem.last_watched_at);
      }
    }
    master.last_sync_at = (maxDate || new Date()).toISOString();
  }

  await masterSave(master);

  // Build rows
  // Comptage exact des épisodes distincts vus par show (comme en PHP)
  const watchedShowsList = await traktGet('/sync/watched/shows', headers);
  const watchedCountByShowId = new Map();
  if (Array.isArray(watchedShowsList)) {
    for (const ws of watchedShowsList) {
      const tid = ws?.show?.ids?.trakt; if (!tid) continue;
      let count = 0;
      if (Array.isArray(ws.seasons)) {
        for (const s of ws.seasons) {
          if (Array.isArray(s.episodes)) count += s.episodes.length; // distincts
        }
      }
      watchedCountByShowId.set(tid, count);
    }
  }
  const showsRows = [];
  const moviesRows = [];
  let PROG_GUARD = 0;

  // shows
  for (const s of master.shows) {
    const sh = s.show || {};
    const ids = sh.ids || {};
    const title = sh.title || '';
    const y     = sh.year || null;
    const slug  = ids.slug || null;
    const tmdbId = ids.tmdb || null;

    const meta = await getCachedMeta(req, 'tv', title, y, tmdbId, 'w342', ids.trakt);
    let episodes_total = null;

    const watched = Number(watchedCountByShowId.get(ids.trakt) || 0);
    const total   = episodes_total != null ? Number(episodes_total) : null;
    const missing = total != null ? Math.max(0, total - watched) : null;

    showsRows.push({
      ids, 
      title, 
      year: y, 
      episodes: watched, 
      episodes_total: total,
      missing, 
      watched_at: s.last_watched_at || null,
      poster: meta.poster || svgNoPoster(), 
      trakt_url: slug ? `https://trakt.tv/shows/${slug}` : null, 
      tmdb_url: meta.tmdbUrl || null,
      overview: meta.overview || null
    });
  }
  if (hasActiveConnections()) {
    sendProgress('progress', 'active', 'Calcul de la progression des séries...', 70);
  }
  
  await enrichShowsWithProgressOptimized(showsRows, { updateMissing: true });
  
  if (hasActiveConnections()) {
    sendProgress('progress', 'completed', 'Progression calculée', 80);
    sendProgress('collection', 'active', 'Finalisation de la collection...', 85);
  }

  // movies
  for (const m of master.movies) {
    const mv = m.movie || {};
    const ids = mv.ids || {};
    const title = mv.title || '';
    const y = mv.year || null;
    const slug  = ids.slug || null;
    const tmdbId = ids.tmdb || null;

    const meta = await getCachedMeta(req, 'movie', title, y, tmdbId, 'w342', ids.trakt);
    
    moviesRows.push({
      ids,
      title, 
      year: y, 
      plays: Number(m.plays||0), 
      watched_at: m.last_watched_at || null,
      poster: meta.poster || svgNoPoster(), 
      trakt_url: slug ? `https://trakt.tv/movies/${slug}` : null, 
      tmdb_url: meta.tmdbUrl || null,
      overview: meta.overview || null
    });
  }

  // Unseen
  const showsUnseenRows = [];
  const moviesUnseenRows = [];

  // Movies in collection but never watched
  {
    const [watMovies, colMovies] = await Promise.all([
      traktGet('/sync/watched/movies', headers),
      traktGet('/sync/collection/movies', headers)
    ]);
    const watchedIds = new Set((Array.isArray(watMovies)?watMovies:[]).map(w => w.movie?.ids?.trakt).filter(Boolean));
    for (const cm of (Array.isArray(colMovies)?colMovies:[])) {
      const mv = cm.movie; if (!mv) continue;
      const tid = mv.ids?.trakt; if (!tid || watchedIds.has(tid)) continue;
      const title = mv.title || ''; const y = mv.year || null; const slug = mv.ids?.slug || null; const tmdbId = mv.ids?.tmdb || null;
      const meta = await getCachedMeta(req, 'movie', title, y, tmdbId, 'w342', tid);
      {
        const collected_at = cm.collected_at || cm.last_collected_at || cm.updated_at || null;
        const collected_at_ts = collected_at ? Date.parse(collected_at) : null;
        moviesUnseenRows.push({
          ids: { trakt: tid },
          title,
          year: y,
          collected_at,
          collected_at_ts, // <— timestamp robuste pour le tri
          poster: meta.poster || svgNoPoster(),
          trakt_url: slug ? `https://trakt.tv/movies/${slug}` : null,
          tmdb_url: meta.tmdbUrl || null,
          overview: meta.overview || null
        });
      }
    }
  }

  // Shows with owned episodes not watched (count seasons[].episodes[])
  {
    const [watShows, colShows] = await Promise.all([
      traktGet('/sync/watched/shows', headers),
      traktGet('/sync/collection/shows', headers)
    ]);

    const watched = new Map();
    for (const ws of (Array.isArray(watShows)?watShows:[])) {
      const tid = ws.show?.ids?.trakt; if (!tid) continue;
      let eps = 0;
      if (Array.isArray(ws.seasons)) {
        for (const s of ws.seasons) {
          if (Array.isArray(s.episodes)) eps += s.episodes.length;
        }
      }
      watched.set(tid, eps);
    }

    for (const cs of (Array.isArray(colShows)?colShows:[])) {
      const sh = cs.show; if (!sh) continue;
      const tid = sh.ids?.trakt; if (!tid) continue;

      let owned = 0;
      if (Array.isArray(cs.seasons)) {
        for (const s of cs.seasons) {
          if (Array.isArray(s.episodes)) owned += s.episodes.length;
        }
      }

      const seen = Number(watched.get(tid) || 0);
      const missing = Math.max(0, owned - seen);
      if (missing <= 0) continue;

      const title = sh.title || ''; const y = sh.year || null; const slug = sh.ids?.slug || null; const tmdbId = sh.ids?.tmdb || null;
      const meta = await getCachedMeta(req, 'tv', title, y, tmdbId, 'w342', tid);
      showsUnseenRows.push({
        ids: { trakt: tid },
        title,
        year:y,
        episodes: seen,
        missing,
        collected_at: cs.last_collected_at || cs.collected_at || cs.updated_at || null,
        poster: meta.poster || svgNoPoster(),
        trakt_url: slug?`https://trakt.tv/shows/${slug}`:null,
        tmdb_url: meta.tmdbUrl || null,
        overview: meta.overview || null
      });
    }
    
    // Enrichir TOUS les shows non vus en une seule fois après la boucle
    if (showsUnseenRows.length > 0) {
      await enrichShowsWithProgressOptimized(showsUnseenRows, { updateMissing: false }); // on garde ton missing (collection - vus), on ne change que total / next
    }
  }

  if (hasActiveConnections()) {
    sendProgress('collection', 'completed', 'Collection finalisée', 95);
    sendProgress('final', 'active', 'Finalisation...', 95);
  }

  const data = { showsRows, moviesRows, showsUnseenRows, moviesUnseenRows, stats };
  await pageCacheSave(data);
  
  if (hasActiveConnections()) {
    sendProgress('final', 'completed', 'Chargement terminé !', 100);
    sendCompletion();
  }
  
  return { devicePrompt:null, cacheHit:false, cacheAge:0, ...data };
  
  } catch (error) {
    // Capturer les erreurs d'authentification et rediriger vers auth
    if (error.message && (
      error.message.includes('No valid authentication token available') ||
      error.message.includes('Unauthorized') ||
      error.message.includes('401') ||
      error.message.includes('Decryption failed')
    )) {
      console.log('[pageData] Authentication error detected, needs re-authentication');
      console.log('[pageData] Auth error:', error.message);
      return { 
        devicePrompt: null,
        cacheHit: false, 
        shows: [], 
        movies: [], 
        stats: null,
        needsSetup: false,
        needsAuth: true  // Flag pour redirection automatique vers auth
      };
    }
    
    // Re-lancer autres erreurs non liées à l'auth
    throw error;
  }
}
