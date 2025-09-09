/**
 * Module de récupération des visionnages par date
 * Utilise le cache progress local avec cache intelligent
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';
import { jsonLoad } from './util.js';
import { ensureWatchedShowsCache } from './trakt.js';

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
 * Extrait les visionnages des données watched pour une date donnée
 * @param {Array} watchedShows - Données watched depuis le cache
 * @param {string} targetDate - Date cible YYYY-MM-DD
 * @returns {Array} Liste des épisodes visionnés ce jour
 */
function extractWatchingsFromWatched(watchedShows, targetDate) {
  const watchings = [];

  for (const watchedItem of watchedShows) {
    const showInfo = {
      title: watchedItem.show?.title || 'Série inconnue',
      ids: watchedItem.show?.ids || {},
      poster: null // Les données watched n'ont pas le poster, on l'ajoutera depuis l'historique
    };

    // Parcourir toutes les saisons et épisodes
    for (const season of watchedItem.seasons || []) {
      for (const episode of season.episodes || []) {
        if (episode.last_watched_at) {
          const watchedDate = parseWatchedDate(episode.last_watched_at);
          if (watchedDate === targetDate) {
            watchings.push({
              type: 'episode',
              show: showInfo.title,
              show_ids: showInfo.ids,
              season_number: season.number,
              episode_number: episode.number,
              watched_at: episode.last_watched_at,
              poster: showInfo.poster
            });
          }
        }
      }
    }
  }

  return watchings;
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
    
    // 1. S'assurer que le cache global existe et charger les données
    try {
      // Force la création du cache s'il n'existe pas
      await ensureWatchedShowsCache();
      
      const watchedCachePath = path.join(process.cwd(), 'data', '.cache_trakt', 'watched_shows_complete.json');
      const watchedShows = await jsonLoad(watchedCachePath);
      
      if (Array.isArray(watchedShows) && watchedShows.length > 0) {
        logger.debug(`WatchingsByDate: Chargement ${watchedShows.length} séries depuis le cache watched`);
        const episodeWatchings = extractWatchingsFromWatched(watchedShows, date);
        watchings.push(...episodeWatchings);
      } else {
        logger.warn('WatchingsByDate: Cache watched existe mais est vide');
      }
    } catch (err) {
      logger.warn('WatchingsByDate: Impossible de créer/lire le cache watched shows:', err.message);
      
      // Fallback: utiliser les fichiers de progression individuels comme la heatmap
      try {
        const cacheDir = path.join(process.cwd(), 'data', '.cache_trakt');
        const files = await fs.readdir(cacheDir);
        const progressFiles = files.filter(f => f.startsWith('progress_') && f.endsWith('.json'));
        
        logger.debug(`WatchingsByDate: Fallback avec ${progressFiles.length} fichiers de progression individuels`);
        
        for (const progressFile of progressFiles) {
          try {
            const progressData = await jsonLoad(path.join(cacheDir, progressFile));
            
            // Extraire les données de visionnage de chaque fichier pour cette date
            if (progressData && progressData.seasons) {
              for (const season of progressData.seasons) {
                if (season.episodes) {
                  for (const episode of season.episodes) {
                    if (episode.last_watched_at) {
                      const watchedDate = parseWatchedDate(episode.last_watched_at);
                      if (watchedDate === date) {
                        // Récupérer les infos de la série depuis la carte
                        const traktId = progressFile.replace('progress_', '').replace('.json', '');
                        let showTitle = 'Série inconnue';
                        let showIds = { trakt: parseInt(traktId) };
                        
                        // Essayer de récupérer le titre depuis le cache de carte
                        try {
                          const cardPath = path.join(process.cwd(), 'data', '.cache_cards', `show_${traktId}.json`);
                          const cardData = await jsonLoad(cardPath);
                          if (cardData && cardData.title) {
                            showTitle = cardData.title;
                            showIds = cardData.ids || showIds;
                          }
                        } catch (cardErr) {
                          // Garde le titre par défaut
                        }
                        
                        watchings.push({
                          type: 'episode',
                          show: showTitle,
                          show_ids: showIds,
                          season_number: season.number,
                          episode_number: episode.number,
                          watched_at: episode.last_watched_at,
                          poster: null // Sera enrichi plus tard
                        });
                      }
                    }
                  }
                }
              }
            }
          } catch (fileErr) {
            // Ignorer les fichiers de progression corrompus
            continue;
          }
        }
        logger.debug(`WatchingsByDate: Fallback trouvé ${watchings.length} watchings pour ${date}`);
      } catch (dirErr) {
        logger.warn('WatchingsByDate: Impossible de lire le répertoire de progression:', dirErr.message);
      }
    }

    // 2. Enrichir avec les informations poster depuis l'historique ET les métadonnées
    const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'trakt_history_cache.json');
    const showsInfo = new Map();
    
    try {
      const historyContent = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyContent);
      
      // Indexer les infos des shows pour récupérer les posters
      for (const show of history.showsRows || []) {
        if (show.ids?.trakt) {
          showsInfo.set(show.ids.trakt, {
            poster: show.poster
          });
        }
      }
      
      // Enrichir les watchings avec les posters
      for (const watching of watchings) {
        if (watching.show_ids?.trakt) {
          const showInfo = showsInfo.get(watching.show_ids.trakt);
          if (showInfo && showInfo.poster) {
            watching.poster = showInfo.poster;
          }
        }
      }
    } catch (err) {
      logger.warn('Impossible de charger les infos shows depuis l\'historique:', err.message);
    }
    
    // 2b. Enrichir avec les posters depuis les caches granulaires des cartes  
    const cardsDir = path.join(process.cwd(), 'data', '.cache_cards');
    
    for (const watching of watchings) {
      if (watching.show_ids?.trakt) { // Toujours essayer, même si poster existe déjà
        try {
          const cardPath = path.join(cardsDir, `show_${watching.show_ids.trakt}.json`);
          const cardData = await jsonLoad(cardPath);
          
          if (cardData && cardData.poster) {
            watching.poster = cardData.poster;
            logger.debug(`✅ Poster trouvé depuis cache de carte pour show ${watching.show_ids.trakt}: ${cardData.poster}`);
          } else {
            // Fallback: construire le chemin du poster depuis cache_imgs
            const traktId = watching.show_ids.trakt;
            const posterPath = `/cache_imgs/trakt_${traktId}.jpg`;
            
            // Vérifier si le fichier existe avant de l'assigner
            try {
              const fullPath = path.join(process.cwd(), 'data', 'cache_imgs', `trakt_${traktId}.jpg`);
              await fs.access(fullPath);
              watching.poster = posterPath;
              logger.debug(`✅ Poster trouvé via fallback direct pour show ${traktId}: ${posterPath}`);
            } catch (accessErr) {
              // Le fichier n'existe pas, utiliser le placeholder
              logger.debug(`❌ Poster physique introuvable pour show ${traktId}: ${fullPath}`);
            }
          }
        } catch (err) {
          // Essayer quand même le fallback direct
          if (watching.show_ids?.trakt) {
            const traktId = watching.show_ids.trakt;
            const posterPath = `/cache_imgs/trakt_${traktId}.jpg`;
            
            try {
              const fullPath = path.join(process.cwd(), 'data', 'cache_imgs', `trakt_${traktId}.jpg`);
              await fs.access(fullPath);
              watching.poster = posterPath;
              logger.debug(`✅ Poster trouvé via fallback exception pour show ${traktId}: ${posterPath}`);
            } catch (accessErr) {
              logger.warn(`❌ Pas de cache ni de poster pour show ${traktId} (cherché: ${fullPath})`);
            }
          }
        }
      }
    }

    // 3. Ajouter les films depuis l'historique (moviesRows au lieu de movies)
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
    
    // Debug: afficher les résultats finaux
    logger.debug(`📊 Watchings trouvés pour ${date}: ${watchings.length} éléments`);
    for (const watching of watchings.slice(0, 3)) { // Afficher les 3 premiers seulement
      logger.debug(`  - ${watching.show} (${watching.type}): poster=${watching.poster || 'MANQUANT'}`);
    }
    
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