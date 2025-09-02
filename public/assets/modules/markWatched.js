/**
 * Module pour marquer les épisodes comme vus
 */

import { loadData } from './data.js';
import { setTab } from './tabs.js';
import { state, DATA } from './state.js';

function getCsrfToken() {
  const input = document.querySelector('input[name="csrf"]');
  return input ? input.value : null;
}

function updateMovieDataLocally(traktId) {
  const traktIdNum = parseInt(traktId);
  
  // Trouver et retirer le film de moviesUnseenRows
  const movieIndex = DATA.moviesUnseenRows.findIndex(movie => movie.ids?.trakt === traktIdNum);
  if (movieIndex === -1) return;
  
  const movie = DATA.moviesUnseenRows.splice(movieIndex, 1)[0];
  
  // Ajouter le film à moviesRows avec plays: 1
  const watchedMovie = {
    ...movie,
    plays: 1,
    watched_at: new Date().toISOString()
  };
  
  // L'ajouter au début de la liste des films vus
  DATA.moviesRows.unshift(watchedMovie);
}

async function markEpisodeWatched(traktId, season, number) {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    console.error('CSRF token not found');
    return { ok: false, error: 'CSRF token not found' };
  }

  try {
    const response = await fetch('/api/mark-watched', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trakt_id: parseInt(traktId),
        season: parseInt(season),
        number: parseInt(number),
        csrf: csrfToken
      })
    });

    return await response.json();
  } catch (error) {
    console.error('Error marking episode as watched:', error);
    return { ok: false, error: error.message };
  }
}

async function markMovieWatched(traktId) {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    console.error('CSRF token not found');
    return { ok: false, error: 'CSRF token not found' };
  }

  try {
    const response = await fetch('/api/mark-movie-watched', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trakt_id: parseInt(traktId),
        csrf: csrfToken
      })
    });

    return await response.json();
  } catch (error) {
    console.error('Error marking movie as watched:', error);
    return { ok: false, error: error.message };
  }
}

// Simple toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // Définir le type de toast avec variable CSS
  toast.style.setProperty('--toast-bg', 
    type === 'success' ? '#10b981' : 
    type === 'error' ? '#ef4444' : '#3b82f6'
  );
  
  document.body.appendChild(toast);
  
  // Auto-remove après 4s
  setTimeout(() => {
    toast.classList.add('animate-toast-reverse');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Gestionnaire de clic pour les badges "next" (épisodes)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-mark-watched');
  if (!btn) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Données de l'épisode
  const traktId = btn.dataset.traktId;
  const season = btn.dataset.season;
  const number = btn.dataset.number;
  const showTitle = btn.dataset.showTitle;
  
  if (!traktId || !season || !number) {
    console.error('Missing episode data');
    return;
  }
  
  // États visuels
  const originalClass = btn.className;
  const originalHTML = btn.innerHTML;
  
  // État loading
  btn.classList.add('loading');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>...</span>';
  
  try {
    const result = await markEpisodeWatched(traktId, season, number);
    
    if (result.ok) {
      // Succès
      btn.className = originalClass.replace('loading', '') + ' success';
      btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Vu ✓</span>';
      
      // Toast de succès
      showToast(`${showTitle} S${season.padStart(2,'0')}E${number.padStart(2,'0')} marqué comme vu !`, 'success');
      
      // Refresh automatique après 1.5s
      setTimeout(() => {
        loadData();
      }, 1500);
      
    } else {
      // Erreur
      console.error('Failed to mark episode:', result.error);
      showToast(`Erreur: ${result.error}`, 'error');
      
      // Restaurer l'état original
      btn.className = originalClass;
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  } catch (error) {
    console.error('Network error:', error);
    showToast('Erreur de réseau', 'error');
    
    // Restaurer l'état original
    btn.className = originalClass;
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
});

// Gestionnaire de clic pour les films "Non vu"
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-mark-movie-watched');
  if (!btn) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Données du film
  const traktId = btn.dataset.traktId;
  const movieTitle = btn.dataset.movieTitle;
  
  if (!traktId) {
    console.error('Missing movie trakt ID');
    return;
  }
  
  // États visuels
  const originalClass = btn.className;
  const originalHTML = btn.innerHTML;
  
  // État loading
  btn.classList.add('loading');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>...</span>';
  
  try {
    const result = await markMovieWatched(traktId);
    
    if (result.ok) {
      // Succès
      btn.className = originalClass.replace('loading', '') + ' success';
      btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Vu ✓</span>';
      
      // Toast de succès
      showToast(`${movieTitle} marqué comme vu !`, 'success');
      
      // Mise à jour immédiate des données locales pour réactivité
      updateMovieDataLocally(traktId);
      
      // Changement d'onglet immédiat si nécessaire
      setTimeout(() => {
        if (state.tab === 'movies_unseen') {
          setTab('movies');
        }
        
        // Rechargement en arrière-plan pour synchronisation
        loadData().catch(console.error);
      }, 1500);
      
    } else {
      // Erreur
      console.error('Failed to mark movie:', result.error);
      showToast(`Erreur: ${result.error}`, 'error');
      
      // Restaurer l'état original
      btn.className = originalClass;
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  } catch (error) {
    console.error('Network error:', error);
    showToast('Erreur de réseau', 'error');
    
    // Restaurer l'état original
    btn.className = originalClass;
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
});

export { markEpisodeWatched, markMovieWatched, showToast };