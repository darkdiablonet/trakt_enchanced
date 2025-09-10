/**
 * Login Page Handler
 */

// CSRF token récupéré depuis l'attribut data du script
const scriptTag = document.currentScript || document.querySelector('script[data-csrf-token]');
const CSRF_TOKEN = scriptTag ? scriptTag.getAttribute('data-csrf-token') : '';


// Variable pour accéder au système i18n
let i18n = null;

// Initialiser l'i18n dès que disponible
if (typeof I18nLite !== 'undefined') {
  i18n = new I18nLite();
  i18n.init().then(() => {
    console.log('[Login] I18n initialized');
    translatePage();
  });
}

// Helper function pour les traductions avec fallback
function t(key, vars = {}) {
  if (i18n && i18n.t) {
    return i18n.t(key, vars);
  }
  return key;
}

// Traduire la page
function translatePage() {
  if (!i18n) return;
  
  // Update page title
  document.title = i18n.t('login.page_title');
  
  // Update language selector
  const langToggleText = document.getElementById('langToggleText');
  if (langToggleText) {
    langToggleText.textContent = i18n.currentLang.toUpperCase();
  }
  
  // Translate all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = i18n.t(key);
  });
}

// Afficher une alerte
function showAlert(message, type = 'error') {
  const alertContainer = document.getElementById('alert-container');
  const alert = document.getElementById('alert');
  const alertIcon = document.getElementById('alert-icon');
  const alertMessage = document.getElementById('alert-message');
  
  if (type === 'error') {
    alert.className = 'p-4 rounded-lg bg-red-900/50 border border-red-700 text-red-200';
    alertIcon.className = 'fa-solid fa-circle-xmark mr-3 text-red-400';
  } else if (type === 'success') {
    alert.className = 'p-4 rounded-lg bg-green-900/50 border border-green-700 text-green-200';
    alertIcon.className = 'fa-solid fa-check-circle mr-3 text-green-400';
  }
  
  alertMessage.textContent = message;
  alertContainer.classList.remove('hidden');
  
  // Auto-hide après 5 secondes
  setTimeout(() => {
    alertContainer.classList.add('hidden');
  }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const submitBtn = document.getElementById('submit-btn');
  
  // Gestion du sélecteur de langue
  const langToggle = document.getElementById('langToggle');
  const langDropdown = document.getElementById('langDropdown');
  
  if (langToggle && langDropdown) {
    langToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      langDropdown.classList.toggle('hidden');
    });
    
    // Fermer le dropdown en cliquant ailleurs
    document.addEventListener('click', () => {
      langDropdown.classList.add('hidden');
    });
    
    // Changer la langue
    const langButtons = langDropdown.querySelectorAll('[data-lang]');
    langButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = btn.getAttribute('data-lang');
        if (i18n) {
          i18n.changeLanguage(lang);
          translatePage();
        }
        langDropdown.classList.add('hidden');
      });
    });
  }
  
  // Gestion du formulaire de login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(loginForm);
      
      // Convertir FormData en URLSearchParams pour plus de compatibilité
      const params = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        params.append(key, value);
      }
      params.set('csrf', CSRF_TOKEN);
      
      
      // Désactiver le bouton pendant la soumission
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin mr-2"></i>
        <span>${t('login.authenticating')}</span>
      `;
      
      try {
        const response = await fetch('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          showAlert(t('login.success'), 'success');
          
          // Redirection après connexion réussie
          const returnUrl = new URLSearchParams(window.location.search).get('returnUrl') || '/';
          setTimeout(() => {
            window.location.href = returnUrl;
          }, 1000);
        } else {
          showAlert(data.error || t('login.invalid_credentials'), 'error');
          
          // Réactiver le bouton
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <i class="fa-solid fa-sign-in-alt mr-2"></i>
            <span>${t('login.submit')}</span>
          `;
        }
      } catch (error) {
        console.error('Login error:', error);
        showAlert(t('login.connection_error'), 'error');
        
        // Réactiver le bouton
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <i class="fa-solid fa-sign-in-alt mr-2"></i>
          <span>${t('login.submit')}</span>
        `;
      }
    });
  }
});