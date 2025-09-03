/**
 * Loading Page Internationalization
 */

class LoadingI18n {
  constructor(i18n) {
    this.i18n = i18n;
  }

  async translatePage() {
    // Update page title
    this.i18n.updatePageLanguage('loading');

    // Translate main content
    const subtitle = document.querySelector('.text-gray-300.text-lg');
    if (subtitle) {
      subtitle.textContent = this.i18n.t('loading.title');
    }

    const description = document.querySelector('.text-gray-400.text-sm');
    if (description) {
      description.textContent = this.i18n.t('loading.subtitle');
    }

    // Translate progress section
    const progressLabel = Array.from(document.querySelectorAll('.text-gray-300')).find(el => el.textContent.includes('Progrès global'));
    if (progressLabel) {
      progressLabel.textContent = this.i18n.t('loading.global_progress');
    }

    // Translate steps
    this.translateStep('step-auth', 'loading.step_auth', 'loading.step_auth_detail');
    this.translateStep('step-shows', 'loading.step_shows', 'loading.step_shows_detail');
    this.translateStep('step-movies', 'loading.step_movies', 'loading.step_movies_detail');
    this.translateStep('step-progress', 'loading.step_progress', 'loading.step_progress_detail');
    this.translateStep('step-collection', 'loading.step_collection', 'loading.step_collection_detail');
    this.translateStep('step-final', 'loading.step_final', 'loading.step_final_detail');

    // Translate info box
    this.translateInfoBox();

    console.log('[LoadingI18n] Page translated');
  }

  translateStep(stepId, titleKey, detailKey) {
    const step = document.getElementById(stepId);
    if (step) {
      const title = step.querySelector('.font-medium');
      const detail = step.querySelector('.step-detail');
      
      if (title) {
        title.textContent = this.i18n.t(titleKey);
      }
      if (detail) {
        detail.textContent = this.i18n.t(detailKey);
      }
    }
  }

  translateInfoBox() {
    const infoBox = document.querySelector('.bg-blue-900\\/30');
    if (infoBox) {
      const strong = infoBox.querySelector('strong');
      const text = infoBox.querySelector('.text-blue-200');
      
      if (strong && text) {
        text.innerHTML = `
          <strong>${this.i18n.t('loading.info_title')}</strong> ${this.i18n.t('loading.info_text')}
        `;
      }
    }
  }

  // Method to update step details during loading process
  updateStepDetail(stepId, message) {
    const step = document.getElementById(stepId);
    if (step) {
      const detail = step.querySelector('.step-detail');
      if (detail) {
        detail.textContent = message;
      }
    }
  }

  // Method to update step status with translated messages
  updateStepStatus(stepId, status, customMessage = null) {
    const step = document.getElementById(stepId);
    if (!step) return;

    const statusIcon = step.querySelector('.status-icon i');
    const detail = step.querySelector('.step-detail');
    
    if (statusIcon) {
      statusIcon.className = '';
      
      switch (status) {
        case 'loading':
          statusIcon.className = 'fa-solid fa-spinner fa-spin text-sky-400';
          break;
        case 'success':
          statusIcon.className = 'fa-solid fa-check text-green-400';
          break;
        case 'error':
          statusIcon.className = 'fa-solid fa-times text-red-400';
          break;
        case 'waiting':
        default:
          statusIcon.className = 'fa-regular fa-clock text-gray-500';
      }
    }

    if (detail && customMessage) {
      detail.textContent = customMessage;
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof I18nLite !== 'undefined') {
    const i18n = new I18nLite();
    await i18n.init();
    
    const loadingI18n = new LoadingI18n(i18n);
    await loadingI18n.translatePage();
    
    // Make available globally for loading script
    window.loadingI18n = loadingI18n;
  }
});