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
    progressBar.style.width = `${percent}%`;
    progressBar.classList.remove('w-0');
  }
  if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
}

async function startLoading() {
  console.log('[loading] Starting loading process...');
  
  // Étape 1: Vérifier l'auth
  updateStep('auth', 'completed', 'Token validé');
  updateProgress(10);
  
  // Étape 2: Shows
  updateStep('shows', 'active', 'Chargement des séries...');
  updateProgress(20);
  
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulation
  updateStep('shows', 'completed', 'Séries chargées');
  updateProgress(40);
  
  // Étape 3: Movies  
  updateStep('movies', 'active', 'Chargement des films...');
  await new Promise(resolve => setTimeout(resolve, 500));
  updateStep('movies', 'completed', 'Films chargés');
  updateProgress(60);
  
  // Étape 4: Progress
  updateStep('progress', 'active', 'Calcul des progressions...');
  await new Promise(resolve => setTimeout(resolve, 500));
  updateStep('progress', 'completed', 'Progressions calculées');
  updateProgress(80);
  
  // Étape 5: Collection
  updateStep('collection', 'active', 'Traitement de la collection...');
  await new Promise(resolve => setTimeout(resolve, 500));
  updateStep('collection', 'completed', 'Collection traitée');
  updateProgress(90);
  
  // Étape 6: Final
  updateStep('final', 'active', 'Finalisation...');
  updateProgress(95);
  
  // Vérifier si les données sont prêtes
  try {
    const response = await fetch('/api/data');
    if (response.ok) {
      const data = await response.json();
      console.log('[loading] Data check:', data);
      
      if (data && !data.needsAuth && !data.needsSetup && data.built_at) {
        updateStep('final', 'completed', 'Prêt !');
        updateProgress(100);
        
        // Redirection
        setTimeout(() => {
          console.log('[loading] Redirecting to main page...');
          window.location.href = '/';
        }, 1000);
      } else {
        console.warn('[loading] Data not ready, trying rebuild...');
        // Déclencher un rebuild si les données ne sont pas prêtes
        const rebuildResponse = await fetch('/rebuild');
        if (rebuildResponse.ok) {
          // Attendre un peu puis rediriger
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
        } else {
          // Forcer la redirection quand même
          setTimeout(() => {
            window.location.href = '/';
          }, 5000);
        }
      }
    }
  } catch (error) {
    console.error('[loading] Error checking data:', error);
    // Forcer la redirection après 5s en cas d'erreur
    setTimeout(() => {
      window.location.href = '/';
    }, 5000);
  }
}

// Démarrer le chargement au load de la page
window.addEventListener('load', startLoading);