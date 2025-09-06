/**
 * Script de chargement - Utilise le VRAI système SSE 
 * Se connecte à /api/loading-progress qui appelle buildPageDataGranular()
 */

let eventSource = null;

// Helper pour récupérer les traductions avec interpolation
function getTranslation(key, fallback = '', vars = {}) {
  if (window.loadingI18n?.i18n) {
    let text = window.loadingI18n.i18n.t(key) || fallback;
    // Simple interpolation for {count} and {message}
    Object.keys(vars).forEach(varKey => {
      text = text.replace(`{${varKey}}`, vars[varKey]);
    });
    return text;
  }
  return fallback;
}

function updateStep(stepId, status, message = null) {
  const step = document.getElementById(`step-${stepId}`);
  if (!step) return;
  
  step.classList.remove('active', 'completed');
  
  // Use the existing i18n system if available
  if (window.loadingI18n) {
    let i18nStatus = status;
    switch(status) {
      case 'active':
        step.classList.add('active');
        i18nStatus = 'loading';
        break;
      case 'completed':
        step.classList.add('completed');
        i18nStatus = 'success';
        break;
      case 'error':
        i18nStatus = 'error';
        break;
    }
    
    window.loadingI18n.updateStepStatus(stepId, i18nStatus, message);
  } else {
    // Fallback if i18n is not loaded yet
    const statusIcon = step.querySelector('.status-icon i');
    const detail = step.querySelector('.step-detail');
    
    switch(status) {
      case 'active':
        step.classList.add('active');
        if (statusIcon) statusIcon.className = 'fa-solid fa-spinner fa-spin text-sky-400';
        if (message && detail) detail.textContent = message;
        break;
      case 'completed':
        step.classList.add('completed');
        if (statusIcon) statusIcon.className = 'fa-solid fa-check text-green-400';
        if (message && detail) detail.textContent = message;
        break;
      case 'error':
        if (statusIcon) statusIcon.className = 'fa-solid fa-exclamation-triangle text-red-400';
        if (message && detail) detail.textContent = message;
        break;
    }
  }
}

function updateProgress(percent) {
  const progressBar = document.getElementById('progress-bar');
  const progressPercent = document.getElementById('progress-percent');
  
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
    progressBar.classList.remove('w-0');
  }
  if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
}

/**
 * Démarre la connexion SSE vers /api/loading-progress
 * C'est le VRAI système qui appelle buildPageDataGranular()
 */
async function startLoading() {
  console.log('[loading] Starting REAL SSE connection to /api/loading-progress');
  
  // Check if we're coming from OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const authStatus = urlParams.get('auth');
  
  if (authStatus === 'success') {
    console.log('[loading] OAuth authentication successful');
    // Update the auth step immediately
    updateStep('auth', 'completed', getTranslation('loading.step_auth_completed', 'Authentication successful'));
  }
  
  // Se connecter au vrai endpoint SSE
  eventSource = new EventSource('/api/loading-progress');
  
  eventSource.onopen = function() {
    console.log('[loading] SSE connection opened successfully');
  };
  
  eventSource.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('[loading] SSE data received:', data);
      
      // Mettre à jour les étapes
      if (data.step) {
        let translatedMessage = data.message || '';
        
        // Traduire les messages avec contexte
        switch(data.step) {
          case 'auth':
            if (data.status === 'completed') {
              translatedMessage = getTranslation('loading.step_auth_completed', 'Token verified');
            }
            break;
          case 'shows':
            if (data.status === 'loading') {
              translatedMessage = getTranslation('loading.step_shows_loading', 'Retrieving shows...');
            } else if (data.status === 'completed') {
              // Extraire le nombre depuis le message si possible
              const count = data.message?.match(/(\d+)/)?.[1] || '0';
              translatedMessage = getTranslation('loading.step_shows_completed', `${count} shows loaded`, {count});
            }
            break;
          case 'movies':
            if (data.status === 'loading') {
              translatedMessage = getTranslation('loading.step_movies_loading', 'Processing movies...');
            } else if (data.status === 'completed') {
              const count = data.message?.match(/(\d+)/)?.[1] || '0';
              translatedMessage = getTranslation('loading.step_movies_completed', `${count} movies loaded`, {count});
            }
            break;
          case 'progress':
            if (data.status === 'loading') {
              translatedMessage = getTranslation('loading.step_progress_loading', 'Calculating progress...');
            } else if (data.status === 'completed') {
              const count = data.message?.match(/(\d+)/)?.[1] || '0';
              translatedMessage = getTranslation('loading.step_progress_completed', `${count} unseen items`, {count});
            }
            break;
          case 'collection':
            if (data.status === 'loading') {
              translatedMessage = getTranslation('loading.step_collection_loading', 'Finalizing collection...');
            } else if (data.status === 'completed') {
              translatedMessage = getTranslation('loading.step_collection_completed', 'Collection organized');
            }
            break;
          case 'final':
            if (data.status === 'loading') {
              translatedMessage = getTranslation('loading.step_final_loading', 'Finalizing...');
            } else if (data.status === 'completed') {
              translatedMessage = getTranslation('loading.step_final_completed', 'Loading complete!');
            } else if (data.status === 'error') {
              translatedMessage = getTranslation('loading.error_api', `Error: ${data.message}`, {message: data.message});
            }
            break;
        }
        
        updateStep(data.step, data.status, translatedMessage);
      }
      
      // Mettre à jour la barre de progression
      if (data.progress !== undefined) {
        updateProgress(data.progress);
      }
      
      // Redirection si terminé
      if (data.completed) {
        console.log('[loading] Loading completed - redirecting to main page');
        eventSource.close();
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
      
    } catch (error) {
      console.error('[loading] Error parsing SSE data:', error, 'Raw data:', event.data);
    }
  };
  
  eventSource.onerror = function(error) {
    console.error('[loading] SSE error:', error);
    console.log('[loading] EventSource readyState:', eventSource?.readyState);
    
    // Fallback: rediriger après 10s si SSE échoue complètement
    setTimeout(() => {
      if (eventSource?.readyState !== EventSource.OPEN) {
        console.log('[loading] SSE failed - redirecting anyway');
        window.location.href = '/';
      }
    }, 10000);
  };
}

// Démarrer le chargement au load de la page
window.addEventListener('load', startLoading);

// Fallback si rien ne se passe après 45 secondes
setTimeout(() => {
  console.warn('[loading] Fallback redirect after 45 seconds');
  window.location.href = '/';
}, 45000);