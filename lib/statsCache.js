// lib/statsCache.js (ESM)
import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve(process.cwd(), 'data', '.cache_trakt', 'stats');

async function ensureDir() {
  try { await fs.mkdir(DIR, { recursive: true }); } catch {}
}

export async function readStatsCache(key, ttlMs = 12 * 3600 * 1000) {
  await ensureDir();
  const file = path.join(DIR, `${key}.json`);
  try {
	const txt = await fs.readFile(file, 'utf8');
	const js = JSON.parse(txt);
	if (js && Number(js.savedAt) && (Date.now() - Number(js.savedAt)) < ttlMs) {
	  return js.data;
	}
  } catch {}
  return null;
}

export async function writeStatsCache(key, data) {
  await ensureDir();
  const file = path.join(DIR, `${key}.json`);
  try {
	await fs.writeFile(file, JSON.stringify({ savedAt: Date.now(), data }), 'utf8');
  } catch {}
}
