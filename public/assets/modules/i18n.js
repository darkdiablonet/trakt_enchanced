/**
 * I18n Module - Client-side internationalization
 */

class I18n {
  constructor() {
    this.currentLang = 'fr';
    this.translations = {};
    this.fallbackLang = 'fr';
    this.supportedLangs = ['fr', 'en'];
  }

  async init() {
    // Detect language from localStorage, navigator, or default
    this.currentLang = this.detectLanguage();
    
    // Load current language translations
    await this.loadTranslations(this.currentLang);
    
    // Load fallback if different from current
    if (this.currentLang !== this.fallbackLang) {
      await this.loadTranslations(this.fallbackLang);
    }
    
    
    // Déclencher l'événement d'initialisation
    window.dispatchEvent(new CustomEvent('i18nInitialized', { 
      detail: { lang: this.currentLang } 
    }));
  }

  detectLanguage() {
    // 1. Check localStorage
    const stored = localStorage.getItem('trakt_lang');
    if (stored && this.supportedLangs.includes(stored)) {
      return stored;
    }

    // 2. Check navigator language
    const nav = navigator.language || navigator.userLanguage || 'fr';
    const navLang = nav.split('-')[0]; // 'fr-FR' -> 'fr'
    
    if (this.supportedLangs.includes(navLang)) {
      return navLang;
    }

    // 3. Default fallback
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
      console.error(`[i18n] Error loading ${lang} translations:`, error);
      
      // If it's not the fallback language, try to load fallback
      if (lang !== this.fallbackLang && !this.translations[this.fallbackLang]) {
        this.currentLang = this.fallbackLang;
      }
    }
  }

  async changeLanguage(lang) {
    if (!this.supportedLangs.includes(lang)) {
      console.warn(`[i18n] Unsupported language: ${lang}`);
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
    
    
    // Dispatch custom event for components to re-render
    window.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { lang } 
    }));
    
    return true;
  }

  /**
   * Get translation for a key with optional variables
   * @param {string} key - Translation key (e.g., 'navigation.shows')
   * @param {Object} vars - Variables to interpolate
   * @returns {string} Translated text
   */
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

  /**
   * Get current language
   */
  getCurrentLanguage() {
    return this.currentLang;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return this.supportedLangs;
  }

  /**
   * Format time duration with proper pluralization
   */
  formatTime(minutes) {
    const m = Number(minutes || 0);
    const d = Math.floor(m / (60 * 24));
    const h = Math.floor((m % (60 * 24)) / 60);
    const r = m % 60;
    
    if (d > 0) {
      return this.t('time.days_hours', { days: d, hours: h });
    }
    if (h > 0) {
      return this.t('time.hours_minutes', { hours: h, minutes: r });
    }
    return this.t('time.minutes', { count: m });
  }
}

// Create global instance
const i18n = new I18n();

// Auto-initialize when module loads
i18n.init().catch(error => {
  console.error('[i18n] Initialization failed:', error);
});

export default i18n;
export { i18n };