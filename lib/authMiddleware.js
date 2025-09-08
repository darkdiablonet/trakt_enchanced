/**
 * Auth Middleware
 * Vérifie que le token Trakt est valide pour tous les endpoints API
 */

import { hasValidCredentials, loadToken, ensureValidToken } from './trakt.js';
import { logger } from './logger.js';

/**
 * Liste des endpoints qui ne nécessitent pas d'authentification
 */
const AUTH_EXEMPT_ENDPOINTS = [
  '/health',
  '/setup',
  '/auth',
  '/oauth',
  '/api/data', // Autorisé pour vérifier l'état d'auth
  '/api/token-status', // Autorisé pour vérifier le statut du token
  '/loading',
  '/favicon.ico',
  '/assets',
  '/locales'
];

/**
 * Middleware qui vérifie l'authentification Trakt
 */
export async function requireAuth(req, res, next) {
  // Vérifier si l'endpoint est exempté
  const path = req.path;
  const isExempt = AUTH_EXEMPT_ENDPOINTS.some(exempt => 
    path === exempt || path.startsWith(exempt + '/')
  );
  
  if (isExempt) {
    return next();
  }
  
  // Vérifier les credentials de base
  if (!hasValidCredentials()) {
    logger.warn(`[AuthMiddleware] Missing Trakt credentials for ${path}`);
    return res.status(412).json({ 
      ok: false, 
      error: 'Trakt configuration missing',
      needsSetup: true
    });
  }
  
  // Vérifier le token
  try {
    const token = await loadToken();
    
    if (!token?.access_token) {
      logger.warn(`[AuthMiddleware] No valid token for ${path}`);
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication required',
        needsAuth: true
      });
    }
    
    // Vérifier si le token est toujours valide
    const validToken = await ensureValidToken();
    if (!validToken?.access_token) {
      logger.warn(`[AuthMiddleware] Token expired or invalid for ${path}`);
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication expired',
        needsAuth: true
      });
    }
    
    // Token valide, continuer
    req.traktToken = validToken;
    next();
    
  } catch (error) {
    logger.error(`[AuthMiddleware] Error checking auth for ${path}:`, error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Authentication check failed'
    });
  }
}

/**
 * Middleware optionnel qui vérifie l'auth mais ne bloque pas
 */
export async function checkAuth(req, res, next) {
  try {
    if (!hasValidCredentials()) {
      req.hasAuth = false;
      return next();
    }
    
    const token = await loadToken();
    req.hasAuth = !!token?.access_token;
    req.traktToken = token;
    next();
    
  } catch (error) {
    req.hasAuth = false;
    next();
  }
}

export default requireAuth;