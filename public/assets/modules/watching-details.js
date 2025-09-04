/**
 * Module de détails de visionnage pour les cartes
 * Gestion des clics sur les metrics des cartes pour afficher les détails
 */

import { posterURL } from './utils.js';
import i18n from './i18n.js';

// Cache des données de visionnage par ID
const watchingDetailsCache = new Map();

/**
 * Récupère les détails de visionnage pour un élément
 * @param {string} traktId - ID Trakt de l'élément
 * @param {string} kind - Type: 'movie' ou 'show'
 * @returns {Promise<Object>} Données de visionnage
 */
async function fetchWatchingDetails(traktId, kind) {
  const cacheKey = `${kind}-${traktId}`;
  
  // Vérifier le cache d'abord
  if (watchingDetailsCache.has(cacheKey)) {
    return watchingDetailsCache.get(cacheKey);
  }

  try {
    const response = await fetch(`/api/watching-details/${kind}/${traktId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Mettre en cache
    watchingDetailsCache.set(cacheKey, data);
    
    return data;
  } catch (err) {
    console.error('Erreur lors de la récupération des détails:', err);
    return { error: err.message, watchings: [] };
  }
}

/**
 * Formate une date de visionnage pour l'affichage
 * @param {string} watchedAt - Date ISO
 * @returns {string} Date et heure formatées
 */
function formatWatchingDateTime(watchedAt) {
  try {
    const date = new Date(watchedAt);
    return date.toLocaleString(i18n.currentLang === 'en' ? 'en-US' : 'fr-FR', { 
      weekday: 'long',
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch (err) {
    return 'Date inconnue';
  }
}

/**
 * Génère le HTML pour les détails de visionnage d'un film
 * @param {Object} movieData - Données du film
 * @returns {string} HTML des détails
 */
function generateMovieDetailsHTML(movieData) {
  if (!movieData.watchings || movieData.watchings.length === 0) {
    return '<div class="text-center text-muted py-8">Aucun visionnage trouvé</div>';
  }

  return movieData.watchings.map(watching => {
    const datetime = formatWatchingDateTime(watching.watched_at);
    
    return `
      <div class="p-3 bg-white/5 rounded-lg">
        <div class="flex items-center gap-2 mb-2">
          <i class="fa-solid fa-play text-green-400"></i>
          <span class="text-sm font-medium">Regardé</span>
        </div>
        <div class="text-xs text-muted">
          🗓️ ${datetime}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Génère le HTML pour les détails de visionnage d'une série
 * @param {Object} showData - Données de la série
 * @returns {string} HTML des détails
 */
function generateShowDetailsHTML(showData) {
  if (!showData.watchings || showData.watchings.length === 0) {
    return '<div class="text-center text-muted py-8">Aucun épisode regardé trouvé</div>';
  }

  return showData.watchings.map(watching => {
    const datetime = formatWatchingDateTime(watching.watched_at);
    
    return `
      <div class="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
        <div class="flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm truncate">${watching.episode_title || 'Episode'}</div>
            <div class="text-xs text-muted">
              S${String(watching.season_number).padStart(2, '0')}E${String(watching.episode_number).padStart(2, '0')}
            </div>
          </div>
          <div class="text-xs text-muted text-right">
            🗓️ ${datetime}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Affiche la modal avec les détails de visionnage
 * @param {string} title - Titre du contenu
 * @param {string} kind - Type: 'movie' ou 'show'
 * @param {Object} data - Données de visionnage
 */
function showWatchingDetailsModal(title, kind, data) {
  const detailsHTML = kind === 'movie' 
    ? generateMovieDetailsHTML(data)
    : generateShowDetailsHTML(data);
  
  const kindLabel = kind === 'movie' ? 'Film' : 'Série';
  const count = data.watchings?.length || 0;
  
  // Créer la modal
  const modalHTML = `
    <div id="watching-details-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
        <!-- Header -->
        <div class="p-4 border-b border-white/10">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold truncate">${title}</h3>
              <p class="text-sm text-muted">${kindLabel} • ${count} visionnage${count > 1 ? 's' : ''}</p>
            </div>
            <button id="close-details-modal" class="text-muted hover:text-white transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="p-4 overflow-y-auto max-h-96">
          <div class="space-y-3">
            ${detailsHTML}
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Supprimer une éventuelle modal existante
  const existingModal = document.getElementById('watching-details-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Ajouter la nouvelle modal
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Gestionnaires d'événements
  const modal = document.getElementById('watching-details-modal');
  const closeBtn = document.getElementById('close-details-modal');
  
  const closeModal = () => {
    modal?.remove();
  };
  
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Fermer avec Escape
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Gestionnaire de clic sur les metrics des cartes
 * @param {Event} event - Événement de clic
 */
async function handleWatchingDetailsClick(event) {
  const button = event.target.closest('.js-show-watchings');
  
  if (!button) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  const traktId = button.getAttribute('data-trakt-id');
  const kind = button.getAttribute('data-kind');
  const title = button.getAttribute('data-show-title') || button.getAttribute('data-movie-title');
  
  if (!traktId || !kind || !title) return;
  
  // Effet visuel sur le bouton cliqué
  button.style.opacity = '0.7';
  setTimeout(() => {
    button.style.opacity = '';
  }, 200);
  
  try {
    // Récupérer les données
    const data = await fetchWatchingDetails(traktId, kind);
    
    if (data.error) {
      console.error('Erreur API:', data.error);
      return;
    }
    
    // Afficher la modal
    showWatchingDetailsModal(title, kind, data);
    
  } catch (err) {
    console.error('Erreur lors du clic sur les détails:', err);
  }
}

/**
 * Initialise les interactions pour les détails de visionnage
 */
export function initWatchingDetails() {
  // Délégation d'événement sur le document
  document.addEventListener('click', handleWatchingDetailsClick);
  
}

/**
 * Stats du cache pour debug
 */
export function getWatchingDetailsCacheStats() {
  return {
    size: watchingDetailsCache.size,
    keys: Array.from(watchingDetailsCache.keys())
  };
}