/**
 * Module pour marquer les épisodes comme vus
 */

import { loadData } from './data.js';
import { setTab } from './tabs.js';
import { state, DATA } from './state.js';
import { invalidateWatchingCache } from './watching-details.js';
import { renderCurrent } from './rendering.js';
import i18n from './i18n.js';
import indexedDBCache from './indexeddb-cache.js';

// Fonction pour mettre à jour les données d'une série avec les données du serveur
function updateShowDataWithServerCard(traktId, serverCard) {
  const traktIdNum = parseInt(traktId);
  
  // Mettre à jour les données dans showsRows et showsUnseenRows
  const sections = ['showsRows', 'showsUnseenRows'];
  let updated = false;
  
  for (const section of sections) {
    const rows = DATA[section] || [];
    const showIndex = rows.findIndex(s => s.ids?.trakt === traktIdNum);
    
    if (showIndex !== -1) {
      // Remplacer complètement avec les données serveur
      rows[showIndex] = { ...serverCard };
      updated = true;
    }
  }
  
  if (updated) {
    // Déclencher un re-rendu complet de l'interface avec les nouvelles données
    renderCurrent();
  }
}

// Fonction pour mettre à jour les données d'un film avec les données du serveur
function updateMovieDataWithServerCard(traktId, serverCard) {
  const traktIdNum = parseInt(traktId);
  
  // Chercher dans moviesUnseenRows et le déplacer vers moviesRows si marqué comme vu
  const movieIndex = DATA.moviesUnseenRows.findIndex(movie => movie.ids?.trakt === traktIdNum);
  if (movieIndex !== -1 && serverCard.plays > 0) {
    // Retirer de la liste non-vue
    DATA.moviesUnseenRows.splice(movieIndex, 1);
    
    // Ajouter aux films vus avec les données serveur
    DATA.moviesRows.unshift({ ...serverCard });
    
    
    // Déclencher un re-rendu complet de l'interface
    renderCurrent();
  } else {
    // Mettre à jour dans la section appropriée
    const sections = ['moviesRows', 'moviesUnseenRows'];
    for (const section of sections) {
      const rows = DATA[section] || [];
      const movieIndex = rows.findIndex(m => m.ids?.trakt === traktIdNum);
      
      if (movieIndex !== -1) {
        rows[movieIndex] = { ...serverCard };
        
        // Déclencher un re-rendu complet de l'interface
        renderCurrent();
        break;
      }
    }
  }
}

// Fonction pour récupérer seulement les données d'une série spécifique
async function refreshShowData(traktId) {
  try {
    
    // Récupérer les nouvelles données depuis le serveur
    const response = await fetch(`/api/show-data/${traktId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const showData = await response.json();
    
    // Mettre à jour DATA avec les nouvelles informations
    const sections = ['showsRows', 'showsUnseenRows'];
    let updated = false;
    
    for (const section of sections) {
      const rows = DATA[section] || [];
      const showIndex = rows.findIndex(s => s.ids?.trakt === traktId);
      
      if (showIndex !== -1) {
        // Conserver certaines propriétés de l'ancien objet et fusionner avec les nouvelles données
        const oldShow = rows[showIndex];
        rows[showIndex] = {
          ...oldShow,
          ...showData,
          ids: oldShow.ids // Garder les IDs originaux
        };
        updated = true;
      }
    }
    
    if (updated) {
      // Mettre à jour l'affichage
      updateNextEpisodeButtonDisplay(traktId);
      updateShowCardMetrics(traktId);
    }
    
    return true;
  } catch (error) {
    console.warn(`[refreshShow] Failed to refresh show ${traktId}:`, error.message);
    return false;
  }
}

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

function updateShowCardMetrics(traktId) {
  const traktIdNum = parseInt(traktId);
  
  // Trouver les cards correspondant à cette série (dans tous les onglets)
  document.querySelectorAll(`article[data-prefetch*="${traktIdNum}"] .js-show-watchings`).forEach(metricsBtn => {
    // Récupérer les données mises à jour de la série
    const showData = [...DATA.showsRows, ...DATA.showsUnseenRows].find(s => s.ids?.trakt === traktIdNum);
    if (!showData) return;
    
    const w0 = Number(showData.episodes ?? 0);
    const t = Number(showData.episodes_total ?? 0);
    const w = t > 0 ? Math.min(w0, t) : w0;
    const hasT = t > 0;
    const diff = hasT && w !== t;
    
    // Mettre à jour le texte du bouton
    const text = hasT ? `${w}/${t}` : `${w}`;
    const icon = metricsBtn.querySelector('i');
    const textSpan = icon ? icon.nextSibling : null;
    
    if (textSpan) {
      textSpan.textContent = text;
    } else {
      // Fallback: recréer le contenu complet
      metricsBtn.innerHTML = `<i class="fa-solid fa-film mr-1"></i>${text}`;
    }
    
    // Mettre à jour les classes CSS pour la couleur d'alerte
    if (diff) {
      metricsBtn.classList.add('chip--warn');
    } else {
      metricsBtn.classList.remove('chip--warn');
    }
  });
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
    
    // Si c'était le prochain épisode, passer au suivant
    if (show.next_episode_data && 
        show.next_episode_data.season === seasonNum && 
        show.next_episode_data.number === numberNum) {
      
      // Passer à l'épisode suivant
      const nextNumber = numberNum + 1;
      const nextSeason = seasonNum;
      
      // Mettre à jour les données du prochain épisode
      show.next_episode_data = {
        season: nextSeason,
        number: nextNumber,
        trakt_id: traktIdNum
      };
      show.next = `S${String(nextSeason).padStart(2,'0')}E${String(nextNumber).padStart(2,'0')}`;
      
      // Si tous les épisodes sont vus, supprimer les données next
      if (show.missing <= 0) {
        delete show.next_episode_data;
        delete show.next;
      }
    }
  });
  
  // Mettre à jour immédiatement l'affichage
  updateNextEpisodeButtonDisplay(traktIdNum);
  updateShowCardMetrics(traktIdNum);
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
    
    // L'épisode retiré devient potentiellement le nouveau next
    if (!show.next_episode_data || 
        (show.next_episode_data.season > seasonNum) ||
        (show.next_episode_data.season === seasonNum && show.next_episode_data.number > numberNum)) {
      
      // L'épisode retiré devient le nouveau next
      show.next_episode_data = {
        season: seasonNum,
        number: numberNum,
        trakt_id: traktIdNum
      };
      show.next = `S${String(seasonNum).padStart(2,'0')}E${String(numberNum).padStart(2,'0')}`;
    }
  });
  
  // Mettre à jour immédiatement l'affichage
  updateNextEpisodeButtonDisplay(traktIdNum);
  updateShowCardMetrics(traktIdNum);
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
  const cards = document.querySelectorAll(`article[data-prefetch*="${traktIdNum}"]`);
  
  cards.forEach(card => {
    // Trouver le bouton next dans cette carte
    const nextBtn = card.querySelector('.badge-next, .js-mark-watched');
    if (!nextBtn) return;
    
    // Vérifier que c'est bien la bonne série
    const cardTraktId = parseInt(nextBtn.dataset.traktId);
    if (cardTraktId !== traktIdNum) return;
    
    // Mettre à jour le bouton next avec les nouvelles données
    if (updatedShow.next_episode_data && updatedShow.next) {
      // Il y a un prochain épisode
      nextBtn.dataset.season = updatedShow.next_episode_data.season;
      nextBtn.dataset.number = updatedShow.next_episode_data.number;
      nextBtn.style.display = ''; // S'assurer qu'il est visible
      
      const spanElement = nextBtn.querySelector('span');
      if (spanElement) {
        spanElement.textContent = updatedShow.next;
      }
    } else {
      // Plus de prochain épisode, masquer le bouton
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
      
      // Invalider le cache IndexedDB car les données ont changé
      await indexedDBCache.clearPageData();
      
      // Invalider le cache de la modal des épisodes vus
      invalidateWatchingCache(traktId, 'show');
      
      // Toast de succès
      showToast(`${showTitle} S${(season || '0').padStart(2,'0')}E${(number || '0').padStart(2,'0')} marqué comme vu !`, 'success');
      
      // Utiliser directement les données mises à jour du serveur si disponibles
      if (result.updatedCard) {
        updateShowDataWithServerCard(traktId, result.updatedCard);
      } else {
        // Fallback vers la mise à jour locale
        updateEpisodeDataLocally(traktId, season, number);
      }
      
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
      
      // Invalider le cache IndexedDB car les données ont changé
      await indexedDBCache.clearPageData();
      
      // Invalider le cache de la modal des visionnages
      invalidateWatchingCache(traktId, 'movie');
      
      // Toast de succès
      showToast(`${movieTitle} marqué comme vu !`, 'success');
      
      // Utiliser directement les données mises à jour du serveur si disponibles
      if (result.updatedCard) {
        updateMovieDataWithServerCard(traktId, result.updatedCard);
      } else {
        // Fallback vers la mise à jour locale
        updateMovieDataLocally(traktId);
      }
      
      // Changement d'onglet immédiat si nécessaire
      setTimeout(() => {
        if (state.tab === 'movies_unseen') {
          setTab('movies');
        }
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
  if (!confirm(`Retirer S${(season || '0').padStart(2,'0')}E${(number || '0').padStart(2,'0')} de l'historique ?`)) {
    return;
  }
  
  // États visuels
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';
  
  try {
    const result = await unmarkEpisodeWatched(traktId, season, number);
    
    if (result.ok) {
      // Invalider le cache IndexedDB car les données ont changé
      await indexedDBCache.clearPageData();
      
      // Invalider le cache de la modal des épisodes vus
      invalidateWatchingCache(traktId, 'show');
      
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
      
      // Utiliser directement les données mises à jour du serveur si disponibles
      if (result.updatedCard) {
        updateShowDataWithServerCard(traktId, result.updatedCard);
      } else {
        // Fallback vers la mise à jour locale
        updateEpisodeDataLocallyForUnmark(traktId, season, number);
      }
      
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