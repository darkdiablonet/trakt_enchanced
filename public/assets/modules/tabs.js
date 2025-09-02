/**
 * Tabs Navigation Module
 * Gestion de la navigation par onglets
 */

import { state, saveState } from './state.js';
import { elements, SORT_ALL } from './dom.js';
import { renderCurrent } from './rendering.js';

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
  elements.sortActive.innerHTML = allowed
    .map(o => `<option value="${o.value}" data-for="${o.for}">${o.label}</option>`)
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

  // Cacher les filtres sur "stats" uniquement
  const isStats = (tab === 'stats');
  elements.filtersSec?.classList.toggle('hidden', isStats);

  if (isStats) {
    // Les cartes stats et graphiques sont gérées dans leurs modules respectifs
    // On importe dynamiquement pour éviter les dépendances circulaires
    import('./graphs.js').then(({ loadAndRenderGraph }) => loadAndRenderGraph());
    import('./pro-stats.js').then(({ loadStatsPro }) => loadStatsPro().catch(()=>{}));
    return;
  }

  // Listes classiques
  rebuildSortOptions(tab);
  renderCurrent();
}