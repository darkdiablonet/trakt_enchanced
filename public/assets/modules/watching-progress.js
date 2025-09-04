/**
 * Real-time Watching Progress Bar Module
 * Affiche une barre de progression temps réel du contenu en cours de visionnage
 */

import { state } from './state.js';

let watchingInterval = null;
let currentWatching = null;
let isInitialized = false;

// Configuration des limites Trakt API (500 appels/5min = 1 appel/0.6s minimum)
const REFRESH_INTERVAL = 30000; // 3 secondes pour rester largement dans les limites
const REFRESH_INTERVAL_PAUSED = 10000; // 10 secondes quand en pause (moins de sollicitation API)
const MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4h max pour éviter les sessions infinies

function applyWidthToProgressBar() {
  const container = document.getElementById('watching-progress');
  if (!container) return;
  
  const full = state.width === 'full';
  if (full) {
    container.classList.remove('max-w-7xl','mx-auto');
    container.classList.add('w-full','max-w-none');
  } else {
    container.classList.add('max-w-7xl','mx-auto');
    container.classList.remove('w-full','max-w-none');
  }
}

export function initWatchingProgress() {
  if (isInitialized) {
    return;
  }
  
  const progressContainer = document.getElementById('watching-progress');
  if (progressContainer) {
    // Nettoyer le conteneur au démarrage pour supprimer tout résidu
    hideProgressBar();
    isInitialized = true;
    startWatchingPolling();
  } else {
    console.warn('[initWatchingProgress] Container not found!');
  }
}

export function stopWatchingProgress() {
  if (watchingInterval) {
    clearInterval(watchingInterval);
    watchingInterval = null;
  }
  hideProgressBar();
}

export function applyWidthToProgressBarExternal() {
  applyWidthToProgressBar();
}

async function fetchWatchingData() {
  try {
    const response = await fetch('/api/watching', { cache: 'no-store' });
    const data = await response.json();
    
    if (!data.ok) {
      console.warn('[watching-progress] API error:', data.error);
      return null;
    }
    
    return data.watching;
  } catch (error) {
    console.error('[watching-progress] Fetch error:', error);
    return null;
  }
}

async function fetchPlaybackData() {
  try {
    const response = await fetch('/api/playback', { cache: 'no-store' });
    
    // Vérifier que la réponse est bien du JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('[watching-progress] Playback API returned non-JSON response:', contentType);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      console.warn('[watching-progress] Playback API error:', data.error);
      return [];
    }
    
    return data.playback || [];
  } catch (error) {
    console.error('[watching-progress] Playback fetch error:', error);
    return [];
  }
}

function startWatchingPolling() {
  // S'assurer qu'aucun interval ne tourne déjà
  if (watchingInterval) {
    clearInterval(watchingInterval);
    watchingInterval = null;
  }
  
  // Premier appel immédiat
  updateWatchingProgress();
  
  // Puis polling régulier
  watchingInterval = setInterval(updateWatchingProgress, REFRESH_INTERVAL);
}

function isContentPaused(watching, playbackList) {
  if (!watching || !playbackList || !Array.isArray(playbackList)) {
    return false;
  }
  
  // Pour les films, comparer par trakt ID
  if (watching.type === 'movie' && watching.movie?.ids?.trakt) {
    return playbackList.some(item => 
      item.type === 'movie' && 
      item.movie?.ids?.trakt === watching.movie.ids.trakt
    );
  }
  
  // Pour les épisodes, comparer par trakt ID
  if (watching.type === 'episode' && watching.episode?.ids?.trakt) {
    return playbackList.some(item => 
      item.type === 'episode' && 
      item.episode?.ids?.trakt === watching.episode.ids.trakt
    );
  }
  
  return false;
}

async function updateWatchingProgress() {
  const [watching, playbackList] = await Promise.all([
    fetchWatchingData(),
    fetchPlaybackData()
  ]);
  
  if (!watching || watching === '' || !watching.started_at) {
    // Rien en cours, masquer la barre
    if (currentWatching) {
      hideProgressBar();
      currentWatching = null;
    }
    return;
  }
  
  // Vérifier si le contenu est en pause
  const isPaused = isContentPaused(watching, playbackList);
  
  // Nouveau contenu ou mise à jour
  const isNewContent = !currentWatching || 
    currentWatching.movie?.ids?.trakt !== watching.movie?.ids?.trakt ||
    currentWatching.episode?.ids?.trakt !== watching.episode?.ids?.trakt;
  
  currentWatching = { ...watching, isPaused };
  
  if (isNewContent) {
    showProgressBar(currentWatching);
  } else {
    updateProgressBarContent(currentWatching);
  }
}

function showProgressBar(watching) {
  const container = document.getElementById('watching-progress');
  if (!container) return;
  
  // Nettoyer complètement le conteneur d'abord
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  
  const { progress, timeInfo, isExpired } = calculateProgress(watching);
  
  if (isExpired) {
    hideProgressBar();
    return;
  }
  
  // Choisir l'icône et le statut selon l'état
  const icon = watching.isPaused ? 'fa-pause' : 'fa-play';
  const iconColor = watching.isPaused ? 'text-orange-400' : 'text-sky-400';
  const statusText = watching.isPaused ? 'En pause' : 'En cours';
  const progressBarColor = watching.isPaused ? 'from-orange-500 to-red-600' : 'from-sky-500 to-blue-600';
  
  // Construire le HTML de la barre sans styles inline
  const html = `
    <div class="glass rounded-xl p-3 animate-fade-in">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <div class="${iconColor}">
            <i class="fa-solid ${icon} text-lg"></i>
          </div>
          <div>
            <div class="font-medium text-adaptive">${statusText} : ${watching.movie?.title || watching.episode?.title || 'Contenu'}</div>
            <div class="text-xs text-muted">
              ${watching.type === 'movie' ? `Film ${watching.movie?.year || ''}` : 
                `${watching.show?.title || ''} S${watching.episode?.season || '?'}E${watching.episode?.number || '?'}`}
            </div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-sm font-mono text-sky-300">${Math.round(progress)}%</div>
          <div class="text-xs text-muted watching-time-info">${timeInfo}</div>
        </div>
      </div>
      
      <!-- Barre de progression -->
      <div class="relative h-2 bg-black/30 rounded-full overflow-hidden">
        <div class="progress-bar-fill absolute top-0 left-0 h-full bg-gradient-to-r ${progressBarColor} rounded-full transition-all duration-1000 ease-out"></div>
        <div class="progress-bar-pulse absolute top-0 left-0 h-full bg-sky-400/20 ${watching.isPaused ? '' : 'animate-pulse'} rounded-full"></div>
      </div>
    </div>
  `;
  
  // Remplacer tout le contenu existant
  container.innerHTML = html;
  container.classList.remove('hidden');
  
  // S'assurer d'avoir les bonnes classes de largeur à chaque affichage
  // (car les classes peuvent être modifiées par le toggle width pendant que la barre est cachée)
  setTimeout(() => applyWidthToProgressBar(), 0);
  
  // Appliquer les largeurs via JavaScript après insertion du HTML
  const progressFill = container.querySelector('.progress-bar-fill');
  const progressPulse = container.querySelector('.progress-bar-pulse');
  
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
  if (progressPulse) {
    progressPulse.style.width = `${progress + 2}%`;
  }
}

function updateProgressBarContent(watching) {
  const container = document.getElementById('watching-progress');
  if (!container || container.classList.contains('hidden')) return;
  
  const { progress, timeInfo, isExpired } = calculateProgress(watching);
  
  if (isExpired) {
    hideProgressBar();
    return;
  }
  
  // S'assurer que les classes de largeur sont correctes à chaque mise à jour
  applyWidthToProgressBar();
  
  // Mettre à jour seulement les éléments qui changent
  const progressPercent = container.querySelector('.text-sky-300');
  const timeDisplay = container.querySelector('.watching-time-info');
  const progressFill = container.querySelector('.progress-bar-fill');
  const progressPulse = container.querySelector('.progress-bar-pulse');
  
  if (progressPercent) {
    progressPercent.textContent = `${Math.round(progress)}%`;
  }
  if (timeDisplay) {
    timeDisplay.textContent = timeInfo;
  }
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
  if (progressPulse) {
    progressPulse.style.width = `${progress + 2}%`;
  }
}

function hideProgressBar() {
  const container = document.getElementById('watching-progress');
  if (container) {
    container.classList.add('hidden');
    // Nettoyer complètement tous les enfants
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.innerHTML = '';
  }
}

function calculateProgress(watching) {
  const now = new Date();
  const startTime = new Date(watching.started_at);
  const expireTime = new Date(watching.expires_at);
  
  const totalDurationMs = expireTime.getTime() - startTime.getTime();
  const elapsedMs = now.getTime() - startTime.getTime();
  const remainingMs = expireTime.getTime() - now.getTime();
  
  // Vérifier si la session a expiré
  const isExpired = remainingMs <= 0 || elapsedMs > MAX_DURATION_MS;
  
  // Calculer le pourcentage de progression
  let progress = Math.max(0, Math.min(100, (elapsedMs / totalDurationMs) * 100));
  
  // Si le contenu est en pause, afficher des informations statiques
  if (watching.isPaused) {
    const elapsed = formatDuration(elapsedMs);
    const total = formatDuration(totalDurationMs);
    const timeInfo = `${elapsed} / ${total} (En pause)`;
    return { progress, timeInfo, isExpired };
  }
  
  // Formater les temps pour le contenu en cours de lecture
  const elapsed = formatDuration(elapsedMs);
  const remaining = formatDuration(Math.max(0, remainingMs));
  const total = formatDuration(totalDurationMs);
  
  const timeInfo = `${elapsed} / ${total} (${remaining} restant)`;
  
  return { progress, timeInfo, isExpired };
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h${(minutes % 60).toString().padStart(2, '0')}m`;
  } else {
    return `${minutes}m${(seconds % 60).toString().padStart(2, '0')}s`;
  }
}

// Auto-initialisation quand le DOM est prêt (avec protection contre double init)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWatchingProgress);
} else {
  initWatchingProgress();
}