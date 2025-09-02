/**
 * Stats Module
 * Gestion des statistiques de base
 */

import { humanMinutes } from './utils.js';

export function statCard(title, items=[], highlight = null) {
  const rows = items
    .filter(it => it && it.label)
    .map(it => {
      const isHighlight = highlight && it.label === highlight.label;
      const rowClass = isHighlight ? 'flex justify-between py-1 px-2 bg-sky-500/20 rounded' : 'flex justify-between';
      const valueClass = isHighlight ? 'font-bold text-sky-300' : 'font-semibold';
      return `<div class="${rowClass}"><span class="text-muted">${it.label}</span><span class="${valueClass}">${it.value}</span></div>`;
    })
    .join('');
  return `
    <article class="glass rounded-xl p-4 hover:bg-white/5 transition-colors">
      <h3 class="text-base font-semibold mb-3 flex items-center gap-2">${title}</h3>
      <div class="space-y-1 text-sm">${rows || '<span class="text-disabled">—</span>'}</div>
    </article>`;
}

export function renderStats(stats) {
  const s = stats || {};
  const movies = s.movies || {};
  const shows = s.shows || {};
  const seasons = s.seasons || {};
  const episodes = s.episodes || {};
  const network = s.network || {};
  const ratings = s.ratings || {};
  const comments = s.comments || {};
  const lists = s.lists || {};

  // Calculer des totaux et métriques intéressantes  
  const totalWatched = (movies.watched ?? 0) + (shows.watched ?? 0);
  const totalMinutes = (movies.minutes ?? 0) + (episodes.minutes ?? 0);
  const totalPlays = (movies.plays ?? 0) + (episodes.plays ?? 0);
  const totalRatings = (movies.ratings ?? 0) + (shows.ratings ?? 0);
  
  const cards = [];
  
  // Vue d'ensemble avec highlights
  cards.push(statCard('📊 Vue d\'ensemble', [
    { label:'Total visionné', value: totalWatched.toLocaleString('fr-FR') },
    { label:'Temps total', value: humanMinutes(totalMinutes) },
    { label:'Lectures totales', value: totalPlays.toLocaleString('fr-FR') },
    { label:'Notes données', value: totalRatings.toLocaleString('fr-FR') },
  ], { label:'Temps total', value: humanMinutes(totalMinutes) }));
  
  // Films avec données enrichies
  const avgMovieRating = movies.ratings > 0 ? ((movies.minutes ?? 0) / movies.ratings).toFixed(0) : 0;
  cards.push(statCard('🎬 Films', [
    { label:'Vus', value: (movies.watched ?? 0).toLocaleString('fr-FR') },
    { label:'Lectures', value: (movies.plays ?? 0).toLocaleString('fr-FR') },
    { label:'Temps visionnage', value: humanMinutes(movies.minutes ?? 0) },
    { label:'Collection', value: (movies.collected ?? 0).toLocaleString('fr-FR') },
    { label:'Notes données', value: (movies.ratings ?? 0).toLocaleString('fr-FR') },
    { label:'Commentaires', value: (movies.comments ?? 0).toLocaleString('fr-FR') },
  ], { label:'Vus', value: (movies.watched ?? 0).toLocaleString('fr-FR') }));
  
  // Séries et épisodes combinés
  cards.push(statCard('📺 Séries & Épisodes', [
    { label:'Séries vues', value: (shows.watched ?? 0).toLocaleString('fr-FR') },
    { label:'Saisons', value: (seasons.watched ?? 0).toLocaleString('fr-FR') },
    { label:'Épisodes', value: (episodes.watched ?? 0).toLocaleString('fr-FR') },
    { label:'Lectures épisodes', value: (episodes.plays ?? 0).toLocaleString('fr-FR') },
    { label:'Temps séries', value: humanMinutes(episodes.minutes ?? 0) },
    { label:'Collection séries', value: (shows.collected ?? 0).toLocaleString('fr-FR') },
  ], { label:'Épisodes', value: (episodes.watched ?? 0).toLocaleString('fr-FR') }));
  
  // Social et engagement
  cards.push(statCard('👥 Social & Engagement', [
    { label:'Amis', value: (network.friends ?? 0).toLocaleString('fr-FR') },
    { label:'Abonnements', value: (network.following ?? 0).toLocaleString('fr-FR') },
    { label:'Abonnés', value: (network.followers ?? 0).toLocaleString('fr-FR') },
    { label:'Listes créées', value: (lists.total ?? 0).toLocaleString('fr-FR') },
    { label:'Commentaires', value: (comments.total ?? 0).toLocaleString('fr-FR') },
  ]));
  
  // Layout adaptatif selon la largeur
  const container = document.getElementById('statsBox');
  container.className = 'stats-grid-optimized';
  container.innerHTML = cards.join('');
}