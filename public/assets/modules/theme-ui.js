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
    
    // Attendre que le DOM soit complètement chargé ET que les éléments soient présents
    let attempts = 0;
    const maxAttempts = 50; // 5 secondes max
    
    const trySetup = () => {
      attempts++;
      let toggle = document.getElementById('themeToggle');
      let icon = document.getElementById('themeIcon');
      
      
      // Si pas trouvé après 10 tentatives, on le crée nous-mêmes !
      if (!toggle && attempts > 10) {
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
          
        }
      }
      
      if (toggle && icon) {
        this.setupUI();
      } else if (attempts < maxAttempts) {
        setTimeout(trySetup, 100);
      } else {
        console.error('[ThemeUI] Gave up after', maxAttempts, 'attempts. Elements not found.');
      }
    };
    
    // Démarrer la tentative
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', trySetup);
    } else {
      trySetup();
    }
  }

  setupUI() {
    
    // Les éléments ont déjà été vérifiés dans trySetup(), on peut les récupérer
    this.themeToggle = document.getElementById('themeToggle');
    this.themeIcon = document.getElementById('themeIcon');


    // Configurer les événements
    this.setupEvents();
    
    // Mettre à jour l'état initial
    this.updateIcon();
    
  }

  setupEvents() {
    
    // Cycle entre les thèmes au clic
    this.themeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycleTheme();
    });

    // Écouter les changements de thème
    window.addEventListener('themechange', (e) => {
      this.updateIcon();
    });
    
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

  updateIcon() {
    if (!this.themeIcon) return;

    const currentTheme = themes.getCurrentTheme();
    const icon = this.getThemeIcon(currentTheme);
    
    
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
export const themeUI = new ThemeUI();
export default themeUI;