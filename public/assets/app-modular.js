/**
 * Trakt Enhanced Front‑End — Modular Edition
 * Application principale utilisant les modules découpés
 */

// Imports des modules
import { elements } from './modules/dom.js';
import { state, saveState } from './modules/state.js';
import { applyWidth } from './modules/utils.js';
import { renderCurrent } from './modules/rendering.js';
import { setTab } from './modules/tabs.js';
import { loadData } from './modules/data.js';
import { lazyManager, initializeLazyLoading, fallbackImageLoading } from './modules/lazy-loading.js';
import { animationManager, initializeAnimations } from './modules/animations.js';
import './modules/modals.js';
import './modules/pro-stats.js';
import './modules/charts.js';
import './modules/theme-ui.js';
import './modules/markWatched.js';
import { initScrollToTop } from './modules/scroll-to-top.js';
import { initHeatmapInteractions } from './modules/heatmap-interactions.js';
import { initWatchingDetails } from './modules/watching-details.js';

// Charger la version de l'application
async function loadAppVersion() {
  try {
    const response = await fetch('/health');
    const health = await response.json();
    const versionEl = document.getElementById('app-version');
    if (versionEl && health.version) {
      versionEl.textContent = `v${health.version}`;
    }
  } catch (error) {
    console.warn('Could not load app version:', error);
  }
}


// Event listeners principaux
elements.toggleWidth?.addEventListener('click', () => { 
  state.width = (state.width==='full') ? 'limited' : 'full'; 
  saveState(); 
  applyWidth(); 
});

Object.values(elements.tabBtns).forEach(btn => 
  btn?.addEventListener('click', () => setTab(btn.dataset.tab))
);

// Reload des données au clic sur le titre
document.getElementById('app-title')?.addEventListener('click', () => {
  loadData();
});

// Event listener pour le bouton de basculement des filtres mobile
const mobileFiltersToggle = document.getElementById('mobileFiltersToggle');
if (mobileFiltersToggle) {
  mobileFiltersToggle.addEventListener('click', () => {
    const mobileFilters = document.getElementById('mobileFilters');
    if (mobileFilters) {
      mobileFilters.classList.toggle('hidden');
    }
  });
}

elements.sortActive.addEventListener('change', () => {
  const [f,d] = String(elements.sortActive.value).split(':'); 
  state.sort = { field:f, dir:d||'asc' }; 
  saveState(); 
  renderCurrent();
});

elements.qActive.addEventListener('input', () => { 
  state.q = elements.qActive.value || ''; 
  saveState(); 
  renderCurrent(); 
});

document.addEventListener('keydown', e => { 
  if ((e.ctrlKey||e.metaKey) && e.key==='/'){ 
    e.preventDefault(); 
    elements.qActive?.focus(); 
  } 
});

elements.openFullModal?.addEventListener('click', () => { 
  elements.fullModal.classList.remove('hidden'); 
});

elements.closeFullModal?.addEventListener('click', () => { 
  elements.fullModal.classList.add('hidden'); 
});

// Initialisation
loadData();

// Initialize lazy loading and animations
initializeLazyLoading();
initializeAnimations();

// Fallback for browsers without Intersection Observer
if (!('IntersectionObserver' in window)) {
  fallbackImageLoading();
}

// Make managers available globally for other scripts
window.lazyManager = lazyManager;
window.animationManager = animationManager;

// Initialiser les fonctionnalités au démarrage
loadAppVersion();
initScrollToTop();
initHeatmapInteractions();
initWatchingDetails();

