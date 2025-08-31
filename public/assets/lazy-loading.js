// Lazy loading system for background images and data prefetching
class LazyLoadManager {
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

    // Create a new Image to preload
    const img = new Image();
    img.onload = () => {
      element.style.backgroundImage = `url('${bgUrl}')`;
      element.classList.add('loaded');
      element.classList.remove('loading');
    };
    img.onerror = () => {
      element.classList.add('error');
      element.classList.remove('loading');
    };
    
    element.classList.add('loading');
    img.src = bgUrl;
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
  }
}

// Initialize when DOM is ready
const lazyManager = new LazyLoadManager();

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    lazyManager.convertExistingImages();
  });
} else {
  lazyManager.convertExistingImages();
}

// Export for manual usage
window.lazyManager = lazyManager;