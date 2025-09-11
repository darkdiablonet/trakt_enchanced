/**
 * Module pour récupérer les détails de visionnage des films et séries
 * Utilise les fichiers progress et history pour extraire les informations
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';
import { jsonLoad } from './util.js';
import { get as traktGet, getHistory } from './trakt.js';

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
    
    // 1. Récupérer les données fraîches directement depuis l'API Trakt watched (au lieu de history)
    try {
      logger.debug(`WatchingDetails: Fetching fresh watched data for movie ${traktId} from API`);
      const watchedData = await traktGet(`/sync/watched/movies?extended=full`);
      
      if (Array.isArray(watchedData) && watchedData.length > 0) {
        // Trouver le film spécifique dans les données watched
        const movieData = watchedData.find(item => 
          item.movie?.ids?.trakt && String(item.movie.ids.trakt) === String(traktId)
        );
        
        if (movieData && movieData.plays > 0) {
          // Si plusieurs plays, récupérer l'historique détaillé pour ce film spécifique
          if (movieData.plays > 1) {
            try {
              logger.debug(`WatchingDetails: Movie has ${movieData.plays} plays, fetching detailed history for ${traktId}`);
              // Utiliser l'endpoint /sync/history/movies/{id} pour ce film spécifique
              const detailedHistory = await traktGet(`/sync/history/movies/${traktId}?extended=full&limit=1000`);
              
              if (Array.isArray(detailedHistory) && detailedHistory.length > 0) {
                // Pas besoin de filtrer, l'endpoint retourne déjà seulement ce film
                for (const item of detailedHistory) {
                  const watchedAt = parseWatchedDate(item.watched_at);
                  if (watchedAt) {
                    watchings.push({
                      watched_at: watchedAt,
                      title: item.movie?.title || movieData.movie?.title || 'Film inconnu',
                      year: item.movie?.year || movieData.movie?.year,
                      action: item.action || 'watch'
                    });
                  }
                }
                logger.debug(`WatchingDetails: Récupéré ${detailedHistory.length} entrées d'historique détaillé pour le film ${traktId}`);
              } else {
                // Fallback si l'historique détaillé échoue
                const watchedAt = parseWatchedDate(movieData.last_watched_at);
                if (watchedAt) {
                  watchings.push({
                    watched_at: watchedAt,
                    title: movieData.movie?.title || 'Film inconnu',
                    year: movieData.movie?.year,
                    plays: movieData.plays
                  });
                }
              }
            } catch (historyErr) {
              logger.error(`WatchingDetails: Erreur lors de la récupération de l'historique détaillé pour ${traktId}:`, historyErr.message);
              // Fallback: utiliser last_watched_at
              const watchedAt = parseWatchedDate(movieData.last_watched_at);
              if (watchedAt) {
                watchings.push({
                  watched_at: watchedAt,
                  title: movieData.movie?.title || 'Film inconnu',
                  year: movieData.movie?.year,
                  plays: movieData.plays
                });
              }
            }
          } else {
            // Un seul visionnage, utiliser last_watched_at
            const watchedAt = parseWatchedDate(movieData.last_watched_at);
            if (watchedAt) {
              watchings.push({
                watched_at: watchedAt,
                title: movieData.movie?.title || 'Film inconnu',
                year: movieData.movie?.year,
                plays: movieData.plays
              });
            }
          }
        }
        
        logger.debug(`WatchingDetails: Trouvé ${watchings.length} visionnages pour le film ${traktId} depuis l'API watched`);
      } else {
        logger.debug(`WatchingDetails: Aucune donnée watched trouvée pour le film ${traktId} depuis l'API`);
      }
    } catch (err) {
      logger.error('WatchingDetails: Erreur lors de la récupération de l\'historique API:', err.message);
      
      // Fallback: Chercher dans l'historique détaillé en cache
      const historyDetailPath = path.join(process.cwd(), 'data', '.cache_trakt', 'history_movies.json');
      
      try {
        const historyContent = await fs.readFile(historyDetailPath, 'utf8');
        const historyItems = JSON.parse(historyContent);
        
        if (Array.isArray(historyItems)) {
          // Filtrer les entrées pour ce film spécifique
          const movieWatchings = historyItems.filter(item => 
            item.movie?.ids?.trakt && String(item.movie.ids.trakt) === String(traktId)
          );
          
          for (const item of movieWatchings) {
            const watchedAt = parseWatchedDate(item.watched_at);
            if (watchedAt) {
              watchings.push({
                watched_at: watchedAt,
                title: item.movie.title,
                year: item.movie.year
              });
            }
          }
          
          logger.debug(`WatchingDetails: Trouvé ${watchings.length} visionnages pour le film ${traktId} depuis le cache détaillé`);
        }
      } catch (err2) {
        logger.debug(`Impossible de lire history_movies.json, fallback vers cache général:`, err2.message);
        
        // Dernier fallback: Chercher dans le cache général
        const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'trakt_history_cache.json');
        
        try {
          const historyContent = await fs.readFile(historyPath, 'utf8');
          const history = JSON.parse(historyContent);
          
          if (history.moviesRows) {
            for (const movie of history.moviesRows) {
              if (movie.ids && String(movie.ids.trakt) === String(traktId)) {
                const watchedAt = parseWatchedDate(movie.watched_at);
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
            
            logger.debug(`WatchingDetails: Trouvé ${watchings.length} visionnages pour le film ${traktId} depuis le cache général`);
          }
        } catch (err3) {
          logger.debug(`Impossible de lire trakt_history_cache.json:`, err3.message);
        }
      }
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
    
    // 1. Récupérer les données fraîches directement depuis l'API Trakt
    try {
      logger.debug(`WatchingDetails: Fetching fresh data for show ${traktId} from API`);
      const watchedShows = await traktGet('/sync/watched/shows');
      
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
          logger.debug(`WatchingDetails: Série ${traktId} non trouvée dans les données watched API`);
        }
      } else {
        logger.warn('WatchingDetails: Aucune donnée watched shows récupérée depuis API');
      }
    } catch (err) {
      logger.error('WatchingDetails: Erreur lors de la récupération API:', err.message);
      
      // Fallback vers le cache en cas d'erreur API
      try {
        const watchedCachePath = path.join(process.cwd(), 'data', '.cache_trakt', 'watched_shows_complete.json');
        const watchedShows = await jsonLoad(watchedCachePath);
        
        if (Array.isArray(watchedShows) && watchedShows.length > 0) {
          // Même logique que ci-dessus pour le fallback
          const targetShow = watchedShows.find(show => 
            show.show?.ids?.trakt && String(show.show.ids.trakt) === String(traktId)
          );
          
          if (targetShow) {
            const showInfo = {
              title: targetShow.show?.title || 'Série inconnue',
              ids: targetShow.show?.ids || {},
              poster: null
            };
            
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
          }
        }
      } catch (fallbackErr) {
        logger.warn('WatchingDetails: Fallback vers cache échoué:', fallbackErr.message);
      }
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