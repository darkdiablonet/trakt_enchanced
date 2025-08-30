
import fsp from 'node:fs/promises';
import path from 'node:path';
import { TMDB_API_KEY, CACHE_DIR, IMG_DIR } from './config.js';
import { cachePath, jsonSave, baseUrl } from './util.js';

async function httpGetJson(url, headers={}) {
  const res = await fetch(url, { headers: { 'User-Agent':'trakt_fetcher', 'Accept':'application/json', ...headers }, redirect:'follow' });
  if (!res.ok) { try { return await res.json(); } catch { return null; } }
  return res.json();
}

export async function tmdbGet(kind, id) {
  if (!TMDB_API_KEY) return null;
  return httpGetJson(`https://api.themoviedb.org/3/${kind}/${id}?api_key=${TMDB_API_KEY}&language=fr-FR`);
}
export async function tmdbSearch(kind, query, year) {
  if (!TMDB_API_KEY || !query) return null;
  const y = year ? `&year=${encodeURIComponent(String(year))}` : '';
  return httpGetJson(`https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}${y}&language=fr-FR`);
}

// Remplace intégralement posterLocalUrl par ceci :
export async function posterLocalUrl(req, posterPath, size = 'w342') {
  if (!posterPath) return null;

  const key = String(posterPath).replace(/^\//, '').replace(/\//g, '_'); // "abc.jpg" -> "abc.jpg"
  const filename = `${size}_${key}`;                                     // "w342_abc.jpg"
  const file = path.join(IMG_DIR, filename);
  const relUrl = `/cache_imgs/${filename}`;                              // <-- URL relative

  try {
    const st = await fsp.stat(file).catch(() => null);
    const ttl = 180 * 24 * 3600 * 1000; // 180 jours

    // (Re)télécharger si absent ou trop ancien
    if (!st || (Date.now() - st.mtimeMs) > ttl) {
      const tmdbUrl = `https://image.tmdb.org/t/p/${size}${posterPath}`;
      const imgRes = await fetch(tmdbUrl);
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        await fsp.writeFile(file, buf);
      } else if (!st) {
        // échec de téléchargement et pas de fichier local -> pas d'image
        return null;
      }
    }

    return relUrl;
  } catch {
    // en cas d’erreur, si le fichier n’existe pas on renvoie null
    const exists = await fsp.stat(file).then(() => true).catch(() => false);
    return exists ? relUrl : null;
  }
}


export async function getCachedMeta(req, kind, title, year, tmdbId, size) {
  let js = null;
  const cacheKey  = tmdbId ? `${kind}-${tmdbId}` : `${kind}-${title}--${year || ''}`;
  const cacheFile = cachePath(CACHE_DIR, cacheKey, 'json');

  // 1) charge depuis le cache disque si dispo
  try { js = JSON.parse(await fsp.readFile(cacheFile, 'utf8')); } catch {}

  // 2) sinon, récup TMDB (details si id connu, sinon search + meilleur candidat)
  if (!js) {
    js = tmdbId ? await tmdbGet(kind, tmdbId) : null;

    if ((!js || !js.poster_path) && title) {
      const search = await tmdbSearch(kind, title, year);
      if (search?.results?.length) {
        let best = null;
        const yy = String(year || '');
        for (const cand of search.results) {
          const yr = kind === 'tv'
            ? (cand.first_air_date || '').slice(0, 4)
            : (cand.release_date   || '').slice(0, 4);
          if (yy && yr === yy) { best = cand; break; }
        }
        if (!best) best = search.results[0];
        js = best;
      }
    }

    if (js) await jsonSave(cacheFile, js);
  }

  // 3) construit les URLs utiles
  let poster = null, tmdbUrl = null;
  if (js?.poster_path) {
    poster = (await posterLocalUrl(req, js.poster_path, size))
          || `https://image.tmdb.org/t/p/${size}${js.poster_path}`;
  }
  const tid = tmdbId || js?.id || null;
  if (tid) tmdbUrl = `https://www.themoviedb.org/${kind === 'tv' ? 'tv' : 'movie'}/${Number(tid)}`;

  // 4) overview (synopsis) — peut venir d’un "details" ou d’un "search result"
  const overview =
    (js && typeof js.overview === 'string' && js.overview.trim().length > 0)
      ? js.overview.trim()
      : null;

  return { poster, tmdbUrl, overview };
}

export async function getDetailsCached(kind, tmdbId) {
  if (!tmdbId) return null;
  const cacheKey  = `${kind}-${tmdbId}`;
  const cacheFile = cachePath(CACHE_DIR, cacheKey, 'json');
  // try cache
  try {
    const js = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    if (js && js.id) return js;
  } catch {}
  // otherwise fetch + save
  const d = await tmdbGet(kind, tmdbId);
  if (d) await jsonSave(cacheFile, d);
  return d || null;
}

