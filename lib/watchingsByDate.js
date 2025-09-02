/**
 * Module de récupération des visionnages par date
 * Utilise le cache progress local avec cache intelligent
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';

// Cache en mémoire avec TTL intelligent
const cache = new Map();

/**
 * Détermine le TTL du cache selon la date
 * @param {string} dateStr - Date au format YYYY-MM-DD
 * @returns {number} TTL en millisecondes (0 = cache permanent)
 */
function getCacheTTL(dateStr) {
  const targetDate = new Date(dateStr + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  if (targetDate.getTime() > today.getTime()) {
    // Date future = impossible, pas de cache
    return -1;
  } else if (targetDate.getTime() === today.getTime()) {
    // Aujourd'hui = peut évoluer, cache 1h
    return 60 * 60 * 1000;
  } else {
    // Date passée = ne changera plus, cache permanent
    return 0;
  }
}

/**
 * Parse une date de visionnage Trakt en date locale
 * @param {string} watchedAt - Date ISO string
 * @returns {string|null} Date au format YYYY-MM-DD en heure locale ou null
 */
function parseWatchedDate(watchedAt) {
  if (!watchedAt) return null;
  try {
    const date = new Date(watchedAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (err) {
    return null;
  }
}

/**
 * Extrait les visionnages d'un fichier progress pour une date donnée
 * @param {string} progressPath - Chemin vers le fichier progress JSON
 * @param {string} targetDate - Date cible YYYY-MM-DD
 * @param {Object} showInfo - Infos sur la série
 * @returns {Promise<Array>} Liste des épisodes visionnés ce jour
 */
async function extractWatchingsFromProgress(progressPath, targetDate, showInfo) {
  try {
    const content = await fs.readFile(progressPath, 'utf8');
    const progress = JSON.parse(content);
    const watchings = [];

    // Parcourir toutes les saisons et épisodes
    for (const season of progress.seasons || []) {
      for (const episode of season.episodes || []) {
        if (episode.completed && episode.last_watched_at) {
          const watchedDate = parseWatchedDate(episode.last_watched_at);
          if (watchedDate === targetDate) {
            watchings.push({
              type: 'episode',
              show: showInfo?.title || 'Série inconnue',
              show_ids: showInfo?.ids || {},
              season_number: season.number,
              episode_number: episode.number,
              watched_at: episode.last_watched_at,
              poster: showInfo?.poster || null
            });
          }
        }
      }
    }

    return watchings;
  } catch (err) {
    logger.debug(`Erreur lecture progress ${progressPath}:`, err.message);
    return [];
  }
}

/**
 * Récupère les visionnages pour une date donnée
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Promise<Array>} Liste des visionnages du jour
 */
export async function getWatchingsByDate(date) {
  // Vérifier le cache
  const cacheKey = date;
  const cached = cache.get(cacheKey);
  const ttl = getCacheTTL(date);
  
  // Si date future, retourner vide
  if (ttl === -1) {
    return [];
  }
  
  // Si cache valide
  if (cached) {
    const isExpired = ttl > 0 && (Date.now() - cached.timestamp) > ttl;
    if (!isExpired) {
      logger.debug(`Cache hit pour ${date}`);
      return cached.data;
    }
  }

  logger.debug(`Calcul des visionnages pour ${date}`);
  
  try {
    const watchings = [];
    
    // 1. Récupérer les shows depuis l'historique principal
    const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'trakt_history_cache.json');
    const showsInfo = new Map();
    
    try {
      const historyContent = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyContent);
      
      // Indexer les infos des shows
      for (const show of history.showsRows || []) {
        if (show.ids?.trakt) {
          showsInfo.set(show.ids.trakt, {
            title: show.title,
            ids: show.ids,
            poster: show.poster
          });
        }
      }
    } catch (err) {
      logger.warn('Impossible de charger l\'historique principal:', err.message);
    }

    // 2. Parcourir les fichiers progress
    const progressDir = path.join(process.cwd(), 'data', '.cache_trakt', 'progress');
    
    try {
      const files = await fs.readdir(progressDir);
      const progressFiles = files.filter(f => f.startsWith('watched_') && f.endsWith('.json'));
      
      for (const file of progressFiles) {
        // Extraire l'ID Trakt du nom de fichier
        const match = file.match(/watched_(\d+)\.json/);
        if (!match) continue;
        
        const traktId = parseInt(match[1]);
        const showInfo = showsInfo.get(traktId);
        const filePath = path.join(progressDir, file);
        
        const episodeWatchings = await extractWatchingsFromProgress(filePath, date, showInfo);
        watchings.push(...episodeWatchings);
      }
      
    } catch (err) {
      logger.warn('Impossible de lire le dossier progress:', err.message);
    }

    // 3. Ajouter les films depuis l'historique
    try {
      const historyContent = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyContent);
      
      // Parcourir les films et chercher ceux regardés à cette date
      for (const movie of history.moviesRows || []) {
        if (movie.watched_at) {
          const watchedDate = parseWatchedDate(movie.watched_at);
          if (watchedDate === date) {
            // Un film peut avoir plusieurs visionnages le même jour
            for (let i = 0; i < (movie.plays || 1); i++) {
              watchings.push({
                type: 'movie',
                show: movie.title,
                show_ids: movie.ids || {},
                season_number: null,
                episode_number: null,
                watched_at: movie.watched_at,
                poster: movie.poster || null,
                year: movie.year
              });
            }
          }
        }
      }
    } catch (err) {
      logger.debug('Impossible de lire les films depuis l\'historique:', err.message);
    }

    // 4. Trier par heure de visionnage
    watchings.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));
    
    // 4. Mettre en cache selon la logique TTL
    if (ttl !== -1) {
      cache.set(cacheKey, {
        data: watchings,
        timestamp: Date.now()
      });
      
      // Nettoyage automatique du cache si TTL > 0
      if (ttl > 0) {
        setTimeout(() => cache.delete(cacheKey), ttl);
      }
    }

    logger.debug(`${watchings.length} visionnages trouvés pour ${date}`);
    return watchings;
    
  } catch (err) {
    logger.error('Erreur lors du calcul des visionnages:', err);
    return [];
  }
}

/**
 * Statistiques du cache (pour debug)
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  };
}