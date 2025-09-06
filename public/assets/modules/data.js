/**
 * Data Layer Module
 * Gestion du chargement des données depuis l'API
 */

import { DATA, state } from './state.js';
import { elements } from './dom.js';
// import { renderStats } from './stats.js'; // Removed - stats cards deleted
import { loadAndRenderGraph } from './graphs.js';
import { loadStatsPro } from './pro-stats.js';
import { applyWidth } from './utils.js';
import { setTab } from './tabs.js';
import i18n from './i18n.js';
import indexedDBCache from './indexeddb-cache.js';

// Variable pour stocker les dernières données device prompt pour re-render
let lastDevicePromptData = null;

// Fonction pour générer le HTML du device prompt avec traductions
function renderDevicePrompt(devicePrompt) {
  lastDevicePromptData = devicePrompt;
  
  // Option OAuth - méthode recommandée
  if (!devicePrompt || !devicePrompt.user_code) {
    return `
      <h2 class="text-lg font-semibold mb-2">${i18n.t('device_auth.title')}</h2>
      <p class="text-secondary text-sm mb-4">${i18n.t('device_auth.oauth_instructions')}</p>
      <div class="mt-3 flex items-center gap-2">
        <a href="/auth" class="btn btn-primary bg-sky-600 hover:bg-sky-700">
          <i class="fa-solid fa-right-to-bracket mr-2"></i>${i18n.t('device_auth.oauth_button')}
        </a>
      </div>
    `;
  }
  
  // Fallback device code si présent
  const expiryDate = new Date(devicePrompt.expires_in * 1000 + Date.now()).toLocaleString();
  const url = devicePrompt.verification_url;
  
  return `
    <h2 class="text-lg font-semibold mb-2">${i18n.t('device_auth.title')}</h2>
    <p class="text-secondary text-sm mb-2">${i18n.t('device_auth.instructions', { url: `<a class="text-sky-400 underline" href="${url}" target="_blank">${url}</a>` })}</p>
    <div class="text-2xl font-bold tracking-widest bg-black/40 inline-block px-3 py-2 rounded">${devicePrompt.user_code}</div>
    <div class="text-xs text-muted mt-2">${i18n.t('device_auth.expires', { date: expiryDate })}</div>
    <div class="mt-3 flex items-center gap-2">
    <button id="pollBtn" class="btn"><i class="fa-solid fa-arrows-rotate mr-1"></i>${i18n.t('device_auth.validate_button')}</button>
    <a href="/oauth/new" class="btn"><i class="fa-solid fa-qrcode"></i>${i18n.t('device_auth.new_code_button')}</a>
    </div>
    <div id="pollMsg" class="text-sm mt-2 text-muted"></div>
  `;
}

export async function loadData() {
  console.time('[LoadData] Total load time');
  
  // Phase 1: Essayer de servir depuis IndexedDB immédiatement
  let cacheServed = false;
  try {
    const cachedData = await indexedDBCache.getPageData();
    if (cachedData && !cachedData.needsAuth && !cachedData.needsSetup) {
      console.log('[LoadData] Serving from IndexedDB cache - instant load!');
      Object.assign(DATA, cachedData);
      applyUIFromData(cachedData);
      cacheServed = true;
      console.timeEnd('[LoadData] Cache served in');
    }
  } catch (error) {
    console.warn('[LoadData] IndexedDB cache failed:', error);
  }

  // Phase 2: Toujours faire l'appel API en parallèle (background refresh)
  let apiPromise = fetchAPIData();
  
  // Si on a servi le cache, laisser l'API en arrière-plan
  if (cacheServed) {
    // Background refresh - ne pas attendre
    apiPromise.then(async (freshData) => {
      if (freshData) {
        await handleBackgroundRefresh(freshData);
      }
    }).catch(error => {
      console.warn('[LoadData] Background refresh failed:', error);
    });
    
    console.timeEnd('[LoadData] Total load time');
    return; // Sortie rapide avec cache
  }
  
  // Phase 3: Pas de cache valide - attendre l'API (première visite)
  console.log('[LoadData] No cache available - waiting for API...');
  const freshData = await apiPromise;
  if (freshData) {
    Object.assign(DATA, freshData);
    applyUIFromData(freshData);
    
    // Sauvegarder en cache pour les prochaines fois
    if (!freshData.needsAuth && !freshData.needsSetup) {
      await indexedDBCache.setPageData(freshData);
    }
  }
  
  console.timeEnd('[LoadData] Total load time');
}

/**
 * Récupérer les données depuis l'API
 */
async function fetchAPIData() {
  try {
    console.time('[LoadData] API fetch time');
    const resp = await fetch('/api/data', { cache: 'no-store' });
    const js = await resp.json();
    console.timeEnd('[LoadData] API fetch time');
    
    // Vérifications critiques
    if (js.needsSetup) {
      window.location.href = '/setup';
      return null;
    }
    
    return js;
  } catch (error) {
    console.error('[LoadData] API fetch failed:', error);
    return null;
  }
}

/**
 * Appliquer les données à l'UI
 */
function applyUIFromData(js) {
  // Gestion des containers d'authentification
  const mainContainer = document.getElementById('mainContainer');
  if (js.needsAuth) {
    if (mainContainer) mainContainer.style.display = 'none';
  } else {
    if (mainContainer) mainContainer.style.display = '';
  }

  // Stats et graphiques
  if (state.tab === 'stats') { 
    loadAndRenderGraph(); 
  }

  // Messages flash
  if (js.flash) { 
    elements.flashBox.textContent = js.flash; 
    elements.flashBox.classList.remove('hidden'); 
  } else { 
    elements.flashBox.classList.add('hidden'); 
  }

  // Device prompt pour authentification
  if (js.needsAuth) {
    // Afficher OAuth prompt si besoin d'auth (avec ou sans device code)
    elements.deviceBox.innerHTML = renderDevicePrompt(js.devicePrompt);
    elements.deviceBox.classList.remove('hidden');
    if (js.devicePrompt && js.devicePrompt.user_code) {
      setupDevicePromptEvents();
    }
  } else if (js.devicePrompt && js.devicePrompt.user_code) {
    // Ancien comportement pour device code uniquement
    elements.deviceBox.innerHTML = renderDevicePrompt(js.devicePrompt);
    elements.deviceBox.classList.remove('hidden');
    setupDevicePromptEvents();
  } else {
    elements.deviceBox.classList.add('hidden');
  }

  // Erreurs d'authentification
  if (js.authError) {
    elements.flashBox.textContent = js.authError;
    elements.flashBox.classList.remove('hidden');
    elements.flashBox.className = 'flash p-4 mb-4 rounded-lg bg-red-800 border border-red-600 text-red-200';
  }

  // Application des paramètres UI
  applyWidth();
  setTab(state.tab);
  elements.qActive.value = state.q || '';
}

/**
 * Configuration des événements pour device prompt
 */
function setupDevicePromptEvents() {
  const pollBtn = elements.deviceBox.querySelector('#pollBtn');
  const pollMsg = elements.deviceBox.querySelector('#pollMsg');

  pollBtn?.addEventListener('click', async () => {
    pollMsg.textContent = i18n.t('device_auth.checking');
    try {
      const r = await fetch('/oauth/poll').then(x=>x.json());
      if (r.ok) { 
        pollMsg.textContent = i18n.t('device_auth.connected'); 
        setTimeout(()=>window.location.href = '/loading', 800); 
      } else { 
        pollMsg.textContent = r.fatal ? i18n.t('device_auth.error', { error: r.err }) : i18n.t('device_auth.waiting'); 
      }
    } catch { 
      pollMsg.textContent = i18n.t('device_auth.network_error'); 
    }
  });
}

/**
 * Gérer le refresh en arrière-plan avec comparaison
 */
async function handleBackgroundRefresh(freshData) {
  try {
    const cachedData = await indexedDBCache.getPageData();
    
    // Comparer les données pour voir s'il y a des changements
    const hasChanges = indexedDBCache.comparePageData(cachedData, freshData);
    
    if (hasChanges) {
      console.log('[LoadData] Background refresh detected changes - updating UI');
      
      // Mettre à jour les données et l'interface
      Object.assign(DATA, freshData);
      applyUIFromData(freshData);
      
      // Import dynamique du rendering pour re-render les cartes
      const { renderCurrent } = await import('./rendering.js');
      renderCurrent();
      
      // Sauvegarder les nouvelles données
      if (!freshData.needsAuth && !freshData.needsSetup) {
        await indexedDBCache.setPageData(freshData);
      }
      
      // Notification utilisateur subtile
      showBackgroundUpdateNotification();
    } else {
      console.log('[LoadData] Background refresh - no changes detected');
      
      // Même si pas de changements, rafraîchir le TTL du cache
      if (!freshData.needsAuth && !freshData.needsSetup) {
        await indexedDBCache.setPageData(freshData);
      }
    }
  } catch (error) {
    console.error('[LoadData] Background refresh handling failed:', error);
  }
}

/**
 * Notification subtile des mises à jour en arrière-plan
 */
function showBackgroundUpdateNotification() {
  // Vérifier s'il y a déjà une notification active
  let existingNotification = document.querySelector('.background-update-notification');
  
  if (existingNotification) {
    return; // Éviter les doublons
  }
  
  const notification = document.createElement('div');
  notification.className = 'background-update-notification fixed top-4 right-4 z-40 bg-blue-500/95 text-white px-4 py-2 rounded-lg shadow-lg text-sm backdrop-blur-sm border-l-4 border-blue-300';
  
  notification.innerHTML = `
    <div class="flex items-center gap-2">
      <i class="fa-solid fa-sync text-blue-200"></i>
      <span>Data updated in background</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animation d'entrée
  notification.style.transform = 'translateX(100%)';
  notification.style.transition = 'transform 0.3s ease-out';
  
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  // Suppression après 2 secondes
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

// Re-render device prompt when language changes
window.addEventListener('languageChanged', () => {
  
  if (lastDevicePromptData && elements.deviceBox && !elements.deviceBox.classList.contains('hidden')) {
    elements.deviceBox.innerHTML = renderDevicePrompt(lastDevicePromptData);
    
    // Re-attach event listener
    const pollBtn = elements.deviceBox.querySelector('#pollBtn');
    const pollMsg = elements.deviceBox.querySelector('#pollMsg');

    pollBtn?.addEventListener('click', async () => {
      pollMsg.textContent = i18n.t('device_auth.checking');
      try {
        const r = await fetch('/oauth/poll').then(x=>x.json());
        if (r.ok) { 
          pollMsg.textContent = i18n.t('device_auth.connected'); 
          setTimeout(()=>window.location.href = '/loading', 800); 
        } else { 
          pollMsg.textContent = r.fatal ? i18n.t('device_auth.error', { error: r.err }) : i18n.t('device_auth.waiting'); 
        }
      } catch { 
        pollMsg.textContent = i18n.t('device_auth.network_error'); 
      }
    });
    
  }
});