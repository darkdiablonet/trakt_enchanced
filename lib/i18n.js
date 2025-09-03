/**
 * I18n Module - Server-side internationalization
 */
import fs from 'node:fs';
import path from 'node:path';

class ServerI18n {
  constructor() {
    this.translations = new Map();
    this.supportedLangs = ['fr', 'en'];
    this.fallbackLang = 'fr';
    this.localesPath = path.join(process.cwd(), 'public', 'locales');
  }

  /**
   * Load all translation files
   */
  loadTranslations() {
    for (const lang of this.supportedLangs) {
      try {
        const filePath = path.join(this.localesPath, `${lang}.json`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          this.translations.set(lang, JSON.parse(content));
          console.log(`[i18n] Loaded server translations for: ${lang}`);
        } else {
          console.warn(`[i18n] Translation file not found: ${filePath}`);
        }
      } catch (error) {
        console.error(`[i18n] Error loading ${lang} translations:`, error);
      }
    }
  }

  /**
   * Detect language from request
   */
  detectLanguage(req) {
    // 1. Check query parameter
    if (req.query.lang && this.supportedLangs.includes(req.query.lang)) {
      return req.query.lang;
    }

    // 2. Check session
    if (req.session?.language && this.supportedLangs.includes(req.session.language)) {
      return req.session.language;
    }

    // 3. Check Accept-Language header
    const acceptLang = req.get('Accept-Language');
    if (acceptLang) {
      const langs = acceptLang.split(',').map(lang => {
        const [code, quality = 1] = lang.trim().split(';q=');
        return { code: code.split('-')[0], quality: parseFloat(quality) };
      }).sort((a, b) => b.quality - a.quality);

      for (const { code } of langs) {
        if (this.supportedLangs.includes(code)) {
          return code;
        }
      }
    }

    // 4. Default fallback
    return this.fallbackLang;
  }

  /**
   * Get translation for a key
   */
  t(key, lang, vars = {}) {
    const translation = this.getTranslation(key, lang) || 
                       this.getTranslation(key, this.fallbackLang) || 
                       key;
    
    return this.interpolate(translation, vars);
  }

  getTranslation(key, lang) {
    const translations = this.translations.get(lang);
    if (!translations) return null;

    const keys = key.split('.');
    let current = translations;
    
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
   * Express middleware to add i18n to request
   */
  middleware() {
    return (req, res, next) => {
      const lang = this.detectLanguage(req);
      
      // Add translation function to request
      req.t = (key, vars) => this.t(key, lang, vars);
      req.lang = lang;
      
      // Save language in session
      if (req.session && req.query.lang) {
        req.session.language = lang;
      }
      
      next();
    };
  }

  /**
   * Get all supported languages with metadata
   */
  getLanguagesInfo() {
    return this.supportedLangs.map(lang => ({
      code: lang,
      name: this.t('app.title', lang) || lang.toUpperCase(),
      flag: this.getLanguageFlag(lang)
    }));
  }

  getLanguageFlag(lang) {
    const flags = {
      'fr': '🇫🇷',
      'en': '🇺🇸'
    };
    return flags[lang] || '🌐';
  }
}

// Create and export singleton
const serverI18n = new ServerI18n();
serverI18n.loadTranslations();

export default serverI18n;
export { serverI18n };