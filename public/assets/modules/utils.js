/**
 * Utilities Module
 * Fonctions utilitaires partagées
 */

import { elements } from './dom.js';
import { state, saveState } from './state.js';

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
  if (full) {
    elements.mainContainer.classList.remove('max-w-7xl','mx-auto');
    elements.mainContainer.classList.add('w-full','max-w-none');
    elements.toggleWidth?.querySelector('span')?.replaceChildren(document.createTextNode('Largeur limitée'));
  } else {
    elements.mainContainer.classList.add('max-w-7xl','mx-auto');
    elements.mainContainer.classList.remove('w-full','max-w-none');
    elements.toggleWidth?.querySelector('span')?.replaceChildren(document.createTextNode('Pleine largeur'));
  }
}

export function humanMinutes(min) {
  const m = Number(min||0);
  const d = Math.floor(m / (60*24));
  const h = Math.floor((m % (60*24)) / 60);
  const r = m % 60;
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${r}m`;
  return `${m}m`;
}