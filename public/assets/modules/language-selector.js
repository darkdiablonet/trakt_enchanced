/**
 * Language Selector Module
 */

import i18n from './i18n.js';

class LanguageSelector {
  constructor() {
    this.langToggle = document.getElementById('langToggle');
    this.langToggleText = document.getElementById('langToggleText');
    this.langDropdown = document.getElementById('langDropdown');
    this.isOpen = false;
  }

  init() {
    if (!this.langToggle) return;

    this.updateUI();
    this.attachEventListeners();

    // Listen for language changes
    window.addEventListener('languageChanged', () => {
      this.updateUI();
    });
  }

  attachEventListeners() {
    // Toggle dropdown
    this.langToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Language selection
    this.langDropdown.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-lang]');
      if (!button) return;

      e.preventDefault();
      e.stopPropagation();

      const selectedLang = button.dataset.lang;
      if (selectedLang !== i18n.getCurrentLanguage()) {
        await this.changeLanguage(selectedLang);
      }
      
      this.closeDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      this.closeDropdown();
    });

    // Close dropdown on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDropdown();
      }
    });
  }

  toggleDropdown() {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    this.langDropdown.classList.remove('hidden');
    this.isOpen = true;
  }

  closeDropdown() {
    this.langDropdown.classList.add('hidden');
    this.isOpen = false;
  }

  async changeLanguage(lang) {
    const success = await i18n.changeLanguage(lang);
    if (success) {
      console.log(`[LanguageSelector] Changed to ${lang}`);
      // Force page refresh to update server-rendered content
      window.location.reload();
    }
  }

  updateUI() {
    const currentLang = i18n.getCurrentLanguage();
    const langMap = {
      'fr': { text: 'FR', flag: '🇫🇷' },
      'en': { text: 'EN', flag: '🇺🇸' }
    };

    const langInfo = langMap[currentLang] || langMap['fr'];
    if (this.langToggleText) {
      this.langToggleText.textContent = langInfo.text;
    }

    // Update active state in dropdown
    const buttons = this.langDropdown.querySelectorAll('[data-lang]');
    buttons.forEach(button => {
      button.classList.toggle('bg-white/20', button.dataset.lang === currentLang);
    });

    // Update tooltip
    if (this.langToggle) {
      this.langToggle.title = i18n.t('tooltips.change_language') || 'Changer de langue';
    }
  }
}

// Initialize and export
const languageSelector = new LanguageSelector();
export default languageSelector;