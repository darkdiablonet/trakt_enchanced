import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Determine the correct .env file path (same logic as setup.js)
const ENV_FILE = fs.existsSync('config') ? path.resolve('config/.env') : path.resolve('.env');

// Load the correct .env file
if (fs.existsSync(ENV_FILE)) {
  dotenv.config({ path: ENV_FILE });
} else {
  dotenv.config(); // Fallback to default
}

// App title
export const TITLE = process.env.TITLE || 'Trakt Enhanced';

// Store initial values to prevent loss
const initialConfig = {
  TRAKT_CLIENT_ID: process.env.TRAKT_CLIENT_ID || '',
  TRAKT_CLIENT_SECRET: process.env.TRAKT_CLIENT_SECRET || '',
  TMDB_API_KEY: process.env.TMDB_API_KEY || '',
  LANGUAGE: process.env.LANGUAGE || 'fr-FR',
  FULL_REBUILD_PASSWORD: process.env.FULL_REBUILD_PASSWORD || '',
  OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || `http://localhost:${process.env.PORT || 30009}/auth/callback`
};

// External API keys (live bindings) — no defaults to avoid exposing secrets
export let TRAKT_CLIENT_ID     = initialConfig.TRAKT_CLIENT_ID;
export let TRAKT_CLIENT_SECRET = initialConfig.TRAKT_CLIENT_SECRET;
export let TMDB_API_KEY        = initialConfig.TMDB_API_KEY;
export let LANGUAGE            = initialConfig.LANGUAGE;
export let FULL_REBUILD_PASSWORD = initialConfig.FULL_REBUILD_PASSWORD;
export let OAUTH_REDIRECT_URI  = initialConfig.OAUTH_REDIRECT_URI;

// Provide a way to reload .env after setup without restarting the process
export function reloadEnv() {
  try {
    // Reload the correct .env file with proper path
    if (fs.existsSync(ENV_FILE)) {
      dotenv.config({ path: ENV_FILE, override: true });
    } else {
      dotenv.config({ override: true });
    }
  } catch (err) {
    console.warn('[config] Error reloading .env:', err.message);
  }
  
  // Only update if new values are non-empty, otherwise keep the initial values
  TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID || TRAKT_CLIENT_ID || initialConfig.TRAKT_CLIENT_ID;
  TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || TRAKT_CLIENT_SECRET || initialConfig.TRAKT_CLIENT_SECRET;
  TMDB_API_KEY = process.env.TMDB_API_KEY || TMDB_API_KEY || initialConfig.TMDB_API_KEY;
  LANGUAGE = process.env.LANGUAGE || LANGUAGE || initialConfig.LANGUAGE;
  FULL_REBUILD_PASSWORD = process.env.FULL_REBUILD_PASSWORD || FULL_REBUILD_PASSWORD || initialConfig.FULL_REBUILD_PASSWORD;
  OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || OAUTH_REDIRECT_URI || initialConfig.OAUTH_REDIRECT_URI;
  
  // Log if credentials are missing after reload
  if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
    console.error('[config] WARNING: Trakt credentials are missing after reload!');
    console.error('[config] Current values - ID:', TRAKT_CLIENT_ID ? 'present' : 'missing', '- Secret:', TRAKT_CLIENT_SECRET ? 'present' : 'missing');
    console.error('[config] Initial values - ID:', initialConfig.TRAKT_CLIENT_ID ? 'present' : 'missing', '- Secret:', initialConfig.TRAKT_CLIENT_SECRET ? 'present' : 'missing');
    
    // Try to restore from initial config
    if (initialConfig.TRAKT_CLIENT_ID && initialConfig.TRAKT_CLIENT_SECRET) {
      console.log('[config] Restoring credentials from initial config');
      TRAKT_CLIENT_ID = initialConfig.TRAKT_CLIENT_ID;
      TRAKT_CLIENT_SECRET = initialConfig.TRAKT_CLIENT_SECRET;
    }
  }
}

// Limits (fixed defaults; not from env)
export const SHOWS_LIMIT_FULL  = 10000;
export const MOVIES_LIMIT_FULL = 5000;

// TTLs seconds (fixed defaults)
export const PAGE_TTL = 6 * 3600; // 6h
export const PROG_TTL = 6 * 3600; // 6h

// Progress/batching (fixed defaults)
export const MAX_SHOWS_PROGRESS_CALLS = 40;
export const PROGRESS_THROTTLE_MS     = 1200;

// Server
export const PORT = Number(process.env.PORT || 30009);

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
