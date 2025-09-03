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
    this.translateLabel('tmdbApiKey', 'setup.tmdb_api_key');
    this.translateLabel('fullRebuildPassword', 'setup.rebuild_password');

    // Translate placeholders
    this.translatePlaceholder('traktClientId', 'setup.trakt_client_id_placeholder');
    this.translatePlaceholder('traktClientSecret', 'setup.trakt_client_secret_placeholder');
    this.translatePlaceholder('tmdbApiKey', 'setup.tmdb_api_key_placeholder');
    this.translatePlaceholder('fullRebuildPassword', 'setup.rebuild_password_placeholder');

    // Translate help texts
    const help = document.querySelector('input[name="fullRebuildPassword"] + p');
    if (help) {
      help.textContent = this.i18n.t('setup.rebuild_password_help');
    }

    // Translate info boxes
    this.translateTraktInfo();
    this.translateTmdbInfo();

    // Translate buttons
    const submitText = document.getElementById('submit-text');
    if (submitText) {
      submitText.innerHTML = `
        <i class="fa-solid fa-save mr-2"></i>
        ${this.i18n.t('setup.create_config')}
      `;
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
    // Find Trakt info section
    const traktSection = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('API Trakt'));
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
      }
    }
  }

  translateTmdbInfo() {
    // Find TMDB info section
    const tmdbSection = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('TMDB'));
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof I18nLite !== 'undefined') {
    const i18n = new I18nLite();
    await i18n.init();
    
    const setupI18n = new SetupI18n(i18n);
    await setupI18n.translatePage();
  }
});