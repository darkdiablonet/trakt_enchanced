/**
 * Trakt Enhanced Front‑End — Modular Edition
 * Application principale utilisant les modules découpés
 */

// Imports des modules - I18N EN PREMIER
import i18n from './modules/i18n.js';

// Auth Guard - PRIORITÉ ABSOLUE
import { checkAuthStatus } from './modules/auth-guard.js';

// Modules de base (pas de dépendance i18n)
import { elements } from './modules/dom.js';
import { state, saveState } from './modules/state.js';

// Modules avec dépendances i18n
import { applyWidth } from './modules/utils.js';
import { renderCurrent } from './modules/rendering.js';
import { setTab } from './modules/tabs.js';
import { loadData } from './modules/data.js';
import { lazyManager, initializeLazyLoading, fallbackImageLoading } from './modules/lazy-loading.js';
import { animationManager, initializeAnimations } from './modules/animations.js';

// Modules UI avec traductions
import languageSelector from './modules/language-selector.js';
import uiTranslations from './modules/ui-translations.js';
import './modules/header-buttons.js';

// Autres modules
import './modules/modals.js';
import './modules/pro-stats.js';
import './modules/charts.js';
import { loadGlobalStats } from './modules/global-stats.js';
import './modules/markWatched.js';
import { initScrollToTop } from './modules/scroll-to-top.js';
import { initWatchingProgress, stopWatchingProgress, applyWidthToProgressBarExternal } from './modules/watching-progress.js';
import { initHeatmapInteractions } from './modules/heatmap-interactions.js';
import { initWatchingDetails } from './modules/watching-details.js';
import { startLiveUpdates } from './modules/live-updates.js';
import { initCalendar } from './modules/calendar.js';

// Initialisation principale de l'application
async function initializeApp() {
  
  // Vérifier l'authentification en premier
  console.log('[App] Checking authentication status...');
  const isAuthenticated = await checkAuthStatus();
  
  // Attendre que i18n soit complètement initialisé (toujours nécessaire)
  await new Promise((resolve) => {
    if (i18n.translations && Object.keys(i18n.translations).length > 0) {
      resolve();
    } else {
      window.addEventListener('i18nInitialized', resolve, { once: true });
    }
  });
  
  // Appliquer immédiatement les traductions UI
  uiTranslations.translateUI();
  
  if (!isAuthenticated) {
    console.log('[App] Not authenticated - showing auth interface only');
    // L'interface de connexion est déjà affichée par auth-guard
    // On n'a pas besoin de charger les données
    return;
  }
  
  // Appliquer la largeur avec traductions
  applyWidth();
  
  // Maintenant charger les données avec i18n pleinement initialisé
  await loadData();
  
  // S'assurer que les options de tri sont traduites après le chargement des données
  setTimeout(() => {
    uiTranslations.translateSortOptions();
  }, 100);
  
  // Démarrer les mises à jour en temps réel (seulement si authentifié)
  setTimeout(() => {
    startLiveUpdates();
  }, 2000); // Attendre 2s après le chargement initial
  
  // Initialiser le calendrier et watching progress maintenant qu'on est authentifié
  initCalendar();
  initWatchingProgress();
}

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

// Démarrer l'initialisation
initializeApp().then(() => {
}).catch(console.error);


// Event listeners principaux
// Le bouton toggleWidth est maintenant géré par header-buttons.js

// Ajouter le bouton playback s'il existe dans le DOM mais pas dans elements
const playbackBtn = document.getElementById('tabBtnPlayback');
if (playbackBtn && !elements.tabBtns.playback) {
  elements.tabBtns.playback = playbackBtn;
  elements.panels.playback = document.getElementById('panelPlayback');
}

// DEBUG: Vérifier et corriger le bouton calendar s'il est null
const calendarBtn = document.getElementById('tabBtnCalendar');
if (calendarBtn && !elements.tabBtns.calendar) {
  console.log('[DEBUG] Calendar button was null in dom.js, fixing it');
  elements.tabBtns.calendar = calendarBtn;
  elements.panels.calendar = document.getElementById('panelCalendar');
}

// DEBUG: Log pour vérifier les éléments
console.log('[DEBUG] All tab buttons:', Object.keys(elements.tabBtns).map(k => ({
  key: k, 
  exists: !!elements.tabBtns[k], 
  id: elements.tabBtns[k]?.id
})));

// DEBUG: Forcer la traduction du calendrier
setTimeout(() => {
  console.log('[DEBUG] Current lang:', i18n.currentLang);
  console.log('[DEBUG] Calendar translation:', i18n.t('navigation.calendar'));
  
  // Forcer manuellement la traduction du calendrier
  const calendarBtn = document.getElementById('tabBtnCalendar');
  if (calendarBtn) {
    const icon = calendarBtn.querySelector('i');
    const iconHtml = icon ? icon.outerHTML : '';
    const translatedText = i18n.t('navigation.calendar');
    console.log('[DEBUG] Forcing calendar translation to:', translatedText);
    
    // Approche 1 : Remplacer tout le contenu sauf l'icône
    calendarBtn.innerHTML = `${iconHtml}${translatedText}`;
  }
}, 1000);

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

// Les données sont maintenant chargées depuis initializeApp()
// loadData() a été déplacé dans initializeApp() pour attendre i18n
// applyWidth(); // Déjà appelé dans initializeApp()

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

// Initialiser les fonctionnalités de base au démarrage
loadAppVersion();
initScrollToTop();
initHeatmapInteractions();
initWatchingDetails();
// NE PAS initialiser le calendrier automatiquement - sera fait après auth
// initCalendar();
languageSelector.init();

// Initialiser les traductions UI après que i18n soit initialisé
i18n.init().then(() => {
  uiTranslations.translateUI();
});

// Écouter les mises à jour du bouton largeur
window.addEventListener('updateWidthButton', () => {
  applyWidth();
});

// initWatchingProgress(); // Auto-initialisé par le module lui-même

