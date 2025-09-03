/**
 * Theme UI Module - Gestionnaire d'interface pour les thèmes
 */

import { themeManager, themes } from './themes.js';
import i18n from './i18n.js';

class ThemeUI {
  constructor() {
    this.themeToggle = null;
    this.themeDropdown = null;
    this.themeToggleText = null;
    this.isDropdownOpen = false;
    this.init();
  }

  init() {
    // Attendre que le DOM soit chargé
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupUI());
    } else {
      this.setupUI();
    }
  }

  setupUI() {
    // Récupérer les éléments DOM
    this.themeToggle = document.getElementById('themeToggle');
    this.themeDropdown = document.getElementById('themeDropdown');
    this.themeToggleText = document.getElementById('themeToggleText');

    if (!this.themeToggle || !this.themeDropdown || !this.themeToggleText) {
      console.warn('Éléments de thème non trouvés dans le DOM');
      return;
    }

    // Configurer les événements
    this.setupEvents();
    
    // Mettre à jour l'état initial
    this.updateUI();
    
    // Écouter l'initialisation d'i18n
    window.addEventListener('i18nInitialized', () => {
      this.updateUI();
    });
  }

  setupEvents() {
    // Événement clic sur le bouton toggle
    this.themeToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Événements des boutons de thème
    const themeButtons = this.themeDropdown.querySelectorAll('[data-theme]');
    themeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const theme = button.getAttribute('data-theme');
        this.selectTheme(theme);
        this.closeDropdown();
      });
    });

    // Fermer le dropdown en cliquant ailleurs
    document.addEventListener('click', (e) => {
      if (this.isDropdownOpen && !this.themeToggle.contains(e.target) && !this.themeDropdown.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Écouter les changements de thème
    window.addEventListener('themechange', (e) => {
      this.updateUI();
    });

    // Écouter les changements de langue
    window.addEventListener('languageChanged', (e) => {
      this.updateUI();
    });

    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isDropdownOpen) {
        this.closeDropdown();
      }
    });
  }

  toggleDropdown() {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    this.themeDropdown.classList.remove('hidden');
    this.themeToggle.classList.add('dropdown-active');
    this.isDropdownOpen = true;
  }

  closeDropdown() {
    this.themeDropdown.classList.add('hidden');
    this.themeToggle.classList.remove('dropdown-active');
    this.isDropdownOpen = false;
  }

  selectTheme(theme) {
    themes.setTheme(theme);
  }

  updateUI() {
    if (!this.themeToggleText) return;

    const currentTheme = themes.getCurrentTheme();
    const effectiveTheme = themes.getEffectiveTheme();

    // Mettre à jour le texte du bouton avec traductions
    let themeLabels;
    
    // Vérifier si i18n est disponible et initialisé
    console.log('[ThemeUI] updateUI called, checking i18n availability...');
    console.log('[ThemeUI] typeof i18n:', typeof i18n);
    console.log('[ThemeUI] i18n.t exists:', typeof i18n !== 'undefined' && !!i18n.t);
    console.log('[ThemeUI] i18n.translations exists:', typeof i18n !== 'undefined' && !!i18n.translations);
    console.log('[ThemeUI] i18n.translations length:', typeof i18n !== 'undefined' && i18n.translations ? Object.keys(i18n.translations).length : 0);
    
    if (typeof i18n !== 'undefined' && i18n.t && i18n.translations && Object.keys(i18n.translations).length > 0) {
      themeLabels = {
        auto: i18n.t('theme.auto'),
        light: i18n.t('theme.light'),
        dark: i18n.t('theme.dark')
      };
      console.log('[ThemeUI] Using i18n translations:', themeLabels);
      console.log('[ThemeUI] Current language:', i18n.getCurrentLanguage());
    } else {
      // Fallback si i18n n'est pas disponible
      themeLabels = {
        auto: 'Auto',
        light: 'Clair',
        dark: 'Sombre'
      };
      console.log('[ThemeUI] i18n not available, using fallback labels');
    }

    this.themeToggleText.textContent = themeLabels[currentTheme] || themeLabels.auto;

    // Mettre à jour les états actifs dans le dropdown
    if (this.themeDropdown) {
      const buttons = this.themeDropdown.querySelectorAll('[data-theme]');
      buttons.forEach(button => {
        const theme = button.getAttribute('data-theme');
        if (theme === currentTheme) {
          button.classList.add('bg-sky-500/20', 'text-sky-300');
        } else {
          button.classList.remove('bg-sky-500/20', 'text-sky-300');
        }
      });
    }
  }

  getThemeIcon(theme) {
    const icons = {
      auto: 'fa-circle-half-stroke',
      light: 'fa-sun',
      dark: 'fa-moon'
    };
    return icons[theme] || 'fa-circle-half-stroke';
  }
}

// Créer et exporter l'instance
export const themeUI = new ThemeUI();
export default themeUI;