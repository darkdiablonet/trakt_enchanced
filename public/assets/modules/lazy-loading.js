/**
 * Lazy Loading Module
 * Système de chargement différé pour images et préchargement
 */

export class LazyLoadManager {
  constructor() {
    this.imageObserver = null;
    this.prefetchObserver = null;
    this.init();
  }

  init() {
    // Intersection Observer for lazy loading images
    if ('IntersectionObserver' in window) {
      this.imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadImage(entry.target);
            this.imageObserver.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: '50px 0px', // Load images 50px before they become visible
        threshold: 0.1
      });

      // Observer for prefetching data
      this.prefetchObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.prefetchData(entry.target);
            this.prefetchObserver.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: '200px 0px', // Prefetch data 200px before visible
        threshold: 0
      });
    }
  }

  loadImage(element) {
    const bgUrl = element.dataset.bgSrc;
    if (!bgUrl) return;

    // If image is already loaded, skip
    if (element.classList.contains('loaded')) {
      return;
    }
    
    // Set the background immediately
    element.style.backgroundImage = `url('${bgUrl}')`;
    element.classList.add('loaded');
    element.classList.remove('loading');
  }

  prefetchData(element) {
    const prefetchUrl = element.dataset.prefetch;
    if (!prefetchUrl) return;

    // Use fetch with low priority
    fetch(prefetchUrl, {
      method: 'GET',
      priority: 'low'
    }).catch(() => {
      // Silent fail for prefetch
    });
  }

  observe(element) {
    if (this.imageObserver && element.dataset.bgSrc) {
      this.imageObserver.observe(element);
    }
    if (this.prefetchObserver && element.dataset.prefetch) {
      this.prefetchObserver.observe(element);
    }
  }

  // Batch observe elements
  observeAll(selector = '.poster[data-bg-src]') {
    document.querySelectorAll(selector).forEach(el => this.observe(el));
  }

  // Update existing grids to use lazy loading
  convertExistingImages() {
    // Handle old-style background-image posters
    document.querySelectorAll('.poster[style*="background-image"]').forEach(poster => {
      const style = poster.getAttribute('style');
      const match = style.match(/background-image:\s*url\(['"](.+?)['"]\)/);
      if (match) {
        const url = match[1];
        poster.dataset.bgSrc = url;
        poster.style.backgroundImage = '';
        poster.classList.add('lazy-bg');
        this.observe(poster);
      }
    });
    
    // Handle new-style data-bg-src posters
    const posters = document.querySelectorAll('.poster[data-bg-src]');
    
    posters.forEach(poster => {
      if (!poster.classList.contains('lazy-bg')) {
        poster.classList.add('lazy-bg');
      }
      this.observe(poster);
    });
    
    // If no intersection observer, load all immediately
    if (!this.imageObserver) {
      posters.forEach(poster => this.loadImage(poster));
    }
  }
}

// Initialize when DOM is ready (will be exported below)

// Auto-initialize when DOM is loaded

export function initializeLazyLoading() {
  lazyManager.convertExistingImages();
  
  // Watch for dynamically added images
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if it's a poster itself
          if (node.matches && node.matches('.poster[data-bg-src]')) {
            node.classList.add('lazy-bg');
            lazyManager.observe(node);
          }
          // Check children for posters
          const posters = node.querySelectorAll && node.querySelectorAll('.poster[data-bg-src]');
          if (posters) {
            posters.forEach(poster => {
              poster.classList.add('lazy-bg');
              lazyManager.observe(poster);
            });
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Fallback function for browsers without Intersection Observer
export function fallbackImageLoading() {
  setTimeout(() => {
    document.querySelectorAll('.poster[data-bg-src]').forEach(element => {
      const bgUrl = element.dataset.bgSrc;
      if (bgUrl) {
        element.style.backgroundImage = `url('${bgUrl}')`;
      }
    });
  }, 100);
}

// Export instance for use by other modules
export const lazyManager = new LazyLoadManager();
window.lazyManager = lazyManager;