/**
 * Client-side Logger with configurable log levels
 * Par défaut, ne montre que les warnings et erreurs en production
 */

// Niveaux de logs (plus bas = plus verbeux)
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4
};

class ClientLogger {
  constructor() {
    // Déterminer le niveau de log selon l'environnement
    this.level = this.getLogLevel();
    this.prefix = '[Client]';
  }

  getLogLevel() {
    // Vérifier si on est en développement (localhost ou paramètre URL)
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' ||
                  new URLSearchParams(window.location.search).has('debug');
    
    if (isDev) {
      return LOG_LEVELS.DEBUG; // Tout afficher en dev
    } else {
      return LOG_LEVELS.WARN; // Seulement warn/error en production
    }
  }

  debug(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.log(`${this.prefix} [DEBUG]`, ...args);
    }
  }

  info(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.info(`${this.prefix} [INFO]`, ...args);
    }
  }

  warn(...args) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn(`${this.prefix} [WARN]`, ...args);
    }
  }

  error(...args) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error(`${this.prefix} [ERROR]`, ...args);
    }
  }

  // Méthodes spécialisées pour les modules
  liveUpdates(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.log('[LiveUpdates]', ...args);
    }
  }

  liveUpdatesWarn(...args) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn('[LiveUpdates]', ...args);
    }
  }

  liveUpdatesError(...args) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error('[LiveUpdates]', ...args);
    }
  }

  // Méthode pour afficher le niveau de log actuel
  showLevel() {
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === this.level);
    console.info(`${this.prefix} Log level: ${levelName}`);
  }
}

// Instance globale
const logger = new ClientLogger();

// Afficher le niveau au démarrage seulement en debug
if (logger.level <= LOG_LEVELS.DEBUG) {
  logger.showLevel();
}

export default logger;