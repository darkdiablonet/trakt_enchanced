// lib/statsPro.js (ESM)
import { get as traktGet, headers as traktHeaders, loadToken } from './trakt.js';
import { getDetailsCached } from './tmdb.js';

// utils
const dkey = (d) => new Date(d).toISOString().slice(0,10);
const monthKey = (d) => new Date(d).toISOString().slice(0,7); // YYYY-MM
const pad2 = (n) => (n<10?'0':'') + n;

function* daysBetweenUTC(start, end) {
  const s = new Date(start), e = new Date(end);
  s.setUTCHours(0,0,0,0); e.setUTCHours(0,0,0,0);
  for (let t = s.getTime(); t <= e.getTime(); t += 86400000) yield new Date(t);
}

function avgRuntimeFromShowDetails(det) {
  const arr = Array.isArray(det?.episode_run_time) ? det.episode_run_time.filter(x => Number(x)>0) : [];
  if (arr.length) return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
  // fallback raisonnable
  if (Number(det?.last_episode_to_air?.runtime) > 0) return Number(det.last_episode_to_air.runtime);
  return 45;
}

function movieRuntime(det) {
  return Number(det?.runtime) > 0 ? Number(det.runtime) : 100;
}

// --- Europe/Paris helpers (IANA)
const TZ = 'Europe/Paris';
const fmtYMD  = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }); // YYYY-MM-DD
const fmtYM   = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' });                 // YYYY-MM
const fmtHour = new Intl.DateTimeFormat('en-GB',  { timeZone: TZ, hour: '2-digit', hour12: false });                   // 00..23
const fmtWk   = new Intl.DateTimeFormat('en-GB',  { timeZone: TZ, weekday: 'short' });                                 // Mon..Sun
const WK_MAP  = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };

const dkeyTZ = (d) => fmtYMD.format(new Date(d));                 // 'YYYY-MM-DD' in Europe/Paris
const mkeyTZ = (d) => fmtYM.format(new Date(d));                  // 'YYYY-MM' in Europe/Paris
const hourTZ = (d) => parseInt(fmtHour.format(new Date(d)), 10);  // 0..23 local
const dowTZ  = (d) => (WK_MAP[fmtWk.format(new Date(d))] ?? 0);   // Mon=0..Sun=6

function nextDayKeyParis(ymd) {
  // incrémente d'1 jour et reformate côté Europe/Paris
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const plus = new Date(utc.getTime() + 86400000);
  return dkeyTZ(plus);
}

// bornes UTC élargies (±3h) pour couvrir les bascules CET/CEST
function parisYearRangeUTC(year) {
  const startUTC = new Date(Date.UTC(year, 0, 1, 0, 0, 0) - 3 * 3600 * 1000);
  const endUTC   = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0) + 3 * 3600 * 1000);
  return { startUTC, endUTC };
}
function parisLastDaysRangeUTC(lastDays) {
  const now = new Date();
  const endUTC   = new Date(now.getTime() + 3 * 3600 * 1000);
  const startUTC = new Date(endUTC.getTime() - Number(lastDays || 365) * 86400000 - 3 * 3600 * 1000);
  return { startUTC, endUTC };
}

async function fetchHistoryRange(headers, pathType, startISO, endISO) {
  const base = `/sync/history/${pathType}`;
  const limit = 100;
  let page = 1;
  const out = [];
  for (;;) {
	const qs = new URLSearchParams({
	  start_at: startISO, end_at: endISO,
	  page: String(page), limit: String(limit), extended: 'min'
	}).toString();
	const chunk = await traktGet(`${base}?${qs}`, headers);
	if (!Array.isArray(chunk) || chunk.length === 0) break;
	out.push(...chunk);
	if (chunk.length < limit) break;
	page += 1;
  }
  return out;
}

export async function computeStatsPro({ range='lastDays', year, lastDays=365, type='all', token } = {}) {
  if (!token) token = (await loadToken())?.access_token;
  if (!token) throw new Error('No Trakt token');
  const hdrs = traktHeaders(token);

  // bornes UTC (élargies) pour couvrir sans manquer des jours locaux
  let startUTC, endUTC;
  if (range === 'year' && year) {
	({ startUTC, endUTC } = parisYearRangeUTC(Number(year)));
  } else {
	({ startUTC, endUTC } = parisLastDaysRangeUTC(Number(lastDays)));
  }
  const startISO = startUTC.toISOString();
  const endISO   = endUTC.toISOString();

  // fetch history (films + épisodes)
  const chunks = [];
  if (type === 'all' || type === 'movies') {
	chunks.push(await fetchHistoryRange(hdrs, 'movies',   startISO, endISO));
  }
  if (type === 'all' || type === 'shows') {
	chunks.push(await fetchHistoryRange(hdrs, 'episodes', startISO, endISO)); // séries = épisodes
  }
  const items = chunks.flat();

  // aggr containers
  const hoursDist   = Array.from({length:24}, () => 0);
  const weekdayDist = Array.from({length:7}, () => 0); // Mon=0..Sun=6
  const byDate  = new Map();   // YYYY-MM-DD (Paris) -> { plays, minutes }
  const byMonth = new Map();   // YYYY-MM (Paris)    -> { plays, minutes }
  const genres  = new Map();   // name -> minutes
  const networks= new Map();   // TV networks
  const studios = new Map();   // Movie studios
  const titles  = new Map();   // key -> { title, type, minutes, plays }

  let totalMinutes = 0, playsMovies = 0, playsEpisodes = 0;

  // memo details TMDB
  const showDetails  = new Map();
  const movieDetails = new Map();

  for (const it of items) {
	const iso = String(it?.watched_at || it?.watchedAt || '');
	if (!iso) continue;

	const kDate = dkeyTZ(iso);
	const kMonth= mkeyTZ(iso);
	const h     = hourTZ(iso);
	const dow   = dowTZ(iso);

	// identifie item
	let kind = null, tmdbId = null, showTmdb = null, title = '';
	if (it.movie) {
	  kind = 'movie';
	  tmdbId = it.movie?.ids?.tmdb || null;
	  title  = it.movie?.title || '';
	} else if (it.episode) {
	  kind = 'show';
	  showTmdb = it.show?.ids?.tmdb || null;
	  tmdbId   = it.episode?.ids?.tmdb || null; // peu utile ici
	  title    = it.show?.title || it.episode?.title || '';
	} else continue;

	// durée (min) via TMDB details (cache disque)
	let minutes = 0;
	if (kind === 'movie') {
	  let det = movieDetails.get(tmdbId);
	  if (tmdbId && !det) { det = await getDetailsCached('movie', tmdbId); movieDetails.set(tmdbId, det); }
	  minutes = movieRuntime(det);
	  playsMovies++;
	  const gs = Array.isArray(det?.genres) ? det.genres : [];
	  for (const g of gs) { const name = String(g?.name||'').trim(); if (name) genres.set(name, (genres.get(name)||0) + minutes); }
	  const comps = Array.isArray(det?.production_companies) ? det.production_companies : [];
	  for (const c of comps) { const name = String(c?.name||'').trim(); if (name) studios.set(name, (studios.get(name)||0) + minutes); }
	} else {
	  let det = showDetails.get(showTmdb);
	  if (showTmdb && !det) { det = await getDetailsCached('tv', showTmdb); showDetails.set(showTmdb, det); }
	  minutes = avgRuntimeFromShowDetails(det);
	  playsEpisodes++;
	  const gs = Array.isArray(det?.genres) ? det.genres : [];
	  for (const g of gs) { const name = String(g?.name||'').trim(); if (name) genres.set(name, (genres.get(name)||0) + minutes); }
	  const nets = Array.isArray(det?.networks) ? det.networks : [];
	  for (const n of nets) { const name = String(n?.name||'').trim(); if (name) networks.set(name, (networks.get(name)||0) + minutes); }
	}

	totalMinutes += minutes;

	const bd = byDate.get(kDate) || { plays:0, minutes:0 };
	bd.plays += 1; bd.minutes += minutes; byDate.set(kDate, bd);

	const bm = byMonth.get(kMonth) || { plays:0, minutes:0 };
	bm.plays += 1; bm.minutes += minutes; byMonth.set(kMonth, bm);

	hoursDist[h] += 1;
	weekdayDist[dow] += 1;

	const key = `${kind}:${title}`;
	const cur = titles.get(key) || { title, type:kind, minutes:0, plays:0 };
	cur.minutes += minutes; cur.plays += 1;
	titles.set(key, cur);
  }

  // streaks (Paris) via clés de dates locales
  const keys = [...byDate.keys()].sort();           // YYYY-MM-DD Paris
  const set  = new Set(keys);
  let longest=0, current=0, longestStart=null, longestEnd=null, currentStart=null;

  // longest
  for (let i=0; i<keys.length; i++){
	let len=1, s=keys[i], e=keys[i];
	while (set.has(nextDayKeyParis(e))) { e = nextDayKeyParis(e); len++; }
	if (len > longest) { longest=len; longestStart=s; longestEnd=e; }
  }
  // current = suffixe jusqu’à la fin de la période
  if (keys.length){
	let e = keys[keys.length-1];            // dernière journée active
	// si la dernière n'est pas la veille/aujourd'hui, current = 0
	// sinon on remonte
	let len = 1, s = e;
	while (set.has(nextDayKeyParis(s)));    // noop (on ne va pas en avant)
	// remonte
	while (set.has(s = (()=>{ const parts = sPrev => { const [y,m,d]=sPrev.split('-').map(Number); const utc=new Date(Date.UTC(y,m-1,d)-86400000); return fmtYMD.format(utc); }; return parts(s); })())) { len++; }
	// petit ajustement : si la dernière clé n'est pas aujourd'hui Paris ni hier Paris, current=0
	current = len; currentStart = s;
  }

  const topN = (map, n, by='minutes') => {
	const arr = Array.isArray(map) ? map : [...map.entries()].map(([name, minutes]) => ({ name, minutes }));
	arr.sort((a,b)=> (b[by]||0) - (a[by]||0));
	return arr.slice(0, n);
  };

  return {
	tz: 'Europe/Paris',
	range,
	start: dkeyTZ(startUTC),           // clé locale (début de période)
	end:   dkeyTZ(new Date(endUTC-86400000)),
	totals: {
	  plays: items.length,
	  movies: playsMovies,
	  episodes: playsEpisodes,
	  minutes: totalMinutes,
	  hours: +(totalMinutes/60).toFixed(1),
	},
	distributions: {
	  hours: hoursDist,                 // 24 cases — Europe/Paris
	  weekday: weekdayDist,             // L(0)..D(6) — Europe/Paris
	  months: Object.fromEntries([...byMonth.entries()].sort(([a],[b])=>a.localeCompare(b))), // Paris
	},
	streaks: {
	  longestDays: longest,
	  longestRange: longest ? { start: longestStart, end: longestEnd } : null,
	  currentDays: current,
	  currentStart: current ? currentStart : null
	},
	top: {
	  genres:   topN(genres, 10),
	  networks: topN(networks, 10),
	  studios:  topN(studios, 10),
	  titles:   topN([...titles.values()], 15, 'minutes')
	}
  };
}
