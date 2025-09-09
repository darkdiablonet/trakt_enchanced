/**
 * Module de mise à jour live via Server-Sent Events (SSE)
 * Écoute les changements de cartes et met à jour l'interface en temps réel
 * REMPLACEMENT COMPLET du système de polling par du VRAI LIVE
 */

import { DATA } from './state.js';
import { renderCurrent } from './rendering.js';
import logger from './logger.js';
import indexedDBCache from './indexeddb-cache.js';

class LiveUpdatesManager {
  constructor() {
    this.eventSource = null;
    this.reconnectTimeout = null;
    this.maxReconnectDelay = 30000; // 30 secondes max
    this.reconnectDelay = 1000; // 1 seconde initial
    this.isConnected = false;

    // WebSocket support
    this.socket = null;
    this.wsReconnectTimeout = null;
    this.wsReconnectDelay = 1000;
    this.wsMaxReconnectDelay = 30000;
    this.preferWS = true; // Tenter WS d'abord
  }

  /**
   * Démarre la connexion SSE avec fallback sur polling
   */
  start() {
    if (this.eventSource || this.socket) {
      logger.liveUpdates('Already connected');
      return;
    }

    logger.liveUpdates('🔥 STARTING REAL LIVE SYSTEM (WS preferred)');

    if (this.preferWS) {
      this.connectWebSocket();
      // Fallback rapide vers SSE si WS ne se connecte pas assez vite
      setTimeout(() => {
        if (!this.isConnected && !this.eventSource) {
          this.fallbackToSSE();
        }
      }, 3000);
    } else {
      this.connect(); // SSE direct
    }

    // Fallback: Si WS/SSE ne marche pas, utiliser un polling intelligent
    setTimeout(() => {
      if (!this.isConnected) {
        logger.liveUpdates('🔄 WS/SSE failed, starting intelligent polling fallback...');
        this.startPollingFallback();
      }
    }, 8000);
  }

  /**
   * Connexion WebSocket (préférée)
   */
  connectWebSocket() {
    try {
      const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/live';
      logger.liveUpdates(`Connecting WebSocket at: ${wsUrl}`);
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        logger.liveUpdates('🎉 WS connection opened - LIVE UPDATES ACTIVE!');
        this.isConnected = true;
        this.reconnectDelay = 1000; // Reset SSE backoff
        this.wsReconnectDelay = 1000; // Reset WS backoff
        this.showConnectionStatus(true);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          logger.liveUpdates('📨 WS EVENT RECEIVED:', data);
          this.handleEvent(data);
        } catch (e) {
          logger.liveUpdatesWarn('Invalid WS JSON:', event.data);
        }
      };

      this.socket.onerror = (err) => {
        logger.liveUpdatesError('💥 WS connection error:', err);
      };

      this.socket.onclose = (evt) => {
        this.isConnected = false;
        this.showConnectionStatus(false);

        // 4001 = auth requise → bascule immédiate vers SSE
        if (evt.code === 4001) {
          logger.liveUpdatesWarn('WS closed (auth-required) → falling back to SSE');
          this.fallbackToSSE();
          return;
        }
        this.scheduleWsReconnect();
      };
    } catch (error) {
      logger.liveUpdatesError('Failed to create WebSocket:', error);
      this.fallbackToSSE();
    }
  }

  scheduleWsReconnect() {
    if (this.wsReconnectTimeout) clearTimeout(this.wsReconnectTimeout);
    logger.liveUpdates(`WS reconnecting in ${this.wsReconnectDelay}ms...`);
    this.wsReconnectTimeout = setTimeout(() => this.connectWebSocket(), this.wsReconnectDelay);
    this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 1.5, this.wsMaxReconnectDelay);
  }

  fallbackToSSE() {
    if (!this.eventSource) {
      logger.liveUpdates('Switching to SSE fallback…');
      this.connect();
    }
  }

  /**
   * Se connecte au stream SSE
   */
  connect() {
    try {
      // Utiliser toujours une URL relative pour que ça marche sur tous les environnements
      const sseUrl = `/api/live-events`;
      
      logger.liveUpdates(`Connecting to SSE at: ${sseUrl} (on ${window.location.origin})`);
      this.eventSource = new EventSource(sseUrl);
      
      this.eventSource.onopen = () => {
        logger.liveUpdates('🎉 SSE connection opened - LIVE UPDATES ACTIVE!');
        this.isConnected = true;
        this.reconnectDelay = 1000; // Reset reconnect delay on success
        this.showConnectionStatus(true);
      };

      this.eventSource.onmessage = (event) => {
        try {
          logger.liveUpdates('📨 SSE EVENT RECEIVED:', event.data);
          const data = JSON.parse(event.data);
          logger.liveUpdates('📨 SSE PARSED DATA:', data);
          this.handleEvent(data);
        } catch (error) {
          logger.liveUpdatesWarn('Invalid JSON received:', event.data);
        }
      };

      this.eventSource.onerror = (error) => {
        logger.liveUpdatesError('💥 SSE connection error:', error);
        logger.liveUpdates('EventSource readyState:', this.eventSource.readyState);
        this.isConnected = false;
        this.showConnectionStatus(false);
        this.scheduleReconnect();
      };

    } catch (error) {
      logger.liveUpdatesError('Failed to create EventSource:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Gère les événements reçus du serveur
   */
  handleEvent(data) {
    logger.liveUpdates('🚀 HANDLING EVENT:', data);
    
    switch (data.type) {
      case 'connected':
        logger.liveUpdates('Connected to REAL LIVE updates');
        break;
        
      case 'heartbeat':
        logger.liveUpdates('💓 Heartbeat received');
        break;
        
      case 'card-update':
        logger.liveUpdates(`⚡ LIVE CARD UPDATE: ${data.cardType} ${data.traktId}`);
        logger.liveUpdates('📦 Card data:', data.card);
        this.updateCard(data.cardType, data.traktId, data.card);
        break;
        
      default:
        logger.liveUpdatesWarn('❓ Unknown event type:', data.type);
    }
  }

  /**
   * Met à jour une carte spécifique dans l'interface
   */
  async updateCard(cardType, traktId, cardData) {
    const traktIdNum = parseInt(traktId);
    
    // Pour les changements externes, forcer un rechargement complet des données
    // car les nouvelles données peuvent ne pas être dans le cache local
    logger.liveUpdates(`⚡ External change detected for ${cardType} ${traktIdNum} - invalidating caches and reloading...`);
    
    try {
      // ÉTAPE 1: Invalider le cache IndexedDB pour forcer un refresh
      await indexedDBCache.clearPageData();
      logger.liveUpdates('🗑️ IndexedDB cache invalidated due to external changes');
      
      // ÉTAPE 2: Import dynamique pour éviter les dépendances circulaires
      const { loadData } = await import('./data.js');
      
      // ÉTAPE 3: Recharger toutes les données (sera forcé depuis API car cache invalidé)
      await loadData();
      
      // ÉTAPE 4: Re-rendre l'interface avec les nouvelles données
      renderCurrent();
      
      logger.liveUpdates(`🔥 FULL DATA RELOAD COMPLETE FOR EXTERNAL CHANGE - ${cardType.toUpperCase()} ${traktIdNum} IS NOW UP TO DATE!`);
      
      // Feedback visuel pour montrer que la mise à jour est live
      this.showLiveUpdateFeedback(cardType, traktIdNum);
      this.showLiveUpdateNotification(cardType, traktIdNum);
      
    } catch (error) {
      logger.liveUpdatesError(`Failed to reload data for external change:`, error);
      
      // Fallback: essayer la méthode originale de mise à jour de carte
      this.updateCardFallback(cardType, traktId, cardData);
    }
  }

  /**
   * Fallback: Met à jour une carte spécifique dans l'interface (méthode originale)
   */
  updateCardFallback(cardType, traktId, cardData) {
    const traktIdNum = parseInt(traktId);
    let updated = false;

    if (cardType === 'show') {
      // Mettre à jour dans toutes les sections de séries
      const sections = ['showsRows', 'showsUnseenRows'];
      for (const section of sections) {
        const rows = DATA[section] || [];
        const index = rows.findIndex(s => s.ids?.trakt === traktIdNum);
        if (index !== -1) {
          // Remplacer la carte existante par les nouvelles données
          rows[index] = { ...cardData };
          updated = true;
          logger.liveUpdates(`⚡ Updated show ${traktIdNum} in ${section} (fallback)`);
        }
      }
    } else if (cardType === 'movie') {
      // Mettre à jour dans toutes les sections de films
      const sections = ['moviesRows', 'moviesUnseenRows'];
      for (const section of sections) {
        const rows = DATA[section] || [];
        const index = rows.findIndex(m => m.ids?.trakt === traktIdNum);
        if (index !== -1) {
          // Remplacer la carte existante par les nouvelles données
          rows[index] = { ...cardData };
          updated = true;
          logger.liveUpdates(`⚡ Updated movie ${traktIdNum} in ${section} (fallback)`);
        }
      }
    }

    // Re-rendre l'interface si on a fait des changements
    if (updated) {
      renderCurrent();
      logger.liveUpdates(`🔥 INTERFACE RE-RENDERED FOR ${cardType.toUpperCase()} ${traktIdNum} - FALLBACK UPDATE COMPLETE!`);
      
      // Feedback visuel pour montrer que la mise à jour est live
      this.showLiveUpdateFeedback(cardType, traktIdNum);
      this.showLiveUpdateNotification(cardType, traktIdNum);
    } else {
      logger.liveUpdatesWarn(`Card ${cardType} ${traktIdNum} not found in current data (fallback)`);
    }
  }

  /**
   * Affiche un feedback visuel pour les mises à jour live
   */
  showLiveUpdateFeedback(cardType, traktId) {
    // Trouver la carte dans le DOM et la faire clignoter brièvement
    const cardElement = document.querySelector(`[data-prefetch*="${traktId}"]`);
    if (cardElement) {
      cardElement.style.transition = 'box-shadow 0.5s ease';
      cardElement.style.boxShadow = '0 0 25px rgba(34, 197, 94, 0.8)';
      
      setTimeout(() => {
        cardElement.style.boxShadow = '';
      }, 1500);
    }
  }

  /**
   * Affiche une notification live groupée
   */
  showLiveUpdateNotification(cardType, traktId) {
    // Vérifier s'il y a déjà une notification live active
    let existingNotification = document.querySelector('.live-update-notification');
    
    if (existingNotification) {
      // Mettre à jour la notification existante
      const content = existingNotification.querySelector('.notification-content');
      if (content) {
        content.innerHTML = `<i class="fa-solid fa-bolt mr-2 text-yellow-300"></i>⚡ LIVE DATA RELOADED - External changes detected`;
      }
      return;
    }
    
    const notification = document.createElement('div');
    notification.className = 'live-update-notification fixed top-4 right-4 z-50 bg-green-500/95 text-white px-4 py-2 rounded-lg shadow-lg text-sm backdrop-blur-sm border-l-4 border-green-300';
    
    const content = document.createElement('div');
    content.className = 'notification-content';
    content.innerHTML = `<i class="fa-solid fa-bolt mr-2 text-yellow-300"></i>⚡ LIVE DATA RELOADED - External changes detected`;
    
    notification.appendChild(content);
    document.body.appendChild(notification);
    
    // Animate in
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'transform 0.3s ease-out';
    
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Affiche le statut de connexion
   */
  showConnectionStatus(connected) {
    // On peut ajouter un indicateur visuel dans le header si nécessaire
    const indicator = document.querySelector('.live-status');
    if (indicator) {
      indicator.className = `live-status ${connected ? 'connected' : 'disconnected'}`;
      indicator.textContent = connected ? '⚡ Live' : '❌ Offline';
    }
  }

  /**
   * Programme une reconnexion automatique
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.close();

    logger.liveUpdates(`Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Augmenter le délai de reconnexion (backoff exponentiel)
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  }

  /**
   * Ferme la connexion SSE
   */
  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.isConnected = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout);
      this.wsReconnectTimeout = null;
    }
  }

  /**
   * Fallback: Polling intelligent pour les mises à jour externes
   */
  startPollingFallback() {
    logger.liveUpdates('📡 Starting intelligent polling fallback (every 2 minutes)');
    this.isConnected = true; // On considère qu'on est "connecté" via polling
    this.pollingInterval = setInterval(async () => {
      try {
        // Appeler l'API pour voir s'il y a eu des changements
        const response = await fetch('/api/live-status', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.hasRecentChanges) {
          logger.liveUpdates('🔄 External changes detected via polling - reloading data...');
          
          // Recharger les données comme avec SSE
          const { loadData } = await import('./data.js');
          await loadData();
          const { renderCurrent } = await import('./rendering.js');
          renderCurrent();
          
          this.showLiveUpdateNotification('external', 'changes');
          logger.liveUpdates('🔄 Data reloaded successfully via polling fallback!');
        }
      } catch (error) {
        logger.liveUpdatesWarn('Polling fallback error:', error.message);
      }
    }, 120000); // Polling toutes les 2 minutes
  }

  /**
   * Arrête complètement le système de mise à jour live
   */
  stop() {
    logger.liveUpdates('Stopping REAL LIVE updates...');
    this.close();
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.showConnectionStatus(false);
  }
}

// Instance globale du gestionnaire
const liveUpdates = new LiveUpdatesManager();

/**
 * Start live updates (NOUVEAU système SSE)
 */
export function startLiveUpdates() {
  logger.liveUpdates('🔥 STARTING REAL LIVE SYSTEM WITH SSE');
  liveUpdates.start();
}

/**
 * Stop live updates
 */
export function stopLiveUpdates() {
  liveUpdates.stop();
}

/**
 * Get live updates status
 */
export function getLiveUpdatesStatus() {
  return {
    active: liveUpdates.isConnected,
    type: 'SSE (Server-Sent Events)',
    isConnected: liveUpdates.isConnected
  };
}

// Auto-start quand la page est chargée
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Attendre un peu pour laisser l'app se charger
    setTimeout(() => {
      startLiveUpdates();
    }, 2000);
  });
} else {
  // Page déjà chargée, démarrer immédiatement
  setTimeout(() => {
    startLiveUpdates();
  }, 2000);
}

// Nettoyer avant la fermeture de la page
window.addEventListener('beforeunload', () => {
  liveUpdates.stop();
});
