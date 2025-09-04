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
  
  
  // Fonction pour obtenir le texte traduit avec fallback
  const getTranslatedText = (key, fallback) => {
    
    if (typeof i18n !== 'undefined' && i18n.t && i18n.translations && Object.keys(i18n.translations).length > 0) {
      const translated = i18n.t(key);
      return translated;
    }
    return fallback;
  };
  
  if (full) {
    elements.mainContainer.classList.remove('max-w-7xl','mx-auto');
    elements.mainContainer.classList.add('w-full','max-w-none');
    // Changer l'attribut data-i18n au lieu d'écraser le texte
    const span = elements.toggleWidth?.querySelector('span');
    if (span) {
      span.setAttribute('data-i18n', 'buttons.limited_width');
      span.textContent = getTranslatedText('buttons.limited_width', 'Limited width');
    }
    
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
    // Changer l'attribut data-i18n au lieu d'écraser le texte
    const span = elements.toggleWidth?.querySelector('span');
    if (span) {
      span.setAttribute('data-i18n', 'buttons.full_width');
      span.textContent = getTranslatedText('buttons.full_width', 'Full width');
    }
    
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

// Écouter les changements de langue pour mettre à jour le bouton largeur
window.addEventListener('languageChanged', () => {
  applyWidth(); // Re-applique la largeur avec les nouvelles traductions
});

// Écouter l'événement personnalisé pour mettre à jour le bouton largeur
window.addEventListener('updateWidthButton', () => {
  applyWidth();
});