// lib/graphCache.js (ESM)
import fs from 'node:fs/promises';
import path from 'node:path';

const GRAPH_CACHE_DIR = path.resolve(process.cwd(), 'data', '.cache_trakt', 'graph');

async function ensureDir() {
  try { await fs.mkdir(GRAPH_CACHE_DIR, { recursive: true }); } catch {}
}

export async function readGraphCache(type, year, ttlMs = 24 * 3600 * 1000) {
  await ensureDir();
  const file = path.join(GRAPH_CACHE_DIR, `${year}-${type}.json`);
  try {
	const txt = await fs.readFile(file, 'utf8');
	const js = JSON.parse(txt);
	if (js && Number(js.savedAt) && (Date.now() - Number(js.savedAt)) < ttlMs) {
	  return js.data; // shape: { year, days, max, sum, daysWithCount }
	}
  } catch {}
  return null;
}

export async function writeGraphCache(type, year, data) {
  await ensureDir();
  const file = path.join(GRAPH_CACHE_DIR, `${year}-${type}.json`);
  const payload = { savedAt: Date.now(), data };
  try { await fs.writeFile(file, JSON.stringify(payload), 'utf8'); } catch {}
}
