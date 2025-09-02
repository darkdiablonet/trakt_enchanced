import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

// App title
export const TITLE = process.env.TITLE || 'Trakt Enhanced';

// External API keys (live bindings) — no defaults to avoid exposing secrets
export let TRAKT_CLIENT_ID     = process.env.TRAKT_CLIENT_ID || '';
export let TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || '';
export let TMDB_API_KEY        = process.env.TMDB_API_KEY || '';

// Provide a way to reload .env after setup without restarting the process
export function reloadEnv() {
  try { dotenv.config({ override: true }); } catch {}
  TRAKT_CLIENT_ID     = process.env.TRAKT_CLIENT_ID || '';
  TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || '';
  TMDB_API_KEY        = process.env.TMDB_API_KEY || '';
}

// Limits (fixed defaults; not from env)
export const SHOWS_LIMIT_FULL  = 10000;
export const MOVIES_LIMIT_FULL = 500;

// TTLs seconds (fixed defaults)
export const PAGE_TTL = 6 * 3600; // 6h
export const PROG_TTL = 6 * 3600; // 6h

// Progress/batching (fixed defaults)
export const MAX_SHOWS_PROGRESS_CALLS = 40;
export const PROGRESS_THROTTLE_MS     = 1200;

// Server
export const PORT = Number(process.env.PORT || 30009);
export const FULL_REBUILD_PASS = (process.env.FULL_REBUILD_PASSWORD || '').trim();

// Paths
export const DATA_DIR  = path.resolve('./data');
export const CACHE_DIR = path.join(DATA_DIR, '.cache_tmdb');
export const SECRETS_DIR = path.join(DATA_DIR, '.secrets');
export const IMG_DIR = path.join(DATA_DIR, 'cache_imgs');
export const HIST_DIR = path.join(DATA_DIR, '.cache_trakt');
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
export const PAGE_CACHE_DIR = HIST_DIR;
export const PAGE_CACHE_FILE = path.join(PAGE_CACHE_DIR, 'trakt_history_cache.json');
export const TOKEN_FILE = process.env.TRAKT_TOKEN_FILE || path.join(SECRETS_DIR, 'trakt_token.json');
export const HIST_FILE = path.join(HIST_DIR, 'trakt_master.json');

// Ensure directories exist
for (const d of [DATA_DIR, CACHE_DIR, SECRETS_DIR, IMG_DIR, HIST_DIR, SESSIONS_DIR, PAGE_CACHE_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}
