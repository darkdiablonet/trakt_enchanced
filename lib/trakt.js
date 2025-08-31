
import path from "node:path";
import fsp from "node:fs/promises";
import { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TOKEN_FILE } from './config.js';
import { jsonLoad, jsonSave, sleep } from './util.js';
import { loggers } from './logger.js';
import { encryptTraktToken, decryptTraktToken } from './crypto.js';

const BATCH_SIZE     = Number(process.env.MAX_SHOWS_PROGRESS_CALLS || 40);   // taille d’un lot
const THROTTLE_MS    = Number(process.env.PROGRESS_THROTTLE_MS || 1200);     // pause entre lots
const PROG_TTL_SECS  = Number(process.env.PROG_TTL_SECS || 6 * 3600);        // fraicheur cache (6h)
const PROG_DIR       = process.env.PROG_DIR || path.join(process.cwd(), "data", ".cache_trakt", "progress");

async function httpGetJson(url, headers={}) {
  const startTime = Date.now();
  let error = null;
  
  try {
    const res = await fetch(url, { 
      headers: { 'User-Agent':'trakt_fetcher', 'Accept':'application/json', ...headers }, 
      redirect:'follow' 
    });
    
    const duration = Date.now() - startTime;
    loggers.logApiCall('trakt', 'GET', url, duration, res.status);
    
    if (!res.ok) { 
      try { 
        return await res.json(); 
      } catch { 
        return null; 
      }
    }
    return res.json();
  } catch (err) {
    const duration = Date.now() - startTime;
    error = err;
    loggers.logApiCall('trakt', 'GET', url, duration, 0, err);
    throw err;
  }
}

async function httpPostJson(url, body, headers={}) {
  const startTime = Date.now();
  let error = null;
  
  try {
    const res = await fetch(url, { 
      method:'POST', 
      headers: { 'User-Agent':'trakt_fetcher', 'Content-Type':'application/json', 'Accept':'application/json', ...headers }, 
      body: JSON.stringify(body) 
    });
    
    const duration = Date.now() - startTime;
    loggers.logApiCall('trakt', 'POST', url, duration, res.status);
    
    try { 
      return await res.json(); 
    } catch { 
      return null; 
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    error = err;
    loggers.logApiCall('trakt', 'POST', url, duration, 0, err);
    return null;
  }
}

export function headers(accessToken='') {
  const h = { 'trakt-api-version':'2', 'trakt-api-key': TRAKT_CLIENT_ID };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
  return h;
}

export async function deviceCode(clientId = TRAKT_CLIENT_ID) {
  return httpPostJson('https://api.trakt.tv/oauth/device/code', { client_id: clientId });
}
export async function deviceToken(code, clientId = TRAKT_CLIENT_ID, clientSecret = TRAKT_CLIENT_SECRET) {
  return httpPostJson('https://api.trakt.tv/oauth/device/token', { code, client_id: clientId, client_secret: clientSecret });
}
export async function refreshToken(refresh_token, clientId = TRAKT_CLIENT_ID, clientSecret = TRAKT_CLIENT_SECRET) {
  return httpPostJson('https://api.trakt.tv/oauth/token', { refresh_token, client_id: clientId, client_secret: clientSecret, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', grant_type: 'refresh_token' });
}

export async function get(endpoint, headersObj) {
  return httpGetJson(`https://api.trakt.tv${endpoint}`, headersObj);
}
export async function historyChunk(type, params, headersObj) {
  const q = new URLSearchParams(params).toString();
  return httpGetJson(`https://api.trakt.tv/sync/history/${type}?${q}`, headersObj);
}
export async function showProgressWatched(traktId, headersObj) {
  return get(`/shows/${traktId}/progress/watched?hidden=false&specials=true&count_specials=true`, headersObj);
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

      // 2) API Trakt via ta fonction get()
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          prog = await get(
            `/shows/${tid}/progress/watched?hidden=false&specials=false&count_specials=false`,
            headers
          );
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
    }
  }
}

export async function userStats(headersObj, username = 'me') {
  return get(`/users/${username}/stats`, headersObj);
}

export async function loadToken() { 
  try {
    const encryptedData = await jsonLoad(TOKEN_FILE);
    if (!encryptedData || !encryptedData.encrypted) {
      // Ancien format non chiffré ou pas de token
      return encryptedData;
    }
    
    // Déchiffrer le token
    const decrypted = decryptTraktToken(encryptedData.encrypted);
    loggers.logPerformance('token_decryption', Date.now() - Date.now());
    return decrypted;
    
  } catch (error) {
    loggers.logError(error, { operation: 'loadToken' });
    return null;
  }
}

export async function saveToken(tok) { 
  try {
    if (!tok) return jsonSave(TOKEN_FILE, null);
    
    // Chiffrer le token avant sauvegarde
    const encrypted = encryptTraktToken(tok);
    const secureData = {
      encrypted,
      created_at: Date.now(),
      version: '2.0'
    };
    
    loggers.logPerformance('token_encryption', Date.now() - Date.now());
    return jsonSave(TOKEN_FILE, secureData);
    
  } catch (error) {
    loggers.logError(error, { operation: 'saveToken' });
    throw error;
  }
}

export async function ensureValidToken() {
  const token = await loadToken();
  if (!token?.access_token) return null;

  // Vérifier si le token expire bientôt (dans l'heure qui suit)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (token.created_at || 0) + (token.expires_in || 86400);
  const refreshThreshold = 3600; // 1 heure avant expiration
  
  if (expiresAt - now > refreshThreshold) {
    // Token encore valide
    return token;
  }

  // Token proche de l'expiration, tenter de le rafraîchir
  if (!token.refresh_token) {
    console.warn('[trakt] Token proche d\'expiration mais pas de refresh_token disponible');
    return token; // Retourner le token même s'il expire bientôt
  }

  console.log('[trakt] Token proche d\'expiration, rafraîchissement en cours...');
  try {
    const refreshed = await refreshToken(token.refresh_token);
    if (refreshed?.access_token) {
      // Ajouter created_at si pas présent
      if (!refreshed.created_at) {
        refreshed.created_at = now;
      }
      await saveToken(refreshed);
      console.log('[trakt] Token rafraîchi avec succès');
      return refreshed;
    } else {
      console.warn('[trakt] Échec du rafraîchissement du token:', refreshed);
      return token; // Retourner l'ancien token
    }
  } catch (error) {
    console.error('[trakt] Erreur lors du rafraîchissement du token:', error);
    return token; // Retourner l'ancien token en cas d'erreur
  }
}