/**
 * Calendar Module
 * Gestion de l'affichage du calendrier des sorties Trakt
 */

import { posterURL } from './utils.js';
import i18n from './i18n.js';

let currentDate = new Date();

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

export function initCalendar() {
  // Vérifier que les éléments DOM existent
  if (!document.getElementById('calendarGrid')) {
    return;
  }
  
  // Éviter l'initialisation multiple
  if (isCalendarInitialized) {
    console.log('[DEBUG] Calendar already initialized, skipping');
    return;
  }
  
  console.log('[DEBUG] Initializing calendar...');
  isCalendarInitialized = true;
  
  // Écouter les clics sur les boutons de navigation
  const prevButton = document.getElementById('calendarPrevWeek');
  const nextButton = document.getElementById('calendarNextWeek');
  const retryButton = document.getElementById('calendarRetry');
  
  if (prevButton) {
    // Supprimer les anciens listeners avant d'en ajouter un nouveau
    prevButton.replaceWith(prevButton.cloneNode(true));
    const newPrevButton = document.getElementById('calendarPrevWeek');
    
    newPrevButton.addEventListener('click', () => {
      console.log('[DEBUG] Previous button clicked');
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      currentDate = new Date(year, month - 1, 1);
      console.log('[DEBUG] Previous month:', currentDate.toISOString().slice(0, 10));
      loadCalendarData();
    });
  }
  
  if (nextButton) {
    // Supprimer les anciens listeners avant d'en ajouter un nouveau
    nextButton.replaceWith(nextButton.cloneNode(true));
    const newNextButton = document.getElementById('calendarNextWeek');
    
    newNextButton.addEventListener('click', () => {
      console.log('[DEBUG] Next button clicked');
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      currentDate = new Date(year, month + 1, 1);
      console.log('[DEBUG] Next month:', currentDate.toISOString().slice(0, 10));
      loadCalendarData();
    });
  }
  
  if (retryButton) {
    retryButton.replaceWith(retryButton.cloneNode(true));
    const newRetryButton = document.getElementById('calendarRetry');
    newRetryButton.addEventListener('click', loadCalendarData);
  }
  
  // Charger les données initiales
  loadCalendarData();
}

/**
 * Charge les données du calendrier depuis l'API
 */
async function loadCalendarData() {
  showLoading();
  
  try {
    const { firstDay, daysInMonth } = getMonthBounds(currentDate);
    const startDate = formatDate(firstDay);
    
    const response = await fetch(`/api/calendar?start_date=${startDate}&days=${daysInMonth}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Erreur inconnue');
    }
    
    // Sauvegarder les données pour la modal
    window.currentCalendarData = data.calendar;
    
    displayCalendar(data.calendar, daysInMonth);
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
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), day);
    const dateKey = formatDate(date);
    const dayEntries = dataByDate[dateKey] || [];
    
    let dayHTML = `<div class="min-h-40 p-2 bg-white/5 rounded-lg">`;
    dayHTML += `<div class="text-sm font-semibold mb-2">${day}</div>`;
    
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
                 loading="lazy"
                 onerror="this.src='/assets/placeholder-poster.svg'">
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
}

/**
 * Met à jour l'affichage du mois courant
 */
function updateMonthRange() {
  const monthRangeElement = document.getElementById('calendarWeekRange');
  if (!monthRangeElement) return;
  
  const locale = i18n.currentLang === 'en' ? 'en-US' : 'fr-FR';
  const options = { month: 'long', year: 'numeric' };
  
  const monthStr = currentDate.toLocaleDateString(locale, options);
  monthRangeElement.textContent = monthStr;
}

/**
 * Formate une date au format YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().slice(0, 10);
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
             onerror="this.src='/assets/placeholder-poster.svg'">
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
 * Réinitialise le calendrier à la date actuelle
 */
export function resetCalendar() {
  currentDate = new Date();
  loadCalendarData();
}