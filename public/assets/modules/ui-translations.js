/**
 * UI Translations Module
 * Handles dynamic translation of DOM elements
 */

import i18n from './i18n.js';

class UITranslations {
  constructor() {
    this.translationMap = new Map();
    this.initTranslationMap();
  }

  initTranslationMap() {
    // Navigation tabs
    this.translationMap.set('#tabBtnShows', 'navigation.shows');
    this.translationMap.set('#tabBtnMovies', 'navigation.movies');
    this.translationMap.set('#tabBtnShowsUnseen', 'navigation.shows_unseen');
    this.translationMap.set('#tabBtnMoviesUnseen', 'navigation.movies_unseen');
    this.translationMap.set('#tabBtnPlayback', 'navigation.playback');
    this.translationMap.set('#tabBtnStats', 'navigation.stats');

    // Tooltips
    this.translationMap.set('[title="En collection avec épisodes manquants"]', 'tooltips.shows_unseen');
    this.translationMap.set('[title="En collection jamais vus"]', 'tooltips.movies_unseen');
    this.translationMap.set('[title="Contenu en cours de visionnage"]', 'tooltips.playback');
    this.translationMap.set('[title="Cliquer pour recharger les données"]', 'tooltips.refresh_data');
    this.translationMap.set('[title="Changer de thème"]', 'tooltips.change_theme');
    this.translationMap.set('[title="Basculer pleine largeur"]', 'tooltips.toggle_width');
    this.translationMap.set('[title="Remonter en haut"]', 'tooltips.scroll_to_top');

    // Buttons
    this.translationMap.set('button span:contains("Rafraîchir")', 'buttons.refresh');
    this.translationMap.set('button span:contains("Full rebuild")', 'buttons.full_rebuild');
    this.translationMap.set('button span:contains("Filtres")', 'buttons.filters');

    // Theme options
    this.translationMap.set('[data-theme="auto"]', 'theme.auto');
    this.translationMap.set('[data-theme="light"]', 'theme.light');
    this.translationMap.set('[data-theme="dark"]', 'theme.dark');

    // Search and sorting
    this.translationMap.set('label[for="qActive"]', 'search.label');
    this.translationMap.set('#qActive', 'search.placeholder');
    this.translationMap.set('label[for="sortActive"]', 'sort.label');

    // Sort options
    this.translationMap.set('[value="watched_at:desc"]', 'sort.watched_at_desc');
    this.translationMap.set('[value="title:asc"]', 'sort.title_asc');
    this.translationMap.set('[value="title:desc"]', 'sort.title_desc');
    this.translationMap.set('[value="year:desc"]', 'sort.year_desc');
    this.translationMap.set('[value="year:asc"]', 'sort.year_asc');
    this.translationMap.set('[value="episodes:desc"]', 'sort.episodes_desc');
    this.translationMap.set('[value="plays:desc"]', 'sort.plays_desc');
    this.translationMap.set('[value="collected_at:desc"]', 'sort.collected_at_desc');
    this.translationMap.set('[value="collected_at:asc"]', 'sort.collected_at_asc');
    this.translationMap.set('[value="missing:desc"]', 'sort.missing_desc');
    this.translationMap.set('[value="missing:asc"]', 'sort.missing_asc');
  }

  translateUI() {
    // Translate static text content
    this.translateTextContent();
    
    // Translate placeholders
    this.translatePlaceholders();
    
    // Translate tooltips (title attributes)
    this.translateTooltips();
    
    // Translate aria-labels
    this.translateAriaLabels();

    console.log('[UITranslations] UI translated to:', i18n.getCurrentLanguage());
  }

  translateTextContent() {
    // Navigation tabs
    const showsTab = document.querySelector('#tabBtnShows');
    if (showsTab) {
      const text = showsTab.childNodes[showsTab.childNodes.length - 1];
      if (text && text.nodeType === Node.TEXT_NODE) {
        text.textContent = i18n.t('navigation.shows');
      }
    }

    const moviesTab = document.querySelector('#tabBtnMovies');
    if (moviesTab) {
      const text = moviesTab.childNodes[moviesTab.childNodes.length - 1];
      if (text && text.nodeType === Node.TEXT_NODE) {
        text.textContent = i18n.t('navigation.movies');
      }
    }

    const showsUnseenTab = document.querySelector('#tabBtnShowsUnseen');
    if (showsUnseenTab) {
      const text = showsUnseenTab.childNodes[showsUnseenTab.childNodes.length - 1];
      if (text && text.nodeType === Node.TEXT_NODE) {
        text.textContent = i18n.t('navigation.shows_unseen');
      }
    }

    const moviesUnseenTab = document.querySelector('#tabBtnMoviesUnseen');
    if (moviesUnseenTab) {
      const text = moviesUnseenTab.childNodes[moviesUnseenTab.childNodes.length - 1];
      if (text && text.nodeType === Node.TEXT_NODE) {
        text.textContent = i18n.t('navigation.movies_unseen');
      }
    }

    const playbackTab = document.querySelector('#tabBtnPlayback');
    if (playbackTab) {
      const text = playbackTab.childNodes[playbackTab.childNodes.length - 1];
      if (text && text.nodeType === Node.TEXT_NODE) {
        text.textContent = i18n.t('navigation.playback');
      }
    }

    const statsTab = document.querySelector('#tabBtnStats');
    if (statsTab) {
      const text = statsTab.childNodes[statsTab.childNodes.length - 1];
      if (text && text.nodeType === Node.TEXT_NODE) {
        text.textContent = i18n.t('navigation.stats');
      }
    }

    // Buttons with spans
    const refreshBtn = document.querySelector('button span:contains("Rafraîchir")');
    if (refreshBtn) refreshBtn.textContent = i18n.t('buttons.refresh');

    const fullRebuildBtn = document.querySelector('button span:contains("Full rebuild")');
    if (fullRebuildBtn) fullRebuildBtn.textContent = i18n.t('buttons.full_rebuild');

    const filtersBtn = document.querySelector('button:contains("Filtres")');
    if (filtersBtn) filtersBtn.textContent = i18n.t('buttons.filters');

    // Theme options
    const autoTheme = document.querySelector('[data-theme="auto"]');
    if (autoTheme) {
      const textNode = autoTheme.childNodes[autoTheme.childNodes.length - 1];
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = i18n.t('theme.auto');
      }
    }

    const lightTheme = document.querySelector('[data-theme="light"]');
    if (lightTheme) {
      const textNode = lightTheme.childNodes[lightTheme.childNodes.length - 1];
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = i18n.t('theme.light');
      }
    }

    const darkTheme = document.querySelector('[data-theme="dark"]');
    if (darkTheme) {
      const textNode = darkTheme.childNodes[darkTheme.childNodes.length - 1];
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = i18n.t('theme.dark');
      }
    }
  }

  translatePlaceholders() {
    const searchInput = document.getElementById('qActive');
    if (searchInput) {
      searchInput.placeholder = i18n.t('search.placeholder');
    }
  }

  translateTooltips() {
    const tooltipElements = [
      { selector: '#tabBtnShowsUnseen', key: 'tooltips.shows_unseen' },
      { selector: '#tabBtnMoviesUnseen', key: 'tooltips.movies_unseen' },
      { selector: '#tabBtnPlayback', key: 'tooltips.playback' },
      { selector: '#app-title', key: 'tooltips.refresh_data' },
      { selector: '#themeToggle', key: 'tooltips.change_theme' },
      { selector: '#langToggle', key: 'tooltips.change_language' },
      { selector: '#toggleWidth', key: 'tooltips.toggle_width' },
      { selector: '#scroll-to-top', key: 'tooltips.scroll_to_top' }
    ];

    tooltipElements.forEach(({ selector, key }) => {
      const element = document.querySelector(selector);
      if (element) {
        element.title = i18n.t(key);
      }
    });
  }

  translateAriaLabels() {
    const ariaLabelElements = [
      { selector: '#closeFullModal', key: 'tooltips.close_modal' },
      { selector: '#ovClose', key: 'tooltips.close_overview' },
      { selector: '#scroll-to-top', key: 'tooltips.scroll_to_top' }
    ];

    ariaLabelElements.forEach(({ selector, key }) => {
      const element = document.querySelector(selector);
      if (element) {
        element.setAttribute('aria-label', i18n.t(key));
      }
    });
  }

  // Method to retranslate UI when language changes
  retranslate() {
    this.translateUI();
  }
}

// Create global instance
const uiTranslations = new UITranslations();

// Listen for language changes
window.addEventListener('languageChanged', () => {
  uiTranslations.retranslate();
});

export default uiTranslations;