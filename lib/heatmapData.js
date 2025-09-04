/**
 * Module pour générer les données de heatmap réelles
 * Utilise les mêmes sources que l'endpoint watchings-by-date
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';
import { jsonLoad } from './util.js';

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
 * Génère toutes les dates d'une année
 * @param {number} year - Année
 * @returns {Array<Date>} Liste des dates
 */
function datesOfYear(year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const days = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

/**
 * Extrait les visionnages des données watched pour une année donnée
 * @param {Array} watchedShows - Données watched depuis /sync/watched/shows
 * @param {number} year - Année cible
 * @returns {Map<string, number>} Map date -> count
 */
function extractWatchingsFromWatchedByYear(watchedShows, year) {
  const dailyCounts = new Map();

  for (const watchedItem of watchedShows) {
    // Parcourir toutes les saisons et épisodes de chaque série
    for (const season of watchedItem.seasons || []) {
      for (const episode of season.episodes || []) {
        if (episode.last_watched_at) {
          const watchedDate = parseWatchedDate(episode.last_watched_at);
          if (watchedDate && watchedDate.startsWith(year.toString())) {
            const currentCount = dailyCounts.get(watchedDate) || 0;
            dailyCounts.set(watchedDate, currentCount + 1);
          }
        }
      }
    }
  }

  return dailyCounts;
}

/**
 * Génère les données de heatmap réelles pour une année
 * @param {number} year - Année
 * @param {string} type - Type de données (ignoré pour l'instant, toujours 'all')
 * @returns {Promise<Object>} Données de heatmap
 */
export async function generateRealHeatmapData(year, type = 'all') {
  try {
    const yearDates = datesOfYear(year);
    const allDailyCounts = new Map();

    // 1. Charger les données watched shows depuis le cache centralisé
    try {
      const watchedCachePath = path.join(process.cwd(), 'data', '.cache_trakt', 'watched_shows_complete.json');
      const watchedShows = await jsonLoad(watchedCachePath);
      
      if (Array.isArray(watchedShows) && watchedShows.length > 0) {
        logger.debug(`Heatmap: Chargement ${watchedShows.length} séries depuis le cache watched`);
        const showsDailyCounts = extractWatchingsFromWatchedByYear(watchedShows, year);
        
        // Fusionner les compteurs des séries
        for (const [date, count] of showsDailyCounts) {
          const currentCount = allDailyCounts.get(date) || 0;
          allDailyCounts.set(date, currentCount + count);
        }
      } else {
        logger.warn('Heatmap: Aucune donnée watched shows trouvée dans le cache');
      }
    } catch (err) {
      logger.warn('Heatmap: Impossible de lire le cache watched shows:', err.message);
    }

    // 2. Ajouter les films depuis l'historique mis à jour 
    try {
      const historyPath = path.join(process.cwd(), 'data', '.cache_trakt', 'trakt_history_cache.json');
      const historyContent = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyContent);
      
      // Parcourir les films et compter ceux de l'année demandée
      for (const movie of history.movies || []) {
        if (movie.last_watched_at) {
          const watchedDate = parseWatchedDate(movie.last_watched_at);
          if (watchedDate && watchedDate.startsWith(year.toString())) {
            // Un film peut avoir plusieurs visionnages (plays)
            const currentCount = allDailyCounts.get(watchedDate) || 0;
            allDailyCounts.set(watchedDate, currentCount + (movie.plays || 1));
          }
        }
      }
      logger.debug(`Heatmap: Ajouté ${history.movies?.length || 0} films depuis l'historique`);
    } catch (err) {
      logger.debug('Heatmap: Impossible de lire les films depuis l\'historique:', err.message);
    }

    // 3. Créer les données de heatmap au format attendu
    const days = [];
    let max = 0;
    let daysWithCount = 0;
    let sum = 0;

    yearDates.forEach(date => {
      const utcDateStr = date.toISOString().slice(0, 10);
      // Chercher dans les données locales avec la clé locale correspondant à cette date UTC
      const localDateStr = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const count = allDailyCounts.get(localDateStr) || 0;
      
      days.push({
        date: utcDateStr,
        count: count
      });
      
      if (count > 0) {
        daysWithCount++;
        sum += count;
      }
      if (count > max) {
        max = count;
      }
    });

    const heatmapData = {
      year: year,
      max: max,
      sum: sum,
      daysWithCount: daysWithCount,
      days: days
    };

    logger.debug(`Heatmap générée pour ${year}: ${daysWithCount} jours actifs, max ${max}`);
    return heatmapData;
    
  } catch (err) {
    logger.error('Erreur génération heatmap:', err);
    return {
      year: year,
      max: 0, 
      sum: 0,
      daysWithCount: 0,
      days: []
    };
  }
}