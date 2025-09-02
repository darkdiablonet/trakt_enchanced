/**
 * App State & Persistence Module
 * Gestion de l'état de l'application et persistance localStorage
 */

let state = JSON.parse(localStorage.getItem('trakt_state') || '{}');
state.tab   = state.tab   || 'shows';
state.sort  = state.sort  || { field:'watched_at', dir:'desc' };
state.q     = (typeof state.q === 'string') ? state.q : '';
state.width = state.width || 'limited';

// Normaliser anciens "field:dir"
if (state.sort && typeof state.sort.field === 'string' && state.sort.field.includes(':')) {
  const [f, d] = state.sort.field.split(':');
  state.sort = { field:f, dir:d || state.sort.dir || 'desc' };
}

export { state };

export function saveState() { 
  localStorage.setItem('trakt_state', JSON.stringify(state)); 
}

export let DATA = { 
  showsRows: [], 
  moviesRows: [], 
  showsUnseenRows: [], 
  moviesUnseenRows: [], 
  devicePrompt: null, 
  cacheHit: false, 
  cacheAge: 0, 
  title: 'Trakt Enhanced', 
  flash: null 
};