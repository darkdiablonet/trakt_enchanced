// lib/graph.js
import { get as traktGet, headers as traktHeaders, loadToken } from './trakt.js';

// YYYY-MM-DD
const dkey = (d) => new Date(d).toISOString().slice(0,10);

function yearRange(year) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end   = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  return { start, end };
}

// Récupère l'historique (par pages) borné à l’année, et agrège par jour
export async function dailyCounts({ type='all', year=new Date().getFullYear(), token }) {
  if (!token) {
	const tk = await loadToken();
	token = tk?.access_token;
  }
  if (!token) throw new Error('No Trakt token');

  const hdrs = traktHeaders(token);
  const { start, end } = yearRange(Number(year));

  const typePath = (type === 'movies') ? '/movies' : (type === 'shows' ? '/episodes' : '');
  const startISO = start.toISOString();
  const endISO   = end.toISOString();
  const perPage  = 100;

  const counts = new Map(); // 'YYYY-MM-DD' -> n
  let page = 1;
  // On boucle tant qu’on reçoit des items
  for (;;) {
	const qs = `?page=${page}&limit=${perPage}&start_at=${encodeURIComponent(startISO)}&end_at=${encodeURIComponent(endISO)}`;
	const ep = `/users/me/history${typePath}${qs}`;
	const items = await traktGet(ep, hdrs); // JSON already
	if (!Array.isArray(items) || items.length === 0) break;

	for (const it of items) {
	  const k = dkey(it.watched_at || it.watchedAt || it.completed_at || start);
	  counts.set(k, (counts.get(k) || 0) + 1);
	}
	if (items.length < perPage) break;
	page += 1;
  }

  // On sort toutes les dates de l’année (même celles = 0)
  const days = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
	const k = dkey(t);
	days.push({ date: k, count: counts.get(k) || 0 });
  }

  const sum = days.reduce((s,x)=>s+x.count, 0);
  const max = days.reduce((m,x)=>Math.max(m,x.count), 0);
  const daysWithCount = days.filter(d=>d.count>0).length;

  return { year: Number(year), type, sum, max, daysWithCount, days };
}
