/**
 * Module pour récupérer les détails de visionnage des films et séries
 * Utilise les fichiers progress et history pour extraire les informations
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';
import { jsonLoad } from './util.js';

/**
 * Parse une date de visionnage Trakt
 * @param {string} watchedAt - Date ISO string  
 * @returns {string|null} Date ISO ou null
 */
function parseWatchedDate(watchedAt) {
  if (!watchedAt) return null;
  try {
    return new Date(watchedAt).toISOString();
  } catch (err) {
    return null;
  }
}

/**
 * Récupère les détails de visionnage pour un film
 * @param {string} traktId - ID Trakt du film
 * @returns {Promise<Object>} Détails de visionnage
 */
export async function getMovieWatchingDetails(traktId) {
  try {
    const watchings = [];
    
    // 1. Chercher dans le fichier trakt_history_cache pour les films
    const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'trakt_history_cache.json');
    
    try {
      const historyContent = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyContent);
      
      // Chercher dans movies
      if (history.movies) {
        for (const movie of history.movies) {
          if (movie.ids && String(movie.ids.trakt) === String(traktId)) {
            const watchedAt = parseWatchedDate(movie.last_watched_at || movie.watched_at);
            if (watchedAt) {
              // Un film peut avoir plusieurs visionnages (plays > 1)
              for (let i = 0; i < (movie.plays || 1); i++) {
                watchings.push({
                  watched_at: watchedAt,
                  title: movie.title,
                  year: movie.year
                });
              }
            }
          }
        }
      }
    } catch (err) {
      logger.debug(`Impossible de lire trakt_history_cache.json:`, err.message);
    }
    
    // Trier par date décroissante (plus récent en premier)
    watchings.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));
    
    return {
      traktId,
      type: 'movie',
      watchings
    };
    
  } catch (err) {
    logger.error('Erreur récupération détails film:', err);
    return {
      traktId,
      type: 'movie',
      watchings: [],
      error: err.message
    };
  }
}

/**
 * Récupère les détails de visionnage pour une série depuis les données watched
 * @param {string} traktId - ID Trakt de la série
 * @returns {Promise<Object>} Détails de visionnage
 */
export async function getShowWatchingDetails(traktId) {
  try {
    const watchings = [];
    
    // 1. Charger les données watched shows depuis le cache centralisé
    try {
      const watchedCachePath = path.join(process.cwd(), 'data', '.cache_trakt', 'watched_shows_complete.json');
      const watchedShows = await jsonLoad(watchedCachePath);
      
      if (Array.isArray(watchedShows) && watchedShows.length > 0) {
        // Trouver la série par ID Trakt
        const targetShow = watchedShows.find(show => 
          show.show?.ids?.trakt && String(show.show.ids.trakt) === String(traktId)
        );
        
        if (targetShow) {
          const showInfo = {
            title: targetShow.show?.title || 'Série inconnue',
            ids: targetShow.show?.ids || {},
            poster: null // Sera enrichi depuis l'historique
          };
          
          // Parcourir toutes les saisons et épisodes
          for (const season of targetShow.seasons || []) {
            for (const episode of season.episodes || []) {
              if (episode.last_watched_at) {
                const watchedAt = parseWatchedDate(episode.last_watched_at);
                if (watchedAt) {
                  watchings.push({
                    watched_at: watchedAt,
                    season_number: season.number,
                    episode_number: episode.number,
                    episode_title: episode.title || `Episode ${episode.number}`,
                    show_title: showInfo.title,
                    poster: showInfo.poster
                  });
                }
              }
            }
          }
        } else {
          logger.debug(`WatchingDetails: Série ${traktId} non trouvée dans les données watched`);
        }
      } else {
        logger.warn('WatchingDetails: Aucune donnée watched shows trouvée dans le cache');
      }
    } catch (err) {
      logger.warn('WatchingDetails: Impossible de lire le cache watched shows:', err.message);
    }
    
    // 2. Enrichir avec les informations poster depuis l'historique
    try {
      const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'trakt_history_cache.json');
      const historyContent = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyContent);
      
      // Chercher les infos show pour le poster
      if (history.shows) {
        const showInfo = history.shows.find(show => 
          show.ids?.trakt && String(show.ids.trakt) === String(traktId)
        );
        
        if (showInfo) {
          // Mettre à jour le poster dans tous les watchings
          for (const watching of watchings) {
            watching.poster = showInfo.poster;
          }
        }
      }
    } catch (err) {
      logger.debug('WatchingDetails: Impossible de charger les infos shows depuis l\'historique:', err.message);
    }
    
    // Trier par date décroissante (plus récent en premier)
    watchings.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));
    
    return {
      traktId,
      type: 'show', 
      watchings
    };
    
  } catch (err) {
    logger.error('Erreur récupération détails série:', err);
    return {
      traktId,
      type: 'show',
      watchings: [],
      error: err.message
    };
  }
}