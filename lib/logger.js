/**
 * Logger Configuration
 * Système de logs centralisé avec Winston
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'node:path';
import fs from 'node:fs';

const LOG_DIR = path.join(process.cwd(), 'data', 'logs');

// Créer le dossier de logs s'il n'existe pas (avec gestion des permissions)
let logDirAvailable = true;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  if (err.code !== 'EEXIST') {
    console.warn(`⚠️  Impossible de créer ${LOG_DIR}:`, err.message);
    console.warn('Les logs seront dirigés vers la console uniquement.');
    logDirAvailable = false;
  }
}

// Configuration des formats
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let logMsg = `${timestamp} [${level}]: ${message}`;
    
    // Ajouter la stack trace pour les erreurs
    if (stack) {
      logMsg += `\n${stack}`;
    }
    
    // Ajouter les métadonnées si présentes
    if (Object.keys(meta).length > 0) {
      logMsg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMsg;
  })
);

// Transports
const transports = [
  // Console (toujours disponible)
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  })
];

// Ajouter les transports de fichiers seulement si le dossier logs est accessible
if (logDirAvailable) {
  transports.push(
    // Fichier pour toutes les logs (rotation quotidienne)
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat,
      level: 'debug'
    }),
    
    // Fichier séparé pour les erreurs
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat,
      level: 'error'
    })
  );
}

// Créer le logger principal
export const logger = winston.createLogger({
  level: 'debug',
  format: logFormat,
  transports,
  // Ne pas sortir sur process.exit() pour les erreurs non capturées
  exitOnError: false
});

// Logger spécialisé pour les requêtes HTTP
export const httpLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '7d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Logger pour les APIs externes (Trakt, TMDB)
export const apiLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'api-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Utilitaires de logging
export const loggers = {
  // Log d'une requête HTTP
  logRequest(req, res, duration) {
    httpLogger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection?.remoteAddress,
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length'),
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  },

  // Log d'un appel API externe
  logApiCall(service, method, url, duration, status, error = null) {
    const logData = {
      service,
      method,
      url,
      duration: `${duration}ms`,
      status,
      timestamp: new Date().toISOString()
    };

    if (error) {
      logData.error = error.message;
      logData.stack = error.stack;
      apiLogger.error('API Call Failed', logData);
    } else {
      apiLogger.info('API Call', logData);
    }
  },

  // Log des métriques de performance
  logPerformance(operation, duration, metadata = {}) {
    logger.info('Performance', {
      operation,
      duration: `${duration}ms`,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },

  // Log d'erreur avec contexte
  logError(error, context = {}) {
    logger.error('Application Error', {
      error: error.message,
      stack: error.stack,
      ...context,
      timestamp: new Date().toISOString()
    });
  }
};

// Gestionnaire d'exceptions non capturées
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { 
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString()
  });
});

export default logger;