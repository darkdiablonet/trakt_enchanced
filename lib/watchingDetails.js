/**
 * Module pour récupérer les détails de visionnage des films et séries
 * Utilise les fichiers progress et history pour extraire les informations
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';

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
      
      // Chercher dans moviesRows
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
 * Récupère les détails de visionnage pour une série
 * @param {string} traktId - ID Trakt de la série
 * @returns {Promise<Object>} Détails de visionnage
 */
export async function getShowWatchingDetails(traktId) {
  try {
    const watchings = [];
    
    // 1. Chercher le fichier progress pour cette série
    const progressPath = path.join(process.cwd(), 'data', '.cache_trakt', 'progress', `watched_${traktId}.json`);
    
    try {
      const progressContent = await fs.readFile(progressPath, 'utf8');
      const progress = JSON.parse(progressContent);
      
      // Enrichir avec les infos de la série depuis l'historique
      let showInfo = null;
      const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'trakt_history_cache.json');
      
      try {
        const historyContent = await fs.readFile(historyPath, 'utf8');
        const history = JSON.parse(historyContent);
        
        // Trouver une entrée pour cette série dans showsRows
        if (history.showsRows) {
          for (const show of history.showsRows) {
            if (show.ids && String(show.ids.trakt) === String(traktId)) {
              showInfo = show;
              break;
            }
          }
        }
      } catch (err) {
        logger.debug(`Impossible de lire trakt_history_cache.json pour enrichissement:`, err.message);
      }
      
      // Parcourir toutes les saisons et épisodes du progress
      for (const season of progress.seasons || []) {
        for (const episode of season.episodes || []) {
          if (episode.completed && episode.last_watched_at) {
            const watchedAt = parseWatchedDate(episode.last_watched_at);
            if (watchedAt) {
              watchings.push({
                watched_at: watchedAt,
                season_number: season.number,
                episode_number: episode.number,
                episode_title: episode.title || `Episode ${episode.number}`,
                show_title: showInfo?.title || progress.title || 'Série inconnue',
                poster: showInfo?.ids?.poster || progress.poster
              });
            }
          }
        }
      }
    } catch (err) {
      logger.debug(`Impossible de lire progress ${progressPath}:`, err.message);
      
      // Fallback: chercher dans l'historique général
      const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'history.json');
      
      try {
        const historyContent = await fs.readFile(historyPath, 'utf8');
        const history = JSON.parse(historyContent);
        
        // Chercher les épisodes de cette série
        for (const entry of history) {
          if (entry.episode && entry.show && entry.show.ids && String(entry.show.ids.trakt) === String(traktId)) {
            const watchedAt = parseWatchedDate(entry.watched_at);
            if (watchedAt) {
              watchings.push({
                watched_at: watchedAt,
                season_number: entry.episode.season,
                episode_number: entry.episode.number,
                episode_title: entry.episode.title || `Episode ${entry.episode.number}`,
                show_title: entry.show.title,
                poster: entry.show.ids?.poster
              });
            }
          }
        }
      } catch (err) {
        logger.debug(`Impossible de lire history.json en fallback:`, err.message);
      }
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