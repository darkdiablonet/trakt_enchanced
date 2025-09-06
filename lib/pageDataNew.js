/**
 * Nouveau système de données de page avec cache granulaire
 * Remplace le cache global monolithique par un cache par carte
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, jsonLoad, jsonSave } from './util.js';
import { DATA_DIR } from './config.js';
import { headers as traktHeaders, get as traktGet, loadToken, enrichShowsWithProgressOptimized } from './trakt.js';
import { getCachedMeta } from './tmdb.js';
import { 
  cacheShowCard, 
  cacheMovieCard, 
  getShowCard, 
  getMovieCard, 
  getAllShowCards, 
  getAllMovieCards, 
  invalidateShowCard,
  invalidateMovieCard,
  cleanExpiredCards 
} from './cardCache.js';
import { sendProgress, sendCompletion, hasActiveConnections } from './progressTracker.js';

/**
 * Construit une carte de série avec toutes ses données
 */
async function buildShowCard(showData, headers, forceRefresh = false) {
  const show = showData.show;
  const traktId = show.ids.trakt;
  
  try {
    // Récupérer les métadonnées TMDB avec poster
    const meta = await getCachedMeta(
      null, // req
      'tv',
      show.title,
      show.year,
      show.ids.tmdb,
      'w342',
      traktId
    );
    
    // Calculer le nombre d'épisodes vus correctement depuis seasons
    const seasons = showData.seasons || [];
    const watchedEpisodes = seasons.reduce((total, season) => {
      return total + (season.episodes?.length || 0);
    }, 0);
    
    const card = {
      ids: show.ids,
      title: show.title,
      year: show.year,
      episodes: watchedEpisodes,
      episodes_total: null,
      missing: null,
      plays: showData.plays || 0,
      last_watched_at: showData.last_watched_at,
      poster: meta.poster,
      tmdb_url: meta.tmdbUrl,
      overview: meta.overview,
      trakt_url: `https://trakt.tv/shows/${show.ids.slug || show.ids.trakt}`,
      next: null,
      next_episode_data: null,
      type: 'show'
    };
    
    // Enrichir avec les données de progression (next episode, etc.)
    const cardArray = [card];
    await enrichShowsWithProgressOptimized(cardArray, { 
      updateMissing: true, 
      headers,
      forceRefreshTraktId: forceRefresh ? traktId : null
    });
    
    return cardArray[0];
  } catch (error) {
    console.error(`[pageDataNew] Error building show card ${traktId}:`, error.message);
    // Retourner une carte basique en cas d'erreur avec calcul correct des épisodes
    const seasons = showData.seasons || [];
    const watchedEpisodes = seasons.reduce((total, season) => {
      return total + (season.episodes?.length || 0);
    }, 0);
    
    return {
      ids: show.ids,
      title: show.title,
      year: show.year,
      episodes: watchedEpisodes,
      plays: showData.plays || 0,
      last_watched_at: showData.last_watched_at,
      type: 'show'
    };
  }
}

/**
 * Construit une carte de film avec toutes ses données
 */
async function buildMovieCard(movieData) {
  const movie = movieData.movie;
  const traktId = movie.ids.trakt;
  
  try {
    // Récupérer les métadonnées TMDB avec poster
    const meta = await getCachedMeta(
      null, // req
      'movie',
      movie.title,
      movie.year,
      movie.ids.tmdb,
      'w342',
      traktId
    );
    
    const card = {
      ids: movie.ids,
      title: movie.title,
      year: movie.year,
      plays: movieData.plays || 0,
      last_watched_at: movieData.last_watched_at,
      poster: meta.poster,
      tmdb_url: meta.tmdbUrl,
      overview: meta.overview,
      trakt_url: `https://trakt.tv/movies/${movie.ids.slug || movie.ids.trakt}`,
      type: 'movie'
    };
    
    return card;
  } catch (error) {
    console.error(`[pageDataNew] Error building movie card ${traktId}:`, error.message);
    // Retourner une carte basique en cas d'erreur
    return {
      ids: movie.ids,
      title: movie.title,
      year: movie.year,
      plays: movieData.plays || 0,
      last_watched_at: movieData.last_watched_at,
      type: 'movie'
    };
  }
}

/**
 * Récupère ou construit une carte de série
 */
export async function getOrBuildShowCard(traktId, headers, forceRebuild = false) {
  // Essayer le cache d'abord
  if (!forceRebuild) {
    const cached = await getShowCard(traktId);
    if (cached) {
      return cached;
    }
  }
  
  // Building show card from API
  
  try {
    // Récupérer les données watched pour cette série
    const watchedShows = await traktGet('/sync/watched/shows', headers);
    const showData = watchedShows.find(s => s.show?.ids?.trakt === traktId);
    
    if (!showData) {
      console.warn(`[pageDataNew] Show ${traktId} not found in watched data`);
      return null;
    }
    
    // Construire la carte
    const card = await buildShowCard(showData, headers, forceRebuild);
    
    // La mettre en cache
    await cacheShowCard(traktId, card);
    
    return card;
  } catch (error) {
    console.error(`[pageDataNew] Error getting/building show card ${traktId}:`, error.message);
    return null;
  }
}

/**
 * Récupère ou construit une carte de film
 */
export async function getOrBuildMovieCard(traktId, headers, forceRebuild = false) {
  // Essayer le cache d'abord
  if (!forceRebuild) {
    const cached = await getMovieCard(traktId);
    if (cached) {
      return cached;
    }
  }
  
  // Building movie card from API
  
  try {
    // Récupérer les données watched pour ce film
    const watchedMovies = await traktGet('/sync/watched/movies', headers);
    const movieData = watchedMovies.find(m => m.movie?.ids?.trakt === traktId);
    
    if (!movieData) {
      console.warn(`[pageDataNew] Movie ${traktId} not found in watched data`);
      return null;
    }
    
    // Construire la carte
    const card = await buildMovieCard(movieData);
    
    // La mettre en cache
    await cacheMovieCard(traktId, card);
    
    return card;
  } catch (error) {
    console.error(`[pageDataNew] Error getting/building movie card ${traktId}:`, error.message);
    return null;
  }
}

/**
 * Construit toutes les données de page avec le nouveau système
 */
export async function buildPageDataGranular(headers) {
  console.log('[pageDataNew] Building page data with granular cache system');
  
  // Envoyer l'étape d'authentification
  if (hasActiveConnections()) {
    sendProgress('auth', 'active', 'Verification du token...');
  }
  
  // Vérifier si on a des headers valides (authentification)
  if (!headers || !headers.Authorization) {
    console.log('[pageDataNew] No valid authentication headers, cannot fetch data');
    if (hasActiveConnections()) {
      sendProgress('auth', 'error', 'Token invalide ou manquant');
    }
    return {
      showsRows: [],
      showsUnseenRows: [],
      moviesRows: [],
      moviesUnseenRows: [],
      built_at: new Date().toISOString(),
      cache_type: 'granular',
      needsAuth: true
    };
  }
  
  if (hasActiveConnections()) {
    sendProgress('auth', 'completed', 'Token validé', 10);
  }
  
  try {
    // Nettoyer les caches expirés
    await cleanExpiredCards();
    
    if (hasActiveConnections()) {
      sendProgress('shows', 'active', 'Récupération des séries...', 15);
    }
    
    // Récupérer les données depuis Trakt
    const [watchedShows, watchedMovies, collectionMovies] = await Promise.all([
      traktGet('/sync/watched/shows', headers),
      traktGet('/sync/watched/movies', headers),
      traktGet('/sync/collection/movies', headers)
    ]);
    
    if (hasActiveConnections()) {
      sendProgress('shows', 'completed', `${watchedShows.length} séries récupérées`, 30);
      sendProgress('movies', 'active', 'Traitement des films...', 35);
    }
    
    // Construire les cartes en parallèle (max 10 à la fois pour éviter la surcharge)
    const BATCH_SIZE = 10;
    
    // Traiter les séries par lots
    const showCards = [];
    for (let i = 0; i < watchedShows.length; i += BATCH_SIZE) {
      const batch = watchedShows.slice(i, i + BATCH_SIZE);
      const batchCards = await Promise.all(
        batch.map(async (showData) => {
          const traktId = showData.show?.ids?.trakt;
          if (!traktId) return null;
          
          // Vérifier le cache d'abord
          let card = await getShowCard(traktId);
          if (!card) {
            card = await buildShowCard(showData, headers);
            await cacheShowCard(traktId, card);
          }
          return card;
        })
      );
      
      showCards.push(...batchCards.filter(Boolean));
      
      // Envoyer le progrès des séries
      if (hasActiveConnections()) {
        const progress = Math.round(30 + (showCards.length / watchedShows.length) * 20);
        sendProgress('shows', 'active', `Traitement: ${showCards.length}/${watchedShows.length} séries`, progress);
      }
    }
    
    if (hasActiveConnections()) {
      sendProgress('shows', 'completed', `${showCards.length} séries traitées`, 50);
    }
    
    // Traiter les films par lots
    const movieCards = [];
    if (hasActiveConnections()) {
      sendProgress('movies', 'active', 'Traitement des films visionnés...', 55);
    }
    
    for (let i = 0; i < watchedMovies.length; i += BATCH_SIZE) {
      const batch = watchedMovies.slice(i, i + BATCH_SIZE);
      const batchCards = await Promise.all(
        batch.map(async (movieData) => {
          const traktId = movieData.movie?.ids?.trakt;
          if (!traktId) return null;
          
          // Vérifier le cache d'abord
          let card = await getMovieCard(traktId);
          if (!card) {
            card = await buildMovieCard(movieData);
            await cacheMovieCard(traktId, card);
          }
          return card;
        })
      );
      
      movieCards.push(...batchCards.filter(Boolean));
      
      // Envoyer le progrès des films
      if (hasActiveConnections()) {
        const progress = Math.round(55 + (movieCards.length / watchedMovies.length) * 15);
        sendProgress('movies', 'active', `Films: ${movieCards.length}/${watchedMovies.length}`, progress);
      }
    }
    
    if (hasActiveConnections()) {
      sendProgress('movies', 'completed', `${movieCards.length} films visionnés traités`, 70);
      sendProgress('progress', 'active', 'Calcul de la progression...', 72);
    }
    
    // Traiter les films de collection non vus
    const watchedMovieIds = new Set(watchedMovies.map(m => m.movie?.ids?.trakt).filter(Boolean));
    const unseenCollectionMovies = collectionMovies.filter(cm => !watchedMovieIds.has(cm.movie?.ids?.trakt));
    
    console.log(`[pageDataNew] Found ${unseenCollectionMovies.length} unseen movies in collection`);
    
    // Traiter les films de collection non vus par lots
    for (let i = 0; i < unseenCollectionMovies.length; i += BATCH_SIZE) {
      const batch = unseenCollectionMovies.slice(i, i + BATCH_SIZE);
      const batchCards = await Promise.all(
        batch.map(async (movieData) => {
          const traktId = movieData.movie?.ids?.trakt;
          if (!traktId) return null;
          
          // Transformer les données de collection en format watched (avec plays = 0)
          const unwatchedMovieData = {
            movie: movieData.movie,
            plays: 0,
            last_watched_at: null,
            collected_at: movieData.collected_at
          };
          
          // Vérifier le cache d'abord
          let card = await getMovieCard(traktId);
          if (!card) {
            card = await buildMovieCard(unwatchedMovieData);
            await cacheMovieCard(traktId, card);
          }
          return card;
        })
      );
      
      movieCards.push(...batchCards.filter(Boolean));
      
      // Envoyer le progrès de la collection
      if (hasActiveConnections()) {
        const totalMovies = watchedMovies.length + unseenCollectionMovies.length;
        const progress = Math.round(70 + ((movieCards.length - watchedMovies.length) / unseenCollectionMovies.length) * 15);
        sendProgress('progress', 'active', `Collection: ${movieCards.length}/${totalMovies} films`, progress);
      }
    }
    
    if (hasActiveConnections()) {
      sendProgress('progress', 'completed', 'Progression calculée', 85);
      sendProgress('collection', 'active', 'Organisation finale...', 88);
    }
    
    // Séparer les séries vues/non vues et films vus/non vus
    const showsRows = showCards.filter(s => s.episodes > 0);
    const showsUnseenRows = showCards.filter(s => s.missing > 0); // Séries avec épisodes manquants
    const moviesRows = movieCards.filter(m => m.plays > 0);
    const moviesUnseenRows = movieCards.filter(m => m.plays === 0);
    
    if (hasActiveConnections()) {
      sendProgress('collection', 'completed', 'Collection organisée', 95);
      sendProgress('final', 'active', 'Finalisation...', 98);
    }
    
    const result = {
      showsRows,
      showsUnseenRows,
      moviesRows,
      moviesUnseenRows,
      built_at: new Date().toISOString(),
      cache_type: 'granular'
    };
    
    console.log(`[pageDataNew] Built page data: ${showsRows.length} shows, ${showsUnseenRows.length} unseen shows, ${moviesRows.length} movies, ${moviesUnseenRows.length} unseen movies`);
    
    if (hasActiveConnections()) {
      sendProgress('final', 'completed', 'Chargement terminé!', 100);
      // Envoyer la completion finale
      setTimeout(() => {
        sendCompletion();
      }, 500);
    }
    
    return result;
    
  } catch (error) {
    console.error('[pageDataNew] Error building granular page data:', error.message);
    
    // Envoyer l'erreur via SSE si on a des connexions actives
    if (hasActiveConnections()) {
      sendProgress('final', 'error', `Erreur: ${error.message}`);
    }
    
    throw error;
  }
}

/**
 * Invalide seulement une carte spécifique au lieu de tout
 */
export async function invalidateSpecificCard(type, traktId) {
  if (type === 'show') {
    return await invalidateShowCard(traktId);
  } else if (type === 'movie') {
    return await invalidateMovieCard(traktId);
  }
  return false;
}

/**
 * Mise à jour d'une carte spécifique après mark/unmark
 */
export async function updateSpecificCard(type, traktId, headers) {
  console.log(`[pageDataNew] Updating ${type} card ${traktId}`);
  
  // Invalider le cache existant
  await invalidateSpecificCard(type, traktId);
  
  // Invalider AUSSI le cache de progression pour les séries (pour next_episode)
  if (type === 'show') {
    try {
      const progressCacheFile = path.join(DATA_DIR, '.cache_trakt', `progress_${traktId}.json`);
      await fsp.unlink(progressCacheFile);
      console.log(`[pageDataNew] 🗑️  Invalidated progress cache for show ${traktId}`);
    } catch (error) {
      // File might not exist, that's ok
    }
  }
  
  // Reconstruire la carte
  if (type === 'show') {
    return await getOrBuildShowCard(traktId, headers, true);
  } else if (type === 'movie') {
    return await getOrBuildMovieCard(traktId, headers, true);
  }
  
  return null;
}