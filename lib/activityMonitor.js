import { getLastActivities, getHistory } from './trakt.js';
import { invalidatePageCache, buildPageData } from './pageData.js';
import { logger } from './logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HIST_FILE, PAGE_CACHE_FILE } from './config.js';

// Store last known activities
let lastActivities = null;
let monitorInterval = null;
let isUpdating = false;
let lastCheckTimestamp = null;

/**
 * Compare two activity objects to detect changes that require cache update
 */
function hasActivityChanged(oldActivities, newActivities) {
  if (!oldActivities || !newActivities) return true;
  
  // Only check watched timestamps - collections changes don't affect main display
  const keysToCheck = [
    'movies.watched_at', 
    'episodes.watched_at'
  ];
  
  for (const key of keysToCheck) {
    const oldValue = key.includes('.') 
      ? key.split('.').reduce((obj, k) => obj?.[k], oldActivities)
      : oldActivities[key];
      
    const newValue = key.includes('.')
      ? key.split('.').reduce((obj, k) => obj?.[k], newActivities)
      : newActivities[key];
    
    if (oldValue !== newValue) {
      console.log(`[monitor] Watch activity change detected: ${key} changed from ${oldValue} to ${newValue}`);
      return { changed: true, key, oldValue, newValue };
    }
  }
  
  return { changed: false };
}

/**
 * Update caches when activity changes are detected
 */
async function updateCachesOnChange() {
  if (isUpdating) {
    console.log('[monitor] Update already in progress, skipping...');
    return;
  }
  
  isUpdating = true;
  
  try {
    console.log('[monitor] Fetching recent history changes...');
    
    // Get recent history since last check (or last 5 minutes for first check)
    const now = new Date();
    const since = lastCheckTimestamp || new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    console.log(`[monitor] Checking history since: ${since}`);
    
    const recentHistory = await getHistory({ 
      limit: 20,  // Réduit de 100 à 20 items
      start_at: since 
    });
    
    // Update last check timestamp after successful fetch
    lastCheckTimestamp = now.toISOString();
    
    console.log(`[monitor] Found ${recentHistory.length} recent items`);
    
    // Load current history file
    let currentHistory = { shows: [], movies: [] };
    try {
      const histContent = await fs.readFile(HIST_FILE, 'utf8');
      currentHistory = JSON.parse(histContent);
    } catch (error) {
      console.warn('[monitor] Could not load current history:', error.message);
    }
    
    // Merge new items into history - more precise detection
    let hasNewItems = false;
    let newEpisodes = 0;
    let newMovies = 0;
    
    for (const item of recentHistory) {
      if (item.type === 'episode' && item.show) {
        // Check if this specific episode is already in our processed data
        const episodeKey = `${item.show.ids?.trakt}_${item.episode?.season}_${item.episode?.number}`;
        // For now, consider any recent episode as potentially new
        hasNewItems = true;
        newEpisodes++;
      } else if (item.type === 'movie' && item.movie) {
        // Check if this movie watch is new
        hasNewItems = true;
        newMovies++;
      }
    }
    
    console.log(`[monitor] Analysis: ${newEpisodes} episodes, ${newMovies} movies in recent history`);
    
    if (hasNewItems) {
      console.log('[monitor] New items detected, rebuilding cache in background...');
      
      // Instead of invalidating, proactively rebuild the cache
      try {
        // Create a fake request object for buildPageData
        const fakeReq = {
          session: {},
          protocol: 'http',
          headers: { host: 'localhost:30009' },
          get(name) { return this.headers[String(name).toLowerCase()]; }
        };
        
        // Invalider le cache centralisé watched au lieu des fichiers progress individuels
        try {
          const watchedCacheFile = path.join(path.dirname(HIST_FILE), 'watched_shows_complete.json');
          await fs.unlink(watchedCacheFile);
          console.log('[monitor] Invalidated watched shows cache');
        } catch (err) {
          // File might not exist, that's ok
        }
        
        try {
          const watchedMoviesCacheFile = path.join(path.dirname(HIST_FILE), 'watched_movies_complete.json');  
          await fs.unlink(watchedMoviesCacheFile);
          console.log('[monitor] Invalidated watched movies cache');
        } catch (err) {
          // File might not exist, that's ok
        }
        
        console.log('[monitor] Starting background cache rebuild...');
        const startTime = Date.now();
        
        // Mise à jour incrémentale au lieu de reconstruction complète
        // Seulement forcer le refresh si on a plus de 5 nouveaux items
        const shouldForceRefresh = recentHistory.length > 5;
        await buildPageData(fakeReq, { forceRefreshOnce: shouldForceRefresh, allowFull: false });
        
        const duration = Date.now() - startTime;
        console.log(`[monitor] Background cache rebuild completed in ${duration}ms - cache is now fresh!`);
        
        // Log the update
        logger.info('Activity monitor updated cache in background', {
          newItems: recentHistory.length,
          hasNewItems
        });
      } catch (error) {
        console.error('[monitor] Error during background rebuild:', error);
        // Fallback to invalidation if rebuild fails
        console.log('[monitor] Falling back to cache invalidation...');
        await invalidatePageCache();
        logger.error('Activity monitor fallback to cache invalidation', { error: error.message });
      }
    } else {
      console.log('[monitor] No new items to add');
    }
    
  } catch (error) {
    console.error('[monitor] Error updating caches:', error);
    logger.error('Activity monitor update failed', { error: error.message });
  } finally {
    isUpdating = false;
  }
}

/**
 * Check for activity changes
 */
async function checkForChanges() {
  try {
    console.log('[monitor] Checking for activity changes...');
    const newActivities = await getLastActivities();
    
    const changeResult = hasActivityChanged(lastActivities, newActivities);
    
    if (changeResult.changed || changeResult === true) {
      console.log('[monitor] Watch activity changes detected! Updating caches...');
      await updateCachesOnChange();
      lastActivities = newActivities;
    } else {
      // Only log "no changes" periodically to reduce noise
      if (Math.random() < 0.1) { // 10% chance to log
        console.log('[monitor] No watch activity changes detected');
      }
    }
  } catch (error) {
    console.error('[monitor] Error checking activities:', error.message);
    logger.error('Activity monitor check failed', { error: error.message });
  }
}

/**
 * Start monitoring Trakt activities
 */
export function startActivityMonitor(intervalMs = 300000) {  // Défaut : 5 minutes au lieu de 30s
  if (monitorInterval) {
    console.log('[monitor] Activity monitor already running');
    return;
  }
  
  console.log(`[monitor] Starting activity monitor (checking every ${intervalMs / 1000}s)`);
  
  // Do an initial check
  checkForChanges().catch(console.error);
  
  // Set up interval
  monitorInterval = setInterval(() => {
    checkForChanges().catch(console.error);
  }, intervalMs);
  
  logger.info('Activity monitor started', { intervalMs });
}

/**
 * Stop monitoring
 */
export function stopActivityMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    lastActivities = null;
    lastCheckTimestamp = null;
    console.log('[monitor] Activity monitor stopped');
    logger.info('Activity monitor stopped');
  }
}

/**
 * Get monitor status
 */
export function getMonitorStatus() {
  return {
    running: !!monitorInterval,
    lastActivities: lastActivities ? Object.keys(lastActivities) : null,
    isUpdating,
    lastCheckTimestamp
  };
}