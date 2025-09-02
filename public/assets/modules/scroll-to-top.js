/**
 * Scroll-to-top Module
 * Gestion du bouton de remontée en haut de page
 */

// Gestion du scroll-to-top
export function initScrollToTop() {
  const scrollBtn = document.getElementById('scroll-to-top');
  if (!scrollBtn) {
    console.warn('Scroll-to-top button not found');
    return;
  }

  // Afficher/masquer le bouton selon le scroll
  function toggleScrollButton() {
    if (window.scrollY > 300) {
      scrollBtn.classList.add('visible');
    } else {
      scrollBtn.classList.remove('visible');
    }
  }

  // Smooth scroll vers le haut
  scrollBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Écouter le scroll avec throttling
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      toggleScrollButton();
      scrollTimeout = null;
    }, 100);
  });

  // Check initial state
  toggleScrollButton();
}