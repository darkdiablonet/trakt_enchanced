/**
 * DOM & UI Mount Points Module
 * Gestion des références DOM et éléments d'interface
 */

export const elements = {
  // Layout
  toggleWidth: document.getElementById('toggleWidth'),
  mainContainer: document.getElementById('mainContainer'),
  
  // Flash et Auth
  flashBox: document.getElementById('flashBox'),
  deviceBox: document.getElementById('deviceBox'),
  
  // Navigation tabs
  tabBtns: {
    shows: document.getElementById('tabBtnShows'),
    movies: document.getElementById('tabBtnMovies'),
    shows_unseen: document.getElementById('tabBtnShowsUnseen'),
    movies_unseen: document.getElementById('tabBtnMoviesUnseen'),
    playback: document.getElementById('tabBtnPlayback'),
    stats: document.getElementById('tabBtnStats'),
    calendar: document.getElementById('tabBtnCalendar'),
  },
  
  // Panels
  panels: {
    shows: document.getElementById('panelShows'),
    movies: document.getElementById('panelMovies'),
    shows_unseen: document.getElementById('panelShowsUnseen'),
    movies_unseen: document.getElementById('panelMoviesUnseen'),
    playback: document.getElementById('panelPlayback'),
    stats: document.getElementById('panelStats'),
    calendar: document.getElementById('panelCalendar'),
  },
  
  // Grids
  grids: {
    shows: document.getElementById('gridS'),
    movies: document.getElementById('gridM'),
    shows_unseen: document.getElementById('gridSU'),
    movies_unseen: document.getElementById('gridMU'),
  },
  
  // Contrôles
  sortActive: document.getElementById('sortActive'),
  qActive: document.getElementById('qActive'),
  
  // Modals
  openFullModal: document.getElementById('openFullModal'),
  closeFullModal: document.getElementById('closeFullModal'),
  fullModal: document.getElementById('fullModal'),
  
  // Autres sections
  filtersSec: document.querySelector('section.filters:not(#mobileFilters)'),
};

// Configuration des options de tri
export const SORT_ALL = Array.from(elements.sortActive.querySelectorAll('option')).map(o => ({
  value: o.value,
  label: o.textContent,
  for: (o.getAttribute('data-for') || '')
}));