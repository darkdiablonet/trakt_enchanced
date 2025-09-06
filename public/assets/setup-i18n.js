/**
 * Setup Page Internationalization
 */

class SetupI18n {
  constructor(i18n) {
    this.i18n = i18n;
  }

  async translatePage() {
    // Update page title
    this.i18n.updatePageLanguage('setup');

    // Translate main titles
    const title = document.querySelector('h1');
    if (title) {
      title.innerHTML = `
        <i class="fa-solid fa-cog mr-3 text-sky-400"></i>
        ${this.i18n.t('setup.title')}
      `;
    }

    const subtitle = document.querySelector('h1 + p');
    if (subtitle) {
      subtitle.textContent = this.i18n.t('setup.subtitle');
    }

    // Translate CSRF info
    const csrfStatus = document.getElementById('csrf-status');
    if (csrfStatus) {
      csrfStatus.innerHTML = `
        <i class="fa-solid fa-shield-alt mr-1"></i>
        ${this.i18n.t('setup.csrf_security')} <span id="csrf-state">${this.i18n.t('setup.csrf_checking')}</span>
      `;
    }

    // Translate sections
    this.translateSection('Configuration de base', 'setup.basic_config', 'fa-home');
    this.translateSection('API Trakt.tv (Requis)', 'setup.trakt_api', 'fa-tv');
    this.translateSection('API TMDB (Requis)', 'setup.tmdb_api', 'fa-film');
    this.translateSection('Sécurité', 'setup.security', 'fa-shield-alt');

    // Translate form fields
    this.translateLabel('port', 'setup.port');
    this.translateLabel('traktClientId', 'setup.trakt_client_id');
    this.translateLabel('traktClientSecret', 'setup.trakt_client_secret');
    this.translateLabel('oauthRedirectUri', 'setup.oauth_redirect_uri');
    this.translateLabel('tmdbApiKey', 'setup.tmdb_api_key');
    this.translateLabel('fullRebuildPassword', 'setup.rebuild_password');

    // Translate placeholders
    this.translatePlaceholder('traktClientId', 'setup.trakt_client_id_placeholder');
    this.translatePlaceholder('traktClientSecret', 'setup.trakt_client_secret_placeholder');
    this.translatePlaceholder('oauthRedirectUri', 'setup.oauth_redirect_uri_placeholder');
    this.translatePlaceholder('tmdbApiKey', 'setup.tmdb_api_key_placeholder');
    this.translatePlaceholder('fullRebuildPassword', 'setup.rebuild_password_placeholder');

    // Translate help texts
    const oauthHelp = document.querySelector('input[name="oauthRedirectUri"] + p');
    if (oauthHelp) {
      oauthHelp.textContent = this.i18n.t('setup.oauth_redirect_uri_help');
    }
    
    const passwordHelp = document.querySelector('input[name="fullRebuildPassword"] + p');
    if (passwordHelp) {
      passwordHelp.textContent = this.i18n.t('setup.rebuild_password_help');
    }

    // Translate OAuth redirect URI warning
    const oauthWarning = document.getElementById('oauth-redirect-warning');
    if (oauthWarning) {
      oauthWarning.innerHTML = `
        <i class="fa-solid fa-exclamation-triangle mr-2 text-amber-400"></i>
        ${this.i18n.t('setup.oauth_redirect_uri_warning')}
      `;
    }

    // Translate info boxes
    this.translateTraktInfo();
    this.translateTmdbInfo();

    // Translate buttons
    const submitText = document.getElementById('submit-text');
    if (submitText) {
      submitText.textContent = this.i18n.t('setup.create_config');
    }

    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) {
      retryBtn.innerHTML = `
        <i class="fa-solid fa-redo mr-2"></i>
        ${this.i18n.t('setup.reset')}
      `;
    }

    console.log('[SetupI18n] Page translated');
  }

  translateSection(originalText, key, iconClass) {
    const sections = document.querySelectorAll('h3');
    sections.forEach(section => {
      if (section.textContent.trim() === originalText) {
        section.innerHTML = `
          <i class="fa-solid ${iconClass} mr-2 text-sky-400"></i>
          ${this.i18n.t(key)}
        `;
      }
    });
  }

  translateLabel(fieldId, key) {
    const label = document.querySelector(`label[for="${fieldId}"]`);
    if (label) {
      label.textContent = this.i18n.t(key);
    }
  }

  translatePlaceholder(fieldId, key) {
    const input = document.getElementById(fieldId);
    if (input) {
      input.placeholder = this.i18n.t(key);
    }
  }

  translateTraktInfo() {
    // Find Trakt info section by icon (more reliable than text content)
    const traktSection = Array.from(document.querySelectorAll('h3')).find(h => h.querySelector('.fa-tv'));
    if (!traktSection) return;

    const infoBox = traktSection.parentElement.querySelector('.bg-gray-800\\/50');
    if (infoBox) {
      const infoPara = infoBox.querySelector('p');
      if (infoPara) {
        infoPara.innerHTML = `
          <i class="fa-solid fa-info-circle mr-2 text-blue-400"></i>
          ${this.i18n.t('setup.trakt_info')}
        `;
      }

      const steps = infoBox.querySelectorAll('li');
      if (steps.length >= 3) {
        steps[0].innerHTML = `${this.i18n.t('setup.trakt_step1')} <a href="https://trakt.tv/oauth/applications" target="_blank" class="text-sky-400 underline">trakt.tv/oauth/applications</a>`;
        steps[1].textContent = this.i18n.t('setup.trakt_step2');
        steps[2].textContent = this.i18n.t('setup.trakt_step3');
        steps[3].textContent = this.i18n.t('setup.trakt_step4');
      }
    }
  }

  translateTmdbInfo() {
    // Find TMDB info section by icon (more reliable than text content)
    const tmdbSection = Array.from(document.querySelectorAll('h3')).find(h => h.querySelector('.fa-film'));
    if (!tmdbSection) return;

    const infoBox = tmdbSection.parentElement.querySelector('.bg-gray-800\\/50');
    if (infoBox) {
      const infoPara = infoBox.querySelector('p');
      if (infoPara) {
        infoPara.innerHTML = `
          <i class="fa-solid fa-info-circle mr-2 text-blue-400"></i>
          ${this.i18n.t('setup.tmdb_info')}
        `;
      }

      const steps = infoBox.querySelectorAll('li');
      if (steps.length >= 3) {
        steps[0].innerHTML = `${this.i18n.t('setup.tmdb_step1')} <a href="https://www.themoviedb.org/" target="_blank" class="text-sky-400 underline">themoviedb.org</a>`;
        steps[1].textContent = this.i18n.t('setup.tmdb_step2');
        steps[2].textContent = this.i18n.t('setup.tmdb_step3');
      }
    }
  }
}

// Language Selector functionality
function setupLanguageSelector(i18n, setupI18n) {
  const langToggle = document.getElementById('langToggle');
  const langDropdown = document.getElementById('langDropdown');
  const langToggleText = document.getElementById('langToggleText');
  
  if (!langToggle || !langDropdown) return;

  let isOpen = false;

  // Update current language display
  function updateLanguageDisplay() {
    const currentLang = i18n.getCurrentLanguage() || 'fr';
    langToggleText.textContent = currentLang.toUpperCase();
  }

  // Toggle dropdown
  langToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    if (isOpen) {
      langDropdown.classList.remove('hidden');
    } else {
      langDropdown.classList.add('hidden');
    }
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!langToggle.contains(e.target) && !langDropdown.contains(e.target)) {
      langDropdown.classList.add('hidden');
      isOpen = false;
    }
  });

  // Handle language selection
  const langButtons = langDropdown.querySelectorAll('[data-lang]');
  langButtons.forEach(langBtn => {
    langBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const lang = langBtn.getAttribute('data-lang');
      
      // Change language
      await i18n.changeLanguage(lang);
      
      // Update display
      updateLanguageDisplay();
      
      // Re-translate the page
      await setupI18n.translatePage();
      
      // Close dropdown
      langDropdown.classList.add('hidden');
      isOpen = false;
      
      console.log('[SetupI18n] Language changed to:', lang);
    });
  });

  // Close with Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      langDropdown.classList.add('hidden');
      isOpen = false;
    }
  });

  // Initial display
  updateLanguageDisplay();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof I18nLite !== 'undefined') {
    const i18n = new I18nLite();
    await i18n.init();
    
    const setupI18n = new SetupI18n(i18n);
    await setupI18n.translatePage();
    
    // Setup language selector
    setupLanguageSelector(i18n, setupI18n);
  }
});