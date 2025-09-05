/**
 * Système de cache granulaire par carte/série
 * Remplace le cache de page global qui force à tout invalider
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { jsonLoad, jsonSave } from './util.js';
import { DATA_DIR } from './config.js';

const CARD_CACHE_DIR = path.join(DATA_DIR, '.cache_cards');

// Ensure cache directory exists
try {
  await fsp.mkdir(CARD_CACHE_DIR, { recursive: true });
} catch (error) {
  // Directory might already exist
}

/**
 * Cache une carte de série individuellement
 */
export async function cacheShowCard(traktId, cardData) {
  try {
    const cacheFile = path.join(CARD_CACHE_DIR, `show_${traktId}.json`);
    const data = {
      ...cardData,
      cached_at: new Date().toISOString(),
      trakt_id: traktId
    };
    
    await jsonSave(cacheFile, data);
    console.log(`[cardCache] Cached show card ${traktId}`);
    return true;
  } catch (error) {
    console.error(`[cardCache] Failed to cache show ${traktId}:`, error.message);
    return false;
  }
}

/**
 * Cache une carte de film individuellement
 */
export async function cacheMovieCard(traktId, cardData) {
  try {
    const cacheFile = path.join(CARD_CACHE_DIR, `movie_${traktId}.json`);
    const data = {
      ...cardData,
      cached_at: new Date().toISOString(),
      trakt_id: traktId
    };
    
    await jsonSave(cacheFile, data);
    console.log(`[cardCache] Cached movie card ${traktId}`);
    return true;
  } catch (error) {
    console.error(`[cardCache] Failed to cache movie ${traktId}:`, error.message);
    return false;
  }
}

/**
 * Récupère une carte de série depuis le cache
 */
export async function getShowCard(traktId, maxAge = 6 * 3600 * 1000) {
  try {
    const cacheFile = path.join(CARD_CACHE_DIR, `show_${traktId}.json`);
    const stat = await fsp.stat(cacheFile);
    
    // Vérifier l'age du cache
    const age = Date.now() - stat.mtimeMs;
    if (age > maxAge) {
      console.log(`[cardCache] Show ${traktId} cache expired (age: ${Math.round(age/1000)}s)`);
      return null;
    }
    
    const data = await jsonLoad(cacheFile);
    console.log(`[cardCache] Show ${traktId} loaded from cache`);
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[cardCache] Error loading show ${traktId}:`, error.message);
    }
    return null;
  }
}

/**
 * Récupère une carte de film depuis le cache
 */
export async function getMovieCard(traktId, maxAge = 6 * 3600 * 1000) {
  try {
    const cacheFile = path.join(CARD_CACHE_DIR, `movie_${traktId}.json`);
    const stat = await fsp.stat(cacheFile);
    
    const age = Date.now() - stat.mtimeMs;
    if (age > maxAge) {
      console.log(`[cardCache] Movie ${traktId} cache expired (age: ${Math.round(age/1000)}s)`);
      return null;
    }
    
    const data = await jsonLoad(cacheFile);
    console.log(`[cardCache] Movie ${traktId} loaded from cache`);
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[cardCache] Error loading movie ${traktId}:`, error.message);
    }
    return null;
  }
}

/**
 * Invalide seulement le cache d'une série spécifique
 */
export async function invalidateShowCard(traktId) {
  try {
    const cacheFile = path.join(CARD_CACHE_DIR, `show_${traktId}.json`);
    await fsp.unlink(cacheFile);
    console.log(`[cardCache] Invalidated show ${traktId} cache`);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[cardCache] Failed to invalidate show ${traktId}:`, error.message);
    }
    return false;
  }
}

/**
 * Invalide seulement le cache d'un film spécifique
 */
export async function invalidateMovieCard(traktId) {
  try {
    const cacheFile = path.join(CARD_CACHE_DIR, `movie_${traktId}.json`);
    await fsp.unlink(cacheFile);
    console.log(`[cardCache] Invalidated movie ${traktId} cache`);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[cardCache] Failed to invalidate movie ${traktId}:`, error.message);
    }
    return false;
  }
}

/**
 * Récupère toutes les cartes de séries depuis le cache
 */
export async function getAllShowCards(maxAge = 6 * 3600 * 1000) {
  try {
    const files = await fsp.readdir(CARD_CACHE_DIR);
    const showFiles = files.filter(f => f.startsWith('show_') && f.endsWith('.json'));
    
    const shows = [];
    for (const file of showFiles) {
      const filePath = path.join(CARD_CACHE_DIR, file);
      const stat = await fsp.stat(filePath);
      
      // Skip if too old
      const age = Date.now() - stat.mtimeMs;
      if (age > maxAge) continue;
      
      try {
        const data = await jsonLoad(filePath);
        shows.push(data);
      } catch (error) {
        console.warn(`[cardCache] Error loading ${file}:`, error.message);
      }
    }
    
    console.log(`[cardCache] Loaded ${shows.length} show cards from cache`);
    return shows;
  } catch (error) {
    console.error('[cardCache] Error loading show cards:', error.message);
    return [];
  }
}

/**
 * Récupère toutes les cartes de films depuis le cache
 */
export async function getAllMovieCards(maxAge = 6 * 3600 * 1000) {
  try {
    const files = await fsp.readdir(CARD_CACHE_DIR);
    const movieFiles = files.filter(f => f.startsWith('movie_') && f.endsWith('.json'));
    
    const movies = [];
    for (const file of movieFiles) {
      const filePath = path.join(CARD_CACHE_DIR, file);
      const stat = await fsp.stat(filePath);
      
      const age = Date.now() - stat.mtimeMs;
      if (age > maxAge) continue;
      
      try {
        const data = await jsonLoad(filePath);
        movies.push(data);
      } catch (error) {
        console.warn(`[cardCache] Error loading ${file}:`, error.message);
      }
    }
    
    console.log(`[cardCache] Loaded ${movies.length} movie cards from cache`);
    return movies;
  } catch (error) {
    console.error('[cardCache] Error loading movie cards:', error.message);
    return [];
  }
}

/**
 * Nettoie les caches expirés
 */
export async function cleanExpiredCards(maxAge = 6 * 3600 * 1000) {
  try {
    const files = await fsp.readdir(CARD_CACHE_DIR);
    let cleaned = 0;
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(CARD_CACHE_DIR, file);
      const stat = await fsp.stat(filePath);
      
      const age = Date.now() - stat.mtimeMs;
      if (age > maxAge) {
        await fsp.unlink(filePath);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[cardCache] Cleaned ${cleaned} expired cards`);
    }
    
    return cleaned;
  } catch (error) {
    console.error('[cardCache] Error cleaning expired cards:', error.message);
    return 0;
  }
}