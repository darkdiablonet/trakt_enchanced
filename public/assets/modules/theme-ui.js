/**
 * Theme UI Module - Gestionnaire d'interface pour les thèmes (Switch simple)
 */

import { themeManager, themes } from './themes.js';

class ThemeUI {
  constructor() {
    this.themeToggle = null;
    this.themeIcon = null;
    this.init();
  }

  init() {
    console.log('[ThemeUI] Initializing...');
    console.log('[ThemeUI] Document readyState:', document.readyState);
    
    // Attendre que le DOM soit complètement chargé ET que les éléments soient présents
    let attempts = 0;
    const maxAttempts = 50; // 5 secondes max
    
    const trySetup = () => {
      attempts++;
      let toggle = document.getElementById('themeToggle');
      let icon = document.getElementById('themeIcon');
      
      console.log(`[ThemeUI] Attempt ${attempts}: themeToggle=${!!toggle}, themeIcon=${!!icon}`);
      
      // Si pas trouvé après 10 tentatives, on le crée nous-mêmes !
      if (!toggle && attempts > 10) {
        console.log('[ThemeUI] Creating button manually...');
        const header = document.querySelector('.app-header .flex.items-center.gap-2');
        if (header) {
          toggle = document.createElement('button');
          toggle.id = 'themeToggle';
          toggle.className = 'btn btn-outline';
          toggle.title = 'Changer de thème';
          
          icon = document.createElement('i');
          icon.id = 'themeIcon';
          icon.className = 'fa-solid fa-circle-half-stroke';
          
          toggle.appendChild(icon);
          header.insertBefore(toggle, header.firstChild);
          
          console.log('[ThemeUI] Button created manually!');
        }
      }
      
      if (toggle && icon) {
        console.log('[ThemeUI] Elements found, setting up...');
        this.setupUI();
      } else if (attempts < maxAttempts) {
        console.log(`[ThemeUI] Elements not ready yet, retrying in 100ms... (${attempts}/${maxAttempts})`);
        setTimeout(trySetup, 100);
      } else {
        console.error('[ThemeUI] Gave up after', maxAttempts, 'attempts. Elements not found.');
      }
    };
    
    // Démarrer la tentative
    if (document.readyState === 'loading') {
      console.log('[ThemeUI] DOM still loading, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', trySetup);
    } else {
      console.log('[ThemeUI] DOM loaded, trying setup...');
      trySetup();
    }
  }

  setupUI() {
    console.log('[ThemeUI] Setting up UI...');
    
    // Les éléments ont déjà été vérifiés dans trySetup(), on peut les récupérer
    this.themeToggle = document.getElementById('themeToggle');
    this.themeIcon = document.getElementById('themeIcon');

    console.log('[ThemeUI] themeToggle found:', !!this.themeToggle, this.themeToggle);
    console.log('[ThemeUI] themeIcon found:', !!this.themeIcon, this.themeIcon);

    // Configurer les événements
    this.setupEvents();
    
    // Mettre à jour l'état initial
    this.updateIcon();
    
    console.log('[ThemeUI] Setup complete!');
  }

  setupEvents() {
    console.log('[ThemeUI] Setting up events...');
    
    // Cycle entre les thèmes au clic
    this.themeToggle.addEventListener('click', (e) => {
      console.log('[ThemeUI] Button clicked!');
      e.preventDefault();
      e.stopPropagation();
      this.cycleTheme();
    });

    // Écouter les changements de thème
    window.addEventListener('themechange', (e) => {
      console.log('[ThemeUI] Theme changed event received');
      this.updateIcon();
    });
    
    console.log('[ThemeUI] Events set up complete!');
  }

  cycleTheme() {
    console.log('[ThemeUI] Cycling theme...');
    
    const current = themes.getCurrentTheme();
    let next;
    
    switch(current) {
      case 'auto': next = 'light'; break;
      case 'light': next = 'dark'; break;
      case 'dark': next = 'auto'; break;
      default: next = 'auto';
    }
    
    console.log('[ThemeUI] Current:', current, '-> Next:', next);
    themes.setTheme(next);
  }

  updateIcon() {
    if (!this.themeIcon) return;

    const currentTheme = themes.getCurrentTheme();
    const icon = this.getThemeIcon(currentTheme);
    
    console.log('[ThemeUI] Updating icon for theme:', currentTheme, 'icon:', icon);
    
    // Supprimer toutes les classes d'icônes précédentes
    this.themeIcon.className = 'fa-solid ' + icon;
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
console.log('[ThemeUI] Creating ThemeUI instance...');
export const themeUI = new ThemeUI();
export default themeUI;