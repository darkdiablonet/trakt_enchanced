/**
 * Modals & Popovers Module
 * Gestion des modales et fenêtres contextuelles avec support accessibilité
 */

const ovModal = document.getElementById('ovModal');
const ovBackdrop = document.getElementById('ovBackdrop');
const ovPanel = document.getElementById('ovPanel');
const ovClose = document.getElementById('ovClose');
const ovTitle = document.getElementById('ovTitle');
const ovChips = document.getElementById('ovChips');
const ovBody = document.getElementById('ovBody');
const ovText = document.getElementById('ovText');
const ovLinks = document.getElementById('ovLinks');

const fullModal = document.getElementById('fullModal');
const closeFullModalBtn = document.getElementById('closeFullModal');

let ovAnchorBtn = null;
let onReposition = null;
let previouslyFocusedElement = null;

// Fonctions utilitaires pour la gestion du focus
function trapFocus(modal) {
  const focusableSelectors = [
    'button', 'input', 'textarea', 'select', 'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ];
  
  const focusableElements = modal.querySelectorAll(focusableSelectors.join(', '));
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  return { firstElement, lastElement, focusableElements };
}

function handleTabKey(e, modal) {
  const { firstElement, lastElement } = trapFocus(modal);
  
  if (e.shiftKey && document.activeElement === firstElement) {
    e.preventDefault();
    lastElement?.focus();
  } else if (!e.shiftKey && document.activeElement === lastElement) {
    e.preventDefault();
    firstElement?.focus();
  }
}

export function positionPopover(btn) {
  if (!btn || !ovPanel) return;
  
  ovPanel.classList.remove('ov-at-top', 'ov-at-bottom');

  const rect = btn.getBoundingClientRect();
  const panelW = Math.min(400, window.innerWidth - 40); // Max width with margin
  const vw = window.innerWidth, vh = window.innerHeight;
  const margin = 20;
  const arrowSize = 12;

  // Set panel dimensions using CSS variables
  ovPanel.style.setProperty('--panel-width', `${panelW}px`);
  ovPanel.style.setProperty('--panel-max-width', `${panelW}px`);
  
  // Calculate panel height after content is set
  const panelH = Math.min(ovPanel.scrollHeight + 32, vh - 60); // Max height with margin
  ovPanel.style.setProperty('--panel-max-height', `${panelH}px`);

  // Smart horizontal positioning
  let left = Math.round(rect.left + rect.width/2 - panelW/2);
  
  // Adjust if panel would go off screen
  if (left < margin) {
    left = margin;
  } else if (left + panelW > vw - margin) {
    left = vw - panelW - margin;
  }

  // Smart vertical positioning with better logic
  const spaceAbove = rect.top;
  const spaceBelow = vh - rect.bottom;
  const needsHeight = panelH + arrowSize + 10;
  
  let top;
  
  if (spaceBelow >= needsHeight) {
    // Enough space below
    top = rect.bottom + arrowSize + 5;
    ovPanel.classList.add('ov-at-bottom');
  } else if (spaceAbove >= needsHeight) {
    // Not enough space below, but enough above
    top = rect.top - panelH - arrowSize - 5;
    ovPanel.classList.add('ov-at-top');
  } else {
    // Not enough space either way, center vertically with preference for below
    if (spaceBelow >= spaceAbove) {
      top = Math.max(margin, rect.bottom + 5);
      ovPanel.classList.add('ov-at-bottom');
    } else {
      top = Math.max(margin, rect.top - panelH - 5);
      ovPanel.classList.add('ov-at-top');
    }
  }

  // Ensure panel doesn't go off screen vertically
  top = Math.max(margin, Math.min(top, vh - panelH - margin));

  ovPanel.style.setProperty('--panel-left', `${left}px`);
  ovPanel.style.setProperty('--panel-top', `${top}px`);

  // Position arrow more intelligently
  const arrow = ovPanel.querySelector('.ov-arrow');
  if (arrow) {
    const btnCenterX = rect.left + rect.width / 2;
    const panelLeft = left;
    let arrowLeft = btnCenterX - panelLeft - (arrowSize / 2);
    
    // Keep arrow within panel bounds with some margin
    arrowLeft = Math.max(16, Math.min(arrowLeft, panelW - 16 - arrowSize));
    arrow.style.setProperty('--arrow-left', `${arrowLeft}px`);
  }
}

export function openOverviewFromBtn(btn) {
  const d = btn.dataset || {};
  
  // Sauvegarder l'élément précédemment focalisé
  previouslyFocusedElement = document.activeElement;
  
  // Populate content
  ovTitle.textContent = d.title || '';
  ovChips.innerHTML = `
    ${d.year ? `<span class="chip"><i class="fa-regular fa-calendar mr-1"></i>${d.year}</span>` : ''}
    ${d.kind ? `<span class="chip"><i class="fa-solid ${d.kind==='show'?'fa-tv':'fa-film'} mr-1"></i>${d.kind==='show'?'Série':'Film'}</span>` : ''}
  `;
  ovText.textContent = d.overview || 'Aucun synopsis disponible.';
  ovLinks.innerHTML = `
    ${d.trakt ? `<a class="chip" href="${d.trakt}" target="_blank"><i class="fa-solid fa-link mr-1"></i>Trakt</a>` : ''}
    ${d.tmdb ? `<a class="chip" href="${d.tmdb}" target="_blank"><i class="fa-solid fa-clapperboard mr-1"></i>TMDB</a>` : ''}
  `;

  // Show modal instantly but hidden
  ovAnchorBtn = btn;
  ovModal.classList.remove('hidden');
  
  // Reset animation classes
  ovPanel.classList.remove('ov-show', 'ov-hide');
  ovBackdrop.classList.remove('ov-show');
  
  // Position first
  positionPopover(btn);
  
  // Trigger animations with staggered timing
  setTimeout(() => {
    ovBackdrop.classList.add('ov-show');
    setTimeout(() => {
      ovPanel.classList.add('ov-show');
      
      // Focus sur le bouton fermer après l'animation
      setTimeout(() => {
        const { firstElement } = trapFocus(ovModal);
        firstElement?.focus();
      }, 100);
    }, 50);
  }, 10);

  // Setup repositioning listeners
  onReposition = () => positionPopover(ovAnchorBtn);
  window.addEventListener('resize', onReposition);
  window.addEventListener('scroll', onReposition, true);
}

export function closeOverview() {
  // Animate out
  ovPanel.classList.remove('ov-show');
  ovPanel.classList.add('ov-hide');
  ovBackdrop.classList.remove('ov-show');
  
  // Hide after animation completes
  setTimeout(() => {
    ovModal.classList.add('hidden');
    ovPanel.classList.remove('ov-hide');
    
    // Restaurer le focus sur l'élément précédent
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus();
      previouslyFocusedElement = null;
    }
  }, 300);
  
  ovAnchorBtn = null;
  
  if (onReposition) {
    window.removeEventListener('resize', onReposition);
    window.removeEventListener('scroll', onReposition, true);
    onReposition = null;
  }
}

// Fonctions pour la modale fullModal
export function openFullModal() {
  previouslyFocusedElement = document.activeElement;
  fullModal.classList.remove('hidden');
  
  // Focus sur le premier élément focusable
  setTimeout(() => {
    const { firstElement } = trapFocus(fullModal);
    firstElement?.focus();
  }, 10);
}

export function closeFullModal() {
  fullModal.classList.add('hidden');
  
  // Restaurer le focus
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus();
    previouslyFocusedElement = null;
  }
}

// Event listeners
document.addEventListener('click', (e) => {
  const b = e.target.closest('.js-ov');
  if (b) { 
    e.preventDefault(); 
    openOverviewFromBtn(b); 
    return; 
  }

  // Close on backdrop click (but not during animation)
  if (e.target === ovBackdrop && ovPanel.classList.contains('ov-show')) { 
    closeOverview(); 
  }
});

ovClose?.addEventListener('click', closeOverview);

// Event listener pour le bouton de fermeture de fullModal
closeFullModalBtn?.addEventListener('click', closeFullModal);

// Gestion complète du clavier pour l'accessibilité
document.addEventListener('keydown', (e) => { 
  // Échappement pour fermer les modales
  if (e.key === 'Escape') {
    if (!ovModal.classList.contains('hidden') && ovPanel.classList.contains('ov-show')) {
      e.preventDefault();
      closeOverview();
    } else if (!fullModal.classList.contains('hidden')) {
      e.preventDefault();
      closeFullModal();
    }
    return;
  }

  // Navigation par Tab avec piégeage du focus
  if (e.key === 'Tab') {
    if (!ovModal.classList.contains('hidden') && ovPanel.classList.contains('ov-show')) {
      handleTabKey(e, ovModal);
    } else if (!fullModal.classList.contains('hidden')) {
      handleTabKey(e, fullModal);
    }
  }
});

// Support des boutons existants qui ouvrent fullModal
document.addEventListener('click', (e) => {
  // Rechercher les boutons qui ouvrent fullModal (par exemple via data-target)
  const fullModalTrigger = e.target.closest('[data-target="fullModal"], .js-full-modal');
  if (fullModalTrigger) {
    e.preventDefault();
    openFullModal();
  }
});


