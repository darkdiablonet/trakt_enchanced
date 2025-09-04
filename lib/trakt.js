
import path from "node:path";
import fsp from "node:fs/promises";
import Trakt from 'trakt.tv';
import { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TOKEN_FILE } from './config.js';
import { jsonLoad, jsonSave, sleep } from './util.js';
import { loggers } from './logger.js';
import { decryptTraktToken } from './crypto.js'; // Gardé temporairement pour la migration

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
      redirect_uri: null // Using device flow
    });
  }
  return trakt;
}

const BATCH_SIZE     = Number(process.env.MAX_SHOWS_PROGRESS_CALLS || 40);   // taille d’un lot
const THROTTLE_MS    = Number(process.env.PROGRESS_THROTTLE_MS || 1200);     // pause entre lots
const PROG_TTL_SECS  = Number(process.env.PROG_TTL_SECS || 6 * 3600);        // fraicheur cache (6h)
const PROG_DIR       = process.env.PROG_DIR || path.join(process.cwd(), "data", ".cache_trakt", "progress");



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
    throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
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

export async function refreshToken() {
  try {
    if (!hasValidCredentials()) {
      throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
    }
    const traktClient = initTraktClient();
    const response = await traktClient.refresh_token();
    return response;
  } catch (error) {
    loggers.logError(error, { operation: 'refreshToken' });
    throw error;
  }
}

// Helper function to make authenticated API calls
async function makeAuthenticatedCall(endpoint, params = {}, method = 'GET') {
  if (!hasValidCredentials()) {
    throw new Error('Missing Trakt credentials. Please configure TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.');
  }
  
  const token = await loadToken();
  if (!token?.access_token) {
    throw new Error('No valid authentication token available');
  }
  
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
    loggers.logApiCall('trakt', method, endpoint, duration, 0, error);
    throw error;
  }
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
  } catch (error) {
    const duration = Date.now() - Date.now();
    loggers.logApiCall('trakt', 'GET', `/sync/history/${type}`, duration, 0, error);
    loggers.logError(error, { operation: 'historyChunk', type, params });
    throw error;
  }
}

export async function showProgressWatched(traktId) {
  return get(`/shows/${traktId}/progress/watched?hidden=false&specials=true&count_specials=true`);
}

export async function enrichShowsWithProgress(rows, headers, { updateMissing = true } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("[progress] nothing to enrich");
    return;
  }
  await fsp.mkdir(PROG_DIR, { recursive: true }).catch(()=>{});
  console.log("[progress] dir ->", PROG_DIR);
  console.log(`[progress] start enrich: total ${rows.length}`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    console.log(`[progress] chunk ${i + 1}..${Math.min(i + chunk.length, rows.length)} / ${rows.length}`);

    await Promise.all(chunk.map(async (row) => {
      const tid = row?.ids?.trakt || row?.trakt;
      if (!tid) {
        if (row?.title) console.log("[progress] skip (no trakt id):", row.title);
        return;
      }

      const cacheFile = path.join(PROG_DIR, `watched_${tid}.json`);
      let prog = null;

      // 1) cache si frais
      const st = await fsp.stat(cacheFile).catch(()=>null);
      const fresh = st ? ((Date.now() - st.mtimeMs) / 1000) < PROG_TTL_SECS : false;
      if (fresh) {
        prog = await jsonLoad(cacheFile).catch(()=>null);
        if (prog) return hydrateRow(row, prog, updateMissing);
      }

      // 2) API Trakt via trakt.tv library
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          prog = await get(`/shows/${tid}/progress/watched?hidden=false&specials=false&count_specials=false`);
          if (prog) {
            await jsonSave(cacheFile, prog);
            console.log("[progress] wrote", path.basename(cacheFile));
          }
          break;
        } catch (e) {
          lastErr = e;
          console.warn(`[progress] fetch error tid=${tid} (attempt ${attempt+1}/3):`, e?.status || e?.code || e?.message || e);
          await sleep(e?.status === 429 ? 1000 * (attempt + 1) : 250);
        }
      }
      if (!prog) {
        console.warn("[progress] FAILED after retries tid=", tid, "lastErr=", lastErr?.message || lastErr);
        return;
      }

      hydrateRow(row, prog, updateMissing);
    }));

    if (i + BATCH_SIZE < rows.length) await sleep(THROTTLE_MS);
  }

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
    
    // Si succès, invalider le cache de progression pour cette série
    if (result?.added?.episodes > 0) {
      await invalidateProgressCache(episode.trakt_id);
    }
    
    return result;
  } catch (error) {
    loggers.logError(error, { operation: 'markEpisodeWatched', episode });
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
 * Invalide le cache de progression pour une série spécifique
 * @param {number} traktId - ID Trakt de la série
 */
export async function invalidateProgressCache(traktId) {
  if (!traktId) return;
  
  try {
    const cacheFile = path.join(PROG_DIR, `watched_${traktId}.json`);
    await fsp.unlink(cacheFile);
    console.log(`[progress] invalidated cache for show ${traktId}`);
  } catch (error) {
    // Ignore l'erreur si le fichier n'existe pas
    if (error.code !== 'ENOENT') {
      console.warn(`[progress] failed to invalidate cache for show ${traktId}:`, error.message);
    }
  }
}

export async function loadToken() { 
  try {
    const tokenData = await jsonLoad(TOKEN_FILE);
    
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
      // Révoquer le token dans la librairie aussi
      try {
        const traktClient = initTraktClient();
        await traktClient.revoke_token();
      } catch {}
      return jsonSave(TOKEN_FILE, null);
    }
    
    // Sauvegarde directe sans chiffrement
    console.log('[trakt] Saving token in plain text format');
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

  // First, test if the token actually works by making a simple API call
  try {
    await get('/users/settings', { 'Authorization': `Bearer ${token.access_token}` });
    console.log('[trakt] Token is valid and working');
  } catch (error) {
    if (error.code === 'HTTP_ERROR' && error.response?.statusCode === 401) {
      console.error('[trakt] Token is invalid (401 Unauthorized) - user must re-authenticate');
      throw new Error('Invalid authentication token');
    }
    // For other errors, continue with expiration checks
    console.warn('[trakt] Token validation test failed with:', error.message);
  }

  // Calculate expiration
  const now = Math.floor(Date.now() / 1000);
  const createdAt = token.created_at || now;
  const expiresIn = token.expires_in || (7776000); // Default 90 days for Trakt
  const expiresAt = createdAt + expiresIn;
  const refreshThreshold = 86400; // 24 hours before expiration
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
    // Import token and refresh
    const traktClient = initTraktClient();
    traktClient.import_token(token);
    const refreshed = await refreshToken();
    
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