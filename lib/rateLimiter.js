/**
 * Rate Limiter pour l'API Trakt
 * Respecte les limites : 1000 requêtes GET par 5 minutes
 * Soit environ 3.3 requêtes par seconde maximum
 */

import { logger } from './logger.js';

class TraktRateLimiter {
  constructor() {
    // File d'attente des requêtes
    this.queue = [];
    this.processing = false;
    
    // Compteurs pour les limites
    this.requestCounts = {
      GET: [],     // Timestamps des requêtes GET
      POST: [],    // Timestamps des requêtes POST/PUT/DELETE
    };
    
    // Limites de l'API Trakt
    this.limits = {
      GET: {
        max: 1000,
        window: 5 * 60 * 1000  // 5 minutes en ms
      },
      POST: {
        max: 1,
        window: 1000  // 1 seconde en ms
      }
    };
    
    // Délai minimum entre les requêtes (300ms pour être prudent)
    this.minDelay = 300;
    this.lastRequestTime = 0;
  }
  
  /**
   * Nettoie les anciennes requêtes hors de la fenêtre de temps
   */
  cleanOldRequests(method) {
    const now = Date.now();
    const window = this.limits[method]?.window || this.limits.GET.window;
    
    this.requestCounts[method] = this.requestCounts[method].filter(
      timestamp => now - timestamp < window
    );
  }
  
  /**
   * Vérifie si on peut faire une requête maintenant
   */
  canMakeRequest(method = 'GET') {
    this.cleanOldRequests(method);
    
    const methodType = ['POST', 'PUT', 'DELETE'].includes(method) ? 'POST' : 'GET';
    const limit = this.limits[methodType];
    const count = this.requestCounts[methodType].length;
    
    return count < limit.max;
  }
  
  /**
   * Calcule le délai d'attente nécessaire avant la prochaine requête
   */
  getWaitTime(method = 'GET') {
    const now = Date.now();
    const methodType = ['POST', 'PUT', 'DELETE'].includes(method) ? 'POST' : 'GET';
    
    // Nettoyer les anciennes requêtes
    this.cleanOldRequests(methodType);
    
    const limit = this.limits[methodType];
    const requests = this.requestCounts[methodType];
    
    // Si on est sous la limite
    if (requests.length < limit.max) {
      // Respecter le délai minimum entre requêtes
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.minDelay) {
        return this.minDelay - timeSinceLastRequest;
      }
      return 0;
    }
    
    // Si on a atteint la limite, calculer quand la plus ancienne requête sortira de la fenêtre
    const oldestRequest = Math.min(...requests);
    const waitTime = (oldestRequest + limit.window) - now;
    
    return Math.max(waitTime, this.minDelay);
  }
  
  /**
   * Enregistre une requête
   */
  recordRequest(method = 'GET') {
    const methodType = ['POST', 'PUT', 'DELETE'].includes(method) ? 'POST' : 'GET';
    const now = Date.now();
    
    this.requestCounts[methodType].push(now);
    this.lastRequestTime = now;
    
    // Log si on approche de la limite
    this.cleanOldRequests(methodType);
    const count = this.requestCounts[methodType].length;
    const limit = this.limits[methodType];
    
    if (count > limit.max * 0.8) {
      logger.warn(`Trakt rate limit warning: ${count}/${limit.max} ${methodType} requests in window`);
    }
  }
  
  /**
   * Exécute une requête avec rate limiting
   */
  async executeWithRateLimit(fn, method = 'GET') {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, method, resolve, reject });
      this.processQueue();
    });
  }
  
  /**
   * Traite la file d'attente des requêtes
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const { fn, method, resolve, reject } = this.queue.shift();
      
      try {
        // Attendre si nécessaire
        const waitTime = this.getWaitTime(method);
        if (waitTime > 0) {
          console.log(`[RateLimiter] Waiting ${waitTime}ms before ${method} request`);
          await new Promise(r => setTimeout(r, waitTime));
        }
        
        // Enregistrer et exécuter la requête
        this.recordRequest(method);
        const result = await fn();
        resolve(result);
        
      } catch (error) {
        const statusCode = error.status || error.statusCode || 0;
        
        // Gestion spéciale pour les erreurs serveur (5xx)
        if (statusCode >= 500 && statusCode < 600) {
          console.log(`[RateLimiter] Got ${statusCode} server error, waiting 10s before retry`);
          // Remettre dans la queue pour réessayer
          this.queue.unshift({ fn, method, resolve, reject });
          await new Promise(r => setTimeout(r, 10000)); // 10 secondes
        }
        // Si erreur 429, attendre plus longtemps
        else if (statusCode === 429) {
          const retryAfter = error.headers?.['retry-after'] || 60;
          console.log(`[RateLimiter] Got 429, waiting ${retryAfter}s`);
          
          // Remettre dans la queue pour réessayer
          this.queue.unshift({ fn, method, resolve, reject });
          await new Promise(r => setTimeout(r, retryAfter * 1000));
        } else {
          reject(error);
        }
      }
    }
    
    this.processing = false;
  }
  
  /**
   * Obtient les statistiques actuelles
   */
  getStats() {
    this.cleanOldRequests('GET');
    this.cleanOldRequests('POST');
    
    return {
      GET: {
        current: this.requestCounts.GET.length,
        limit: this.limits.GET.max,
        percentage: (this.requestCounts.GET.length / this.limits.GET.max) * 100
      },
      POST: {
        current: this.requestCounts.POST.length,
        limit: this.limits.POST.max,
        percentage: (this.requestCounts.POST.length / this.limits.POST.max) * 100
      },
      queueLength: this.queue.length
    };
  }
}

// Instance unique du rate limiter
export const traktRateLimiter = new TraktRateLimiter();