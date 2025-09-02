/**
 * Script de configuration - Setup Form Handler
 */

// CSRF token récupéré depuis l'attribut data du script
const scriptTag = document.currentScript || document.querySelector('script[data-csrf-token]');
const CSRF_TOKEN = scriptTag ? scriptTag.getAttribute('data-csrf-token') : '';

document.addEventListener('DOMContentLoaded', () => {
  const setupForm = document.getElementById('setup-form');
  if (!setupForm) return;

  // Event listener pour le bouton de réinitialisation
  const retryBtn = document.getElementById('retryBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Debug info pour le token CSRF
  console.log('CSRF Token Info:', {
    présent: !!CSRF_TOKEN,
    longueur: CSRF_TOKEN?.length || 0,
    début: CSRF_TOKEN?.substring(0, 10) + '...' || 'N/A'
  });

  // Mise à jour de l'indicateur CSRF (optionnel, pour debug)
  const csrfInfo = document.getElementById('csrf-info');
  const csrfState = document.getElementById('csrf-state');
  if (csrfInfo && csrfState) {
    if (CSRF_TOKEN && CSRF_TOKEN.length > 10) {
      csrfState.textContent = 'Active ✓';
      csrfState.className = 'text-green-400';
    } else {
      csrfState.textContent = 'Manquant ⚠';
      csrfState.className = 'text-yellow-400';
      csrfInfo.classList.remove('hidden'); // Afficher seulement si problème
    }
  }

  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    const submitText = document.getElementById('submit-text');
    const alertContainer = document.getElementById('alert-container');
    const alert = document.getElementById('alert');
    const alertIcon = document.getElementById('alert-icon');
    const alertMessage = document.getElementById('alert-message');
    
    // État loading
    submitBtn.disabled = true;
    submitText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Configuration en cours...';
    
    try {
      const formData = new FormData(e.target);
      const config = Object.fromEntries(formData.entries());
      
      const response = await fetch('/setup', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': CSRF_TOKEN
        },
        body: JSON.stringify(config)
      });
      
      // Gestion spécifique des erreurs HTTP
      if (!response.ok) {
        let errorMessage = 'Erreur du serveur';
        
        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.code === 'CSRF_MISSING' || errorData.code === 'CSRF_INVALID') {
            errorMessage = 'Erreur de sécurité CSRF. Veuillez recharger la page et réessayer.';
            console.error('CSRF Error:', {
              token: CSRF_TOKEN ? 'présent' : 'manquant',
              tokenLength: CSRF_TOKEN?.length || 0,
              error: errorData
            });
          } else {
            errorMessage = 'Accès refusé (403)';
          }
        } else if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}));
          errorMessage = errorData.error || 'Données invalides (400)';
        } else if (response.status === 500) {
          errorMessage = 'Erreur interne du serveur (500)';
        } else {
          errorMessage = `Erreur HTTP ${response.status}`;
        }
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Succès
        alert.className = 'p-4 rounded-lg mb-4 bg-green-800 border border-green-600 text-green-200';
        alertIcon.className = 'fa-solid fa-check-circle mr-3 text-green-400';
        alertMessage.textContent = 'Configuration créée avec succès ! Redirection...';
        alertContainer.classList.remove('hidden');
        
        // Redirection après 2s
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
        
      } else {
        // Erreur
        alert.className = 'p-4 rounded-lg mb-4 bg-red-800 border border-red-600 text-red-200';
        alertIcon.className = 'fa-solid fa-exclamation-triangle mr-3 text-red-400';
        alertMessage.textContent = result.error || 'Erreur lors de la configuration';
        alertContainer.classList.remove('hidden');
        
        submitBtn.disabled = false;
        submitText.innerHTML = '<i class="fa-solid fa-save mr-2"></i>Créer la configuration';
      }
      
    } catch (error) {
      console.error('Erreur:', error);
      alert.className = 'p-4 rounded-lg mb-4 bg-red-800 border border-red-600 text-red-200';
      alertIcon.className = 'fa-solid fa-exclamation-triangle mr-3 text-red-400';
      
      // Utiliser le message d'erreur spécifique ou un message générique
      alertMessage.textContent = error.message || 'Erreur de connexion au serveur';
      alertContainer.classList.remove('hidden');
      
      submitBtn.disabled = false;
      submitText.innerHTML = '<i class="fa-solid fa-save mr-2"></i>Créer la configuration';
    }
  });
});