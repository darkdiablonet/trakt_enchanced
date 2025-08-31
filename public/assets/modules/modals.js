/**
 * Modals & Popovers Module
 * Gestion des modales et fenêtres contextuelles
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

let ovAnchorBtn = null;
let onReposition = null;

export function positionPopover(btn) {
  if (!btn || !ovPanel) return;
  
  ovPanel.classList.remove('ov-at-top', 'ov-at-bottom');

  const rect = btn.getBoundingClientRect();
  const panelW = Math.min(400, window.innerWidth - 40); // Max width with margin
  const vw = window.innerWidth, vh = window.innerHeight;
  const margin = 20;
  const arrowSize = 12;

  // Set panel width
  ovPanel.style.width = `${panelW}px`;
  ovPanel.style.maxWidth = `${panelW}px`;
  
  // Calculate panel height after content is set
  const panelH = Math.min(ovPanel.scrollHeight + 32, vh - 60); // Max height with margin
  ovPanel.style.maxHeight = `${panelH}px`;

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

  ovPanel.style.left = `${left}px`;
  ovPanel.style.top = `${top}px`;

  // Position arrow more intelligently
  const arrow = ovPanel.querySelector('.ov-arrow');
  if (arrow) {
    const btnCenterX = rect.left + rect.width / 2;
    const panelLeft = left;
    let arrowLeft = btnCenterX - panelLeft - (arrowSize / 2);
    
    // Keep arrow within panel bounds with some margin
    arrowLeft = Math.max(16, Math.min(arrowLeft, panelW - 16 - arrowSize));
    arrow.style.left = `${arrowLeft}px`;
  }
}

export function openOverviewFromBtn(btn) {
  const d = btn.dataset || {};
  
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
  }, 300);
  
  ovAnchorBtn = null;
  
  if (onReposition) {
    window.removeEventListener('resize', onReposition);
    window.removeEventListener('scroll', onReposition, true);
    onReposition = null;
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

document.addEventListener('keydown', (e) => { 
  if (e.key === 'Escape' && !ovModal.classList.contains('hidden') && ovPanel.classList.contains('ov-show')) {
    closeOverview();
  }
});

console.log('[Modals] Enhanced popover system loaded');