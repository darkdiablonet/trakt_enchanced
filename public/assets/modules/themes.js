/**
 * Theme Management Module
 * Gestion des thèmes et préférences utilisateur
 */

const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  AUTO: 'auto'
};

const THEME_KEY = 'trakt_theme_preference';

class ThemeManager {
  constructor() {
    this.currentTheme = this.loadTheme();
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.init();
  }

  init() {
    // Écouter les changements de préférence système
    this.mediaQuery.addEventListener('change', () => {
      if (this.currentTheme === THEMES.AUTO) {
        this.applyTheme();
      }
    });

    // Appliquer le thème initial
    this.applyTheme();
  }

  loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && Object.values(THEMES).includes(saved)) {
      return saved;
    }
    return THEMES.AUTO; // Par défaut : suivre le système
  }

  saveTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
  }

  getEffectiveTheme() {
    if (this.currentTheme === THEMES.AUTO) {
      return this.mediaQuery.matches ? THEMES.DARK : THEMES.LIGHT;
    }
    return this.currentTheme;
  }

  applyTheme() {
    const effectiveTheme = this.getEffectiveTheme();
    const root = document.documentElement;
    
    // Retirer les anciennes classes
    root.classList.remove('theme-dark', 'theme-light');
    
    // Ajouter la nouvelle classe
    root.classList.add(`theme-${effectiveTheme}`);
    
    // Mettre à jour la couleur de la barre d'adresse mobile
    this.updateMetaThemeColor(effectiveTheme);
    
    // Déclencher un événement personnalisé
    window.dispatchEvent(new CustomEvent('themechange', { 
      detail: { 
        theme: effectiveTheme,
        preference: this.currentTheme
      } 
    }));
  }

  updateMetaThemeColor(theme) {
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    
    // Couleurs pour la barre d'adresse mobile
    const colors = {
      [THEMES.DARK]: '#0f172a',
      [THEMES.LIGHT]: '#f8fafc'
    };
    
    metaTheme.content = colors[theme];
  }

  setTheme(theme) {
    if (!Object.values(THEMES).includes(theme)) {
      console.warn(`Theme invalide: ${theme}`);
      return;
    }
    
    this.currentTheme = theme;
    this.saveTheme(theme);
    this.applyTheme();
  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  getEffectiveThemeName() {
    return this.getEffectiveTheme();
  }

  toggle() {
    const effective = this.getEffectiveTheme();
    const newTheme = effective === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    this.setTheme(newTheme);
  }
}

// Instance globale du gestionnaire de thèmes
export const themeManager = new ThemeManager();

// Fonctions utilitaires
export const themes = {
  setTheme: (theme) => themeManager.setTheme(theme),
  getCurrentTheme: () => themeManager.getCurrentTheme(),
  getEffectiveTheme: () => themeManager.getEffectiveThemeName(),
  toggle: () => themeManager.toggle(),
  
  // Constantes
  THEMES,
  
  // Vérifications
  isDark: () => themeManager.getEffectiveTheme() === THEMES.DARK,
  isLight: () => themeManager.getEffectiveTheme() === THEMES.LIGHT,
  isAuto: () => themeManager.getCurrentTheme() === THEMES.AUTO
};

// Export par défaut
export default themeManager;