/**
 * Module d'interactions avec la heatmap
 * Gestion des clics sur les cellules et affichage modal
 */

import { posterURL } from './utils.js';
import i18n from './i18n.js';

// Cache des données de visionnages par date
const watchingsCache = new Map();

/**
 * Récupère les visionnages pour une date donnée
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Promise<Object>} Données de visionnages
 */
async function fetchWatchingsByDate(date) {
  // Vérifier le cache d'abord
  if (watchingsCache.has(date)) {
    return watchingsCache.get(date);
  }

  try {
    const response = await fetch(`/api/watchings-by-date/${date}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Mettre en cache avec TTL intelligent
    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) {
      // Date passée = cache permanent
      watchingsCache.set(date, data);
    }
    // Date d'aujourd'hui = pas de cache côté frontend (TTL géré côté serveur)
    
    return data;
  } catch (err) {
    console.error('Erreur lors de la récupération des visionnages:', err);
    return { date, count: 0, watchings: [], error: err.message };
  }
}

/**
 * Formate une date de visionnage pour l'affichage
 * @param {string} watchedAt - Date ISO
 * @returns {string} Heure formatée
 */
function formatWatchedTime(watchedAt) {
  try {
    const date = new Date(watchedAt);
    const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
    return date.toLocaleTimeString(locale, { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch (err) {
    return 'Heure inconnue';
  }
}

/**
 * Formate une date pour l'affichage
 * @param {string} dateStr - Date YYYY-MM-DD
 * @returns {string} Date formatée en français
 */
function formatDate(dateStr) {
  try {
    const date = new Date(dateStr + 'T00:00:00Z');
    const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
    return date.toLocaleDateString(locale, { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  } catch (err) {
    return dateStr;
  }
}

/**
 * Génère le HTML pour la liste des visionnages
 * @param {Array} watchings - Liste des visionnages
 * @returns {string} HTML de la liste
 */
function generateWatchingsHTML(watchings) {
  if (!watchings || watchings.length === 0) {
    return '<div class="text-center text-muted py-8">Aucun visionnage ce jour-là</div>';
  }

  return watchings.map(watching => {
    const time = formatWatchedTime(watching.watched_at);
    const posterRaw = String(watching.poster || '');
    const poster = posterRaw ? posterURL(posterRaw) : '/assets/placeholder-poster.svg';
    
    return `
      <div class="flex items-start gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
        <img src="${poster}" 
             alt="${watching.show}" 
             class="w-12 h-16 object-cover rounded flex-shrink-0 watching-poster"
             loading="lazy">
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">${watching.show}</div>
          ${watching.type === 'movie' ? `
            <div class="text-xs text-muted">
              Film${watching.year ? ` • ${watching.year}` : ''}
            </div>
          ` : `
            <div class="text-xs text-muted">
              S${String(watching.season_number).padStart(2, '0')}E${String(watching.episode_number).padStart(2, '0')}
            </div>
          `}
          <div class="text-xs text-muted mt-1">
            🕐 ${time}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Affiche la modal avec les visionnages du jour
 * @param {string} date - Date YYYY-MM-DD
 * @param {number} count - Nombre de visionnages
 * @param {Array} watchings - Liste des visionnages
 */
function showWatchingsModal(date, count, watchings) {
  const formattedDate = formatDate(date);
  const watchingsHTML = generateWatchingsHTML(watchings);
  
  // Créer la modal
  const modalHTML = `
    <div id="watchings-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
        <!-- Header -->
        <div class="p-4 border-b border-white/10">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold">${formattedDate}</h3>
              <p class="text-sm text-muted">${count} visionnage${count > 1 ? 's' : ''}</p>
            </div>
            <button id="close-modal" class="text-muted hover:text-white transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="p-4 overflow-y-auto max-h-96">
          <div class="space-y-3">
            ${watchingsHTML}
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Supprimer une éventuelle modal existante
  const existingModal = document.getElementById('watchings-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Ajouter la nouvelle modal
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Gérer les erreurs d'images après insertion
  const posterImages = document.querySelectorAll('#watchings-modal .watching-poster');
  posterImages.forEach(img => {
    img.addEventListener('error', () => {
      img.src = '/assets/placeholder-poster.svg';
    });
  });
  
  // Gestionnaires d'événements
  const modal = document.getElementById('watchings-modal');
  const closeBtn = document.getElementById('close-modal');
  
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
 * Gestionnaire de clic sur une cellule de la heatmap
 * @param {Event} event - Événement de clic
 */
async function handleHeatmapCellClick(event) {
  const cell = event.target;
  
  // Vérifier que c'est bien une cellule cliquable
  if (!cell.classList.contains('heatmap-cell')) return;
  
  const date = cell.getAttribute('data-date');
  const count = parseInt(cell.getAttribute('data-count')) || 0;
  
  if (!date) return;
  
  // Si aucun visionnage, ne pas ouvrir la modal
  if (count === 0) return;
  
  // Effet visuel sur la cellule cliquée
  cell.style.filter = 'brightness(1.2)';
  setTimeout(() => {
    cell.style.filter = '';
  }, 200);
  
  try {
    // Récupérer les données
    const data = await fetchWatchingsByDate(date);
    
    if (data.error) {
      console.error('Erreur API:', data.error);
      return;
    }
    
    // Afficher la modal
    showWatchingsModal(date, data.count, data.watchings);
    
  } catch (err) {
    console.error('Erreur lors du clic sur la cellule:', err);
  }
}

/**
 * Initialise les interactions de la heatmap
 */
export function initHeatmapInteractions() {
  // Délégation d'événement sur le conteneur de la heatmap
  document.addEventListener('click', (event) => {
    if (event.target.classList.contains('heatmap-cell')) {
      handleHeatmapCellClick(event);
    }
  });
  
  console.log('Interactions heatmap initialisées');
}

/**
 * Stats du cache pour debug
 */
export function getHeatmapCacheStats() {
  return {
    size: watchingsCache.size,
    keys: Array.from(watchingsCache.keys())
  };
}