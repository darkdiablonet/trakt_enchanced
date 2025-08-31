/**
 * UNFR — Trakt History Front‑End — Modular Edition
 * Application principale utilisant les modules découpés
 */

// Imports des modules
import { elements } from './modules/dom.js';
import { state, saveState } from './modules/state.js';
import { applyWidth } from './modules/utils.js';
import { renderCurrent } from './modules/rendering.js';
import { setTab } from './modules/tabs.js';
import { loadData } from './modules/data.js';
import './modules/modals.js';
import './modules/pro-stats.js';

// Event listeners principaux
elements.toggleWidth?.addEventListener('click', () => { 
  state.width = (state.width==='full') ? 'limited' : 'full'; 
  saveState(); 
  applyWidth(); 
});

Object.values(elements.tabBtns).forEach(btn => 
  btn?.addEventListener('click', () => setTab(btn.dataset.tab))
);

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