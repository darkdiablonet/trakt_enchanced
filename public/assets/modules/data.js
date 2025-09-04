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

// Variable pour stocker les dernières données device prompt pour re-render
let lastDevicePromptData = null;

// Fonction pour générer le HTML du device prompt avec traductions
function renderDevicePrompt(devicePrompt) {
  lastDevicePromptData = devicePrompt;
  
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
  const resp = await fetch('/api/data', { cache:'no-store' });
  const js = await resp.json();
  
  // Vérifier si la configuration est manquante et rediriger vers setup
  if (js.needsSetup) {
    window.location.href = '/setup';
    return;
  }
  
  // Vérifier si le token utilisateur est corrompu - afficher deviceBox pour reconnexion
  if (js.needsAuth) {
    // Masquer le conteneur principal quand deviceBox est affichée
    const mainContainer = document.getElementById('mainContainer');
    if (mainContainer) {
      mainContainer.style.display = 'none';
    }
    // Continue le traitement normal pour afficher deviceBox si devicePrompt est disponible
    // La logique de deviceBox ci-dessous s'occupera de l'affichage
  } else {
    // S'assurer que le conteneur principal est visible quand pas d'authentification requise
    const mainContainer = document.getElementById('mainContainer');
    if (mainContainer) {
      mainContainer.style.display = '';
    }
  }
  
  Object.assign(DATA, js);

  // Stats cards removed - no longer rendering stats
  // if (js.stats) {
  //   renderStats(js.stats);
  // } else {
  //   try {
  //     const s = await fetch('/api/stats').then(r => r.ok ? r.json() : null);
  //     if (s?.ok && s.stats) renderStats(s.stats);
  //   } catch {}
  // }
  
  if (state.tab === 'stats') { 
    loadAndRenderGraph(); 
  }

  if (js.flash) { 
    elements.flashBox.textContent = js.flash; 
    elements.flashBox.classList.remove('hidden'); 
  } else { 
    elements.flashBox.classList.add('hidden'); 
  }

  if (js.devicePrompt && js.devicePrompt.user_code) {
    elements.deviceBox.innerHTML = renderDevicePrompt(js.devicePrompt);
    elements.deviceBox.classList.remove('hidden');
    
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
  } else {
    elements.deviceBox.classList.add('hidden');
  }

  // Gérer les erreurs d'authentification
  if (js.authError) {
    elements.flashBox.textContent = js.authError;
    elements.flashBox.classList.remove('hidden');
    elements.flashBox.className = 'flash p-4 mb-4 rounded-lg bg-red-800 border border-red-600 text-red-200';
  }

  applyWidth();
  setTab(state.tab);
  elements.qActive.value = state.q || '';
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