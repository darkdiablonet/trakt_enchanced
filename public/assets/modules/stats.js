/**
 * Stats Module
 * Gestion des statistiques de base
 */

import { humanMinutes } from './utils.js';

export function statCard(title, items=[]) {
  const rows = items
    .filter(it => it && it.label)
    .map(it => `<div class="flex justify-between"><span class="text-slate-400">${it.label}</span><span class="font-semibold">${it.value}</span></div>`)
    .join('');
  return `<article class="card p-4"><h3 class="text-base font-semibold mb-3">${title}</h3><div class="space-y-1 text-sm">${rows || '<span class="text-slate-500">—</span>'}</div></article>`;
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

  const cards = [];
  cards.push(statCard('🎬 Films', [
    { label:'Vus', value: movies.watched ?? 0 },
    { label:'Lectures', value: movies.plays ?? 0 },
    { label:'Collection', value: movies.collected ?? 0 },
    { label:'Durée', value: humanMinutes(movies.minutes ?? 0) },
    { label:'Notes', value: movies.ratings ?? 0 },
    { label:'Commentaires', value: movies.comments ?? 0 },
  ]));
  cards.push(statCard('📺 Séries', [
    { label:'Vues', value: shows.watched ?? 0 },
    { label:'Saisons', value: shows.seasons ?? seasons.watched ?? 0 },
    { label:'Épisodes', value: shows.episodes ?? episodes.watched ?? 0 },
    { label:'Collection', value: shows.collected ?? 0 },
    { label:'Notes', value: shows.ratings ?? 0 },
    { label:'Commentaires', value: shows.comments ?? 0 },
  ]));
  cards.push(statCard('📼 Épisodes', [
    { label:'Vus', value: episodes.watched ?? 0 },
    { label:'Lectures', value: episodes.plays ?? 0 },
    { label:'Durée', value: humanMinutes(episodes.minutes ?? 0) },
  ]));
  cards.push(statCard('⭐ Ratings & Listes', [
    { label:'Notes', value: ratings.total ?? (movies.ratings ?? 0) + (shows.ratings ?? 0) },
    { label:'Listes', value: lists.total ?? 0 },
    { label:'Commentaires', value: comments.total ?? 0 },
    { label:'Amis (Network)', value: network.friends ?? 0 },
    { label:'Abonnements', value: network.following ?? 0 },
    { label:'Abonnés', value: network.followers ?? 0 },
  ]));
  document.getElementById('statsBox').innerHTML = cards.join('');
}