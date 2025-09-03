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

    // Note: This translationMap is kept for reference but we use direct DOM manipulation
    // due to CSS selector limitations with :contains()

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
    
    // Translate labels and form elements
    this.translateLabels();
    
    // Translate placeholders
    this.translatePlaceholders();
    
    // Translate tooltips (title attributes)
    this.translateTooltips();
    
    // Translate aria-labels
    this.translateAriaLabels();

    console.log('[UITranslations] UI translated to:', i18n.getCurrentLanguage());
  }

  translateTab(selector, key) {
    const tab = document.querySelector(selector);
    if (tab) {
      // Trouve le texte après l'icône
      const textNodes = Array.from(tab.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
      if (textNodes.length > 0) {
        textNodes[textNodes.length - 1].textContent = i18n.t(key);
      } else {
        // Fallback: cherche le texte dans l'innerHTML
        const iconHtml = tab.querySelector('i') ? tab.querySelector('i').outerHTML : '';
        tab.innerHTML = `${iconHtml}${i18n.t(key)}`;
      }
    }
  }

  translateTextContent() {
    // Navigation tabs - Approach améliorée
    this.translateTab('#tabBtnShows', 'navigation.shows');
    this.translateTab('#tabBtnMovies', 'navigation.movies'); 
    this.translateTab('#tabBtnShowsUnseen', 'navigation.shows_unseen');
    this.translateTab('#tabBtnMoviesUnseen', 'navigation.movies_unseen');
    this.translateTab('#tabBtnPlayback', 'navigation.playback');
    this.translateTab('#tabBtnStats', 'navigation.stats');

    // Buttons with spans - use proper DOM traversal
    const refreshBtn = Array.from(document.querySelectorAll('button span')).find(span => span.textContent.includes('Rafraîchir'));
    if (refreshBtn) refreshBtn.textContent = i18n.t('buttons.refresh');

    const fullRebuildBtn = Array.from(document.querySelectorAll('button span')).find(span => span.textContent.includes('Full rebuild'));
    if (fullRebuildBtn) fullRebuildBtn.textContent = i18n.t('buttons.full_rebuild');
  }

  translatePlaceholders() {
    const searchInput = document.getElementById('qActive');
    if (searchInput) {
      searchInput.placeholder = i18n.t('search.placeholder');
    }
  }

  translateLabels() {
    // Translate search label
    const searchLabel = document.querySelector('label[for="qActive"]');
    if (searchLabel) {
      const icon = searchLabel.querySelector('i');
      const iconHtml = icon ? icon.outerHTML : '';
      searchLabel.innerHTML = `${iconHtml}${i18n.t('search.label')}`;
    }

    // Translate sort label
    const sortLabel = document.querySelector('label[for="sortActive"]');
    if (sortLabel) {
      sortLabel.textContent = i18n.t('sort.label');
    }

    // Translate sort options
    this.translateSortOptions();

    // Translate filters button
    const filtersBtn = document.getElementById('mobileFiltersToggle');
    if (filtersBtn) {
      const icon = filtersBtn.querySelector('i');
      const iconHtml = icon ? icon.outerHTML : '';
      filtersBtn.innerHTML = `${iconHtml}${i18n.t('buttons.filters')}`;
    }

    // Translate theme options
    this.translateThemeOptions();
  }

  translateThemeOptions() {
    const autoTheme = document.querySelector('[data-theme="auto"]');
    if (autoTheme) {
      const icon = autoTheme.querySelector('i');
      const iconHtml = icon ? icon.outerHTML : '';
      autoTheme.innerHTML = `${iconHtml}${i18n.t('theme.auto')}`;
    }

    const lightTheme = document.querySelector('[data-theme="light"]');
    if (lightTheme) {
      const icon = lightTheme.querySelector('i');
      const iconHtml = icon ? icon.outerHTML : '';
      lightTheme.innerHTML = `${iconHtml}${i18n.t('theme.light')}`;
    }

    const darkTheme = document.querySelector('[data-theme="dark"]');
    if (darkTheme) {
      const icon = darkTheme.querySelector('i');
      const iconHtml = icon ? icon.outerHTML : '';
      darkTheme.innerHTML = `${iconHtml}${i18n.t('theme.dark')}`;
    }
  }

  translateSortOptions() {
    const sortSelect = document.getElementById('sortActive');
    if (sortSelect) {
      const options = sortSelect.querySelectorAll('option');
      options.forEach(option => {
        const value = option.value;
        let translationKey = '';
        
        switch(value) {
          case 'watched_at:desc':
            translationKey = 'sort.watched_at_desc';
            break;
          case 'title:asc':
            translationKey = 'sort.title_asc';
            break;
          case 'title:desc':
            translationKey = 'sort.title_desc';
            break;
          case 'year:desc':
            translationKey = 'sort.year_desc';
            break;
          case 'year:asc':
            translationKey = 'sort.year_asc';
            break;
          case 'episodes:desc':
            translationKey = 'sort.episodes_desc';
            break;
          case 'plays:desc':
            translationKey = 'sort.plays_desc';
            break;
          case 'collected_at:desc':
            translationKey = 'sort.collected_at_desc';
            break;
          case 'collected_at:asc':
            translationKey = 'sort.collected_at_asc';
            break;
          case 'missing:desc':
            translationKey = 'sort.missing_desc';
            break;
          case 'missing:asc':
            translationKey = 'sort.missing_asc';
            break;
        }
        
        if (translationKey) {
          option.textContent = i18n.t(translationKey);
        }
      });
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
    
    // Forcer la mise à jour du bouton pleine largeur
    this.updateWidthButton();
  }

  updateWidthButton() {
    // Déclencher un événement pour que utils.js puisse se mettre à jour
    window.dispatchEvent(new CustomEvent('updateWidthButton'));
  }
}

// Create global instance
const uiTranslations = new UITranslations();

// Listen for language changes
window.addEventListener('languageChanged', () => {
  uiTranslations.retranslate();
});

export default uiTranslations;