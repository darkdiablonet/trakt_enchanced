/**
 * I18n Lite Module - Lightweight i18n for setup/loading pages
 * Simplified version without full UI integration
 */

class I18nLite {
  constructor() {
    this.currentLang = 'fr';
    this.translations = {};
    this.fallbackLang = 'fr';
    this.supportedLangs = ['fr', 'en'];
  }

  async init() {
    this.currentLang = this.detectLanguage();
    await this.loadTranslations(this.currentLang);
    
    if (this.currentLang !== this.fallbackLang) {
      await this.loadTranslations(this.fallbackLang);
    }
    
  }

  detectLanguage() {
    // 1. Check localStorage
    const stored = localStorage.getItem('trakt_lang');
    if (stored && this.supportedLangs.includes(stored)) {
      return stored;
    }

    // 2. Check navigator language
    const nav = navigator.language || navigator.userLanguage || 'fr';
    const navLang = nav.split('-')[0];
    
    if (this.supportedLangs.includes(navLang)) {
      return navLang;
    }

    return this.fallbackLang;
  }

  async loadTranslations(lang) {
    try {
      const response = await fetch(`/locales/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load ${lang} translations`);
      }
      
      this.translations[lang] = await response.json();
    } catch (error) {
      console.error(`[i18n-lite] Error loading ${lang} translations:`, error);
      
      if (lang !== this.fallbackLang && !this.translations[this.fallbackLang]) {
        this.currentLang = this.fallbackLang;
      }
    }
  }

  t(key, vars = {}) {
    const translation = this.getTranslation(key, this.currentLang) || 
                       this.getTranslation(key, this.fallbackLang) || 
                       key;
    
    return this.interpolate(translation, vars);
  }

  getTranslation(key, lang) {
    const keys = key.split('.');
    let current = this.translations[lang];
    
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return null;
      }
    }
    
    return current;
  }

  interpolate(text, vars) {
    if (typeof text !== 'string') return text;
    
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return vars.hasOwnProperty(key) ? vars[key] : match;
    });
  }

  updatePageLanguage(section) {
    // Update HTML lang attribute
    document.documentElement.lang = this.currentLang;
    
    // Update page title
    document.title = this.t(`${section}.page_title`);
    
  }

  getCurrentLanguage() {
    return this.currentLang;
  }

  async changeLanguage(lang) {
    if (!this.supportedLangs.includes(lang)) {
      console.warn(`[i18n-lite] Unsupported language: ${lang}`);
      return false;
    }

    // Load translations if not already loaded
    if (!this.translations[lang]) {
      await this.loadTranslations(lang);
    }

    this.currentLang = lang;
    localStorage.setItem('trakt_lang', lang);
    
    // Update HTML lang attribute
    document.documentElement.lang = lang;
    
    return true;
  }
}

// Export for use in setup/loading pages
window.I18nLite = I18nLite;