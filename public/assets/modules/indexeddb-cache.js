/**
 * IndexedDB Cache Module
 * Système de cache client haute performance pour les données Trakt
 */

const DB_NAME = 'trakt_cache';
const DB_VERSION = 1;
const STORES = {
  PAGE_DATA: 'page_data',
  METADATA: 'metadata'
};

// TTL par défaut : 1 heure
const DEFAULT_TTL = 60 * 60 * 1000; 

class IndexedDBCache {
  constructor() {
    this.db = null;
    this.isSupported = this.checkSupport();
  }

  /**
   * Vérifier si IndexedDB est supporté
   */
  checkSupport() {
    return 'indexedDB' in window && indexedDB !== null;
  }

  /**
   * Initialiser la base de données
   */
  async init() {
    if (!this.isSupported) {
      console.warn('[IndexedDBCache] IndexedDB not supported');
      return false;
    }

    if (this.db) return true;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDBCache] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDBCache] Database opened successfully');
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store pour les données principales de page
        if (!db.objectStoreNames.contains(STORES.PAGE_DATA)) {
          const pageStore = db.createObjectStore(STORES.PAGE_DATA, { keyPath: 'key' });
          pageStore.createIndex('timestamp', 'timestamp');
        }

        // Store pour les métadonnées
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
        }

        console.log('[IndexedDBCache] Database schema created/updated');
      };
    });
  }

  /**
   * Sauvegarder les données de page avec TTL
   */
  async setPageData(data, ttl = DEFAULT_TTL) {
    if (!await this.init()) return false;

    const transaction = this.db.transaction([STORES.PAGE_DATA], 'readwrite');
    const store = transaction.objectStore(STORES.PAGE_DATA);
    
    const cacheEntry = {
      key: 'main_page_data',
      data: data,
      timestamp: Date.now(),
      expires: Date.now() + ttl,
      version: DB_VERSION
    };

    return new Promise((resolve, reject) => {
      const request = store.put(cacheEntry);
      
      request.onsuccess = () => {
        console.log('[IndexedDBCache] Page data saved to cache');
        resolve(true);
      };
      
      request.onerror = () => {
        console.error('[IndexedDBCache] Failed to save page data:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Récupérer les données de page (avec vérification TTL)
   */
  async getPageData() {
    if (!await this.init()) return null;

    const transaction = this.db.transaction([STORES.PAGE_DATA], 'readonly');
    const store = transaction.objectStore(STORES.PAGE_DATA);

    return new Promise((resolve, reject) => {
      const request = store.get('main_page_data');
      
      request.onsuccess = () => {
        const result = request.result;
        
        if (!result) {
          console.log('[IndexedDBCache] No cached page data found');
          resolve(null);
          return;
        }

        // Vérifier expiration
        if (Date.now() > result.expires) {
          console.log('[IndexedDBCache] Cached page data expired');
          // Nettoyer le cache expiré
          this.clearPageData();
          resolve(null);
          return;
        }

        console.log('[IndexedDBCache] Valid cached page data found');
        resolve(result.data);
      };
      
      request.onerror = () => {
        console.error('[IndexedDBCache] Failed to get page data:', request.error);
        resolve(null); // Fallback silencieux
      };
    });
  }

  /**
   * Vérifier si les données en cache sont différentes des nouvelles
   */
  comparePageData(cachedData, newData) {
    if (!cachedData || !newData) return true;

    // Comparaison rapide basée sur les timestamps et tailles
    const cachedFingerprint = this.createDataFingerprint(cachedData);
    const newFingerprint = this.createDataFingerprint(newData);

    return cachedFingerprint !== newFingerprint;
  }

  /**
   * Créer une empreinte des données pour comparaison rapide
   */
  createDataFingerprint(data) {
    const counts = {
      shows: data.showsRows?.length || 0,
      showsUnseen: data.showsUnseenRows?.length || 0,
      movies: data.moviesRows?.length || 0,
      moviesUnseen: data.moviesUnseenRows?.length || 0,
      built_at: data.built_at
    };
    return JSON.stringify(counts);
  }

  /**
   * Sauvegarder métadonnées (dernière sync, hash utilisateur, etc.)
   */
  async setMetadata(key, value) {
    if (!await this.init()) return false;

    const transaction = this.db.transaction([STORES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORES.METADATA);
    
    const entry = {
      key: key,
      value: value,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => {
        console.error(`[IndexedDBCache] Failed to save metadata ${key}:`, request.error);
        resolve(false);
      };
    });
  }

  /**
   * Récupérer métadonnées
   */
  async getMetadata(key) {
    if (!await this.init()) return null;

    const transaction = this.db.transaction([STORES.METADATA], 'readonly');
    const store = transaction.objectStore(STORES.METADATA);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      
      request.onerror = () => {
        console.error(`[IndexedDBCache] Failed to get metadata ${key}:`, request.error);
        resolve(null);
      };
    });
  }

  /**
   * Supprimer les données de page du cache
   */
  async clearPageData() {
    if (!await this.init()) return false;

    const transaction = this.db.transaction([STORES.PAGE_DATA], 'readwrite');
    const store = transaction.objectStore(STORES.PAGE_DATA);

    return new Promise((resolve, reject) => {
      const request = store.delete('main_page_data');
      
      request.onsuccess = () => {
        console.log('[IndexedDBCache] Page data cache cleared');
        resolve(true);
      };
      
      request.onerror = () => {
        console.error('[IndexedDBCache] Failed to clear page data:', request.error);
        resolve(false);
      };
    });
  }

  /**
   * Nettoyer tous les caches expirés
   */
  async cleanupExpired() {
    if (!await this.init()) return;

    const transaction = this.db.transaction([STORES.PAGE_DATA], 'readwrite');
    const store = transaction.objectStore(STORES.PAGE_DATA);
    const index = store.index('timestamp');

    const now = Date.now();
    const request = index.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (now > entry.expires) {
          cursor.delete();
          console.log(`[IndexedDBCache] Removed expired entry: ${entry.key}`);
        }
        cursor.continue();
      }
    };
  }

  /**
   * Obtenir des statistiques sur le cache
   */
  async getCacheStats() {
    if (!await this.init()) return null;

    try {
      const transaction = this.db.transaction([STORES.PAGE_DATA, STORES.METADATA], 'readonly');
      
      const pageDataStore = transaction.objectStore(STORES.PAGE_DATA);
      const metadataStore = transaction.objectStore(STORES.METADATA);
      
      const pageDataCount = await this.getStoreCount(pageDataStore);
      const metadataCount = await this.getStoreCount(metadataStore);

      // Estimer la taille (approximation)
      const estimate = await navigator.storage?.estimate?.();
      
      return {
        pageDataEntries: pageDataCount,
        metadataEntries: metadataCount,
        estimatedSize: estimate?.usage || 'unknown',
        quota: estimate?.quota || 'unknown'
      };
    } catch (error) {
      console.error('[IndexedDBCache] Failed to get cache stats:', error);
      return null;
    }
  }

  /**
   * Compter les entrées dans un store
   */
  getStoreCount(store) {
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }

  /**
   * Fermer la connexion à la base de données
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[IndexedDBCache] Database connection closed');
    }
  }
}

// Instance globale
const indexedDBCache = new IndexedDBCache();

export default indexedDBCache;