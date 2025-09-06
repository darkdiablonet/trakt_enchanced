/**
 * Script de chargement - Suit le VRAI processus de l'application
 * Appelle /api/data et surveille son état comme le fait data.js
 */

let isLoading = false;
let currentStep = '';

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
 * Le vrai processus de chargement qui suit exactement ce que fait data.js
 */
async function startRealLoading() {
  if (isLoading) return;
  isLoading = true;
  
  console.log('[loading] Starting REAL loading process matching data.js');
  
  // Étape 1: Authentification vérifiée (loading.html n'est affiché que si on passe les vérifications)
  updateStep('auth', 'completed', getTranslation('loading.step_auth_completed', 'Authentication validated'));
  updateProgress(5);
  
  try {
    // Étape 2: Début du chargement - on appelle l'API comme le fait data.js
    currentStep = 'shows';
    updateStep('shows', 'active', getTranslation('loading.step_shows_loading', 'Retrieving Trakt data...'));
    updateProgress(10);
    
    console.log('[loading] Calling /api/data - this is what data.js does');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const response = await fetch('/api/data', { 
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    updateProgress(25);
    const data = await response.json();
    console.log('[loading] API data received:', {
      hasShows: data.showsRows?.length || 0,
      hasMovies: data.moviesRows?.length || 0,
      needsAuth: data.needsAuth,
      needsSetup: data.needsSetup,
      builtAt: data.built_at
    });
    
    // Vérifier les redirections comme le fait data.js
    if (data.needsSetup) {
      console.log('[loading] Needs setup - redirecting');
      window.location.href = '/setup';
      return;
    }
    
    if (data.needsAuth) {
      console.log('[loading] Needs auth - redirecting to auth flow');
      window.location.href = '/';
      return;
    }
    
    // Étape 3: Traitement des séries
    updateStep('shows', 'completed', getTranslation('loading.step_shows_completed', `${data.showsRows?.length || 0} shows loaded`, {count: data.showsRows?.length || 0}));
    updateStep('movies', 'active', getTranslation('loading.step_movies_loading', 'Processing movies...'));
    updateProgress(40);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Étape 4: Traitement des films
    updateStep('movies', 'completed', getTranslation('loading.step_movies_completed', `${data.moviesRows?.length || 0} movies loaded`, {count: data.moviesRows?.length || 0}));
    updateStep('progress', 'active', getTranslation('loading.step_progress_loading', 'Calculating progress...'));
    updateProgress(60);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Étape 5: Progression
    const unseenShows = data.showsUnseenRows?.length || 0;
    const unseenMovies = data.moviesUnseenRows?.length || 0;
    updateStep('progress', 'completed', getTranslation('loading.step_progress_completed', `${unseenShows + unseenMovies} unseen items`, {count: unseenShows + unseenMovies}));
    updateStep('collection', 'active', getTranslation('loading.step_collection_loading', 'Finalizing collection...'));
    updateProgress(80);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Étape 6: Collection
    updateStep('collection', 'completed', getTranslation('loading.step_collection_completed', 'Collection organized'));
    updateStep('final', 'active', getTranslation('loading.step_final_loading', 'Finalizing...'));
    updateProgress(90);
    
    // Vérifier que les données sont cohérentes (comme le fait data.js)
    if (!data.built_at) {
      console.warn('[loading] No built_at timestamp - data may be incomplete');
    }
    
    updateStep('final', 'completed', getTranslation('loading.step_final_completed', 'Loading complete!'));
    updateProgress(100);
    
    // Redirection après un court délai
    console.log('[loading] Loading complete - redirecting to main page');
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
    
  } catch (error) {
    console.error('[loading] Loading failed:', error);
    
    // Gestion des erreurs spécifiques
    if (error.name === 'AbortError') {
      updateStep(currentStep, 'error', getTranslation('loading.error_timeout', 'Timeout - loading too long'));
    } else {
      updateStep(currentStep, 'error', getTranslation('loading.error_api', `Error: ${error.message}`, {message: error.message}));
    }
    
    // Essayer de rediriger quand même après un délai
    setTimeout(() => {
      console.log('[loading] Redirecting despite error');
      window.location.href = '/';
    }, 5000);
  }
}

// Surveiller les logs du serveur si possible (dev uniquement)
if (window.location.hostname === 'localhost') {
  console.log('[loading] Development mode - will show detailed logs');
}

// Démarrer le vrai processus au chargement de la page
window.addEventListener('load', startRealLoading);

// Fallback si rien ne se passe après 45 secondes
setTimeout(() => {
  if (isLoading) {
    console.warn('[loading] Fallback redirect after 45 seconds');
    window.location.href = '/';
  }
}, 45000);