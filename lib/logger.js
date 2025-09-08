/**
 * Logger Module avec gestion robuste des permissions
 * Système de logging centralisé avec fallback sur console
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from './config.js';

// Configuration du répertoire de logs
const LOG_DIR = path.join(DATA_DIR, 'logs');

// Fonction helper pour créer un dossier de manière sûre
function ensureLogDirectory() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      try {
        // Essayer de créer le dossier
        fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o755 });
        console.log(`✅ Dossier de logs créé: ${LOG_DIR}`);
        return true;
      } catch (mkdirError) {
        // Si on ne peut pas créer, vérifier si le parent existe et est writable
        const parentDir = path.dirname(LOG_DIR);
        if (fs.existsSync(parentDir)) {
          try {
            // Tester l'écriture dans le parent
            const testFile = path.join(parentDir, '.write_test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            
            // Si on peut écrire dans le parent, essayer avec une autre méthode
            fs.mkdirSync(LOG_DIR, { recursive: true });
            return true;
          } catch (e) {
            console.warn(`⚠️  Impossible de créer ${LOG_DIR}: ${e.message}`);
            return false;
          }
        }
        console.warn(`⚠️  Dossier parent n'existe pas: ${parentDir}`);
        return false;
      }
    }
    
    // Le dossier existe, vérifier qu'on peut écrire dedans
    try {
      const testFile = path.join(LOG_DIR, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    } catch (writeError) {
      console.warn(`⚠️  Impossible d'écrire dans ${LOG_DIR}: ${writeError.message}`);
      return false;
    }
  } catch (error) {
    console.warn(`⚠️  Erreur lors de la vérification du dossier de logs: ${error.message}`);
    return false;
  }
}

// Vérifier si on peut utiliser les fichiers de logs
const canUseFileLogging = ensureLogDirectory();

if (!canUseFileLogging) {
  console.warn('⚠️  Les logs seront dirigés vers la console uniquement.');
  console.warn('💡 Pour corriger: chmod -R 755 /app/data ou chown -R 99:100 /app/data');
}

// Format personnalisé pour les logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message}${metaString ? '\n' + metaString : ''}`;
  })
);

// Créer les transports en fonction des permissions
function createTransports(filePrefix = 'app') {
  const transports = [
    // Toujours inclure la console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ];
  
  // Ajouter les fichiers seulement si on a les permissions
  if (canUseFileLogging) {
    try {
      transports.push(
        new DailyRotateFile({
          filename: path.join(LOG_DIR, `${filePrefix}-%DATE%.log`),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
          handleExceptions: false, // Éviter les erreurs de permissions
          handleRejections: false
        })
      );
    } catch (error) {
      console.warn(`⚠️  Impossible de créer le transport de fichier pour ${filePrefix}: ${error.message}`);
    }
  }
  
  return transports;
}

// Logger principal avec fallback robuste
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: createTransports('app'),
  exitOnError: false, // Ne pas crasher sur erreur de log
  silent: false
});

// Logger HTTP avec fallback
export const httpLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: createTransports('http'),
  exitOnError: false,
  silent: false
});

// Logger API avec fallback
export const apiLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: createTransports('api'),
  exitOnError: false,
  silent: false
});

// Logger de sécurité avec fallback
export const securityLogger = winston.createLogger({
  level: 'warn',
  format: logFormat,
  transports: createTransports('security'),
  exitOnError: false,
  silent: false
});

// Gestionnaire d'erreurs global pour les loggers
process.on('uncaughtException', (error) => {
  if (error.message && error.message.includes('EACCES') && error.message.includes('logs')) {
    console.error('❌ Erreur de permissions sur les logs. Continuant avec console uniquement...');
    // Ne pas crasher l'application pour une erreur de logs
  } else {
    // Re-throw les autres erreurs
    throw error;
  }
});

// Object loggers pour compatibilité avec l'ancien code
export const loggers = {
  logRequest: (req, res, duration) => {
    httpLogger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      duration: `${duration}ms`
    });
  },
  
  logError: (error, context = {}) => {
    logger.error('Application Error', {
      error: error.message,
      stack: error.stack,
      ...context
    });
  },
  
  logApiCall: (service, method, endpoint, duration, statusCode, error = null) => {
    const logData = {
      service,
      method,
      endpoint,
      duration: `${duration}ms`,
      statusCode
    };
    
    if (error) {
      logData.error = error.message;
      apiLogger.error('API Error', logData);
    } else {
      apiLogger.info('API Call', logData);
    }
  },
  
  logPerformance: (operation, duration, context = {}) => {
    logger.info('Performance', {
      operation,
      duration: `${duration}ms`,
      ...context
    });
  }
};

// Export par défaut
export default logger;