/**
 * Data Layer Module
 * Gestion du chargement des données depuis l'API
 */

import { DATA, state } from './state.js';
import { elements } from './dom.js';
import { renderStats } from './stats.js';
import { loadAndRenderGraph } from './graphs.js';
import { loadStatsPro } from './pro-stats.js';
import { applyWidth } from './utils.js';
import { setTab } from './tabs.js';

export async function loadData() {
  const resp = await fetch('/api/data', { cache:'no-store' });
  const js = await resp.json();
  Object.assign(DATA, js);

  if (js.stats) {
    renderStats(js.stats);
  } else {
    try {
      const s = await fetch('/api/stats').then(r => r.ok ? r.json() : null);
      if (s?.ok && s.stats) renderStats(s.stats);
    } catch {}
  }
  
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
    elements.deviceBox.innerHTML = `
      <h2 class="text-lg font-semibold mb-2">Connecter votre compte Trakt</h2>
      <p class="text-slate-300 text-sm mb-2">Rendez-vous sur <a class="text-sky-400 underline" href="${js.devicePrompt.verification_url}" target="_blank">${js.devicePrompt.verification_url}</a> et entrez le code :</p>
      <div class="text-2xl font-bold tracking-widest bg-black/40 inline-block px-3 py-2 rounded">${js.devicePrompt.user_code}</div>
      <div class="text-xs text-slate-400 mt-2">Ce code expire le ${new Date(js.devicePrompt.expires_in*1000 + Date.now()).toLocaleString()}.</div>
      <div class="mt-3 flex items-center gap-2">
      <button id="pollBtn" class="btn"><i class="fa-solid fa-arrows-rotate mr-1"></i>J'ai validé, vérifier</button>
      <a href="/oauth/new" class="btn"><i class="fa-solid fa-qrcode"></i>Nouveau code</a>
      </div>
      <div id="pollMsg" class="text-sm mt-2 text-slate-400"></div>
    `;
    elements.deviceBox.classList.remove('hidden');
    
    const pollBtn = elements.deviceBox.querySelector('#pollBtn');
    const pollMsg = elements.deviceBox.querySelector('#pollMsg');

    pollBtn?.addEventListener('click', async () => {
      pollMsg.textContent = 'Vérification en cours...';
      try {
        const r = await fetch('/oauth/poll').then(x=>x.json());
        if (r.ok) { 
          pollMsg.textContent = 'Connecté ! Rechargement...'; 
          setTimeout(()=>location.reload(), 800); 
        } else { 
          pollMsg.textContent = r.fatal ? ('Erreur : '+r.err) : 'Toujours en attente, réessayez.'; 
        }
      } catch { 
        pollMsg.textContent = 'Erreur réseau.'; 
      }
    });
  } else {
    elements.deviceBox.classList.add('hidden');
  }

  applyWidth();
  setTab(state.tab);
  elements.qActive.value = state.q || '';
}