/**
 * Auth Guard Module
 * Vérifie l'état de l'authentification et bloque tous les appels API si nécessaire
 */

let isAuthenticated = false;
let authCheckInProgress = false;
let authCheckPromise = null;

/**
 * Vérifie l'état de l'authentification
 * @returns {Promise<boolean>} true si authentifié, false sinon
 */
export async function checkAuthStatus() {
  // Si une vérification est déjà en cours, attendre son résultat
  if (authCheckInProgress && authCheckPromise) {
    return authCheckPromise;
  }

  authCheckInProgress = true;
  authCheckPromise = performAuthCheck();
  
  try {
    const result = await authCheckPromise;
    return result;
  } finally {
    authCheckInProgress = false;
    authCheckPromise = null;
  }
}

async function performAuthCheck() {
  try {
    
    // Faire un appel minimal pour vérifier l'auth
    const response = await fetch('/api/data', { 
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok && response.status === 412) {
      // Needs setup
      window.location.href = '/setup';
      return false;
    }
    
    const data = await response.json();
    
    // Vérifier si on a besoin d'authentification
    if (data.needsAuth === true) {
      isAuthenticated = false;
      showAuthPrompt(data);
      // IMPORTANT: Ne pas déclencher de reload, juste afficher le prompt
      return false;
    }
    
    // Token valide
    isAuthenticated = true;
    hideAuthPrompt();
    return true;
    
  } catch (error) {
    console.error('[AuthGuard] Auth check failed:', error);
    // En cas d'erreur réseau, considérer comme non authentifié
    isAuthenticated = false;
    return false;
  }
}

/**
 * Affiche uniquement l'interface de connexion
 */
function showAuthPrompt(data) {
  
  // Cacher l'interface principale
  const mainContainer = document.getElementById('mainContainer');
  if (mainContainer) {
    mainContainer.style.display = 'none';
  }
  
  // Cacher les onglets
  const tabsGroup = document.querySelector('.tabs-group');
  if (tabsGroup) {
    tabsGroup.style.display = 'none';
  }
  
  // Cacher le bouton de filtres mobile
  const mobileFiltersToggle = document.getElementById('mobileFiltersToggle');
  if (mobileFiltersToggle) {
    mobileFiltersToggle.style.display = 'none';
  }
  
  // Cacher les filtres
  const mobileFilters = document.getElementById('mobileFilters');
  if (mobileFilters) {
    mobileFilters.style.display = 'none';
  }
  
  // Afficher le message d'authentification
  const deviceBox = document.getElementById('deviceBox');
  if (deviceBox) {
    deviceBox.innerHTML = `
      <div class="text-center py-8">
        <i class="fa-solid fa-lock text-6xl text-yellow-500 mb-4"></i>
        <h2 class="text-2xl font-bold mb-4">Connexion à Trakt requise</h2>
        <p class="text-gray-400 mb-6">Votre token d'authentification est invalide ou expirant.<br>Veuillez vous reconnecter à Trakt pour continuer.</p>
        <a href="/auth" class="inline-block bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
          <i class="fa-solid fa-right-to-bracket mr-2"></i>Se connecter avec Trakt
        </a>
      </div>
    `;
    deviceBox.classList.remove('hidden');
  }
  
  // Afficher un message d'erreur si présent
  if (data.flash) {
    const flashBox = document.getElementById('flashBox');
    if (flashBox) {
      flashBox.textContent = data.flash;
      flashBox.classList.remove('hidden');
      flashBox.className = 'mx-auto max-w-7xl mt-4 px-4 py-3 rounded-lg border border-yellow-600 bg-yellow-900/60 text-yellow-200';
    }
  }
}

/**
 * Cache l'interface d'authentification
 */
function hideAuthPrompt() {
  const deviceBox = document.getElementById('deviceBox');
  if (deviceBox) {
    deviceBox.classList.add('hidden');
  }
  
  const mainContainer = document.getElementById('mainContainer');
  if (mainContainer) {
    mainContainer.style.display = '';
  }
  
  const tabsGroup = document.querySelector('.tabs-group');
  if (tabsGroup) {
    tabsGroup.style.display = '';
  }
}

/**
 * Wrapper pour fetch qui vérifie l'authentification
 */
export async function guardedFetch(url, options = {}) {
  // Liste des URLs qui ne nécessitent pas d'authentification
  const authExemptUrls = [
    '/health',
    '/setup',
    '/auth',
    '/oauth',
    '/api/data' // On laisse passer pour le check initial
  ];
  
  // Vérifier si l'URL est exemptée
  const isExempt = authExemptUrls.some(exempt => url.startsWith(exempt));
  
  if (!isExempt && !isAuthenticated) {
    // Vérifier l'auth une fois de plus
    const authValid = await checkAuthStatus();
    if (!authValid) {
      throw new Error('Authentication required');
    }
  }
  
  // Faire l'appel normal
  const response = await fetch(url, options);
  
  // Si on reçoit une erreur 401, invalider l'auth
  if (response.status === 401) {
    isAuthenticated = false;
    await checkAuthStatus(); // Re-vérifier et afficher le prompt
    throw new Error('Authentication expired');
  }
  
  return response;
}

/**
 * Vérifie si l'utilisateur est authentifié
 */
export function isUserAuthenticated() {
  return isAuthenticated;
}

/**
 * Force une re-vérification de l'authentification
 */
export async function forceAuthCheck() {
  isAuthenticated = false;
  authCheckPromise = null;
  return checkAuthStatus();
}

// Export par défaut
export default {
  checkAuthStatus,
  guardedFetch,
  isUserAuthenticated,
  forceAuthCheck
};