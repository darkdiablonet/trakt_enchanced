import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, jsonLoad, jsonSave, svgNoPoster, saveDeviceCode, loadDeviceCode } from './util.js';
import { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, PAGE_TTL, PROG_TTL, SHOWS_LIMIT_FULL, MOVIES_LIMIT_FULL, MAX_SHOWS_PROGRESS_CALLS, PAGE_CACHE_FILE, HIST_FILE } from './config.js';
import { headers as traktHeaders, deviceCode as traktDeviceCode, refreshToken as traktRefreshToken, historyChunk as traktHistoryChunk, enrichShowsWithProgress, showProgressWatched, userStats,  get as traktGet, loadToken as traktTokenLoad, saveToken as traktTokenSave, ensureValidToken, hasValidCredentials } from './trakt.js';
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
    
    // 3. Enrichir uniquement cette série avec les nouvelles données de progression
    await enrichShowsWithProgress([targetRow], headers, { updateMissing: true });
    
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

  if (!forceRefreshOnce) {
    const pc = await pageCacheLoad();
    if (pc.hit) return { devicePrompt:null, cacheHit:true, cacheAge:pc.age, ...pc.data };
  }

  // Access token avec vérification automatique de validité
  let sessionTok = req.session?.trakt || null;
  let ACCESS_TOKEN = sessionTok?.access_token || null;

  // Prioriser le token du fichier et s'assurer qu'il est valide
  const validToken = await ensureValidToken();
  if (validToken?.access_token) {
    ACCESS_TOKEN = validToken.access_token;
    // Mettre à jour la session si elle existe
    if (req.session) {
      req.session.trakt = validToken;
    }
  } else {
    // Fallback sur l'ancien système si ensureValidToken() échoue
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
    
    let page=1, fetched=0, maxDate=null;
    master.shows = [];
    while (fetched < SHOWS_LIMIT_FULL) {
      const limit = Math.min(100, SHOWS_LIMIT_FULL - fetched);
      const chunk = await traktHistoryChunk('shows', { page, limit }, headers);
      if (!Array.isArray(chunk) || chunk.length===0) break;
      for (const it of chunk) { mergeShow(master.shows, it); const wa = it.watched_at || null; if (wa && (!maxDate || new Date(wa) > new Date(maxDate))) maxDate = wa; }
      const got = chunk.length; fetched += got; if (got < limit) break; page++;
      
      if (hasActiveConnections()) {
        const progress = 10 + (fetched / SHOWS_LIMIT_FULL) * 30;
        sendProgress('shows', 'active', `Récupération des séries (${fetched}/${SHOWS_LIMIT_FULL})`, progress);
      }
    }
    
    if (hasActiveConnections()) {
      sendProgress('shows', 'completed', `${master.shows.length} séries récupérées`, 40);
      sendProgress('movies', 'active', 'Récupération de l\'historique des films...', 40);
    }
    
    page=1; fetched=0;
    master.movies = [];
    while (fetched < MOVIES_LIMIT_FULL) {
      const limit = Math.min(100, MOVIES_LIMIT_FULL - fetched);
      const chunk = await traktHistoryChunk('movies', { page, limit }, headers);
      if (!Array.isArray(chunk) || chunk.length===0) break;
      for (const it of chunk) { mergeMovie(master.movies, it); const wa = it.watched_at || null; if (wa && (!maxDate || new Date(wa) > new Date(maxDate))) maxDate = wa; }
      const got = chunk.length; fetched += got; if (got < limit) break; page++;
      
      if (hasActiveConnections()) {
        const progress = 40 + (fetched / MOVIES_LIMIT_FULL) * 20;
        sendProgress('movies', 'active', `Récupération des films (${fetched}/${MOVIES_LIMIT_FULL})`, progress);
      }
    }
    
    if (hasActiveConnections()) {
      sendProgress('movies', 'completed', `${master.movies.length} films récupérés`, 60);
    }
    
    master.last_sync_at = maxDate || nowIso();
  } else {
    // INCREMENTAL
    const since = master.last_sync_at;
    let page=1, maxDate=new Date(since);
    while (true) {
      const limit = 100;
      const chunk = await traktHistoryChunk('shows', { page, limit, start_at: since }, headers);
      if (!Array.isArray(chunk) || chunk.length===0) break;
      for (const it of chunk) { mergeShow(master.shows, it); const wa = it.watched_at || null; if (wa && new Date(wa) > maxDate) maxDate = new Date(wa); }
      if (chunk.length < limit) break; page++;
    }
    page=1;
    while (true) {
      const limit = 100;
      const chunk = await traktHistoryChunk('movies', { page, limit, start_at: since }, headers);
      if (!Array.isArray(chunk) || chunk.length===0) break;
      for (const it of chunk) { mergeMovie(master.movies, it); const wa = it.watched_at || null; if (wa && new Date(wa) > maxDate) maxDate = new Date(wa); }
      if (chunk.length < limit) break; page++;
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
  const PROG_DIR = path.join(path.dirname(HIST_FILE), 'progress');
  await fsp.mkdir(PROG_DIR, { recursive: true });
  let PROG_GUARD = 0;

  // shows
  for (const s of master.shows) {
    const sh = s.show || {};
    const ids = sh.ids || {};
    const title = sh.title || '';
    const y     = sh.year || null;
    const slug  = ids.slug || null;
    const tmdbId = ids.tmdb || null;

    const meta = await getCachedMeta(req, 'tv', title, y, tmdbId, 'w342');
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
  
  await enrichShowsWithProgress(showsRows, headers, { updateMissing: true });
  
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

    const meta = await getCachedMeta(req, 'movie', title, y, tmdbId, 'w342');
    
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
      const meta = await getCachedMeta(req, 'movie', title, y, tmdbId, 'w342');
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
      const meta = await getCachedMeta(req, 'tv', title, y, tmdbId, 'w342');
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
      await enrichShowsWithProgress(showsUnseenRows, headers, { updateMissing: false }); // on garde ton missing (collection - vus), on ne change que total / next
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
}
