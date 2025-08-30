
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

export const TITLE = process.env.TITLE || 'Trakt History';
export const TRAKT_CLIENT_ID     = process.env.TRAKT_CLIENT_ID     || 'e12e9cf0e13c518960af73246b1934191335410a74887eca63d2bb7ca1a98d25';
export const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || 'a39a83144f83d424eaa272c54b92a9d3f77d0ec8e8bd31e8677c4a3959796542';
export const TMDB_API_KEY        = process.env.TMDB_API_KEY        || 'a3e2775c4d38fe179721bf2318760c9f';

export const POSTER_SIZE_TV    = process.env.POSTER_SIZE_TV    || 'w342';
export const POSTER_SIZE_MOVIE = process.env.POSTER_SIZE_MOVIE || 'w342';

export const SHOWS_LIMIT_FULL  = Number(process.env.SHOWS_LIMIT_FULL  || 10000);
export const MOVIES_LIMIT_FULL = Number(process.env.MOVIES_LIMIT_FULL || 500);
export const PAGE_TTL          = Number(process.env.PAGE_TTL_SECONDS || 6*3600);
export const PROG_TTL          = Number(process.env.PROG_TTL_SECONDS || 6*3600);
export const MAX_SHOWS_PROGRESS_CALLS = Number(process.env.MAX_SHOWS_PROGRESS_CALLS || 40);

export const PORT = Number(process.env.PORT || 3000);
export const FULL_REBUILD_PASS = (process.env.FULL_REBUILD_PASSWORD || '').trim();

// Paths
export const DATA_DIR  = path.resolve('./data');
export const CACHE_DIR = path.join(DATA_DIR, '.cache_tmdb');
export const SECRETS_DIR = path.join(DATA_DIR, '.secrets');
export const IMG_DIR = path.join(DATA_DIR, 'cache_imgs');
export const HIST_DIR = path.join(DATA_DIR, '.cache_trakt');
export const PAGE_CACHE_DIR = HIST_DIR;
export const PAGE_CACHE_FILE = path.join(PAGE_CACHE_DIR, 'trakt_history_cache.json');
export const TOKEN_FILE = process.env.TRAKT_TOKEN_FILE || path.join(SECRETS_DIR, 'trakt_token.json');
export const HIST_FILE = path.join(HIST_DIR, 'trakt_master.json');

// Ensure directories exist
for (const d of [DATA_DIR, CACHE_DIR, SECRETS_DIR, IMG_DIR, HIST_DIR, PAGE_CACHE_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}
