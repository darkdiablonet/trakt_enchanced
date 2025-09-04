/**
 * Script de chargement - Loading Progress Handler
 */

let eventSource = null;

function updateStep(stepId, status, message = null, progress = null) {
  const step = document.getElementById(`step-${stepId}`);
  if (!step) return;
  
  const statusIcon = step.querySelector('.status-icon i');
  const detail = step.querySelector('.step-detail');
  
  step.classList.remove('active', 'completed');
  
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

function updateProgress(percent) {
  const progressBar = document.getElementById('progress-bar');
  const progressPercent = document.getElementById('progress-percent');
  
  if (progressBar) {
    progressBar.style.setProperty('--progress-width', `${percent}%`);
    progressBar.classList.remove('w-0');
    progressBar.classList.add('progress-dynamic');
  }
  if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
}

async function startLoading() {
  // PRE-CHARGEMENT OPTIMISÉ : Récupérer d'abord les données watched en un seul appel
  try {
    updateStep('progress', 'active', 'Pré-chargement optimisé des données watchées...', 5);
    
    // Pré-charger shows et movies en parallèle
    const [showsResponse, moviesResponse] = await Promise.all([
      fetch('/api/watched/shows'),
      fetch('/api/watched/movies')
    ]);
    
    let totalItems = 0;
    if (showsResponse.ok) {
      const showsData = await showsResponse.json();
      totalItems += showsData.length;
      console.log(`[loading] Pre-chargement shows: ${showsData.length} shows récupérés`);
    }
    
    if (moviesResponse.ok) {
      const moviesData = await moviesResponse.json();
      totalItems += moviesData.length;
      console.log(`[loading] Pre-chargement movies: ${moviesData.length} movies récupérés`);
    }
    
    if (totalItems > 0) {
      console.log(`[loading] Pre-chargement optimisé réussi: ${totalItems} éléments total`);
      updateStep('progress', 'active', `Données pré-chargées: ${totalItems} éléments`, 15);
    } else {
      console.warn('[loading] Pre-chargement échoué, fallback sur méthode classique');
      updateStep('progress', 'active', 'Fallback sur méthode classique...', 10);
    }
  } catch (error) {
    console.warn('[loading] Erreur pre-chargement:', error);
    updateStep('progress', 'active', 'Chargement des données...', 10);
  }
  
  // Maintenant démarrer le processus SSE normal qui bénéficiera du cache
  eventSource = new EventSource('/api/loading-progress');
  
  eventSource.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      
      if (data.step) {
        updateStep(data.step, data.status, data.message, data.progress);
      }
      
      if (data.progress !== undefined) {
        updateProgress(data.progress);
      }
      
      if (data.completed) {
        eventSource.close();
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
      
    } catch (error) {
      console.error('Error parsing SSE data:', error);
    }
  };
  
  eventSource.onerror = function(error) {
    console.error('EventSource error:', error);
    // Fallback: rediriger après 10s si SSE échoue
    setTimeout(() => {
      window.location.href = '/';
    }, 10000);
  };
}

// Démarrer le chargement au load de la page
window.addEventListener('load', startLoading);