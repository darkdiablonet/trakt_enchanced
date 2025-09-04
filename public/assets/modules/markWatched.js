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

function updateEpisodeDataLocally(traktId, season, number) {
  const traktIdNum = parseInt(traktId);
  const seasonNum = parseInt(season);
  const numberNum = parseInt(number);
  
  // Mettre à jour les données dans showsRows et showsUnseenRows
  [DATA.showsRows, DATA.showsUnseenRows].forEach(rows => {
    const show = rows.find(s => s.ids?.trakt === traktIdNum);
    if (!show) return;
    
    // Incrémenter le compteur d'épisodes vus
    show.episodes = (show.episodes || 0) + 1;
    
    // Recalculer missing si episodes_total est disponible
    if (show.episodes_total) {
      show.missing = Math.max(0, show.episodes_total - show.episodes);
    }
    
    // Si c'était le prochain épisode, essayer de calculer le nouvel épisode suivant
    if (show.next_episode_data && 
        show.next_episode_data.season === seasonNum && 
        show.next_episode_data.number === numberNum) {
      
      // Simple incrémentation - dans une vraie app, il faudrait vérifier les saisons
      const nextNumber = numberNum + 1;
      const nextSeason = seasonNum;
      
      // Mettre à jour les données du prochain épisode
      show.next_episode_data = {
        season: nextSeason,
        number: nextNumber,
        trakt_id: traktIdNum
      };
      show.next = `S${String(nextSeason).padStart(2,'0')}E${String(nextNumber).padStart(2,'0')}`;
      
      // Si on a dépassé les épisodes disponibles, supprimer les données next
      if (show.missing <= 0) {
        delete show.next_episode_data;
        delete show.next;
      }
    }
  });
}

function updateEpisodeDataLocallyForUnmark(traktId, season, number) {
  const traktIdNum = parseInt(traktId);
  const seasonNum = parseInt(season);
  const numberNum = parseInt(number);
  
  // Mettre à jour les données dans showsRows et showsUnseenRows
  [DATA.showsRows, DATA.showsUnseenRows].forEach(rows => {
    const show = rows.find(s => s.ids?.trakt === traktIdNum);
    if (!show) return;
    
    // Décrémenter le compteur d'épisodes vus
    show.episodes = Math.max(0, (show.episodes || 0) - 1);
    
    // Recalculer missing si episodes_total est disponible
    if (show.episodes_total) {
      show.missing = Math.max(0, show.episodes_total - show.episodes);
    }
    
    // Quand on retire un épisode, on doit recalculer le prochain épisode correctement
    // L'épisode retiré devient le nouveau "next" seulement s'il était le prochain prévu
    if (seasonNum && numberNum) {
      // Si l'épisode retiré était le prochain attendu, on recule d'un épisode
      if (show.next_episode_data && 
          show.next_episode_data.season === seasonNum && 
          show.next_episode_data.number === numberNum) {
        
        // L'épisode retiré devient le nouveau next
        show.next_episode_data = {
          season: seasonNum,
          number: numberNum,
          trakt_id: traktIdNum
        };
        show.next = `S${String(seasonNum).padStart(2,'0')}E${String(numberNum).padStart(2,'0')}`;
      }
      // Si l'épisode retiré est antérieur au next actuel, il devient le nouveau next
      else if (show.next_episode_data && 
               ((seasonNum < show.next_episode_data.season) ||
                (seasonNum === show.next_episode_data.season && numberNum < show.next_episode_data.number))) {
        
        show.next_episode_data = {
          season: seasonNum,
          number: numberNum,
          trakt_id: traktIdNum
        };
        show.next = `S${String(seasonNum).padStart(2,'0')}E${String(numberNum).padStart(2,'0')}`;
      }
    }
    
    // S'assurer qu'on a des données next si missing > 0 et qu'on n'en a pas
    if (show.missing > 0 && !show.next_episode_data && seasonNum && numberNum) {
      show.next_episode_data = {
        season: seasonNum,
        number: numberNum,
        trakt_id: traktIdNum
      };
      show.next = `S${String(seasonNum).padStart(2,'0')}E${String(numberNum).padStart(2,'0')}`;
    }
  });
}

function updateNextEpisodeButtonDisplay(traktId) {
  const traktIdNum = parseInt(traktId);
  
  // Trouver les données mises à jour de la série
  let updatedShow = null;
  [DATA.showsRows, DATA.showsUnseenRows].forEach(rows => {
    const show = rows.find(s => s.ids?.trakt === traktIdNum);
    if (show && !updatedShow) {
      updatedShow = show;
    }
  });
  
  if (!updatedShow) return;
  
  // Trouver toutes les cartes de cette série dans le DOM
  const cards = document.querySelectorAll(`article[data-prefetch*="${traktIdNum}"], .card`);
  
  cards.forEach(card => {
    // Vérifier si c'est bien la bonne série (par précaution)
    const nextBtn = card.querySelector('.badge-next');
    if (!nextBtn) return;
    
    const cardTraktId = nextBtn.dataset.traktId;
    if (parseInt(cardTraktId) !== traktIdNum) return;
    
    // Mettre à jour le bouton next avec les nouvelles données
    if (updatedShow.next_episode_data && updatedShow.next) {
      // Il y a un prochain épisode
      nextBtn.dataset.season = updatedShow.next_episode_data.season;
      nextBtn.dataset.number = updatedShow.next_episode_data.number;
      nextBtn.querySelector('span').textContent = updatedShow.next;
    } else {
      // Plus de prochain épisode, masquer ou supprimer le bouton
      nextBtn.style.display = 'none';
    }
  });
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

async function unmarkEpisodeWatched(traktId, season, number) {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    console.error('CSRF token not found');
    return { ok: false, error: 'CSRF token not found' };
  }

  try {
    const response = await fetch('/api/unmark-watched', {
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
    console.error('Error unmarking episode:', error);
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
      
      // Mise à jour immédiate des données locales pour réactivité
      updateEpisodeDataLocally(traktId, season, number);
      
      // Mettre à jour immédiatement l'affichage du prochain épisode
      updateNextEpisodeButtonDisplay(traktId);
      
      // Refresh automatique après 1.5s pour synchronisation
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

// Gestionnaire de clic pour retirer un épisode de l'historique
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-unmark-episode');
  if (!btn) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Données de l'épisode
  const traktId = btn.dataset.traktId;
  const season = btn.dataset.season;
  const number = btn.dataset.number;
  
  if (!traktId || !season || !number) {
    console.error('Missing episode data for unmark');
    return;
  }
  
  // Confirmation
  if (!confirm(`Retirer S${season.padStart(2,'0')}E${number.padStart(2,'0')} de l'historique ?`)) {
    return;
  }
  
  // États visuels
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';
  
  try {
    const result = await unmarkEpisodeWatched(traktId, season, number);
    
    if (result.ok) {
      // Succès - masquer la ligne
      const episodeRow = btn.closest('.p-3');
      if (episodeRow) {
        episodeRow.style.opacity = '0';
        episodeRow.style.transition = 'opacity 0.3s';
        setTimeout(() => {
          episodeRow.remove();
          // Si plus d'épisodes, afficher un message
          const container = document.querySelector('#watching-details-modal .space-y-3');
          if (container && container.children.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-8">Aucun épisode regardé</div>';
          }
        }, 300);
      }
      
      showToast(`Épisode retiré de l'historique`, 'success');
      
      // Cache page invalidé côté serveur, refresh les données via loadData()
      console.log(`[DEBUG] Unmark success for ${traktId} S${season}E${number}, refreshing data`);
      setTimeout(async () => {
        console.log(`[DEBUG] Starting loadData() refresh after unmark`);
        await loadData();
        console.log(`[DEBUG] loadData() completed after unmark`);
      }, 500);
      
    } else {
      // Erreur
      console.error('Failed to unmark episode:', result.error);
      showToast(`Erreur: ${result.error}`, 'error');
      
      // Restaurer le bouton
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  } catch (error) {
    console.error('Network error:', error);
    showToast('Erreur de réseau', 'error');
    
    // Restaurer le bouton
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
});

export { markEpisodeWatched, markMovieWatched, unmarkEpisodeWatched, showToast };