/**
 * Calendar Module
 * Gestion de l'affichage du calendrier des sorties Trakt
 */

import { posterURL } from './utils.js';
import i18n from './i18n.js';

let currentDate = new Date();
let currentMode = 'releases'; // 'releases' or 'history'
let isMobileView = false; // Vue liste pour mobile

/**
 * Calcule le premier et dernier jour du mois
 */
function getMonthBounds(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0); // 0 = dernier jour du mois précédent
  
  return {
    firstDay,
    lastDay,
    daysInMonth: lastDay.getDate()
  };
}

/**
 * Initialise le module calendrier
 */
// Flag pour éviter l'initialisation multiple
let isCalendarInitialized = false;

/**
 * Détecte si on est sur mobile
 */
function checkMobileView() {
  isMobileView = window.innerWidth < 768;
  return isMobileView;
}

export function initCalendar() {
  // Vérifier que les éléments DOM existent
  if (!document.getElementById('calendarGrid')) {
    return;
  }
  
  // Éviter l'initialisation multiple
  if (isCalendarInitialized) {
    return;
  }
  
  isCalendarInitialized = true;
  
  // Vérifier si on est sur mobile
  checkMobileView();
  
  // Écouter les changements de taille de fenêtre
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const wasMobile = isMobileView;
      checkMobileView();
      if (wasMobile !== isMobileView) {
        // Recharger si on passe de mobile à desktop ou vice versa
        loadCalendarData();
      }
    }, 250);
  });
  
  // Écouter les clics sur les boutons de mode (desktop et mobile)
  const releasesButton = document.getElementById('calendarModeReleases');
  const historyButton = document.getElementById('calendarModeHistory');
  const releasesButtonMobile = document.getElementById('calendarModeReleasesMobile');
  const historyButtonMobile = document.getElementById('calendarModeHistoryMobile');
  
  function switchToReleases() {
    if (currentMode !== 'releases') {
      currentMode = 'releases';
      updateModeButtons();
      loadCalendarData();
    }
  }
  
  function switchToHistory() {
    if (currentMode !== 'history') {
      currentMode = 'history';
      updateModeButtons();
      loadCalendarData();
    }
  }
  
  if (releasesButton && historyButton) {
    releasesButton.addEventListener('click', switchToReleases);
    historyButton.addEventListener('click', switchToHistory);
  }
  
  if (releasesButtonMobile && historyButtonMobile) {
    releasesButtonMobile.addEventListener('click', switchToReleases);
    historyButtonMobile.addEventListener('click', switchToHistory);
  }
  
  // Écouter les clics sur les boutons de navigation (desktop et mobile)
  const prevButton = document.getElementById('calendarPrevWeek');
  const nextButton = document.getElementById('calendarNextWeek');
  const prevButtonMobile = document.getElementById('calendarPrevWeekMobile');
  const nextButtonMobile = document.getElementById('calendarNextWeekMobile');
  const retryButton = document.getElementById('calendarRetry');
  
  function navigatePrev() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    currentDate = new Date(year, month - 1, 1);
    loadCalendarData();
  }
  
  function navigateNext() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    currentDate = new Date(year, month + 1, 1);
    loadCalendarData();
  }
  
  if (prevButton) {
    // Supprimer les anciens listeners avant d'en ajouter un nouveau
    prevButton.replaceWith(prevButton.cloneNode(true));
    const newPrevButton = document.getElementById('calendarPrevWeek');
    newPrevButton.addEventListener('click', navigatePrev);
  }
  
  if (nextButton) {
    // Supprimer les anciens listeners avant d'en ajouter un nouveau
    nextButton.replaceWith(nextButton.cloneNode(true));
    const newNextButton = document.getElementById('calendarNextWeek');
    newNextButton.addEventListener('click', navigateNext);
  }
  
  if (prevButtonMobile) {
    prevButtonMobile.addEventListener('click', navigatePrev);
  }
  
  if (nextButtonMobile) {
    nextButtonMobile.addEventListener('click', navigateNext);
  }
  
  if (retryButton) {
    retryButton.replaceWith(retryButton.cloneNode(true));
    const newRetryButton = document.getElementById('calendarRetry');
    newRetryButton.addEventListener('click', loadCalendarData);
  }
  
  // Mettre à jour les boutons de mode
  updateModeButtons();
  
  // Charger les données initiales
  loadCalendarData();
}

/**
 * Met à jour les boutons de mode (desktop et mobile)
 */
function updateModeButtons() {
  const releasesButton = document.getElementById('calendarModeReleases');
  const historyButton = document.getElementById('calendarModeHistory');
  const releasesButtonMobile = document.getElementById('calendarModeReleasesMobile');
  const historyButtonMobile = document.getElementById('calendarModeHistoryMobile');
  
  if (releasesButton && historyButton) {
    if (currentMode === 'releases') {
      releasesButton.classList.add('active');
      historyButton.classList.remove('active');
    } else {
      releasesButton.classList.remove('active');
      historyButton.classList.add('active');
    }
  }
  
  if (releasesButtonMobile && historyButtonMobile) {
    if (currentMode === 'releases') {
      releasesButtonMobile.classList.add('active');
      historyButtonMobile.classList.remove('active');
    } else {
      releasesButtonMobile.classList.remove('active');
      historyButtonMobile.classList.add('active');
    }
  }
}

/**
 * Charge les données du calendrier depuis l'API
 */
async function loadCalendarData() {
  showLoading();
  checkMobileView();
  
  try {
    let response, data;
    
    if (currentMode === 'history') {
      // Mode historique - utiliser l'API heatmap
      const { firstDay, daysInMonth } = getMonthBounds(currentDate);
      const startDate = formatDate(firstDay);
      const endDate = formatDate(new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0));
      
      response = await fetch(`/api/calendar/history?start_date=${startDate}&end_date=${endDate}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      data = await response.json();
      
      // Sauvegarder les données pour la modal
      window.currentCalendarData = data.watchings || [];
      
      if (isMobileView) {
        displayHistoryCalendarList(data.watchings || []);
      } else {
        displayHistoryCalendar(data.watchings || [], daysInMonth);
      }
    } else {
      // Mode sorties (ancien comportement)
      const { firstDay, daysInMonth } = getMonthBounds(currentDate);
      const startDate = formatDate(firstDay);
      
      response = await fetch(`/api/calendar?start_date=${startDate}&days=${daysInMonth}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Erreur inconnue');
      }
      
      // Sauvegarder les données pour la modal
      window.currentCalendarData = data.calendar;
      
      if (isMobileView) {
        displayCalendarList(data.calendar);
      } else {
        displayCalendar(data.calendar, daysInMonth);
      }
    }
    
    updateMonthRange();
    
  } catch (error) {
    console.error('Erreur lors du chargement du calendrier:', error);
    showError();
  }
}

/**
 * Affiche l'état de chargement
 */
function showLoading() {
  const loading = document.getElementById('calendarLoading');
  const error = document.getElementById('calendarError');
  const grid = document.getElementById('calendarGrid');
  
  if (loading) loading.classList.remove('hidden');
  if (error) error.classList.add('hidden');
  if (grid) grid.classList.add('hidden');
}

/**
 * Affiche l'état d'erreur
 */
function showError() {
  const loading = document.getElementById('calendarLoading');
  const error = document.getElementById('calendarError');
  const grid = document.getElementById('calendarGrid');
  
  if (loading) loading.classList.add('hidden');
  if (error) error.classList.remove('hidden');
  if (grid) grid.classList.add('hidden');
}

/**
 * Affiche le calendrier historique avec les données de visionnage
 */
function displayHistoryCalendar(watchingsData, daysInMonth) {
  const loading = document.getElementById('calendarLoading');
  const error = document.getElementById('calendarError');
  const grid = document.getElementById('calendarGrid');
  
  if (loading) loading.classList.add('hidden');
  if (error) error.classList.add('hidden');
  if (grid) grid.classList.remove('hidden');
  
  if (!grid) return;
  
  // Organiser les données par date
  const dataByDate = {};
  if (watchingsData && Array.isArray(watchingsData)) {
    watchingsData.forEach(watching => {
      const dateKey = watching.watched_at ? watching.watched_at.slice(0, 10) : '';
      if (dateKey) {
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = [];
        }
        dataByDate[dateKey].push(watching);
      }
    });
  }
  
  // Obtenir les bornes du mois
  const { firstDay } = getMonthBounds(currentDate);
  
  // Générer la grille du calendrier pour tout le mois
  let calendarHTML = '';
  
  // Grille de 7 colonnes pour les jours de la semaine
  grid.className = `grid grid-cols-7 gap-2 w-full`;
  
  // En-têtes des jours de la semaine
  const weekdays = i18n.t('calendar.weekdays_chart') || ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  weekdays.forEach(day => {
    calendarHTML += `
      <div class="text-center p-2 bg-white/10 rounded-lg font-semibold text-sm">
        ${day}
      </div>
    `;
  });
  
  // Calculer le jour de la semaine du premier jour (0 = dimanche, 1 = lundi, etc.)
  const firstDayOfWeek = firstDay.getDay();
  const mondayFirst = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Convertir pour lundi = 0
  
  // Ajouter des cellules vides pour les jours avant le 1er du mois
  for (let i = 0; i < mondayFirst; i++) {
    calendarHTML += `<div class="p-2 bg-white/5 rounded-lg opacity-50"></div>`;
  }
  
  // Générer les jours du mois
  const today = new Date().toLocaleDateString('sv-SE'); // Format YYYY-MM-DD en local
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), day);
    const dateKey = formatDate(date);
    const dayWatchings = dataByDate[dateKey] || [];
    const isToday = dateKey === today;
    
    // Calculer si c'est une date passée
    const todayDate = new Date();
    const daysDiff = Math.floor((todayDate - date) / (1000 * 60 * 60 * 24));
    const isPast = daysDiff > 0;
    
    // Déterminer les classes CSS selon la date
    let cellClasses = 'min-h-40 p-2 rounded-lg transition-all';
    let dayNumberClasses = 'text-sm font-semibold mb-2';
    
    if (isToday) {
      cellClasses += ' bg-green-500/10 ring-2 ring-green-500 shadow-lg shadow-green-500/20 calendar-today';
      dayNumberClasses += ' text-green-400';
    } else {
      cellClasses += ' bg-white/5';
    }

    
    
    let dayHTML = `<div class="${cellClasses}">`;
    
    // Badge "Aujourd'hui" si c'est le jour actuel
    if (isToday) {
      dayHTML += `<div class="flex items-baseline gap-2 mb-2">
        <div class="${dayNumberClasses}">${day}</div>
        <div class="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full inline-block font-medium -mb-0.5">
          ${i18n.currentLang === 'en' ? 'Today' : "Aujourd'hui"}
        </div>
      </div>`;
    } else {
      dayHTML += `<div class="${dayNumberClasses}">${day}</div>`;
    }
    
    if (dayWatchings.length === 0) {
      // Jour vide - juste le numéro
    } else {
      // Afficher les visionnages (limité à 3 pour l'espace)
      const maxToShow = 3;
      const watchingsToShow = dayWatchings.slice(0, maxToShow);
      
      watchingsToShow.forEach(watching => {
        const showTitle = watching.show || 'Inconnu';
        const watchTime = watching.watched_at ? new Date(watching.watched_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        const posterImg = watching.poster ? posterURL(watching.poster) : '/assets/placeholder-poster.svg';
        
        let mediaInfo = '';
        if (watching.type === 'movie') {
          mediaInfo = `Film${watching.year ? ` • ${watching.year}` : ''}`;
        } else {
          mediaInfo = `S${String(watching.season_number || 0).padStart(2, '0')}E${String(watching.episode_number || 0).padStart(2, '0')}`;
        }
        
        dayHTML += `
          <div class="text-sm mb-2 p-2 bg-white/10 rounded flex items-start gap-2" title="${showTitle} - ${mediaInfo} - ${watchTime}">
            <img src="${posterImg}" 
                 alt="${showTitle}" 
                 class="w-12 h-16 object-cover rounded flex-shrink-0"
                 loading="lazy">
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">${showTitle}</div>
              <div class="text-muted truncate">${mediaInfo}</div>
              <div class="text-muted truncate">🕐 ${watchTime}</div>
            </div>
          </div>
        `;
      });
      
      // Indicateur s'il y a plus de visionnages
      if (dayWatchings.length > maxToShow) {
        const remainingCount = dayWatchings.length - maxToShow;
        dayHTML += `
          <div class="text-xs text-muted cursor-pointer hover:text-white transition-colors calendar-expand-history" 
               data-day="${dateKey}"
               data-total="${dayWatchings.length}">
            +${remainingCount} autre${remainingCount > 1 ? 's' : ''}
          </div>
        `;
      }
    }
    
    dayHTML += '</div>';
    calendarHTML += dayHTML;
  }
  
  grid.innerHTML = calendarHTML;
  
  // Attacher les event listeners pour les liens d'expansion
  grid.querySelectorAll('.calendar-expand-history').forEach(expandBtn => {
    expandBtn.addEventListener('click', () => {
      const dateKey = expandBtn.dataset.day;
      showAllWatchings(expandBtn, dateKey);
    });
  });
  
  // Attacher les event listeners pour les erreurs d'images
  grid.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => {
      img.src = '/assets/placeholder-poster.svg';
    });
  });
}

/**
 * Affiche le calendrier avec les données
 */
function displayCalendar(calendarData, daysInMonth) {
  const loading = document.getElementById('calendarLoading');
  const error = document.getElementById('calendarError');
  const grid = document.getElementById('calendarGrid');
  
  if (loading) loading.classList.add('hidden');
  if (error) error.classList.add('hidden');
  if (grid) grid.classList.remove('hidden');
  
  if (!grid) return;
  
  // Organiser les données par date
  const dataByDate = {};
  if (calendarData && Array.isArray(calendarData)) {
    calendarData.forEach(entry => {
      const dateKey = entry.first_aired ? entry.first_aired.slice(0, 10) : '';
      if (dateKey) {
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = [];
        }
        dataByDate[dateKey].push(entry);
      }
    });
  }
  
  // Obtenir les bornes du mois
  const { firstDay } = getMonthBounds(currentDate);
  
  // Générer la grille du calendrier pour tout le mois
  let calendarHTML = '';
  
  // Grille de 7 colonnes pour les jours de la semaine
  
  // Définir les classes CSS pour la grille
  grid.className = `grid grid-cols-7 gap-2 w-full`;
  
  // En-têtes des jours de la semaine
  const weekdays = i18n.t('calendar.weekdays_chart') || ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  weekdays.forEach(day => {
    calendarHTML += `
      <div class="text-center p-2 bg-white/10 rounded-lg font-semibold text-sm">
        ${day}
      </div>
    `;
  });
  
  // Calculer le jour de la semaine du premier jour (0 = dimanche, 1 = lundi, etc.)
  const firstDayOfWeek = firstDay.getDay();
  const mondayFirst = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Convertir pour lundi = 0
  
  // Ajouter des cellules vides pour les jours avant le 1er du mois
  for (let i = 0; i < mondayFirst; i++) {
    calendarHTML += `<div class="p-2 bg-white/5 rounded-lg opacity-50"></div>`;
  }
  
  // Générer les jours du mois
  const today = new Date().toLocaleDateString('sv-SE'); // Format YYYY-MM-DD en local
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), day);
    const dateKey = formatDate(date);
    const dayEntries = dataByDate[dateKey] || [];
    const isToday = dateKey === today;
    
    // Calculer si c'est une date passée
    const todayDate = new Date();
    const daysDiff = Math.floor((todayDate - date) / (1000 * 60 * 60 * 24));
    const isPast = daysDiff > 0;
    
    // Déterminer les classes CSS selon la date
    let cellClasses = 'min-h-40 p-2 rounded-lg transition-all';
    let dayNumberClasses = 'text-sm font-semibold mb-2';
    
    if (isToday) {
      cellClasses += ' bg-green-500/10 ring-2 ring-green-500 shadow-lg shadow-green-500/20 calendar-today';
      dayNumberClasses += ' text-green-400';
    } else if (isPast) {
      cellClasses += ' bg-white/2 opacity-30 calendar-past';
      dayNumberClasses += ' text-gray-500';
    } else {
      cellClasses += ' bg-white/5';
    }
    
    let dayHTML = `<div class="${cellClasses}">`;
    
    // Badge "Aujourd'hui" si c'est le jour actuel
    if (isToday) {
      dayHTML += `<div class="flex items-baseline gap-2 mb-2">
        <div class="${dayNumberClasses}">${day}</div>
        <div class="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full inline-block font-medium -mb-0.5">
          ${i18n.currentLang === 'en' ? 'Today' : "Aujourd'hui"}
        </div>
      </div>`;
    } else {
      dayHTML += `<div class="${dayNumberClasses}">${day}</div>`;
    }
    
    if (dayEntries.length === 0) {
      // Jour vide - juste le numéro
    } else {
      // Afficher les épisodes (limité à 3 pour l'espace)
      const maxToShow = 3;
      const entriesToShow = dayEntries.slice(0, maxToShow);
      
      entriesToShow.forEach(entry => {
        const showTitle = entry.show ? entry.show.title : 'Inconnu';
        const episodeInfo = entry.episode ? `S${String(entry.episode.season || 0).padStart(2, '0')}E${String(entry.episode.number || 0).padStart(2, '0')}` : '';
        const posterImg = entry.show && entry.show.poster ? posterURL(entry.show.poster) : '/assets/placeholder-poster.svg';
        
        dayHTML += `
          <div class="text-sm mb-2 p-2 bg-white/10 rounded flex items-start gap-2" title="${showTitle} - ${episodeInfo}">
            <img src="${posterImg}" 
                 alt="${showTitle}" 
                 class="w-12 h-16 object-cover rounded flex-shrink-0"
                 loading="lazy">
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">${showTitle}</div>
              <div class="text-muted truncate">${episodeInfo}</div>
            </div>
          </div>
        `;
      });
      
      // Indicateur s'il y a plus d'épisodes
      if (dayEntries.length > maxToShow) {
        const remainingCount = dayEntries.length - maxToShow;
        dayHTML += `
          <div class="text-xs text-muted cursor-pointer hover:text-white transition-colors calendar-expand" 
               data-day="${dateKey}"
               data-total="${dayEntries.length}">
            +${remainingCount} autre${remainingCount > 1 ? 's' : ''}
          </div>
        `;
      }
    }
    
    dayHTML += '</div>';
    calendarHTML += dayHTML;
  }
  
  grid.innerHTML = calendarHTML;
  
  // Attacher les event listeners pour les liens d'expansion
  grid.querySelectorAll('.calendar-expand').forEach(expandBtn => {
    expandBtn.addEventListener('click', () => {
      const dateKey = expandBtn.dataset.day;
      showAllEpisodes(expandBtn, dateKey);
    });
  });
  
  // Attacher les event listeners pour les erreurs d'images
  grid.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => {
      img.src = '/assets/placeholder-poster.svg';
    });
  });
}

/**
 * Met à jour l'affichage du mois courant (desktop et mobile)
 */
function updateMonthRange() {
  const monthRangeElement = document.getElementById('calendarWeekRange');
  const monthRangeElementMobile = document.getElementById('calendarWeekRangeMobile');
  
  const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
  const options = { month: 'long', year: 'numeric' };
  const monthStr = currentDate.toLocaleDateString(locale, options);
  
  if (monthRangeElement) {
    monthRangeElement.textContent = monthStr;
  }
  
  if (monthRangeElementMobile) {
    monthRangeElementMobile.textContent = monthStr;
  }
}

/**
 * Formate une date au format YYYY-MM-DD
 */
function formatDate(date) {
  // Utiliser la date locale au lieu d'UTC pour être cohérent avec today
  return date.toLocaleDateString('sv-SE');
}

/**
 * Affiche tous les visionnages d'un jour dans une modal
 */
function showAllWatchings(element, dateKey) {
  const dayData = element.closest('[data-day]') || element;
  const totalCount = dayData.dataset.total || 0;
  
  // Trouver les données du jour
  const watchingsData = window.currentCalendarData || [];
  const dayWatchings = watchingsData.filter(watching => {
    const watchingDate = watching.watched_at ? watching.watched_at.slice(0, 10) : '';
    return watchingDate === dateKey;
  });
  
  // Créer le contenu de la modal
  const date = new Date(dateKey);
  const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
  const formattedDate = date.toLocaleDateString(locale, { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let modalContent = `
    <div class="mb-4">
      <h3 class="text-lg font-semibold">${formattedDate}</h3>
      <p class="text-muted">${totalCount} visionnage${totalCount > 1 ? 's' : ''}</p>
    </div>
    <div class="max-h-96 overflow-y-auto space-y-2">
  `;
  
  dayWatchings.forEach(watching => {
    const showTitle = watching.show || 'Inconnu';
    const watchTime = watching.watched_at ? new Date(watching.watched_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const posterImg = watching.poster ? posterURL(watching.poster) : '/assets/placeholder-poster.svg';
    
    let mediaInfo = '';
    if (watching.type === 'movie') {
      mediaInfo = `Film${watching.year ? ` • ${watching.year}` : ''}`;
    } else {
      mediaInfo = `S${String(watching.season_number || 0).padStart(2, '0')}E${String(watching.episode_number || 0).padStart(2, '0')}`;
    }
    
    modalContent += `
      <div class="flex items-start gap-3 p-2 bg-white/5 rounded-lg">
        <img src="${posterImg}" 
             alt="${showTitle}" 
             class="w-12 h-16 object-cover rounded flex-shrink-0"
             loading="lazy"
>
        <div class="flex-1 min-w-0">
          <div class="font-medium">${showTitle}</div>
          <div class="text-muted text-sm">${mediaInfo}</div>
          <div class="text-muted text-sm mt-1">🕐 ${watchTime}</div>
        </div>
      </div>
    `;
  });
  
  modalContent += '</div>';
  
  // Injecter dans la modal existante
  const fullModal = document.getElementById('fullModal');
  if (fullModal) {
    // Remplacer le contenu de la modal
    const modalContainer = fullModal.querySelector('.glass.rounded-xl');
    if (modalContainer) {
      modalContainer.innerHTML = `
        <div class="flex items-start justify-between">
          <div></div>
          <button id="closeFullModal" class="btn btn-outline text-xs" aria-label="Fermer la modale">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div class="mt-4">
          ${modalContent}
        </div>
      `;
      
      // Réattacher l'event listener du bouton fermer
      const closeBtn = modalContainer.querySelector('#closeFullModal');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          fullModal.classList.add('hidden');
        });
      }
      
      // Attacher les event listeners pour les erreurs d'images dans la modal
      modalContainer.querySelectorAll('img').forEach(img => {
        img.addEventListener('error', () => {
          img.src = '/assets/placeholder-poster.svg';
        });
      });
      
      // Fermeture en cliquant sur le backdrop
      const backdrop = fullModal.querySelector('.absolute.inset-0');
      if (backdrop) {
        backdrop.addEventListener('click', () => {
          fullModal.classList.add('hidden');
        });
      }
    }
    fullModal.classList.remove('hidden');
  }
}

/**
 * Affiche tous les épisodes d'un jour dans une modal
 */
function showAllEpisodes(element, dateKey) {
  const dayData = element.closest('[data-day]') || element;
  const totalCount = dayData.dataset.total || 0;
  
  // Trouver les données du jour
  const calendarData = window.currentCalendarData || [];
  const dayEntries = calendarData.filter(entry => {
    const entryDate = entry.first_aired ? entry.first_aired.slice(0, 10) : '';
    return entryDate === dateKey;
  });
  
  // Créer le contenu de la modal
  const date = new Date(dateKey);
  const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
  const formattedDate = date.toLocaleDateString(locale, { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let modalContent = `
    <div class="mb-4">
      <h3 class="text-lg font-semibold">${formattedDate}</h3>
      <p class="text-muted">${totalCount} épisode${totalCount > 1 ? 's' : ''}</p>
    </div>
    <div class="max-h-96 overflow-y-auto space-y-2">
  `;
  
  dayEntries.forEach(entry => {
    const showTitle = entry.show ? entry.show.title : 'Inconnu';
    const episodeInfo = entry.episode ? `S${String(entry.episode.season || 0).padStart(2, '0')}E${String(entry.episode.number || 0).padStart(2, '0')}` : '';
    const episodeTitle = entry.episode ? entry.episode.title : '';
    const posterImg = entry.show && entry.show.poster ? posterURL(entry.show.poster) : '/assets/placeholder-poster.svg';
    
    modalContent += `
      <div class="flex items-start gap-3 p-2 bg-white/5 rounded-lg">
        <img src="${posterImg}" 
             alt="${showTitle}" 
             class="w-12 h-16 object-cover rounded flex-shrink-0"
             loading="lazy"
>
        <div class="flex-1 min-w-0">
          <div class="font-medium">${showTitle}</div>
          <div class="text-muted text-sm">${episodeInfo}</div>
          ${episodeTitle ? `<div class="text-sm mt-1">${episodeTitle}</div>` : ''}
        </div>
      </div>
    `;
  });
  
  modalContent += '</div>';
  
  // Injecter dans la modal existante
  const fullModal = document.getElementById('fullModal');
  if (fullModal) {
    // Remplacer le contenu de la modal
    const modalContainer = fullModal.querySelector('.glass.rounded-xl');
    if (modalContainer) {
      modalContainer.innerHTML = `
        <div class="flex items-start justify-between">
          <div></div>
          <button id="closeFullModal" class="btn btn-outline text-xs" aria-label="Fermer la modale">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div class="mt-4">
          ${modalContent}
        </div>
      `;
      
      // Réattacher l'event listener du bouton fermer
      const closeBtn = modalContainer.querySelector('#closeFullModal');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          fullModal.classList.add('hidden');
        });
      }
      
      // Attacher les event listeners pour les erreurs d'images dans la modal
      modalContainer.querySelectorAll('img').forEach(img => {
        img.addEventListener('error', () => {
          img.src = '/assets/placeholder-poster.svg';
        });
      });
      
      // Fermeture en cliquant sur le backdrop
      const backdrop = fullModal.querySelector('.absolute.inset-0');
      if (backdrop) {
        backdrop.addEventListener('click', () => {
          fullModal.classList.add('hidden');
        });
      }
    }
    fullModal.classList.remove('hidden');
  }
};

/**
 * Affiche le calendrier historique en vue liste (mobile)
 */
function displayHistoryCalendarList(watchingsData) {
  const loading = document.getElementById('calendarLoading');
  const error = document.getElementById('calendarError');
  const grid = document.getElementById('calendarGrid');
  
  if (loading) loading.classList.add('hidden');
  if (error) error.classList.add('hidden');
  if (grid) grid.classList.remove('hidden');
  
  if (!grid) return;
  
  // Organiser les données par date
  const dataByDate = {};
  if (watchingsData && Array.isArray(watchingsData)) {
    watchingsData.forEach(watching => {
      const dateKey = watching.watched_at ? watching.watched_at.slice(0, 10) : '';
      if (dateKey) {
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = [];
        }
        dataByDate[dateKey].push(watching);
      }
    });
  }
  
  // Trier les dates
  const sortedDates = Object.keys(dataByDate).sort((a, b) => b.localeCompare(a));
  
  // Classes pour la vue liste
  grid.className = `space-y-2 w-full`;
  
  let listHTML = '';
  const today = new Date().toLocaleDateString('sv-SE');
  const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
  
  if (sortedDates.length === 0) {
    listHTML = `
      <div class="text-center text-muted p-8">
        ${i18n.currentLang === 'en' ? 'No viewings this month' : 'Aucun visionnage ce mois'}
      </div>
    `;
  } else {
    sortedDates.forEach(dateKey => {
      const dayWatchings = dataByDate[dateKey];
      const date = new Date(dateKey + 'T12:00:00');
      const isToday = dateKey === today;
      
      const formattedDate = date.toLocaleDateString(locale, { 
        weekday: 'short', 
        day: 'numeric',
        month: 'short'
      });
      
      // Carte pour chaque jour
      listHTML += `
        <div class="bg-white/5 rounded-lg p-3 ${isToday ? 'ring-1 ring-green-500' : ''}">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold ${isToday ? 'text-green-400' : ''}">
              ${formattedDate}
              ${isToday ? `<span class="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">${i18n.currentLang === 'en' ? 'Today' : "Aujourd'hui"}</span>` : ''}
            </div>
            <div class="text-sm text-muted">
              ${dayWatchings.length} ${dayWatchings.length === 1 ? 'vu' : 'vus'}
            </div>
          </div>
          <div class="space-y-2">
      `;
      
      // Afficher jusqu'à 3 visionnages
      const maxToShow = 3;
      dayWatchings.slice(0, maxToShow).forEach(watching => {
        const showTitle = watching.show || 'Inconnu';
        const watchTime = watching.watched_at ? new Date(watching.watched_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        const posterImg = watching.poster ? posterURL(watching.poster) : '/assets/placeholder-poster.svg';
        
        let mediaInfo = '';
        if (watching.type === 'movie') {
          mediaInfo = `Film${watching.year ? ` • ${watching.year}` : ''}`;
        } else {
          mediaInfo = `S${String(watching.season_number || 0).padStart(2, '0')}E${String(watching.episode_number || 0).padStart(2, '0')}`;
        }
        
        listHTML += `
          <div class="flex items-start gap-2 p-2 bg-white/5 rounded">
            <img src="${posterImg}" 
                 alt="${showTitle}" 
                 class="w-10 h-14 object-cover rounded flex-shrink-0"
                 loading="lazy"
                 onerror="this.src='/assets/placeholder-poster.svg'">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">${showTitle}</div>
              <div class="text-xs text-muted">${mediaInfo} • ${watchTime}</div>
            </div>
          </div>
        `;
      });
      
      // Bouton "Voir plus" si nécessaire
      if (dayWatchings.length > maxToShow) {
        const remainingCount = dayWatchings.length - maxToShow;
        listHTML += `
          <button class="w-full text-center text-xs text-muted hover:text-white py-1 calendar-expand-history" 
                  data-day="${dateKey}"
                  data-total="${dayWatchings.length}">
            +${remainingCount} autre${remainingCount > 1 ? 's' : ''}
          </button>
        `;
      }
      
      listHTML += `
          </div>
        </div>
      `;
    });
  }
  
  grid.innerHTML = listHTML;
  
  // Centrer sur la date du jour sur mobile
  setTimeout(() => {
    const todayCard = grid.querySelector('.ring-1.ring-green-500');
    if (todayCard) {
      todayCard.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }, 100);
  
  // Attacher les event listeners
  grid.querySelectorAll('.calendar-expand-history').forEach(expandBtn => {
    expandBtn.addEventListener('click', () => {
      const dateKey = expandBtn.dataset.day;
      showAllWatchings(expandBtn, dateKey);
    });
  });
}

/**
 * Affiche le calendrier des sorties en vue liste (mobile)
 */
function displayCalendarList(calendarData) {
  const loading = document.getElementById('calendarLoading');
  const error = document.getElementById('calendarError');
  const grid = document.getElementById('calendarGrid');
  
  if (loading) loading.classList.add('hidden');
  if (error) error.classList.add('hidden');
  if (grid) grid.classList.remove('hidden');
  
  if (!grid) return;
  
  // Organiser les données par date
  const dataByDate = {};
  if (calendarData && Array.isArray(calendarData)) {
    calendarData.forEach(entry => {
      const dateKey = entry.first_aired ? entry.first_aired.slice(0, 10) : '';
      if (dateKey) {
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = [];
        }
        dataByDate[dateKey].push(entry);
      }
    });
  }
  
  // Trier les dates
  const sortedDates = Object.keys(dataByDate).sort();
  
  // Classes pour la vue liste
  grid.className = `space-y-2 w-full`;
  
  let listHTML = '';
  const today = new Date().toLocaleDateString('sv-SE');
  const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
  
  if (sortedDates.length === 0) {
    listHTML = `
      <div class="text-center text-muted p-8">
        ${i18n.currentLang === 'en' ? 'No releases this month' : 'Aucune sortie ce mois'}
      </div>
    `;
  } else {
    sortedDates.forEach(dateKey => {
      const dayEntries = dataByDate[dateKey];
      const date = new Date(dateKey + 'T12:00:00');
      const isToday = dateKey === today;
      
      // Calculer si c'est une date passée
      const todayDate = new Date();
      const daysDiff = Math.floor((todayDate - date) / (1000 * 60 * 60 * 24));
      const isPast = daysDiff > 0;
      
      const formattedDate = date.toLocaleDateString(locale, { 
        weekday: 'short', 
        day: 'numeric',
        month: 'short'
      });
      
      // Carte pour chaque jour
      listHTML += `
        <div class="bg-white/5 rounded-lg p-3 ${isToday ? 'ring-1 ring-green-500' : isPast ? 'opacity-50' : ''}">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold ${isToday ? 'text-green-400' : isPast ? 'text-gray-500' : ''}">
              ${formattedDate}
              ${isToday ? `<span class="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">${i18n.currentLang === 'en' ? 'Today' : "Aujourd'hui"}</span>` : ''}
            </div>
            <div class="text-sm text-muted">
              ${dayEntries.length} ${dayEntries.length === 1 ? 'épisode' : 'épisodes'}
            </div>
          </div>
          <div class="space-y-2">
      `;
      
      // Afficher jusqu'à 3 épisodes
      const maxToShow = 3;
      dayEntries.slice(0, maxToShow).forEach(entry => {
        const showTitle = entry.show ? entry.show.title : 'Inconnu';
        const episodeInfo = entry.episode ? `S${String(entry.episode.season || 0).padStart(2, '0')}E${String(entry.episode.number || 0).padStart(2, '0')}` : '';
        const episodeTitle = entry.episode ? entry.episode.title : '';
        const posterImg = entry.show && entry.show.poster ? posterURL(entry.show.poster) : '/assets/placeholder-poster.svg';
        
        listHTML += `
          <div class="flex items-start gap-2 p-2 bg-white/5 rounded">
            <img src="${posterImg}" 
                 alt="${showTitle}" 
                 class="w-10 h-14 object-cover rounded flex-shrink-0"
                 loading="lazy"
                 onerror="this.src='/assets/placeholder-poster.svg'">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">${showTitle}</div>
              <div class="text-xs text-muted">${episodeInfo}</div>
              ${episodeTitle ? `<div class="text-xs text-muted truncate">${episodeTitle}</div>` : ''}
            </div>
          </div>
        `;
      });
      
      // Bouton "Voir plus" si nécessaire
      if (dayEntries.length > maxToShow) {
        const remainingCount = dayEntries.length - maxToShow;
        listHTML += `
          <button class="w-full text-center text-xs text-muted hover:text-white py-1 calendar-expand" 
                  data-day="${dateKey}"
                  data-total="${dayEntries.length}">
            +${remainingCount} autre${remainingCount > 1 ? 's' : ''}
          </button>
        `;
      }
      
      listHTML += `
          </div>
        </div>
      `;
    });
  }
  
  grid.innerHTML = listHTML;
  
  // Centrer sur la date du jour sur mobile
  setTimeout(() => {
    const todayCard = grid.querySelector('.ring-1.ring-green-500');
    if (todayCard) {
      todayCard.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }, 100);
  
  // Attacher les event listeners
  grid.querySelectorAll('.calendar-expand').forEach(expandBtn => {
    expandBtn.addEventListener('click', () => {
      const dateKey = expandBtn.dataset.day;
      showAllEpisodes(expandBtn, dateKey);
    });
  });
}

/**
 * Réinitialise le calendrier à la date actuelle
 */
export function resetCalendar() {
  currentDate = new Date();
  loadCalendarData();
}