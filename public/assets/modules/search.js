/**
 * Search Module - TheMovieDB API Search
 * Recherche en temps réel avec l'API TheMovieDB
 */

import i18n from './i18n.js';

class SearchModule {
  constructor() {
    this.searchInput = null;
    this.searchResults = null;
    this.searchCloseButton = null;
    this.currentTimeout = null;
    this.currentAbortController = null;
    this.init();
  }
  
  getCsrfToken() {
    const input = document.querySelector('input[name="csrf"]');
    return input ? input.value : null;
  }

  init() {
    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupElements());
    } else {
      this.setupElements();
    }
  }

  setupElements() {
    this.searchInput = document.getElementById('searchInput');
    this.searchResults = document.getElementById('searchResults');
    this.searchCloseButton = document.getElementById('searchCloseButton');

    if (this.searchInput) {
      this.setupSearchInput();
    }

    if (this.searchCloseButton) {
      this.setupCloseButton();
    }

    // Les traductions sont gérées par ui-translations.js
  }

  setupSearchInput() {
    // Recherche en temps réel avec debounce
    this.searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      // Annuler la recherche précédente
      if (this.currentTimeout) {
        clearTimeout(this.currentTimeout);
      }
      if (this.currentAbortController) {
        this.currentAbortController.abort();
      }

      if (query.length < 2) {
        this.hideResults();
        return;
      }

      // Debounce de 300ms
      this.currentTimeout = setTimeout(() => {
        this.performSearch(query);
      }, 300);
    });

    // Gérer les touches spéciales
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSearch();
      }
    });

  }

  setupCloseButton() {
    this.searchCloseButton.addEventListener('click', () => {
      this.closeSearch();
    });
  }

  async performSearch(query) {
    if (!query || query.length < 2) return;

    // Créer un nouveau AbortController pour cette recherche
    this.currentAbortController = new AbortController();

    try {
      // Afficher un indicateur de chargement
      this.showLoading();

      // Faire les recherches en parallèle (films et séries)
      const [moviesResponse, showsResponse] = await Promise.all([
        this.searchMovies(query),
        this.searchShows(query)
      ]);

      // Vérifier si la recherche n'a pas été annulée
      if (this.currentAbortController.signal.aborted) return;

      // Traiter les résultats
      this.displayResults(moviesResponse, showsResponse, query);

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Search error:', error);
        this.showError();
      }
    }
  }

  async searchMovies(query) {
    const currentLang = i18n.getCurrentLanguage();
    const langParam = currentLang === 'en' ? 'en-US' : 'fr-FR';
    
    const response = await fetch(`/api/search/movies?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(langParam)}`, {
      signal: this.currentAbortController.signal
    });
    
    if (!response.ok) {
      throw new Error(`Movies search failed: ${response.status}`);
    }
    
    return response.json();
  }

  async searchShows(query) {
    const currentLang = i18n.getCurrentLanguage();
    const langParam = currentLang === 'en' ? 'en-US' : 'fr-FR';
    
    const response = await fetch(`/api/search/tv?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(langParam)}`, {
      signal: this.currentAbortController.signal
    });
    
    if (!response.ok) {
      throw new Error(`TV shows search failed: ${response.status}`);
    }
    
    return response.json();
  }

  showLoading() {
    if (!this.searchResults) return;
    
    this.searchResults.classList.remove('hidden');
    this.searchResults.innerHTML = `
      <div class="flex items-center justify-center py-8 text-muted">
        <i class="fa-solid fa-spinner fa-spin mr-2"></i>
        ${i18n.t('search.searching', 'Recherche en cours...')}
      </div>
    `;
  }

  showError() {
    if (!this.searchResults) return;
    
    this.searchResults.classList.remove('hidden');
    this.searchResults.innerHTML = `
      <div class="flex items-center justify-center py-8 text-red-400">
        <i class="fa-solid fa-exclamation-triangle mr-2"></i>
        ${i18n.t('search.error', 'Erreur lors de la recherche')}
      </div>
    `;
  }

  displayResults(moviesData, showsData, query) {
    if (!this.searchResults) return;

    const movies = moviesData?.results || [];
    const shows = showsData?.results || [];
    const totalResults = movies.length + shows.length;

    if (totalResults === 0) {
      this.showNoResults(query);
      return;
    }

    this.searchResults.classList.remove('hidden');
    
    let html = '';

    // Afficher les films si il y en a
    if (movies.length > 0) {
      html += this.renderSection('movies', movies.slice(0, 5));
    }

    // Afficher les séries si il y en a
    if (shows.length > 0) {
      html += this.renderSection('tv', shows.slice(0, 5));
    }

    this.searchResults.innerHTML = html;
    
    // Ajouter les gestionnaires d'événement pour les boutons "Ajouter"
    this.setupAddToHistoryButtons();
  }

  setupAddToHistoryButtons() {
    const addButtons = this.searchResults.querySelectorAll('.add-to-history-btn');
    addButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = button.getAttribute('data-type');
        const tmdbId = button.getAttribute('data-tmdb-id');
        const title = button.getAttribute('data-title');
        const year = button.getAttribute('data-year');
        const posterPath = button.getAttribute('data-poster-path');
        
        this.openAddToHistoryModal({
          type,
          tmdbId,
          title,
          year,
          poster_path: posterPath
        });
      });
    });
  }

  openAddToHistoryModal(itemData) {
    // Créer et afficher une modal pour sélectionner la date/heure
    const modal = document.createElement('div');
    modal.className = 'add-to-history-modal fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm';
    
    const now = new Date();
    // Générer la date et l'heure locales pour les inputs séparés
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentDate = `${year}-${month}-${day}`;
    const currentTime = `${hours}:${minutes}`;
    
    modal.innerHTML = `
      <div class="bg-primary-bg rounded-lg p-6 mx-4 w-full max-w-md border border-white/20 shadow-xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-primary">
            ${i18n.t('search.add_to_history_title', 'Ajouter à l\'historique')}
          </h3>
          <button class="close-modal text-muted hover:text-white" title="${i18n.t('buttons.close', 'Fermer')}">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>
        
        <div class="mb-4">
          <div class="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
            <div class="flex-shrink-0 w-12 h-16 bg-white/10 rounded overflow-hidden">
              ${itemData.poster_path ? 
                `<img src="https://image.tmdb.org/t/p/w92${itemData.poster_path}" alt="${itemData.title}" class="w-full h-full object-cover">` :
                `<div class="w-full h-full flex items-center justify-center">
                  <i class="fa-solid ${itemData.type === 'movies' ? 'fa-film' : 'fa-clapperboard'} text-muted text-lg"></i>
                </div>`
              }
            </div>
            <div>
              <h4 class="font-medium text-primary text-sm">${itemData.title}</h4>
              ${itemData.year ? `<p class="text-xs text-muted">${itemData.year}</p>` : ''}
              <p class="text-xs text-muted/70 mt-1">${itemData.type === 'movies' ? 'Film' : 'Série TV'}</p>
            </div>
          </div>
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-primary mb-2">
            ${i18n.t('search.watched_at', 'Date et heure de visionnage')}
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-muted mb-1">Date</label>
              <input 
                type="date" 
                id="watchedDate"
                value="${currentDate}"
                class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
            </div>
            <div>
              <label class="block text-xs text-muted mb-1">Heure</label>
              <input 
                type="time" 
                id="watchedTime"
                value="${currentTime}"
                class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
            </div>
          </div>
          <p class="text-xs text-muted/70 mt-1">
            ${i18n.t('search.watched_at_help', 'Choisissez quand vous avez regardé ce contenu')}
          </p>
        </div>
        
        <div class="flex items-center gap-3">
          <button 
            id="confirmAdd" 
            class="flex-1 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <i class="fa-solid fa-plus mr-2"></i>
            ${i18n.t('search.confirm_add', 'Ajouter à l\'historique')}
          </button>
          <button 
            class="close-modal px-4 py-2 text-muted hover:text-white transition-colors text-sm"
          >
            ${i18n.t('buttons.close', 'Annuler')}
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Gestionnaires d'événement de la modal
    const closeModal = () => {
      modal.remove();
    };
    
    modal.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    document.addEventListener('keydown', function escapeHandler(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    });
    
    // Gestionnaire pour la confirmation
    const confirmBtn = modal.querySelector('#confirmAdd');
    const watchedDateInput = modal.querySelector('#watchedDate');
    const watchedTimeInput = modal.querySelector('#watchedTime');
    
    confirmBtn.addEventListener('click', async () => {
      const watchedDate = watchedDateInput.value;
      const watchedTime = watchedTimeInput.value;
      
      if (!watchedDate || !watchedTime) {
        alert(i18n.t('search.select_date_error', 'Veuillez sélectionner une date et heure'));
        return;
      }
      
      // Combiner la date et l'heure en format ISO
      const watchedAt = `${watchedDate}T${watchedTime}:00`;
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin mr-2"></i>
        ${i18n.t('search.adding', 'Ajout en cours...')}
      `;
      
      try {
        await this.addToTraktHistory({
          type: itemData.type === 'movies' ? 'movie' : 'show',
          title: itemData.title,
          year: itemData.year ? parseInt(itemData.year) : null,
          tmdb_id: itemData.tmdbId ? parseInt(itemData.tmdbId) : null,
          watched_at: new Date(watchedAt).toISOString()
        });
        
        closeModal();
        this.showSuccessNotification(itemData.title);
        
        // Déclencher un rafraîchissement des données
        this.refreshData();
      } catch (error) {
        console.error('Error adding to history:', error);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
          <i class="fa-solid fa-plus mr-2"></i>
          ${i18n.t('search.confirm_add', 'Ajouter à l\'historique')}
        `;
        this.showErrorNotification(error.message);
      }
    });
  }

  async addToTraktHistory(itemData) {
    const csrfToken = this.getCsrfToken();
    if (!csrfToken) {
      throw new Error('CSRF token not found');
    }
    
    const response = await fetch('/api/add-to-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...itemData,
        csrf: csrfToken
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add to history');
    }

    return response.json();
  }

  showSuccessNotification(title) {
    // Utiliser le système de notifications existant ou créer une notification simple
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in';
    notification.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-check-circle"></i>
        <span>${i18n.t('search.added_success', 'Ajouté à l\'historique')}: ${title}</span>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  showErrorNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in';
    notification.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-exclamation-circle"></i>
        <span>${i18n.t('search.add_error', 'Erreur')}: ${message}</span>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  async refreshData() {
    try {
      // Utiliser l'endpoint de refresh existant
      const csrfToken = this.getCsrfToken();
      const response = await fetch('/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `csrf=${encodeURIComponent(csrfToken)}`
      });
      
      if (response.ok) {
        // Recharger la page après le refresh
        window.location.reload();
      }
    } catch (error) {
      console.warn('[Search] Failed to refresh data after add:', error);
    }
  }

  renderSection(type, items) {
    const title = type === 'movies' ? 
      i18n.t('search.movies', 'Films') : 
      i18n.t('search.tv_shows', 'Séries TV');
    
    const icon = type === 'movies' ? 'fa-film' : 'fa-clapperboard';

    let html = `
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
          <i class="fa-solid ${icon}"></i>
          ${title}
        </h3>
        <div class="space-y-1">
    `;

    items.forEach(item => {
      html += this.renderResultItem(item, type);
    });

    html += `</div></div>`;
    return html;
  }

  renderResultItem(item, type) {
    const title = item.title || item.name || 'Titre inconnu';
    const year = this.extractYear(item.release_date || item.first_air_date);
    const overview = item.overview || '';
    const posterPath = item.poster_path;
    const tmdbId = item.id;
    
    const posterUrl = posterPath ? 
      `https://image.tmdb.org/t/p/w92${posterPath}` : 
      '/assets/no-poster.svg';

    const truncatedOverview = overview.length > 100 ? 
      overview.substring(0, 100) + '...' : 
      overview;

    return `
      <div class="search-result-item flex items-start gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-white/20" 
           data-type="${type}" 
           data-tmdb-id="${tmdbId}"
           data-title="${this.escapeHtml(title)}"
           data-year="${year}">
        <div class="flex-shrink-0 w-12 h-16 bg-white/10 rounded overflow-hidden">
          <img 
            src="${posterUrl}" 
            alt="${this.escapeHtml(title)}"
            class="w-full h-full object-cover"
            loading="lazy"
            onerror="this.src='/assets/no-poster.svg'"
          >
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="font-medium text-primary text-sm leading-tight">
            ${this.escapeHtml(title)}
            ${year ? `<span class="text-muted font-normal"> (${year})</span>` : ''}
          </h4>
          ${truncatedOverview ? `
            <p class="text-xs text-muted mt-1 line-clamp-2">
              ${this.escapeHtml(truncatedOverview)}
            </p>
          ` : ''}
          <div class="flex items-center justify-between mt-2">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-white/10 text-muted">
                <i class="fa-solid ${type === 'movies' ? 'fa-film' : 'fa-clapperboard'} mr-1"></i>
                ${type === 'movies' ? 'Film' : 'Série'}
              </span>
              <span class="text-xs text-muted/70">
                TMDB: ${tmdbId}
              </span>
            </div>
            <button 
              class="add-to-history-btn inline-flex items-center px-2 py-1 rounded text-xs bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              data-type="${type}"
              data-tmdb-id="${tmdbId}"
              data-title="${this.escapeHtml(title)}"
              data-year="${year}"
              data-poster-path="${posterPath || ''}"
              title="Ajouter à l'historique Trakt"
            >
              <i class="fa-solid fa-plus mr-1"></i>
              ${i18n.t('search.add_to_history', 'Ajouter')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  showNoResults(query) {
    if (!this.searchResults) return;
    
    this.searchResults.classList.remove('hidden');
    this.searchResults.innerHTML = `
      <div class="flex flex-col items-center justify-center py-8 text-muted">
        <i class="fa-solid fa-search text-2xl mb-2"></i>
        <p>${i18n.t('search.no_results', 'Aucun résultat trouvé')}</p>
        <p class="text-sm text-muted/70 mt-1">${i18n.t('search.try_different', 'Essayez avec des mots-clés différents')}</p>
      </div>
    `;
  }

  hideResults() {
    if (this.searchResults) {
      this.searchResults.classList.add('hidden');
      this.searchResults.innerHTML = '';
    }
  }

  closeSearch() {
    // Utiliser la fonction du header-buttons si elle existe
    const headerButtons = window.headerButtons;
    if (headerButtons && typeof headerButtons.toggleSearchBar === 'function') {
      headerButtons.toggleSearchBar();
    } else {
      // Fallback direct
      const searchBar = document.getElementById('searchBar');
      if (searchBar) {
        searchBar.classList.add('hidden');
        this.hideResults();
        if (this.searchInput) {
          this.searchInput.value = '';
        }
      }
    }
  }

  extractYear(dateString) {
    if (!dateString) return '';
    return dateString.substring(0, 4);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Créer l'instance
const searchModule = new SearchModule();

export default searchModule;