
import path from "node:path";
import fsp from "node:fs/promises";
import Trakt from 'trakt.tv';
import { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TOKEN_FILE, DATA_DIR, OAUTH_REDIRECT_URI } from './config.js';
import { jsonLoad, jsonSave, sleep } from './util.js';
import { loggers } from './logger.js';
import { decryptTraktToken } from './crypto.js'; // Gardé temporairement pour la migration
import { traktRateLimiter } from './rateLimiter.js';
// Ancien système de cache global supprimé - utilisation du cache granulaire
import { updateSpecificCard } from './pageDataNew.js';

// Initialize Trakt client
let trakt = null;

// Initialize Trakt instance with config
function initTraktClient() {
  if (!trakt) {
    // Vérifier que les credentials sont disponibles avant d'initialiser
    if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
      throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
    }
    
    trakt = new Trakt({
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      redirect_uri: OAUTH_REDIRECT_URI
    });
  }
  return trakt;
}

const BATCH_SIZE     = Number(process.env.MAX_SHOWS_PROGRESS_CALLS || 40);   // taille d'un lot
const THROTTLE_MS    = Number(process.env.PROGRESS_THROTTLE_MS || 1200);     // pause entre lots
const PROG_TTL_SECS  = Number(process.env.PROG_TTL_SECS || 6 * 3600);        // fraicheur cache (6h)

// Blacklist temporaire pour les shows qui échouent (réinitialisée au redémarrage)
const FAILED_SHOWS_BLACKLIST = new Set();



// Vérifier si les credentials Trakt sont configurés
export function hasValidCredentials() {
  const valid = !!(TRAKT_CLIENT_ID && TRAKT_CLIENT_SECRET);
  if (!valid) {
    console.error('[trakt] Credentials check failed - ID:', TRAKT_CLIENT_ID ? 'present' : 'MISSING', '- Secret:', TRAKT_CLIENT_SECRET ? 'present' : 'MISSING');
  }
  return valid;
}

export function headers(accessToken='') {
  if (!TRAKT_CLIENT_ID) {
    return null; // Permettre au serveur de gérer la redirection vers setup
  }
  const h = { 'trakt-api-version':'2', 'trakt-api-key': TRAKT_CLIENT_ID };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
  return h;
}

// Set access token in trakt client
export function setTraktAccessToken(accessToken) {
  trakt.import_token({
    access_token: accessToken,
    expires: Date.now() + (24 * 60 * 60 * 1000), // 24h expiry
    refresh_token: null // Will be set when available
  });
}

export async function deviceCode() {
  try {
    if (!hasValidCredentials()) {
      throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
    }
    const traktClient = initTraktClient();
    const response = await traktClient.get_codes();
    return response;
  } catch (error) {
    loggers.logError(error, { operation: 'deviceCode' });
    throw error;
  }
}

export async function deviceToken(code) {
  try {
    if (!hasValidCredentials()) {
      throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
    }
    const traktClient = initTraktClient();
    const response = await traktClient.poll_access({
      device_code: code
    });
    return response;
  } catch (error) {
    loggers.logError(error, { operation: 'deviceToken' });
    return { error: error.message || 'unknown_error' };
  }
}

// OAuth authorization URL generation
export function getOAuthAuthorizeUrl(state = '') {
  if (!hasValidCredentials()) {
    throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TRAKT_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    state: state || ''
  });
  
  return `https://trakt.tv/oauth/authorize?${params.toString()}`;
}

// Exchange OAuth code for access token
export async function exchangeCodeForToken(code) {
  try {
    if (!hasValidCredentials()) {
      throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
    }
    
    const traktClient = initTraktClient();
    const response = await traktClient.exchange_code(code);
    
    if (response && response.access_token) {
      // Import the token to the client for immediate use
      traktClient.import_token(response);
      return response;
    } else {
      throw new Error('Invalid response from token exchange');
    }
  } catch (error) {
    loggers.logError(error, { operation: 'exchangeCodeForToken' });
    throw error;
  }
}

export async function refreshToken(existingToken = null) {
  try {
    if (!hasValidCredentials()) {
      throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
    }
    
    // Charger le token existant si non fourni
    const token = existingToken || await loadToken();
    if (!token?.refresh_token) {
      throw new Error('No refresh token available');
    }
    
    const traktClient = initTraktClient();
    // IMPORTANT: Import du token AVANT d'appeler refresh
    traktClient.import_token(token);
    
    const response = await traktClient.refresh_token();
    return response;
  } catch (error) {
    loggers.logError(error, { operation: 'refreshToken' });
    throw error;
  }
}

// Helper function to make authenticated API calls
async function makeAuthenticatedCall(endpoint, params = {}, method = 'GET', retryOnUnauthorized = true) {
  if (!hasValidCredentials()) {
    throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
  }
  
  let token = await loadToken();
  if (!token?.access_token) {
    throw new Error('No valid authentication token available');
  }
  
  // Utiliser le rate limiter pour exécuter la requête
  return traktRateLimiter.executeWithRateLimit(async () => {
    const traktClient = initTraktClient();
    traktClient.import_token(token);
    
    const startTime = Date.now();
    try {
      let result;
      let fullUrl = endpoint;
      
      if (method === 'GET' && Object.keys(params).length > 0) {
        // Pour les GET, ajouter les paramètres comme query string
        const queryString = new URLSearchParams(params).toString();
        fullUrl = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
      }
      
      if (method === 'GET') {
        result = await traktClient._call({ method: 'GET', url: fullUrl, opts: { auth: true } }, {});
      } else {
        result = await traktClient._call({ method: method, url: fullUrl, opts: { auth: true }, body: params }, {});
      }
      
      const duration = Date.now() - startTime;
      loggers.logApiCall('trakt', method, fullUrl, duration, 200);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle 401 errors by attempting to refresh the token
      if (retryOnUnauthorized && (error.status === 401 || error.statusCode === 401)) {
        console.log('[trakt] Received 401 error, attempting to refresh token...');
        
        try {
          // Try to refresh the token
          if (!token.refresh_token) {
            console.error('[trakt] No refresh token available, user must re-authenticate');
            loggers.logApiCall('trakt', method, endpoint, duration, 401, error);
            throw new Error('Authentication expired - please re-authenticate with Trakt');
          }
          
          const refreshed = await refreshToken(token);
          
          if (refreshed?.access_token) {
            // Ensure created_at is set
            refreshed.created_at = Math.floor(Date.now() / 1000);
            
            // Save the new token
            await saveToken(refreshed);
            console.log('[trakt] Token refreshed successfully, retrying request...');
            
            // Retry the request with the new token (but don't retry again on failure)
            return makeAuthenticatedCall(endpoint, params, method, false);
          } else {
            console.error('[trakt] Failed to refresh token');
            loggers.logApiCall('trakt', method, endpoint, duration, 401, error);
            throw new Error('Failed to refresh authentication - please re-authenticate with Trakt');
          }
        } catch (refreshError) {
          console.error('[trakt] Error during token refresh:', refreshError.message);
          loggers.logApiCall('trakt', method, endpoint, duration, 401, error);
          
          // If refresh fails, the user needs to re-authenticate
          throw new Error('Authentication failed - please re-authenticate with Trakt');
        }
      }
      
      // For non-401 errors, just log and throw
      loggers.logApiCall('trakt', method, endpoint, duration, 0, error);
      throw error;
    }
  }, method);
}

export async function get(endpoint, headersObj) {
  // Ignorer headersObj car l'authentification est gérée automatiquement
  
  // Si l'endpoint contient déjà des query parameters, les séparer
  const [path, queryString] = endpoint.split('?');
  
  if (queryString) {
    // Convertir la query string en objet de paramètres
    const params = Object.fromEntries(new URLSearchParams(queryString));
    return makeAuthenticatedCall(path, params, 'GET');
  } else {
    return makeAuthenticatedCall(endpoint, {}, 'GET');
  }
}

export async function del(endpoint, headersObj) {
  // Ignorer headersObj car l'authentification est gérée automatiquement
  
  // Si l'endpoint contient déjà des query parameters, les séparer
  const [path, queryString] = endpoint.split('?');
  
  if (queryString) {
    // Convertir la query string en objet de paramètres
    const params = Object.fromEntries(new URLSearchParams(queryString));
    return makeAuthenticatedCall(path, params, 'DELETE');
  } else {
    return makeAuthenticatedCall(endpoint, {}, 'DELETE');
  }
}

export async function historyChunk(type, params) {
  try {
    if (!hasValidCredentials()) {
      throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
    }
    
    // Charger le token pour la librairie trakt.tv
    const token = await loadToken();
    if (!token?.access_token) {
      throw new Error('No valid authentication token available');
    }
    
    // Utiliser le rate limiter
    return traktRateLimiter.executeWithRateLimit(async () => {
      const traktClient = initTraktClient();
      traktClient.import_token(token);
      
      // Debug log pour vérifier les paramètres
      console.log(`[historyChunk] Calling /sync/history/${type} with params:`, params);
      
      const startTime = Date.now();
      
      // Utiliser la méthode sync.history.get de la librairie trakt.tv
      // Ajouter le type dans les paramètres
      const historyParams = {
        ...params,
        type: type
      };
      
      const result = await traktClient.sync.history.get(historyParams);
      
      const duration = Date.now() - startTime;
      loggers.logApiCall('trakt', 'GET', `/sync/history/${type}`, duration, 200);
      
      // Debug log pour vérifier la réponse
      console.log(`[historyChunk] Got ${Array.isArray(result) ? result.length : 'non-array'} items`);
      
      return result;
    }, 'GET');
  } catch (error) {
    loggers.logApiCall('trakt', 'GET', `/sync/history/${type}`, 0, 0, error);
    loggers.logError(error, { operation: 'historyChunk', type, params });
    throw error;
  }
}

export async function showProgressWatched(traktId) {
  return get(`/shows/${traktId}/progress/watched?hidden=false&specials=true&count_specials=true`);
}

// Fonction utilitaire partagée pour hydrater une row avec les données de progression
function hydrateRow(row, prog, updateMissing) {
  const aired = Number(prog.aired ?? 0);
  row.episodes_total = aired || row.episodes_total || 0;

  if (updateMissing) {
    const watchedDistinct = Number(row.episodes ?? 0);
    row.missing = Math.max(0, aired - watchedDistinct);
  }
  if (prog.next_episode) {
    const s = String(prog.next_episode.season ?? "");
    const e = String(prog.next_episode.number ?? "");
    row.next = (s && e) ? `S${s.padStart(2,"0")}E${e.padStart(2,"0")}` : (row.next || "");
    // Ajouter les données brutes pour l'API mark-watched
    row.next_episode_data = {
      season: parseInt(s) || null,
      number: parseInt(e) || null,
      trakt_id: row.ids?.trakt || null
    };
  }
}


// Nouvelle fonction optimisée utilisant /sync/watched/shows
export async function enrichShowsWithProgressOptimized(rows, { updateMissing = true, forceRefreshTraktId = null } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("[progress] nothing to enrich");
    return;
  }

  console.log(`[progress] OPTIMIZED: fetching ALL watched shows data in 1 API call for ${rows.length} shows`);
  
  const CACHE_FILE = path.join(DATA_DIR, '.cache_trakt', 'watched_shows_complete.json');
  let watchedShows = null;

  // Vérifier le cache global
  try {
    const st = await fsp.stat(CACHE_FILE).catch(() => null);
    const fresh = st ? ((Date.now() - st.mtimeMs) / 1000) < PROG_TTL_SECS : false;
    
    if (fresh) {
      watchedShows = await jsonLoad(CACHE_FILE).catch(() => null);
      if (watchedShows) {
        console.log(`[progress] using cached watched data (${watchedShows.length} shows)`);
      }
    }
  } catch (error) {
    console.warn('[progress] cache read error:', error.message);
  }

  // Récupérer les données si pas en cache
  if (!watchedShows) {
    try {
      console.log('[progress] fetching fresh watched data from API...');
      watchedShows = await get('/sync/watched/shows');
      
      if (Array.isArray(watchedShows)) {
        console.log(`[progress] fetched ${watchedShows.length} watched shows`);
        // Sauvegarder en cache
        await fsp.mkdir(path.dirname(CACHE_FILE), { recursive: true }).catch(() => {});
        await jsonSave(CACHE_FILE, watchedShows);
        console.log('[progress] cached watched data');
      } else {
        console.warn('[progress] unexpected API response format');
        watchedShows = [];
      }
    } catch (error) {
      console.error('[progress] failed to fetch watched data:', error.message);
      return; // Fallback à l'ancienne méthode si nécessaire
    }
  }

  // Créer un index pour accès rapide par trakt_id
  const watchedIndex = new Map();
  watchedShows.forEach(item => {
    const traktId = item.show?.ids?.trakt;
    if (traktId) {
      watchedIndex.set(traktId, item);
    }
  });

  // Enrichir les séries avec les données de progression
  console.log(`[progress] enriching ${rows.length} shows with watched data`);
  let enriched = 0;
  
  rows.forEach(row => {
    const tid = row?.ids?.trakt || row?.trakt;
    if (!tid) return;

    const watchedData = watchedIndex.get(tid);
    if (watchedData) {
      // Adapter le format de watchedData pour hydrateRow
      const progressData = convertWatchedDataToProgressFormat(watchedData);
      hydrateRow(row, progressData, updateMissing);
      enriched++;
    }
  });

  console.log(`[progress] OPTIMIZED: enriched ${enriched}/${rows.length} shows (${Math.round(enriched/rows.length*100)}%)`);

  // Phase 2: Récupérer les données next_episode pour les séries avec épisodes manquants
  await fetchNextEpisodesForIncompleteSeries(rows, forceRefreshTraktId);
}

// Fonction helper pour convertir les données de /sync/watched/shows au format attendu par hydrateRow
function convertWatchedDataToProgressFormat(watchedData) {
  const seasons = watchedData.seasons || [];
  const totalEpisodes = seasons.reduce((total, season) => total + (season.episodes?.length || 0), 0);
  
  return {
    aired: totalEpisodes,
    completed: totalEpisodes,
    seasons: seasons.map(season => ({
      number: season.number,
      aired: season.episodes?.length || 0,
      completed: season.episodes?.length || 0,
      episodes: (season.episodes || []).map(ep => ({
        number: ep.number,
        completed: true,
        collected: false,
        watched_at: ep.last_watched_at
      }))
    })),
    last_watched_at: watchedData.last_watched_at,
    next_episode: null // Pas disponible dans /sync/watched/shows
  };
}

// Fonction hybride pour récupérer les données next_episode pour les séries incomplètes
async function fetchNextEpisodesForIncompleteSeries(rows, forceRefreshTraktId = null) {
  // Identifier les séries qui pourraient avoir des épisodes suivants
  // Cela inclut : missing > 0 OU séries sans données next_episode OU forceRefreshTraktId
  const incompleteSeries = rows.filter(row => {
    const missing = Number(row.missing || 0);
    const traktId = row.ids?.trakt;
    const hasNextEpisodeData = row.next_episode_data || row.next;
    
    // Récupérer les données si : missing > 0 OU pas encore de données next_episode OU série forcée
    return traktId && (missing > 0 || !hasNextEpisodeData || (forceRefreshTraktId && traktId === forceRefreshTraktId));
  });

  if (incompleteSeries.length === 0) {
    console.log('[progress] HYBRID: No incomplete series found, skipping next_episode fetch');
    return;
  }

  console.log(`[progress] HYBRID: Found ${incompleteSeries.length} incomplete series, fetching next_episode data...`);

  // Cache pour les appels progress
  const CACHE_DIR = path.join(DATA_DIR, '.cache_trakt');
  
  let nextEpisodeFetched = 0;
  
  // Traiter par petits lots pour éviter de surcharger l'API
  for (let i = 0; i < incompleteSeries.length; i += 10) {
    const batch = incompleteSeries.slice(i, i + 10);
    
    await Promise.all(batch.map(async (row) => {
      const traktId = row.ids.trakt;
      const cacheFile = path.join(CACHE_DIR, `progress_${traktId}.json`);
      
      try {
        // Vérifier le cache (TTL 6h)
        let progressData = null;
        try {
          const stat = await fsp.stat(cacheFile);
          const age = (Date.now() - stat.mtimeMs) / 1000;
          if (age < PROG_TTL_SECS) {
            progressData = await jsonLoad(cacheFile);
          }
        } catch (e) {
          // Pas de cache ou erreur, on fera un appel API
        }
        
        if (!progressData) {
          // Appel API pour récupérer next_episode et episodes_total
          const token = await loadToken();
          if (!token?.access_token) {
            console.warn(`[progress] HYBRID: No valid token for show ${traktId}`);
            return;
          }
          
          const traktClient = initTraktClient();
          traktClient.import_token(token);
          
          progressData = await traktClient._call({
            method: 'GET',
            url: `/shows/${traktId}/progress/watched?hidden=false&specials=false&count_specials=false`,
            opts: { auth: true }
          }, {});
          
          if (progressData) {
            // Sauvegarder en cache
            await jsonSave(cacheFile, progressData);
            console.log(`[progress] HYBRID: Cached next_episode data for show ${traktId}`);
          }
        }
        
        if (progressData) {
          // Enrichir avec les données next_episode et episodes_total
          hydrateRow(row, progressData, true);
          nextEpisodeFetched++;
        }
        
      } catch (error) {
        console.warn(`[progress] HYBRID: Failed to fetch next_episode for show ${traktId}:`, error.message);
      }
    }));
    
    // Petit délai entre les lots pour respecter le rate limiting
    if (i + 10 < incompleteSeries.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`[progress] HYBRID: Successfully fetched next_episode data for ${nextEpisodeFetched}/${incompleteSeries.length} incomplete series`);
}

export async function userStats(_, username = 'me') {
  try {
    const stats = await get(`/users/${username}/stats`);
    return stats;
  } catch (error) {
    loggers.logError(error, { operation: 'userStats', username });
    throw error;
  }
}

/**
 * Get last activities from Trakt
 * Useful to check when collections were updated, when episodes were watched, etc.
 * @returns {Promise<Object>} Last activities object with timestamps for each activity type
 */
export async function getLastActivities() {
  try {
    const activities = await get('/sync/last_activities');
    return activities;
  } catch (error) {
    loggers.logError(error, { operation: 'getLastActivities' });
    throw error;
  }
}

/**
 * Get watch history from Trakt with optional filters
 * @param {Object} options - Query options
 * @param {string} options.type - Filter by type: movies, shows, seasons, episodes
 * @param {string} options.itemId - Specific item ID (Trakt ID, slug, or IMDB ID)
 * @param {string} options.startAt - Start date (ISO 8601)
 * @param {string} options.endAt - End date (ISO 8601)
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Results per page, max 100 (default: 10)
 * @returns {Promise<Array>} Array of history items
 */
export async function getHistory(options = {}) {
  try {
    const { type, itemId, startAt, endAt, page = 1, limit = 10 } = options;
    
    // Build endpoint
    let endpoint = '/sync/history';
    if (type) {
      endpoint += `/${type}`;
      if (itemId) {
        endpoint += `/${itemId}`;
      }
    }
    
    // Build query parameters
    const params = new URLSearchParams();
    if (startAt) params.append('start_at', startAt);
    if (endAt) params.append('end_at', endAt);
    params.append('page', page);
    params.append('limit', Math.min(limit, 100));
    
    const queryString = params.toString();
    const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;
    
    const history = await get(fullEndpoint);
    return history;
  } catch (error) {
    loggers.logError(error, { operation: 'getHistory', options });
    throw error;
  }
}

/**
 * Marque un épisode comme vu sur Trakt
 * @param {Object} episode - Objet épisode avec { trakt_id, season, number }
 * @param {Object} headers - Headers avec token d'authentification
 * @returns {Promise<Object>} Réponse de l'API Trakt
 */
export async function markEpisodeWatched(episode) {
  try {
    const body = {
      shows: [{
        ids: { trakt: episode.trakt_id },
        seasons: [{
          number: episode.season,
          episodes: [{
            number: episode.number,
            watched_at: new Date().toISOString()
          }]
        }]
      }]
    };
    
    const result = await makeAuthenticatedCall('/sync/history', body, 'POST');
    
    // Si succès, utiliser le nouveau système granulaire
    if (result?.added?.episodes > 0) {
      const showTraktId = episode.trakt_id;
      if (showTraktId) {
        try {
          // Nouveau système : mettre à jour seulement cette série
          await updateSpecificCard('show', showTraktId, headers);
          console.log(`[trakt] Granular cache updated for show ${showTraktId} after marking S${episode.season}E${episode.number}`);
        } catch (error) {
          console.warn(`[trakt] Granular cache update failed for show ${showTraktId}:`, error.message);
          // Fallback minimal : invalider seulement cette série
          await invalidateProgressCache(showTraktId);
        }
      } else {
        console.warn(`[trakt] No show trakt ID available for mark operation`);
      }
    }
    
    return result;
  } catch (error) {
    loggers.logError(error, { operation: 'markEpisodeWatched', episode });
    throw error;
  }
}

export async function removeEpisodeFromHistory(episode) {
  try {
    const body = {
      shows: [{
        ids: { trakt: episode.trakt_id },
        seasons: [{
          number: episode.season,
          episodes: [{
            number: episode.number
          }]
        }]
      }]
    };
    
    const result = await makeAuthenticatedCall('/sync/history/remove', body, 'POST');
    
    // Si succès, utiliser le nouveau système granulaire
    if (result?.deleted?.episodes > 0) {
      const showTraktId = episode.trakt_id;
      if (showTraktId) {
        try {
          // Nouveau système : mettre à jour seulement cette série
          await updateSpecificCard('show', showTraktId, headers);
          console.log(`[trakt] Granular cache updated for show ${showTraktId} after unmarking S${episode.season}E${episode.number}`);
        } catch (error) {
          console.warn(`[trakt] Granular cache update failed for show ${showTraktId}:`, error.message);
          // Fallback minimal : invalider seulement cette série
          await invalidateProgressCache(showTraktId);
          try {
            await forceRefreshProgressCache(showTraktId);
          } catch (refreshError) {
            console.warn(`[progress] Failed to force refresh after unmark:`, refreshError.message);
          }
        }
      } else {
        console.warn(`[trakt] No show trakt ID available for unmark operation`);
      }
    }
    
    return result;
  } catch (error) {
    loggers.logError(error, { operation: 'removeEpisodeFromHistory', episode });
    throw error;
  }
}

export async function markMovieWatched(movie) {
  try {
    const body = {
      movies: [{
        ids: { trakt: movie.trakt_id },
        watched_at: new Date().toISOString()
      }]
    };
    
    const result = await makeAuthenticatedCall('/sync/history', body, 'POST');
    
    return result;
  } catch (error) {
    loggers.logError(error, { operation: 'markMovieWatched', movie });
    throw error;
  }
}

/**
 * Invalide le cache global de progression pour toutes les séries
 * @param {number} traktId - ID Trakt de la série (optionnel, pour l'API backwards compatibility)
 */
export async function invalidateProgressCache(traktId) {
  const CACHE_DIR = path.join(DATA_DIR, '.cache_trakt');
  
  // Invalider le cache global watched_shows
  try {
    const cacheFile = path.join(CACHE_DIR, 'watched_shows_complete.json');
    await fsp.unlink(cacheFile);
    console.log(`[progress] invalidated global watched cache ${traktId ? 'for show ' + traktId : ''}`);
  } catch (error) {
    // Ignore l'erreur si le fichier n'existe pas
    if (error.code !== 'ENOENT') {
      console.warn(`[progress] failed to invalidate watched cache:`, error.message);
    }
  }
  
  // Si un traktId est fourni, invalider aussi le cache individuel de progression
  if (traktId) {
    try {
      const progressFile = path.join(CACHE_DIR, `progress_${traktId}.json`);
      await fsp.unlink(progressFile);
      console.log(`[progress] invalidated individual progress cache for show ${traktId}`);
    } catch (error) {
      // Ignore l'erreur si le fichier n'existe pas
      if (error.code !== 'ENOENT') {
        console.warn(`[progress] failed to invalidate progress cache for show ${traktId}:`, error.message);
      }
    }
  }
}

/**
 * Force la récupération des données de progression pour une série spécifique
 * Utilisé après unmark pour s'assurer que les données next_episode sont recalculées
 */
export async function forceRefreshProgressCache(traktId) {
  const CACHE_DIR = path.join(DATA_DIR, '.cache_trakt');
  const cacheFile = path.join(CACHE_DIR, `progress_${traktId}.json`);
  
  try {
    console.log(`[progress] Force refreshing progress cache for show ${traktId}`);
    
    const token = await loadToken();
    if (!token) {
      throw new Error('No authentication token');
    }
    
    // Appel direct à l'API progress/watched pour cette série
    const progressData = await showProgressWatched(traktId);
    
    if (progressData) {
      // Sauvegarder en cache
      await fsp.mkdir(path.dirname(cacheFile), { recursive: true }).catch(() => {});
      await jsonSave(cacheFile, progressData);
      console.log(`[progress] Cached fresh progress data for show ${traktId}`);
      return progressData;
    }
  } catch (error) {
    console.error(`[progress] Failed to force refresh progress for show ${traktId}:`, error.message);
    throw error;
  }
}

/**
 * Met à jour intelligemment le cache après avoir marqué un épisode comme vu
 */
export async function updateCacheAfterMarkWatched(traktId, season, number) {
  const CACHE_DIR = path.join(DATA_DIR, '.cache_trakt');
  const HISTORY_CACHE = path.join(CACHE_DIR, 'trakt_history_cache.json');
  const WATCHED_CACHE = path.join(CACHE_DIR, 'watched_shows_complete.json');
  
  try {
    // 1. Mettre à jour le cache watched_shows_complete
    const watchedData = await jsonLoad(WATCHED_CACHE).catch(() => null);
    if (watchedData && Array.isArray(watchedData)) {
      const show = watchedData.find(s => s.show?.ids?.trakt === traktId);
      if (show) {
        // Trouver ou créer la saison
        let seasonData = show.seasons?.find(s => s.number === season);
        if (!seasonData) {
          seasonData = { number: season, episodes: [] };
          if (!show.seasons) show.seasons = [];
          show.seasons.push(seasonData);
        }
        
        // Ajouter ou mettre à jour l'épisode
        let episodeData = seasonData.episodes.find(e => e.number === number);
        if (!episodeData) {
          episodeData = { number, plays: 1, last_watched_at: new Date().toISOString() };
          seasonData.episodes.push(episodeData);
        } else {
          episodeData.plays = (episodeData.plays || 0) + 1;
          episodeData.last_watched_at = new Date().toISOString();
        }
        
        // Mettre à jour les compteurs globaux
        show.plays = (show.plays || 0) + 1;
        show.last_watched_at = new Date().toISOString();
        
        await jsonSave(WATCHED_CACHE, watchedData);
      }
    }
    
    // 2. Mettre à jour le cache history
    const historyData = await jsonLoad(HISTORY_CACHE).catch(() => null);
    if (historyData) {
      // Trouver la série dans showsRows
      const showRow = historyData.showsRows?.find(s => s.ids?.trakt === traktId);
      if (showRow) {
        // Incrémenter le nombre d'épisodes vus
        showRow.episodes = (showRow.episodes || 0) + 1;
        
        // Recalculer missing
        if (showRow.episodes_total) {
          showRow.missing = Math.max(0, showRow.episodes_total - showRow.episodes);
        }
        
        // Mettre à jour le next episode
        if (showRow.next_episode_data && 
            showRow.next_episode_data.season === season && 
            showRow.next_episode_data.number === number) {
          // C'était le prochain épisode, passer au suivant
          showRow.next_episode_data.number = number + 1;
          showRow.next = `S${String(season).padStart(2,'0')}E${String(number + 1).padStart(2,'0')}`;
          
          // Si on a atteint le total, supprimer next
          if (showRow.missing <= 0) {
            delete showRow.next_episode_data;
            delete showRow.next;
          }
        }
        
        await jsonSave(HISTORY_CACHE, historyData);
      }
    }
    
    // 3. Plus besoin d'invalider le cache global - système granulaire
    console.log('[cache] Granular cache system used - no global invalidation needed');
    
  } catch (error) {
    console.error(`[cache] Failed to update cache after mark watched:`, error.message);
    // En cas d'erreur, invalider seulement le cache de progression de cette série
    await invalidateProgressCache(traktId);
    console.log('[cache] Using granular fallback - no global invalidation');
  }
}

/**
 * Met à jour intelligemment le cache après avoir retiré un épisode de l'historique
 */
export async function updateCacheAfterUnmarkWatched(traktId, season, number) {
  const CACHE_DIR = path.join(DATA_DIR, '.cache_trakt');
  const HISTORY_CACHE = path.join(CACHE_DIR, 'trakt_history_cache.json');
  const WATCHED_CACHE = path.join(CACHE_DIR, 'watched_shows_complete.json');
  
  try {
    // 1. Mettre à jour le cache watched_shows_complete
    const watchedData = await jsonLoad(WATCHED_CACHE).catch(() => null);
    if (watchedData && Array.isArray(watchedData)) {
      const show = watchedData.find(s => s.show?.ids?.trakt === traktId);
      if (show) {
        const seasonData = show.seasons?.find(s => s.number === season);
        if (seasonData) {
          const episodeIndex = seasonData.episodes.findIndex(e => e.number === number);
          if (episodeIndex >= 0) {
            const episode = seasonData.episodes[episodeIndex];
            if (episode.plays > 1) {
              episode.plays--;
            } else {
              // Supprimer l'épisode s'il n'a qu'un seul visionnage
              seasonData.episodes.splice(episodeIndex, 1);
            }
            
            // Mettre à jour les compteurs globaux
            show.plays = Math.max(0, (show.plays || 0) - 1);
          }
        }
        
        await jsonSave(WATCHED_CACHE, watchedData);
      }
    }
    
    // 2. Mettre à jour le cache history
    const historyData = await jsonLoad(HISTORY_CACHE).catch(() => null);
    if (historyData) {
      const showRow = historyData.showsRows?.find(s => s.ids?.trakt === traktId);
      if (showRow) {
        // Décrémenter le nombre d'épisodes vus
        showRow.episodes = Math.max(0, (showRow.episodes || 0) - 1);
        
        // Recalculer missing
        if (showRow.episodes_total) {
          showRow.missing = Math.max(0, showRow.episodes_total - showRow.episodes);
        }
        
        // Mettre à jour le next episode si nécessaire
        if (!showRow.next_episode_data || 
            (showRow.next_episode_data.season > season) ||
            (showRow.next_episode_data.season === season && showRow.next_episode_data.number > number)) {
          // L'épisode retiré devient le nouveau next
          showRow.next_episode_data = {
            season: season,
            number: number,
            trakt_id: traktId
          };
          showRow.next = `S${String(season).padStart(2,'0')}E${String(number).padStart(2,'0')}`;
        }
        
        await jsonSave(HISTORY_CACHE, historyData);
      }
    }
    
    // 3. Plus besoin d'invalider le cache global - système granulaire
    console.log('[cache] Granular cache system used - no global invalidation needed');
    
  } catch (error) {
    console.error(`[cache] Failed to update cache after unmark watched:`, error.message);
    // En cas d'erreur, invalider seulement le cache de progression de cette série
    await invalidateProgressCache(traktId);
    console.log('[cache] Using granular fallback - no global invalidation');
  }
}

export async function loadToken() { 
  try {
    const tokenData = await jsonLoad(TOKEN_FILE);
    
    if (!tokenData) {
      console.log('[trakt] loadToken: No token file found or file is empty');
      return null;
    }
    
    // Support pour l'ancien format chiffré (migration automatique)
    if (tokenData && tokenData.encrypted) {
      console.log('[trakt] Migrating from encrypted token format to plain text');
      try {
        const decrypted = decryptTraktToken(tokenData.encrypted);
        // Sauvegarder immédiatement au nouveau format non chiffré
        await jsonSave(TOKEN_FILE, decrypted);
        console.log('[trakt] Successfully migrated encrypted token to plain text');
        return decrypted;
      } catch (decryptError) {
        console.warn('[trakt] Failed to decrypt old token, deleting corrupted file');
        // Supprimer le fichier token corrompu pour permettre une nouvelle authentification
        try {
          await jsonSave(TOKEN_FILE, null);
        } catch (deleteError) {
          console.error('[trakt] Failed to delete corrupted token file:', deleteError.message);
        }
        return null;
      }
    }
    
    return tokenData;
    
  } catch (error) {
    loggers.logError(error, { operation: 'loadToken' });
    return null;
  }
}

export async function saveToken(tok) { 
  try {
    if (!tok) {
      console.warn('[trakt] saveToken called with null/undefined token - DELETING TOKEN FILE');
      console.trace('[trakt] Stack trace for token deletion:');
      // Révoquer le token dans la librairie aussi
      try {
        const traktClient = initTraktClient();
        await traktClient.revoke_token();
      } catch {}
      return jsonSave(TOKEN_FILE, null);
    }
    
    // Log détaillé pour tracer les sauvegardes
    console.log('[trakt] Saving token:', {
      has_access_token: !!tok.access_token,
      has_refresh_token: !!tok.refresh_token,
      expires_in: tok.expires_in,
      created_at: tok.created_at
    });
    return jsonSave(TOKEN_FILE, tok);
    
  } catch (error) {
    loggers.logError(error, { operation: 'saveToken' });
    throw error;
  }
}

export async function ensureValidToken(forceRefresh = false) {
  const token = await loadToken();
  if (!token?.access_token) {
    console.warn('[trakt] No access token found');
    return null;
  }

  // Test if token works WITHOUT causing recursive loop
  // Directly call Trakt API without using our get() function
  try {
    if (!hasValidCredentials()) {
      throw new Error('Missing Trakt credentials');
    }
    
    const traktClient = initTraktClient();
    traktClient.import_token(token);
    
    // Direct API call to avoid recursion
    await traktClient._call({ 
      method: 'GET', 
      url: '/users/settings', 
      opts: { auth: true } 
    }, {});
    
    console.log('[trakt] Token is valid and working');
  } catch (error) {
    if (error.status === 401 || error.statusCode === 401) {
      console.log('[trakt] Token is invalid (401), attempting to refresh...');
      
      // Try to refresh the token instead of failing immediately
      if (token.refresh_token) {
        try {
          const refreshed = await refreshToken(token);
          
          if (refreshed?.access_token) {
            // Ensure created_at is set
            refreshed.created_at = Math.floor(Date.now() / 1000);
            
            // Save refreshed token
            await saveToken(refreshed);
            console.log('[trakt] Token refreshed successfully after 401');
            return refreshed;
          }
        } catch (refreshError) {
          console.error('[trakt] Failed to refresh token after 401:', refreshError.message);
        }
      }
      
      console.error('[trakt] Token is invalid and cannot be refreshed - user must re-authenticate');
      throw new Error('Invalid authentication token - please re-authenticate');
    }
    // For other errors, continue with expiration checks
    console.warn('[trakt] Token validation test failed with:', error.message);
  }

  // Calculate expiration
  const now = Math.floor(Date.now() / 1000);
  const createdAt = token.created_at || now;
  const expiresIn = token.expires_in || (7776000); // Default 90 days for Trakt
  const expiresAt = createdAt + expiresIn;
  const refreshThreshold = 3600; // 1 hour before expiration
  const timeUntilExpiry = expiresAt - now;
  
  // Log token status
  console.log(`[trakt] Token status: expires in ${Math.floor(timeUntilExpiry / 3600)} hours (${Math.floor(timeUntilExpiry / 86400)} days)`);
  
  // Check if we need to refresh
  if (!forceRefresh && timeUntilExpiry > refreshThreshold) {
    // Token still valid
    return token;
  }

  // Token needs refresh
  if (!token.refresh_token) {
    console.error('[trakt] Token expires soon but no refresh_token available!');
    console.error('[trakt] User needs to re-authenticate with Trakt');
    throw new Error('No refresh token available - user must re-authenticate');
  }

  console.log('[trakt] Token refresh needed, refreshing now...');
  try {
    // Passer le token existant à refreshToken
    const refreshed = await refreshToken(token);
    
    if (refreshed?.access_token) {
      // Ensure created_at is set
      refreshed.created_at = Math.floor(Date.now() / 1000);
      
      // Save refreshed token
      await saveToken(refreshed);
      console.log('[trakt] Token refreshed successfully, new expiry in', refreshed.expires_in, 'seconds');
      
      return refreshed;
    } else {
      console.error('[trakt] Failed to refresh token, response:', refreshed);
      throw new Error('Failed to refresh token - user must re-authenticate');
    }
  } catch (error) {
    console.error('[trakt] Error refreshing token:', error.message || error);
    
    // If refresh fails due to invalid refresh token, inform user
    if (error.message?.includes('invalid') || error.message?.includes('expired')) {
      console.error('[trakt] Refresh token is invalid or expired - user must re-authenticate');
    }
    
    throw new Error('Token refresh failed - user must re-authenticate');
  }
}