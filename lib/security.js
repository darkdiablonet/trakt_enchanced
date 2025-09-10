/**
 * Security Module - Protection CSRF, headers sécurisés et validation
 */

import { generateCSRFToken, verifyCSRFToken } from './crypto.js';
import { logger } from './logger.js';

// Configuration CSRF
const CSRF_TOKEN_KEY = 'csrfToken';

/**
 * Middleware de protection CSRF
 */
export function csrfProtection(req, res, next) {
  // Exemptions pour les requêtes GET et les APIs publiques
  if (req.method === 'GET' || req.url.startsWith('/api/data') || req.url.startsWith('/api/stats')) {
    return next();
  }
  
  const token = req.body?.csrf || req.headers['x-csrf-token'];
  const sessionToken = req.session?.[CSRF_TOKEN_KEY];
  
  logger.debug('CSRF Debug:', {
    receivedToken: token ? token.substring(0, 10) + '...' : 'null',
    sessionToken: sessionToken ? sessionToken.substring(0, 10) + '...' : 'null',
    headers: req.headers['x-csrf-token'] ? 'present' : 'missing',
    body: req.body?.csrf ? 'present' : 'missing',
    session: {
      id: req.sessionID,
      exists: !!req.session,
      csrfTokenKey: req.session ? (CSRF_TOKEN_KEY in req.session) : 'no-session'
    },
    bodyKeys: req.body ? Object.keys(req.body) : 'no-body'
  });
  
  if (!token || !sessionToken) {
    logger.warn('CSRF: Missing token', {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(403).json({
      error: 'CSRF token manquant',
      code: 'CSRF_MISSING'
    });
  }
  
  if (!verifyCSRFToken(token, sessionToken)) {
    logger.warn('CSRF: Invalid token', {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      tokenProvided: !!token,
      sessionToken: !!sessionToken
    });
    
    return res.status(403).json({
      error: 'CSRF token invalide',
      code: 'CSRF_INVALID'
    });
  }
  
  logger.debug('CSRF: Token validated successfully');
  next();
}

/**
 * Middleware pour injecter le token CSRF dans les sessions
 */
export function csrfTokenMiddleware(req, res, next) {
  if (!req.session[CSRF_TOKEN_KEY]) {
    req.session[CSRF_TOKEN_KEY] = generateCSRFToken();
    logger.debug('CSRF: New token generated for session');
  }
  
  // Ajouter le token aux variables globales pour les templates
  res.locals = res.locals || {};
  res.locals.csrfToken = req.session[CSRF_TOKEN_KEY];
  
  next();
}

/**
 * Middleware de headers de sécurité
 */
export function securityHeaders(req, res, next) {
  // Content Security Policy - Scripts inline externalisés, unsafe-inline retiré
  // unsafe-eval nécessaire pour les imports dynamiques import() dans les modules ES6
  // Utilisé dans tabs.js pour loadAndRenderGraph() et loadStatsPro()
  const scriptSrc = "'self' 'unsafe-eval'";
    
  const csp = [
    "default-src 'self'",
    "style-src 'self'",
    `script-src ${scriptSrc}`,
    "script-src-attr 'none'", 
    "img-src 'self' https://image.tmdb.org https://images.trakt.tv data:",
    "connect-src 'self' ws: wss: https://api.trakt.tv https://api.themoviedb.org",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
  
  // Headers de sécurité standard
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // X-XSS-Protection retiré : obsolète et potentiellement dangereux
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()', 
    'geolocation=()',
    'browsing-topics=()',
    'run-ad-auction=()',
    'join-ad-interest-group=()',
    'private-state-token-redemption=()',
    'private-state-token-issuance=()', 
    'private-aggregation=()',
    'attribution-reporting=()'
  ].join(', '));
  
  // HSTS en production seulement
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Cache control pour les ressources sensibles
  if (req.url.includes('/api/') || req.url.includes('/oauth/')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
}

/**
 * Validation et sanitisation des entrées
 */
export function validateInput(schema) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body?.[field] || req.query?.[field];
      
      if (rules.required && (!value || value.trim() === '')) {
        errors.push(`${field} est requis`);
        continue;
      }
      
      if (value && rules.type) {
        switch (rules.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`${field} doit être une chaîne`);
            } else {
              if (rules.minLength && value.length < rules.minLength) {
                errors.push(`${field} doit faire au moins ${rules.minLength} caractères`);
              }
              if (rules.maxLength && value.length > rules.maxLength) {
                errors.push(`${field} doit faire au maximum ${rules.maxLength} caractères`);
              }
              if (rules.pattern && !rules.pattern.test(value)) {
                errors.push(`${field} a un format invalide`);
              }
            }
            break;
            
          case 'number':
            const num = Number(value);
            if (isNaN(num)) {
              errors.push(`${field} doit être un nombre`);
            } else {
              if (rules.min !== undefined && num < rules.min) {
                errors.push(`${field} doit être >= ${rules.min}`);
              }
              if (rules.max !== undefined && num > rules.max) {
                errors.push(`${field} doit être <= ${rules.max}`);
              }
            }
            break;
            
          case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              errors.push(`${field} doit être un email valide`);
            }
            break;
        }
      }
      
      // Sanitisation basique
      if (typeof value === 'string') {
        req.body[field] = value.trim();
        req.query[field] = value.trim();
      }
    }
    
    if (errors.length > 0) {
      logger.warn('Input validation failed', {
        errors,
        ip: req.ip,
        url: req.url,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(400).json({
        error: 'Données invalides',
        details: errors,
        code: 'VALIDATION_ERROR'
      });
    }
    
    next();
  };
}

/**
 * Middleware de détection d'attaques
 */
export function attackDetection(req, res, next) {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /union\s+select/i,
    /drop\s+table/i,
    /insert\s+into/i,
    /update\s+.*\s+set/i,
    /delete\s+from/i,
    /'.*or.*'.*='/i,
    /\.\./,
    /\/etc\/passwd/,
    /\/proc\/self\/environ/
  ];
  
  const checkValue = (value, source) => {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          logger.warn('Potential attack detected', {
            pattern: pattern.toString(),
            value: value.substring(0, 100),
            source,
            ip: req.ip,
            url: req.url,
            userAgent: req.get('User-Agent')
          });
          
          return res.status(400).json({
            error: 'Requête suspecte détectée',
            code: 'SUSPICIOUS_REQUEST'
          });
        }
      }
    }
    return null;
  };
  
  // Vérifier query params
  for (const [key, value] of Object.entries(req.query || {})) {
    const result = checkValue(value, `query.${key}`);
    if (result) return result;
  }
  
  // Vérifier body
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      const result = checkValue(value, `body.${key}`);
      if (result) return result;
    }
  }
  
  next();
}

/**
 * Limitation du taux de requêtes par IP
 */
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 200; // 200 requêtes par fenêtre

export function rateLimitByIP(req, res, next) {
  const clientId = req.ip || 'unknown';
  const now = Date.now();
  
  // Nettoyer les anciens compteurs
  for (const [ip, data] of rateLimits.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW) {
      rateLimits.delete(ip);
    }
  }
  
  let clientData = rateLimits.get(clientId);
  if (!clientData || now - clientData.windowStart > RATE_LIMIT_WINDOW) {
    clientData = { count: 0, windowStart: now };
    rateLimits.set(clientId, clientData);
  }
  
  clientData.count++;
  
  if (clientData.count > RATE_LIMIT_MAX) {
    logger.warn('Rate limit exceeded by IP', {
      ip: clientId,
      count: clientData.count,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(429).json({
      error: 'Trop de requêtes',
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - clientData.windowStart)) / 1000),
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
  
  res.set({
    'X-RateLimit-Limit': RATE_LIMIT_MAX,
    'X-RateLimit-Remaining': Math.max(0, RATE_LIMIT_MAX - clientData.count),
    'X-RateLimit-Reset': new Date(clientData.windowStart + RATE_LIMIT_WINDOW).toISOString()
  });
  
  next();
}

export default {
  csrfProtection,
  csrfTokenMiddleware,
  securityHeaders,
  validateInput,
  attackDetection,
  rateLimitByIP
};
