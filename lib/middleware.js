/**
 * Middleware de monitoring et gestion d'erreurs
 */

import { logger, loggers } from './logger.js';

// Middleware de logging des requêtes HTTP
export function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const originalSend = res.send;

  // Override de res.send pour capturer le temps de réponse
  res.send = function(data) {
    const duration = Date.now() - startTime;
    loggers.logRequest(req, res, duration);
    return originalSend.call(this, data);
  };

  // Log des requêtes entrantes
  logger.debug('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection?.remoteAddress,
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined
  });

  next();
}

// Middleware de gestion centralisée des erreurs
export function errorHandlingMiddleware(error, req, res, next) {
  // Log de l'erreur avec contexte
  loggers.logError(error, {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection?.remoteAddress,
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined
  });

  // Déterminer le code de statut
  let statusCode = 500;
  let message = 'Erreur interne du serveur';

  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Données invalides';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Non autorisé';
  } else if (error.status) {
    statusCode = error.status;
  }

  // En mode développement, inclure la stack trace
  const errorResponse = {
    error: message,
    timestamp: new Date().toISOString(),
    path: req.url
  };

  if (process.env.NODE_ENV !== 'production') {
    errorResponse.details = error.message;
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
}

// Middleware de monitoring des performances
export function performanceMiddleware(operation) {
  return (req, res, next) => {
    const startTime = Date.now();
    
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      // Log si la requête prend plus de 1 seconde
      if (duration > 1000) {
        loggers.logPerformance(operation || req.url, duration, {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          slow: true
        });
      }
      
      return originalSend.call(this, data);
    };

    next();
  };
}

// Middleware de rate limiting simple (en mémoire)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requêtes par fenêtre

export function rateLimitMiddleware(req, res, next) {
  const clientId = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  
  // Nettoyer les anciens compteurs
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW) {
      requestCounts.delete(key);
    }
  }
  
  // Obtenir ou créer le compteur pour ce client
  let clientData = requestCounts.get(clientId);
  if (!clientData || now - clientData.windowStart > RATE_LIMIT_WINDOW) {
    clientData = { count: 0, windowStart: now };
    requestCounts.set(clientId, clientData);
  }
  
  clientData.count++;
  
  // Vérifier la limite
  if (clientData.count > RATE_LIMIT_MAX) {
    logger.warn('Rate limit exceeded', {
      clientId,
      count: clientData.count,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(429).json({
      error: 'Trop de requêtes',
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - clientData.windowStart)) / 1000)
    });
  }
  
  // Ajouter les headers de rate limiting
  res.set({
    'X-RateLimit-Limit': RATE_LIMIT_MAX,
    'X-RateLimit-Remaining': Math.max(0, RATE_LIMIT_MAX - clientData.count),
    'X-RateLimit-Reset': new Date(clientData.windowStart + RATE_LIMIT_WINDOW).toISOString()
  });
  
  next();
}

// Wrapper pour les fonctions async avec gestion d'erreurs
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}