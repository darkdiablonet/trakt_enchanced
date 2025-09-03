/**
 * Utilities Module
 * Fonctions utilitaires partagées
 */

import { elements } from './dom.js';
import { state, saveState } from './state.js';
import i18n from './i18n.js';

export function posterURL(u) {
  if (!u) return '';
  const retina = (window.devicePixelRatio || 1) > 1.25;
  const preset = retina ? 'cardx2' : 'card';
  const clean = u.replace(/^\/+/, '');
  const v = 'webp1';
  return `/img/p/${preset}/${clean}?v=${v}`;
}

export function escapeAttr(s) { 
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/[\r\n]+/g,' '); 
}

export function esc(s) { 
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); 
}

export function applyWidth() {
  const full = state.width === 'full';
  const containers = [
    document.getElementById('watching-progress'),
    document.getElementById('flashBox'),
    document.getElementById('deviceBox')
  ];
  
  console.log('[applyWidth] full:', full, 'containers found:', containers.filter(Boolean).length);
  
  if (full) {
    elements.mainContainer.classList.remove('max-w-7xl','mx-auto');
    elements.mainContainer.classList.add('w-full','max-w-none');
    elements.toggleWidth?.querySelector('span')?.replaceChildren(document.createTextNode(i18n.t('buttons.limited_width')));
    
    // Appliquer la même logique à tous les conteneurs concernés
    containers.forEach(container => {
      if (container) {
        container.classList.remove('max-w-7xl','mx-auto');
        container.classList.add('w-full','max-w-none');
      }
    });
  } else {
    elements.mainContainer.classList.add('max-w-7xl','mx-auto');
    elements.mainContainer.classList.remove('w-full','max-w-none');
    elements.toggleWidth?.querySelector('span')?.replaceChildren(document.createTextNode(i18n.t('buttons.full_width')));
    
    // Appliquer la même logique à tous les conteneurs concernés
    containers.forEach(container => {
      if (container) {
        container.classList.add('max-w-7xl','mx-auto');
        container.classList.remove('w-full','max-w-none');
      }
    });
  }
}

export function humanMinutes(min) {
  return i18n.formatTime(min);
}