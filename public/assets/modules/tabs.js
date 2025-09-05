/**
 * Tabs Navigation Module
 * Gestion de la navigation par onglets
 */

import { state, saveState } from './state.js';
import { elements, SORT_ALL } from './dom.js';
import { renderCurrent } from './rendering.js';
import i18n from './i18n.js';

export function rebuildSortOptions(tab) {
  const allowed = SORT_ALL.filter(opt =>
    opt.for.split(',').map(s => s.trim()).includes(tab)
  );
  const defaultByTab = {
    shows: 'watched_at:desc',
    movies: 'watched_at:desc',
    shows_unseen: 'collected_at:desc',
    movies_unseen: 'collected_at:desc'
  };
  const currentKey = `${state.sort.field}:${state.sort.dir}`;
  const selectedKey = allowed.some(o => o.value === currentKey) ? currentKey : defaultByTab[tab];
  
  // Fonction pour obtenir la clé de traduction basée sur la valeur
  const getTranslationKey = (value) => {
    const translationMap = {
      'watched_at:desc': 'sort.watched_at_desc',
      'title:asc': 'sort.title_asc',
      'title:desc': 'sort.title_desc',
      'year:desc': 'sort.year_desc',
      'year:asc': 'sort.year_asc',
      'episodes:desc': 'sort.episodes_desc',
      'plays:desc': 'sort.plays_desc',
      'missing:desc': 'sort.missing_desc',
      'missing:asc': 'sort.missing_asc'
    };
    return translationMap[value] || value;
  };
  
  elements.sortActive.innerHTML = allowed
    .map(o => {
      const translationKey = getTranslationKey(o.value);
      const translatedLabel = i18n.t(translationKey) || o.label;
      return `<option value="${o.value}" data-for="${o.for}">${translatedLabel}</option>`;
    })
    .join('');
  elements.sortActive.value = selectedKey;
  const [f, d] = selectedKey.split(':');
  state.sort = { field: f, dir: d };
  saveState();
}

export function setTab(tab) {
  state.tab = tab; 
  saveState();

  // Activer le bouton courant / masquer les autres panneaux
  Object.entries(elements.tabBtns).forEach(([k,b]) => b?.classList.toggle('tab-btn-active', k===tab));
  Object.entries(elements.panels).forEach(([k,p]) => p?.classList.toggle('hidden', k!==tab));

  // Cacher les filtres sur "stats" et "playback"
  const isStats = (tab === 'stats');
  const isPlayback = (tab === 'playback');
  const hideFilters = isStats || isPlayback;
  
  // Masquer le bouton mobile et sa section
  document.getElementById('mobileFiltersToggle')?.classList.toggle('hidden', hideFilters);
  
  // Forcer le masquage de mobileFilters sur Stats et Playback (override de sm:block)
  const mobileFilters = document.getElementById('mobileFilters');
  if (mobileFilters) {
    mobileFilters.classList.toggle('force-hidden', hideFilters);
  }

  if (isStats) {
    // Charger Pro Stats (qui génère aussi la heatmap depuis ses données)
    import('./pro-stats.js').then(({ loadStatsPro }) => loadStatsPro().catch(()=>{}));
    return;
  }

  if (isPlayback) {
    // Charger les données de playback
    import('./playback.js').then(({ loadPlayback }) => loadPlayback().catch(()=>{}));
    return;
  }

  // Listes classiques
  rebuildSortOptions(tab);
  renderCurrent();
}