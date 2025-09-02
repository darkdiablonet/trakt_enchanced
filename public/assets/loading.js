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

function startLoading() {
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