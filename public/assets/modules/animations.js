/**
 * Animation Module
 * Système d'animations fluides pour interactions UI
 */

export class AnimationManager {
  constructor() {
    this.observeElements();
    this.setupIntersectionObserver();
  }

  // Observer pour animer les éléments à l'apparition
  setupIntersectionObserver() {
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.animateElement(entry.target);
            this.observer.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: '20px 0px',
        threshold: 0.1
      });
    }
  }

  // Animer un élément selon son type
  animateElement(element) {
    if (element.classList.contains('card')) {
      element.classList.add('animate-fade-in-up');
    } else if (element.classList.contains('filters')) {
      element.classList.add('animate-slide-in-right');
    } else {
      element.classList.add('animate-fade-in');
    }
  }

  // Observer les nouveaux éléments ajoutés
  observeElements() {
    // Observer les cartes existantes
    this.observeCards();
    
    // Observer les mutations DOM pour les nouvelles cartes
    if ('MutationObserver' in window) {
      this.mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              this.observeNewElement(node);
              
              // Observer les cartes dans les enfants
              const cards = node.querySelectorAll && node.querySelectorAll('.card');
              if (cards) {
                cards.forEach(card => this.observeNewElement(card));
              }
            }
          });
        });
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // Observer les cartes existantes au chargement
  observeCards() {
    if (!this.observer) return;
    
    document.querySelectorAll('.card').forEach((card, index) => {
      // Ajouter un délai d'animation en cascade avec variable CSS
      card.style.setProperty('--animation-delay', `${index * 0.1}s`);
      card.classList.add('animation-delay-dynamic');
      this.observer.observe(card);
    });

    // Observer autres éléments
    document.querySelectorAll('.filters').forEach(filter => {
      this.observer.observe(filter);
    });
  }

  // Observer un nouvel élément
  observeNewElement(element) {
    if (!this.observer) return;
    
    if (element.classList && element.classList.contains('card')) {
      this.observer.observe(element);
    }
  }

  // Animation de transition entre onglets
  animateTabTransition(fromPanel, toPanel) {
    if (fromPanel && toPanel) {
      // Animation de sortie
      fromPanel.classList.add('opacity-0-transform-slide');
      
      setTimeout(() => {
        fromPanel.classList.add('hidden');
        toPanel.classList.remove('hidden');
        
        // Animation d'entrée
        toPanel.classList.add('opacity-0-transform-slide-right');
        
        requestAnimationFrame(() => {
          toPanel.classList.remove('opacity-0-transform-slide-right');
          toPanel.classList.add('opacity-1-transform-none');
        });
      }, 150);
    }
  }

  // Animation de recherche (filtrage des résultats)
  animateSearch(container) {
    const cards = container.querySelectorAll('.card');
    
    // Animer la disparition
    cards.forEach((card, index) => {
      card.style.setProperty('--transition-delay', `${index * 0.02}s`);
      card.classList.add('opacity-0-scale-90', 'transition-delay-dynamic');
    });

    // Puis réanimer l'apparition
    setTimeout(() => {
      cards.forEach((card, index) => {
        card.style.setProperty('--transition-delay', `${index * 0.05}s`);
        card.classList.remove('opacity-0-scale-90');
        card.classList.add('opacity-1-scale-100');
      });
    }, 200);
  }

  // Animation pour le loading des images
  animateImageLoad(imgElement) {
    imgElement.classList.add('opacity-0-scale-110');
    
    imgElement.addEventListener('load', () => {
      imgElement.classList.remove('opacity-0-scale-110');
      imgElement.classList.add('opacity-1-scale-100');
    });
  }

  // Effet de particules pour les interactions
  createParticleEffect(x, y, color = '#0ea5e9') {
    const particle = document.createElement('div');
    particle.className = 'particle-effect';
    particle.style.setProperty('--particle-x', `${x}px`);
    particle.style.setProperty('--particle-y', `${y}px`);
    particle.style.setProperty('--particle-color', color);

    document.body.appendChild(particle);

    // Nettoyer après l'animation
    setTimeout(() => {
      particle.remove();
    }, 600);
  }
}

// Les keyframes pour particle-explosion sont maintenant dans tailwind.css

// Export instance for use by other modules
export const animationManager = new AnimationManager();

// Export pour usage manuel
window.animationManager = animationManager;

// Initialize animations - called by app-modular.js
export function initializeAnimations() {
  // Animation d'entrée pour l'header
  const header = document.querySelector('.app-header');
  if (header) {
    header.classList.add('transform-slide-up');
    requestAnimationFrame(() => {
      header.classList.remove('transform-slide-up');
      header.classList.add('transform-slide-none');
    });
  }

  // Ajouter des event listeners pour les effets interactifs
  document.addEventListener('click', (e) => {
    // Effet de particules sur clic des boutons
    if (e.target.matches('button, .btn')) {
      const rect = e.target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      animationManager.createParticleEffect(x, y);
    }
  });
  
}