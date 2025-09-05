/**
 * Header Buttons Module - Génération dynamique des boutons du header
 */

import { themes } from './themes.js';
import i18n from './i18n.js';
import { applyWidth } from './utils.js';
import { state, saveState } from './state.js';

class HeaderButtons {
  constructor() {
    this.headerContainer = null;
    this.init();
  }

  init() {
    
    // Attendre que le header soit disponible
    const trySetup = () => {
      this.headerContainer = document.querySelector('.app-header .flex.items-center.gap-2');
      
      if (this.headerContainer) {
        this.createButtons();
      } else {
        setTimeout(trySetup, 100);
      }
    };
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', trySetup);
    } else {
      trySetup();
    }
  }

  createButtons() {
    // Créer le conteneur des boutons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'ml-auto flex items-center gap-2';

    // Boutons à créer
    const buttons = [
      this.createLanguageSelector(),
      this.createThemeButton(),
      this.createRefreshButton(),
      this.createWidthButton(),
      this.createFullRebuildButton()
    ];

    // Ajouter tous les boutons
    buttons.forEach(button => {
      if (button) buttonsContainer.appendChild(button);
    });

    // Ajouter le conteneur au header
    this.headerContainer.appendChild(buttonsContainer);
    
    
    // Écouter les changements de langue pour mettre à jour les textes
    window.addEventListener('languageChanged', () => {
      this.updateButtonTexts();
      this.updateLanguageDisplay();
    });
  }

  createLanguageSelector() {
    const container = document.createElement('div');
    container.className = 'language-selector relative';

    const button = document.createElement('button');
    button.id = 'langToggle';
    button.className = 'btn btn-outline';
    button.title = 'Changer de langue';
    
    // Récupérer la langue actuelle depuis localStorage ou i18n
    const currentLang = i18n.getCurrentLanguage() || 'fr';
    const langDisplay = currentLang.toUpperCase();
    
    button.innerHTML = `
      <i class="fa-solid fa-globe"></i>
      <span id="langToggleText">${langDisplay}</span>
      <i class="fa-solid fa-chevron-down ml-1 text-xs"></i>
    `;
    

    const dropdown = document.createElement('div');
    dropdown.id = 'langDropdown';
    dropdown.className = 'hidden absolute right-0 mt-2 w-36 bg-slate-900 rounded-lg border border-slate-600 shadow-xl z-50';
    dropdown.innerHTML = `
      <button data-lang="fr" class="w-full px-3 py-2 text-left text-sm hover:bg-white/10 rounded-t-lg flex items-center gap-2">
        <span class="text-base">🇫🇷</span>
        Français
      </button>
      <button data-lang="en" class="w-full px-3 py-2 text-left text-sm hover:bg-white/10 rounded-b-lg flex items-center gap-2">
        <span class="text-base">🇺🇸</span>
        English
      </button>
    `;

    container.appendChild(button);
    container.appendChild(dropdown);
    
    // Ajouter les événements pour le sélecteur de langue
    this.setupLanguageEvents(button, dropdown);
    
    return container;
  }

  setupLanguageEvents(button, dropdown) {
    let isOpen = false;

    // Toggle dropdown au clic du bouton
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      if (isOpen) {
        dropdown.classList.remove('hidden');
        button.classList.add('dropdown-active');
      } else {
        dropdown.classList.add('hidden');
        button.classList.remove('dropdown-active');
      }
    });

    // Fermer en cliquant ailleurs
    document.addEventListener('click', (e) => {
      if (!button.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
        button.classList.remove('dropdown-active');
        isOpen = false;
      }
    });

    // Événements sur les boutons de langue
    const langButtons = dropdown.querySelectorAll('[data-lang]');
    langButtons.forEach(langBtn => {
      langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = langBtn.getAttribute('data-lang');
        
        // Changer la langue via i18n
        i18n.changeLanguage(lang);
        
        // Mettre à jour le texte du bouton
        const langText = button.querySelector('#langToggleText');
        if (langText) {
          langText.textContent = lang.toUpperCase();
        }
        
        // Fermer le dropdown
        dropdown.classList.add('hidden');
        button.classList.remove('dropdown-active');
        isOpen = false;
        
      });
    });

    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        dropdown.classList.add('hidden');
        button.classList.remove('dropdown-active');
        isOpen = false;
      }
    });
  }

  createThemeButton() {
    const button = document.createElement('button');
    button.id = 'themeToggle';
    button.className = 'btn btn-outline';
    button.title = 'Changer de thème';
    
    const icon = document.createElement('i');
    icon.id = 'themeIcon';
    icon.className = 'fa-solid fa-circle-half-stroke';
    
    button.appendChild(icon);
    
    // Événement de cycle des thèmes
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycleTheme();
    });
    
    // Écouter les changements de thème pour mettre à jour l'icône
    window.addEventListener('themechange', () => {
      this.updateThemeIcon();
    });
    
    // Mettre à jour l'icône initiale
    this.updateThemeIcon();
    
    return button;
  }

  createRefreshButton() {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = '/refresh';

    // Récupérer le token CSRF depuis le modal full rebuild (qui a le token valide)
    let csrfToken = '';
    const existingCsrf = document.querySelector('input[name="csrf"]');
    if (existingCsrf && existingCsrf.value !== '<!-- CSRF_TOKEN -->') {
      csrfToken = existingCsrf.value;
    } else {
      // Fallback: essayer une meta tag
      const metaCsrf = document.querySelector('meta[name="csrf-token"]');
      if (metaCsrf) {
        csrfToken = metaCsrf.getAttribute('content');
      }
    }

    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = 'csrf';
    csrfInput.value = csrfToken;

    const button = document.createElement('button');
    button.className = 'btn btn-outline';
    button.type = 'submit';
    button.innerHTML = `
      <i class="fa-solid fa-rotate-right"></i>
      <span data-i18n="buttons.refresh">Refresh</span>
    `;

    form.appendChild(csrfInput);
    form.appendChild(button);
    
    
    return form;
  }

  createWidthButton() {
    const button = document.createElement('button');
    button.id = 'toggleWidth';
    button.className = 'btn btn-outline';
    button.title = 'Basculer pleine largeur';
    button.innerHTML = `
      <i class="fa-solid fa-arrows-left-right-to-line"></i>
      <span data-i18n="buttons.full_width">Full width</span>
    `;

    // Événement de basculement de largeur
    button.addEventListener('click', () => {
      state.width = (state.width === 'full') ? 'limited' : 'full';
      saveState();
      applyWidth();
    });
    
    return button;
  }

  createFullRebuildButton() {
    const button = document.createElement('button');
    button.id = 'openFullModal';
    button.className = 'btn btn-outline js-full-modal';
    button.setAttribute('data-target', 'fullModal');
    button.innerHTML = `
      <i class="fa-solid fa-bolt"></i>
      <span>Full rebuild</span>
    `;
    
    return button;
  }

  cycleTheme() {
    const current = themes.getCurrentTheme();
    let next;
    
    switch(current) {
      case 'auto': next = 'light'; break;
      case 'light': next = 'dark'; break;
      case 'dark': next = 'auto'; break;
      default: next = 'auto';
    }
    
    themes.setTheme(next);
  }

  updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;

    const currentTheme = themes.getCurrentTheme();
    const icons = {
      auto: 'fa-circle-half-stroke',
      light: 'fa-sun',
      dark: 'fa-moon'
    };
    
    const iconClass = icons[currentTheme] || 'fa-circle-half-stroke';
    icon.className = 'fa-solid ' + iconClass;
    
  }

  updateButtonTexts() {
    // Les textes avec data-i18n seront mis à jour automatiquement par ui-translations.js
  }

  updateLanguageDisplay() {
    const langText = document.getElementById('langToggleText');
    if (langText) {
      const currentLang = i18n.getCurrentLanguage() || 'fr';
      langText.textContent = currentLang.toUpperCase();
    }
  }
}

// Créer l'instance
const headerButtons = new HeaderButtons();

export default headerButtons;