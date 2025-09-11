/**
 * Playback Progress Module
 * Affiche et gère le contenu en cours de visionnage avec progression
 */

import { escapeAttr } from './utils.js';
import i18n from './i18n.js';

export async function loadPlayback() {
  
  const container = document.getElementById('playbackContainer');
  if (!container) {
    console.warn('[loadPlayback] Container not found!');
    return;
  }

  try {
    // Afficher un loading state
    container.innerHTML = `
      <div class="flex items-center justify-center p-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
        <span class="ml-3 text-muted">${i18n.t('loading.progress') || 'Loading progress...'}</span>
      </div>
    `;

    const response = await fetch('/api/playback', { cache: 'no-store' });
    
    // Check for 401 authentication error
    if (response.status === 401) {
      const data = await response.json();
      console.error('[playback] Authentication expired:', data.message);
      // Redirect to main page to show auth prompt
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      } else {
        // Reload to trigger auth flow
        window.location.reload();
      }
      return;
    }
    
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Failed to fetch playback data');
    }

    const playbackList = data.playback || [];
    
    if (playbackList.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12">
          <div class="glass rounded-xl p-8">
            <i class="fa-solid fa-play-circle text-4xl text-muted mb-4"></i>
            <h3 class="text-lg font-medium text-adaptive mb-2">Aucun contenu en cours</h3>
            <p class="text-muted">Vous n'avez pas de contenu en progression actuellement.</p>
          </div>
        </div>
      `;
      return;
    }

    // Construire l'HTML des items
    const itemsHtml = playbackList.map(item => renderPlaybackCard(item)).join('');
    
    container.innerHTML = itemsHtml;

    // Appliquer les largeurs de progression via JavaScript
    container.querySelectorAll('.playback-progress-fill').forEach(bar => {
      const progress = bar.dataset.progress;
      if (progress) {
        bar.style.width = `${progress}%`;
      }
    });

    // Activer le lazy loading des images  
    // Déclencher le lazy loading en utilisant la même méthode que les autres modules
    const lazyBgs = container.querySelectorAll('.lazy-bg[data-bg-src]');
    lazyBgs.forEach(el => {
      if (window.lazyManager) {
        window.lazyManager.observe(el);
      }
    });

    // Ajouter les event listeners pour les boutons de suppression
    container.querySelectorAll('[data-remove-playback]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.removePlayback;
        if (confirm('Supprimer cet élément de la liste de lecture ?')) {
          await removePlaybackItem(id);
          loadPlayback(); // Recharger la liste
        }
      });
    });

  } catch (error) {
    console.error('[loadPlayback] Error:', error);
    container.innerHTML = `
      <div class="col-span-full">
        <div class="glass rounded-xl p-6 border border-red-500/20">
          <div class="flex items-center text-red-400 mb-2">
            <i class="fa-solid fa-exclamation-triangle mr-2"></i>
            <span class="font-medium">Erreur de chargement</span>
          </div>
          <p class="text-muted">${error.message}</p>
        </div>
      </div>
    `;
  }
}

function renderPlaybackCard(item) {
  const isMovie = item.type === 'movie';
  const media = isMovie ? item.movie : item.show;
  const title = isMovie ? item.movie?.title : item.show?.title;
  const episodeTitle = !isMovie ? item.episode?.title : '';
  const year = isMovie ? item.movie?.year : item.show?.year;
  
  const progress = item.progress || 0;
  const progressPercent = Math.round(progress);
  
  // Calculer le temps écoulé et restant si on a la durée
  const runtime = isMovie ? item.movie?.runtime : item.episode?.runtime;
  let timeInfo = '';
  if (runtime) {
    const elapsed = Math.round((runtime * progress) / 100);
    const remaining = runtime - elapsed;
    timeInfo = `${elapsed}m / ${runtime}m`;
  }

  const traktId = isMovie ? item.movie?.ids?.trakt : item.episode?.ids?.trakt;
  const showId = !isMovie ? item.show?.ids?.trakt : null;
  const slug = media?.ids?.slug || '';
  
  // Construire l'URL Trakt
  const traktUrl = isMovie 
    ? `https://trakt.tv/movies/${slug}`
    : `https://trakt.tv/shows/${item.show?.ids?.slug}/seasons/${item.episode?.season}/episodes/${item.episode?.number}`;
  
  // Utiliser le poster fourni par l'API, sinon un placeholder
  const poster = isMovie 
    ? (item.movie?.poster || '/img/placeholder-poster.svg')
    : (item.show?.poster || '/img/placeholder-poster.svg');

  // Badge pour épisode ou progress
  let badgeInfo = '';
  if (!isMovie) {
    badgeInfo = `S${String(item.episode?.season || '?').padStart(2, '0')}E${String(item.episode?.number || '?').padStart(2, '0')}`;
    if (episodeTitle) {
      badgeInfo += `: ${episodeTitle}`;
    }
  }

  // Utiliser une structure unique qui s'adapte via CSS
  return `
    <article class="card playback-card p-3 hover:shadow-xl hover:shadow-sky-900/10 transition-shadow">
      <div class="poster-wrap mb-3">
        <div class="poster lazy-bg" data-bg-src="${poster}"></div>
        
        <!-- Badge de progression en overlay sur le poster -->
        <div class="badge-progress">
          <span class="text-sky-300">${progressPercent}%</span>
        </div>
        
        <!-- Bouton supprimer en overlay (caché sur mobile) -->
        <button 
          class="ov-btn playback-remove-btn"
          data-remove-playback="${item.id}" 
          title="Supprimer de la liste"
        >
          <i class="fa-solid fa-trash"></i>
          <span>Supprimer</span>
        </button>
      </div>
      
      <div class="playback-content">
        <h3 class="text-base font-semibold leading-tight line-clamp-2">${escapeAttr(title || 'Titre inconnu')}</h3>
        
        ${badgeInfo ? `
          <p class="text-sm text-muted mt-1 line-clamp-1">${escapeAttr(badgeInfo)}</p>
        ` : ''}
        
        <!-- Ligne 1: Barre de progression + bouton play/pause aligné à droite -->
        <div class="mt-2 flex items-center gap-2">
          <div class="flex-1 relative h-2 bg-black/30 rounded-full overflow-hidden">
            <div 
              class="playback-progress-fill absolute top-0 left-0 h-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full transition-all duration-300"
              data-progress="${progressPercent}"
            ></div>
          </div>
          ${item.paused_at ? `
            <span class="chip chip--warn ml-2">
              <i class="fa-solid fa-pause mr-1"></i>${i18n.t('playback.paused')}
            </span>
          ` : `
            <span class="chip ml-2">
              <i class="fa-solid fa-play mr-1"></i>${i18n.t('playback.playing')}
            </span>
          `}
        </div>
        
        <!-- Ligne 2: Année + Trakt URL -->
        <div class="mt-2 flex items-center gap-2 text-sm">
          <span class="chip">
            <i class="fa-regular fa-calendar mr-1"></i>${year || '—'}
          </span>
          <a class="chip" href="${traktUrl}" target="_blank">
            <i class="fa-solid fa-link mr-1"></i>Trakt
          </a>
        </div>
        
        <!-- Ligne 3: Bouton supprimer aligné à droite -->
        <div class="mt-2 flex justify-end">
          <button 
            class="chip mobile-synopsis-btn playback-remove-mobile"
            data-remove-playback="${item.id}" 
            title="Supprimer de la liste"
          >
            <i class="fa-solid fa-trash mr-1"></i>Supprimer
          </button>
        </div>
      </div>
    </article>`;
}

async function removePlaybackItem(id) {
  if (!id) return;
  
  try {
    const response = await fetch(`/api/playback/${id}`, {
      method: 'DELETE',
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to remove playback item');
    }
    
    
  } catch (error) {
    console.error('[removePlaybackItem] Error:', error);
    alert(`Erreur lors de la suppression: ${error.message}`);
  }
}

// Re-render playback items when language changes
window.addEventListener('languageChanged', () => {
  // Re-render playback if it's currently shown
  const playbackContainer = document.getElementById('playbackContainer');
  if (playbackContainer && !playbackContainer.closest('#panelPlayback').classList.contains('hidden')) {
    loadPlayback();
  }
});

