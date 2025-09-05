/**
 * UI Rendering Module
 * Fonctions de rendu des cartes et listes
 */

import { state, DATA } from './state.js';
import { elements } from './dom.js';
import { posterURL, escapeAttr, esc } from './utils.js';
import i18n from './i18n.js';

export function card(r, kind) {
  const posterRaw = String(r.poster||'');
  const poster = (typeof posterURL === 'function') ? posterURL(posterRaw) : posterRaw;
  const y = r.year || '';
  const url = r.trakt_url || '#';
  const tmdburl = r.tmdb_url || '';
  const next = r.next || '';
  const isUnseen = (state.tab === 'shows_unseen' || state.tab === 'movies_unseen');

  const ov = escapeAttr(r.overview || '');
  const title = escapeAttr(r.title || '');

  let metrics = '';
  if (isUnseen) {
    if (kind === 'show') {
      const missing = Number(r.missing ?? 0);
      const episodes = Number(r.episodes ?? 0);
      const traktId = escapeAttr(r.ids?.trakt || '');
      
      // Si missing > 0, cela signifie qu'on a déjà vu certains épisodes
      // On rend le bouton cliquable pour voir les détails
      if (missing > 0 && episodes > 0) {
        metrics = `<button class="chip chip-clickable js-show-watchings" data-trakt-id="${traktId}" data-show-title="${title}" data-kind="show" title="${i18n.t('cards.view_episodes')}"><i class="fa-solid fa-list-check mr-1"></i>${missing} ${i18n.t('cards.to_watch')}</button>`;
      } else {
        metrics = `<span class="chip"><i class="fa-regular fa-eye-slash mr-1"></i>${i18n.t('cards.not_watched')}</span>`;
      }
    } else {
      metrics = `<button class="chip chip-clickable js-mark-movie-watched" data-trakt-id="${escapeAttr(r.ids?.trakt || '')}" data-movie-title="${title}" title="${i18n.t('cards.click_to_mark_watched')}"><i class="fa-regular fa-eye-slash mr-1"></i>${i18n.t('cards.not_watched')}</button>`;
    }
  } else if (kind === 'show') {
    const w0 = Number(r.episodes ?? 0);
    const t = Number(r.episodes_total ?? 0);
    const w = t > 0 ? Math.min(w0, t) : w0;
    const hasT = t > 0;
    const diff = hasT && w !== t;
    const cls = diff ? 'chip--warn' : '';
    const text = hasT ? `${w}/${t}` : `${w}`;
    const traktId = escapeAttr(r.ids?.trakt || '');
    metrics = `<button class="chip chip-clickable js-show-watchings ${cls}" data-trakt-id="${traktId}" data-show-title="${title}" data-kind="show" title="${i18n.t('cards.view_details')}"><i class="fa-solid fa-film mr-1"></i>${text}</button>`;
  } else {
    const traktId = escapeAttr(r.ids?.trakt || '');
    metrics = `<button class="chip chip-clickable js-show-watchings" data-trakt-id="${traktId}" data-movie-title="${title}" data-kind="movie" title="${i18n.t('cards.view_details')}"><i class="fa-solid fa-play mr-1"></i>${r.plays||0}</button>`;
  }

  return `
  <article class="card p-3 hover:shadow-xl hover:shadow-sky-900/10 transition-shadow" data-prefetch="${escapeAttr(url)}">
    <div class="poster-wrap mb-3">
    <div class="poster lazy-bg" data-bg-src="${poster}"></div>
    <button class="ov-btn js-ov"
      data-title="${title}"
      data-year="${escapeAttr(y)}"
      data-overview="${ov}"
      data-poster="${escapeAttr(poster)}"
      data-trakt="${escapeAttr(url)}"
      data-tmdb="${escapeAttr(tmdburl)}"
      data-kind="${escapeAttr(kind)}"
      title="${i18n.t('overview.synopsis_tooltip')}">
      <i class="fa-solid fa-circle-info"></i><span>${i18n.t('overview.synopsis')}</span>
    </button>
    ${ next ? `<button class="badge-next js-mark-watched" 
        data-trakt-id="${escapeAttr(r.next_episode_data?.trakt_id || '')}"
        data-season="${escapeAttr(r.next_episode_data?.season || '')}"
        data-number="${escapeAttr(r.next_episode_data?.number || '')}"
        data-show-title="${escapeAttr(title)}"
        title="${i18n.t('cards.click_to_mark_watched')}">
        <i class="fa-solid fa-forward-step"></i><span>${next}</span>
      </button>` : '' }
    </div>
    <h3 class="text-base font-semibold leading-tight line-clamp-2">${title}</h3>
    <div class="mt-2 flex items-center gap-2 text-sm">
    <span class="chip"><i class="fa-regular fa-calendar mr-1"></i>${y}</span>
    ${metrics}
    </div>
    <div class="mt-2 flex items-center gap-2 text-sm">
    <a class="chip" href="${url}" target="_blank"><i class="fa-solid fa-link mr-1"></i>Trakt</a>
    ${tmdburl ? `<a class="chip" href="${tmdburl}" target="_blank"><i class="fa-solid fa-clapperboard mr-1"></i>TMDB</a>` : ''}
    </div>
  </article>`;
}

export function renderTopSimple(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '<div class="text-disabled text-sm">—</div>';
  const max = Math.max(1, ...arr.map(x => Number(x.minutes||0)));
  const rows = arr.slice(0,10).map((it,i)=>{
    const minutes = Number(it.minutes||0);
    const pct = Math.round(minutes * 100 / max);
    const delay = i * 150; // Plus lent pour effet plus doux
    return `<div class="row animate-fade-in-up" data-delay="${delay}">
      <span class="rank">${i+1}</span>
      <div class="flex-1">
        <div class="name font-medium">${esc(it.name||'—')}</div>
        <div class="bar mt-1 h-2 bg-slate-700 rounded-full overflow-hidden">
          <span class="block h-full animate-progress" data-width="${pct}" data-delay="${delay + 500}"></span>
        </div>
      </div>
      <div class="flex items-center gap-2 ml-4">
        <span class="chip chip-xs animate-count-up" data-delay="${delay + 800}">
          <i class="fa-regular fa-clock mr-1"></i>${minutes.toLocaleString(i18n.currentLang === 'en' ? 'en-US' : 'fr-FR')} min
        </span>
      </div>
    </div>`;
  }).join('');
  return `<div class="topcard toplist">${rows}</div>`;
}

export function renderTopTitles(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '<div class="text-disabled text-sm">—</div>';
  const max = Math.max(1, ...arr.map(x => Number(x.minutes||0)));
  const rows = arr.slice(0,20).map((it,i)=>{
    const minutes = Number(it.minutes||0);
    const plays = Number(it.plays||0);
    const pct = Math.round(minutes * 100 / max);
    const icon = it.type === 'show' ? 'fa-tv' : 'fa-film';
    const typeLbl = it.type === 'show' ? i18n.t('cards.show') : i18n.t('cards.movie');
    const delay = i * 120; // Plus lent pour top titres plus long
    return `<div class="row animate-fade-in-up" data-delay="${delay}">
      <span class="rank">${i+1}</span>
      <div class="flex-1">
        <div class="name font-medium text-sm">${esc(it.title||'—')}</div>
        <div class="bar mt-1 h-2 bg-slate-700 rounded-full overflow-hidden">
          <span class="block h-full animate-progress" data-width="${pct}" data-delay="${delay + 400}"></span>
        </div>
      </div>
      <div class="flex items-center gap-2 ml-4">
        <span class="chip chip-xs animate-count-up" data-delay="${delay + 600}">
          <i class="fa-solid ${icon} mr-1"></i>${typeLbl}
        </span>
        <span class="chip chip-xs animate-count-up" data-delay="${delay + 700}">
          <i class="fa-regular fa-clock mr-1"></i>${minutes.toLocaleString(i18n.currentLang === 'en' ? 'en-US' : 'fr-FR')} min
        </span>
        <span class="chip chip-xs animate-count-up" data-delay="${delay + 800}">
          <i class="fa-solid fa-play mr-1"></i>${plays}
        </span>
      </div>
    </div>`;
  }).join('');
  return `<div class="topcard toplist">${rows}</div>`;
}

export function renderInto(el, rows, kind) { 
  el.innerHTML = rows.map(r => card(r, kind)).join(''); 
}

export function filterItems(items, q) {
  const s = (q||'').trim().toLowerCase();
  if (!s) return items;
  return items.filter(it => String(it.title||'').toLowerCase().includes(s));
}

export function sortItems(items, field, dir) {
  return items.slice().sort((a,b)=>{
    if (field==='title') {
      return dir==='asc'
        ? String(a.title||'').localeCompare(String(b.title||''))
        : String(b.title||'').localeCompare(String(a.title||''));
    }
    if (field==='watched_at' || field==='collected_at') {
      const taRaw = field==='collected_at'
        ? (a.collected_at_ts ?? Date.parse(a.collected_at ?? ''))
        : Date.parse(a.last_watched_at ?? '');
      const tbRaw = field==='collected_at'
        ? (b.collected_at_ts ?? Date.parse(b.collected_at ?? ''))
        : Date.parse(b.last_watched_at ?? '');
      const ta = Number.isFinite(taRaw) ? taRaw : (dir==='asc' ? -Infinity : Infinity);
      const tb = Number.isFinite(tbRaw) ? tbRaw : (dir==='asc' ? -Infinity : Infinity);
      return dir==='asc' ? (ta-tb) : (tb-ta);
    }
    if (field==='missing') {
      const na = Number(a.missing||0), nb = Number(b.missing||0);
      return dir==='asc' ? na-nb : nb-na;
    }
    if (field==='episodes' || field==='plays' || field==='year') {
      const na = Number(a[field]||0), nb = Number(b[field]||0);
      return dir==='asc' ? na-nb : nb-na;
    }
    return 0;
  });
}

export function dataForTab(tab) {
  if (tab==='shows') return { arr:DATA.showsRows, kind:'show' };
  if (tab==='movies') return { arr:DATA.moviesRows, kind:'movie' };
  if (tab==='shows_unseen') return { arr:DATA.showsUnseenRows, kind:'show' };
  if (tab==='movies_unseen') return { arr:DATA.moviesUnseenRows, kind:'movie' };
  return { arr:[], kind:'show' };
}

export function renderCurrent() {
  const { arr, kind } = dataForTab(state.tab);
  const filtered = filterItems(arr, state.q);
  const sorted = sortItems(filtered, state.sort.field, state.sort.dir);
  if (state.tab==='shows') renderInto(elements.grids.shows, sorted, kind);
  if (state.tab==='movies') renderInto(elements.grids.movies, sorted, kind);
  if (state.tab==='shows_unseen') renderInto(elements.grids.shows_unseen, sorted, kind);
  if (state.tab==='movies_unseen') renderInto(elements.grids.movies_unseen, sorted, kind);
}

// Fonction pour appliquer les styles via variables CSS après rendu
export function applyProgressBars() {
  // Appliquer les largeurs des barres de progression
  document.querySelectorAll('.animate-progress[data-width]').forEach(bar => {
    const width = bar.getAttribute('data-width');
    const delay = bar.getAttribute('data-delay') || '0';
    bar.style.setProperty('--w', `${width}%`);
    bar.style.setProperty('--animation-delay', `${delay}ms`);
  });

  // Appliquer les délais d'animation
  document.querySelectorAll('[data-delay]').forEach(element => {
    const delay = element.getAttribute('data-delay');
    element.style.setProperty('--animation-delay', `${delay}ms`);
  });
}