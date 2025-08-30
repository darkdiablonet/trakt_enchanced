#!/usr/bin/env node
// tools/prune-oldest-plays.mjs
import 'dotenv/config';
import { headers as traktHeaders, loadToken } from '../lib/trakt.js';

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function buildHeaders() {
  const tok = await loadToken();
  if (!tok?.access_token) {
	console.error('❌ Pas de token Trakt. Lance l’app et connecte-toi (device flow).');
	process.exit(1);
  }
  return traktHeaders(tok.access_token); // => reprend CLIENT_ID, etc. depuis ton .env comme server.js
}

async function fetchFullHistory(type, headers, { since=null } = {}) {
  const all = [];
  let page = 1;
  const perPage = 100;
  while (true) {
	const url = new URL(`https://api.trakt.tv/users/me/history/${type}`);
	url.searchParams.set('page', String(page));
	url.searchParams.set('limit', String(perPage));
	if (since) url.searchParams.set('start_at', new Date(since).toISOString());

	const res = await fetch(url, { headers });
	if (res.status === 429) {
	  const reset = Number(res.headers.get('X-RateLimit-Reset') || 1);
	  const waitMs = Math.max(1, reset) * 1000;
	  console.warn(`⏳ 429 rate-limited, attente ${waitMs}ms…`);
	  await sleep(waitMs);
	  continue;
	}
	if (!res.ok) {
	  const body = await res.text().catch(()=> '');
	  throw new Error(`GET ${url} -> ${res.status} ${body}`);
	}
	const items = await res.json();
	all.push(...items);
	if (items.length < perPage) break; // pas besoin des headers de pagination
	page += 1;
	await sleep(200);
  }
  return all;
}

function groupByTitle(items, type) {
  const map = new Map();
  for (const it of items) {
	let key = null;
	if (type === 'movies'   && it.movie?.ids?.trakt)   key = `m:${it.movie.ids.trakt}`;
	if (type === 'episodes' && it.episode?.ids?.trakt) key = `e:${it.episode.ids.trakt}`;
	if (!key) continue;
	if (!map.has(key)) map.set(key, []);
	map.get(key).push(it);
  }
  return map;
}

function buildRemovalEntries(groupMap, type, keepNewest = 1) {
  const entries = [];
  for (const [, arr] of groupMap) {
	if (!Array.isArray(arr) || arr.length <= keepNewest) continue;

	// tri du plus récent au plus ancien
	const sorted = arr.slice().sort((a, b) => {
	  const ta = Date.parse(a.watched_at || 0);
	  const tb = Date.parse(b.watched_at || 0);
	  if (tb !== ta) return tb - ta;        // récents d’abord
	  return Number(b.id) - Number(a.id);   // tie-breaker sur l’id d’historique
	});

	// on supprime tout sauf les "keepNewest" premiers
	const toRemove = sorted.slice(keepNewest);
	for (const it of toRemove) {
	  // ⚠️ sur /users/me/history, l’ID d’historique est `it.id`
	  const historyId  = it.id;
	  const watched_at = it.watched_at;
	  const itemTraktId = (type === 'movies')
		? (it.movie?.ids?.trakt ?? null)
		: (it.episode?.ids?.trakt ?? null);

	  entries.push({
		historyId,
		type: (type === 'movies' ? 'movie' : 'episode'),
		itemTraktId,
		watched_at
	  });
	}
  }
  return entries;
}



function pickIdsToDelete(groupMap, keepNewest = 1) {
  const ids = [];
  for (const [, arr] of groupMap) {
	if (!Array.isArray(arr) || arr.length <= keepNewest) continue;

	// trie du plus récent → au plus ancien (watched_at desc, puis id desc en tie-break)
	const sorted = arr.slice().sort((a, b) => {
	  const ta = Date.parse(a.watched_at || 0);
	  const tb = Date.parse(b.watched_at || 0);
	  if (tb !== ta) return tb - ta;           // récents d’abord
	  return Number(b.id) - Number(a.id);      // puis plus grand id
	});

	// on garde les "keepNewest" premiers (les plus récents), on supprime le reste
	const toRemove = sorted.slice(keepNewest);
	for (const it of toRemove) {
	  if (it?.id) ids.push(it.id);
	}
  }
  return Array.from(new Set(ids));
}


/**
 * entries: Array of {
 *   historyId: number,          // REQUIRED for the fast path
 *   type?: 'movie'|'episode',   // for fallback
 *   itemTraktId?: number,       // trakt id of the movie or episode (fallback)
 *   watched_at?: string         // ISO watched_at for that specific play (fallback)
 * }
 */
export async function removeHistoryVerbose(entries, headers) {
  const url = 'https://api.trakt.tv/sync/history/remove';
  const batchSize = 200;
  let removed = 0;

  // ensure proper JSON header + UA (some setups strip it)
  const baseHeaders = {
	...headers,
	'Content-Type': 'application/json; charset=utf-8',
	'User-Agent': headers['User-Agent'] || 'unfr-trakt-node-mod/1.0'
  };

  function sumDeleted(obj) {
	if (!obj || typeof obj !== 'object') return 0;
	let n = 0;
	for (const k of Object.keys(obj)) {
	  const v = obj[k];
	  if (typeof v === 'number') n += v;
	  else if (Array.isArray(v)) n += v.length; // some impls return arrays
	}
	return n;
  }

  for (let i = 0; i < entries.length; i += batchSize) {
	const slice = entries.slice(i, i + batchSize);

	// ---------- 1) Fast path: raw history ids ----------
	const ids = slice
	  .map(e => Number(e.historyId))
	  .filter(n => Number.isFinite(n));

	let didDelete = 0;
	if (ids.length) {
	  console.log(`[remove] batch ${i / batchSize + 1}/${Math.ceil(entries.length / batchSize)} → ${ids.length} ids (sample: ${ids.slice(0,5).join(', ')}, …)`);
	  let res = await fetch(url, { method: 'POST', headers: baseHeaders, body: JSON.stringify({ ids }) });

	  if (res.status === 429) {
		const reset = Number(res.headers.get('X-RateLimit-Reset') || 1);
		const waitMs = Math.max(1, reset) * 1000;
		console.warn(`⏳ 429 sur remove, attente ${waitMs}ms…`);
		await sleep(waitMs);
		// retry once immediately
		res = await fetch(url, { method: 'POST', headers: baseHeaders, body: JSON.stringify({ ids }) });
	  }

	  const reqId = res.headers.get('X-Trakt-Request-Id') || '?';
	  const limit = res.headers.get('X-RateLimit-Limit') || '?';
	  const rem   = res.headers.get('X-RateLimit-Remaining') || '?';
	  const reset = res.headers.get('X-RateLimit-Reset') || '?';
	  const www   = res.headers.get('WWW-Authenticate') || '';

	  let body = {};
	  try { body = await res.json(); } catch { body = {}; }

	  console.log(`[remove] status ${res.status} ${res.ok ? 'OK' : 'ERR'}  reqId=${reqId}  rate=${rem}/${limit} reset=${reset}s`);
	  if (www) console.warn(`[remove] WWW-Authenticate: ${www}`);
	  console.log('[remove] raw response:', JSON.stringify(body, null, 2));

	  const del = body.deleted || {};
	  const nf  = body.not_found || {};
	  // many servers return "deleted.ids" when raw ids are used
	  const byIds = Number(del.ids || 0);
	  const total = byIds || sumDeleted(del); // prefer ids if present
	  console.log(`[remove] deleted: ${JSON.stringify(del)}`);
	  console.log(`[remove] not_found: ${JSON.stringify(nf)}`);

	  didDelete = total;
	  removed  += total;
	  console.log(`[remove] batch ${i / batchSize + 1} → removed=${total} (cumulé=${removed})`);

	  // if we actually deleted something with the ids path, continue next batch
	  if (didDelete > 0) {
		await sleep(250);
		continue;
	  }
	}

	// ---------- 2) Fallback: typed removal with watched_at ----------
	// Only if the ids path didn’t delete anything AND we have enough info.
	const movies   = [];
	const episodes = [];
	for (const e of slice) {
	  if (!e || !e.itemTraktId || !e.watched_at || !e.type) continue;
	  const obj = { ids: { trakt: Number(e.itemTraktId) }, watched_at: e.watched_at };
	  if (e.type === 'movie') movies.push(obj);
	  else if (e.type === 'episode') episodes.push(obj);
	}

	if (movies.length || episodes.length) {
	  console.log(`[remove/fallback] movies=${movies.length} episodes=${episodes.length}`);
	  let res = await fetch(url, { method:'POST', headers: baseHeaders, body: JSON.stringify({ movies, episodes }) });

	  if (res.status === 429) {
		const reset = Number(res.headers.get('X-RateLimit-Reset') || 1);
		const waitMs = Math.max(1, reset) * 1000;
		console.warn(`⏳ 429 sur remove (fallback), attente ${waitMs}ms…`);
		await sleep(waitMs);
		res = await fetch(url, { method:'POST', headers: baseHeaders, body: JSON.stringify({ movies, episodes }) });
	  }

	  const reqId = res.headers.get('X-Trakt-Request-Id') || '?';
	  const limit = res.headers.get('X-RateLimit-Limit') || '?';
	  const rem   = res.headers.get('X-RateLimit-Remaining') || '?';
	  const reset = res.headers.get('X-RateLimit-Reset') || '?';
	  const www   = res.headers.get('WWW-Authenticate') || '';

	  let body = {};
	  try { body = await res.json(); } catch { body = {}; }

	  console.log(`[remove/fallback] status ${res.status} ${res.ok ? 'OK' : 'ERR'}  reqId=${reqId}  rate=${rem}/${limit} reset=${reset}s`);
	  if (www) console.warn(`[remove/fallback] WWW-Authenticate: ${www}`);
	  console.log('[remove/fallback] raw response:', JSON.stringify(body, null, 2));

	  const del = body.deleted || {};
	  const total = sumDeleted(del);
	  const nf  = body.not_found || {};
	  console.log(`[remove/fallback] deleted: ${JSON.stringify(del)}`);
	  console.log(`[remove/fallback] not_found: ${JSON.stringify(nf)}`);
	  removed += total;
	  console.log(`[remove/fallback] batch ${i / batchSize + 1} → removed=${total} (cumulé=${removed})`);
	  await sleep(250);
	} else {
	  console.warn('[remove] rien supprimé et pas assez d’infos pour le fallback (besoin de type, itemTraktId, watched_at)');
	}
  }

  console.log(`[remove] DONE → total removed=${removed}`);
  return removed;
}

// -------- CLI --------
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const typesArg = (args.find(a => a.startsWith('--types=')) || '--types=movies,episodes').split('=')[1];
const TYPES = typesArg.split(',').map(s => s.trim()).filter(Boolean);
const SINCE = (args.find(a => a.startsWith('--since=')) || '').split('=')[1] || null;

const headers = await buildHeaders();

console.log(`▶︎ Scan types: ${TYPES.join(', ')}  ${SINCE ? `(since ${SINCE})` : ''}`);

let entries = []; // ⬅️ IMPORTANT : on initialise ici

for (const t of TYPES) {
  if (!['movies','episodes'].includes(t)) continue;

  const hist = await fetchFullHistory(t, headers, { since: SINCE });
  console.log(`  • ${t}: ${hist.length} plays`);

  const grouped = groupByTitle(hist, t);
  const entriesT = buildRemovalEntries(grouped, t, 1); // garde 1 play le plus récent par titre
  console.log(`    → candidats (après keepNewest=1): ${entriesT.length}`);

  entries.push(...entriesT);
}

console.log(`\nRésumé: ${entries.length} plays ciblés.`);
if (!APPLY) {
  console.log('Dry-run (aucune suppression). Ajoute --apply pour exécuter.');
  process.exit(0);
}

if (entries.length === 0) {
  console.log('Rien à supprimer.');
  process.exit(0);
}

// utilise la version verbeuse avec fallback (ids → movies/episodes+watched_at)
const removed = await removeHistoryVerbose(entries, headers);
console.log(`✅ Supprimé: ${removed} plays.`);

