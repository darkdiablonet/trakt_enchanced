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
  
  ovPanel.classList.remove('ov-at-top','ov-at-bottom');

  const rect = btn.getBoundingClientRect();
  ovPanel.style.visibility = 'hidden';
  ovPanel.classList.add('block');
  ovModal.classList.remove('hidden');

  const panelW = ovPanel.offsetWidth;
  const panelH = ovPanel.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const margin = 10;

  let left = Math.round(rect.left + rect.width/2 - panelW/2);
  left = Math.max(margin, Math.min(left, vw - panelW - margin));

  let placeTop = rect.top >= panelH + 24;
  let top;
  if (placeTop) {
    top = Math.round(rect.top - panelH - 10);
    ovPanel.classList.add('ov-at-top');
  } else {
    top = Math.round(rect.bottom + 10);
    if (top + panelH > vh - margin && rect.top - 10 - panelH >= margin) {
      top = Math.round(rect.top - panelH - 10);
      ovPanel.classList.add('ov-at-top');
    } else {
      ovPanel.classList.add('ov-at-bottom');
    }
  }

  ovPanel.style.left = `${left}px`;
  ovPanel.style.top = `${top}px`;

  const arrow = ovPanel.querySelector('.ov-arrow');
  if (arrow) {
    const centerX = rect.left + rect.width/2;
    let ax = Math.round(centerX - left - 6);
    ax = Math.max(12, Math.min(ax, panelW - 12));
    arrow.style.left = `${ax}px`;
  }

  ovPanel.style.visibility = '';
}

export function openOverviewFromBtn(btn) {
  const d = btn.dataset || {};
  ovTitle.textContent = d.title || '';
  ovChips.innerHTML = `
    ${d.year ? `<span class="chip"><i class="fa-regular fa-calendar mr-1"></i>${d.year}</span>` : ''}
    ${d.kind ? `<span class="chip"><i class="fa-solid ${d.kind==='show'?'fa-tv':'fa-film'} mr-1"></i>${d.kind==='show'?'Série':'Film'}</span>` : ''}
  `;
  ovText.textContent = d.overview || '—';
  ovLinks.innerHTML = `
    ${d.trakt ? `<a class="chip" href="${d.trakt}" target="_blank"><i class="fa-solid fa-link mr-1"></i>Trakt</a>` : ''}
    ${d.tmdb ? `<a class="chip" href="${d.tmdb}" target="_blank"><i class="fa-solid fa-clapperboard mr-1"></i>TMDB</a>` : ''}
  `;

  ovAnchorBtn = btn;
  positionPopover(btn);

  onReposition = () => positionPopover(ovAnchorBtn);
  window.addEventListener('resize', onReposition);
  window.addEventListener('scroll', onReposition, true);
}

export function closeOverview() {
  ovModal.classList.add('hidden');
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

  if (e.target === ovBackdrop) { 
    closeOverview(); 
  }
});

ovClose?.addEventListener('click', closeOverview);

document.addEventListener('keydown', (e) => { 
  if (e.key === 'Escape' && !ovModal.classList.contains('hidden')) {
    closeOverview();
  }
});