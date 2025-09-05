/**
 * Smart Cache Management - Invalidation sélective par série
 * Résout les problèmes de désynchronisation entre caches
 */

import fsp from 'node:fs/promises';
import { jsonLoad, jsonSave } from './util.js';
import { PAGE_CACHE_FILE } from './config.js';
import { enrichShowsWithProgressOptimized } from './trakt.js';

/**
 * Invalidation intelligente : Met à jour une série spécifique dans le cache global
 * @param {number} traktId - ID Trakt de la série à mettre à jour
 * @param {Function} headersFunc - Fonction qui retourne les headers d'auth
 */
export async function smartInvalidateShow(traktId, headersFunc) {
  try {
    console.log(`[smartCache] Updating show ${traktId} in global cache`);
    
    // 1. Charger le cache global
    const globalCache = await jsonLoad(PAGE_CACHE_FILE);
    if (!globalCache) {
      console.log('[smartCache] No global cache found, skipping smart update');
      return false;
    }
    
    // 2. Trouver la série dans toutes les sections du cache
    const sections = ['showsRows', 'showsUnseenRows'];
    let updated = false;
    
    for (const section of sections) {
      const rows = globalCache[section] || [];
      const showIndex = rows.findIndex(row => row.ids?.trakt === traktId);
      
      if (showIndex !== -1) {
        console.log(`[smartCache] Found show in ${section}, updating...`);
        
        // 3. Récupérer les nouvelles données depuis l'API (le cache progress a été invalidé)
        const showToUpdate = [rows[showIndex]];
        await enrichShowsWithProgressOptimized(showToUpdate, { 
          updateMissing: true,
          headers: headersFunc
        });
        
        // 4. Remplacer la série dans le cache
        rows[showIndex] = showToUpdate[0];
        updated = true;
        
        console.log(`[smartCache] Updated show ${showToUpdate[0].title} in ${section}`);
      }
    }
    
    if (updated) {
      // 5. Sauvegarder le cache modifié
      await jsonSave(PAGE_CACHE_FILE, globalCache);
      console.log(`[smartCache] Global cache updated for show ${traktId}`);
      return true;
    } else {
      console.log(`[smartCache] Show ${traktId} not found in cache`);
      return false;
    }
    
  } catch (error) {
    console.warn(`[smartCache] Failed to smart update show ${traktId}:`, error.message);
    return false;
  }
}

/**
 * Fallback : Invalidation complète du cache (ancienne méthode)
 */
export async function fallbackInvalidateCache() {
  try {
    await fsp.unlink(PAGE_CACHE_FILE);
    console.log('[smartCache] Fallback: complete cache invalidation');
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[smartCache] Failed fallback invalidation:', error.message);
    }
    return false;
  }
}

/**
 * Invalidation hybride : Smart d'abord, fallback si échec
 * @param {number} traktId - ID Trakt de la série  
 * @param {Function} headersFunc - Fonction headers d'auth
 */
export async function hybridInvalidate(traktId, headersFunc) {
  // Tentative d'invalidation intelligente
  const smartSuccess = await smartInvalidateShow(traktId, headersFunc);
  
  if (!smartSuccess) {
    // Fallback sur invalidation complète
    console.log('[smartCache] Smart update failed, using fallback invalidation');
    await fallbackInvalidateCache();
  }
  
  return smartSuccess;
}