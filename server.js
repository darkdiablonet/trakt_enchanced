import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import session from 'express-session';
import FileStore from 'session-file-store';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

// Import du système de monitoring et sécurité
import { logger } from './lib/logger.js';
import { requestLoggingMiddleware, errorHandlingMiddleware, performanceMiddleware, asyncHandler } from './lib/middleware.js';
import { securityHeaders, csrfTokenMiddleware, csrfProtection, attackDetection } from './lib/security.js';
import { serverI18n } from './lib/i18n.js';
import { requireAuth, checkAuth } from './lib/authMiddleware.js';

import { DATA_DIR, IMG_DIR, SESSIONS_DIR, PORT, FULL_REBUILD_PASSWORD, TITLE, reloadEnv, OAUTH_REDIRECT_URI } from './lib/config.js';
import { saveToken, deviceToken, deviceCode, headers as traktHeaders, loadToken, userStats, markEpisodeWatched, removeEpisodeFromHistory, markMovieWatched, removeMovieFromHistory, hasValidCredentials, get, del, getLastActivities, getHistory, ensureValidToken, getOAuthAuthorizeUrl, exchangeCodeForToken, addToHistory } from './lib/trakt.js';
// Ancien système de cache global supprimé - utilisation du cache granulaire uniquement
import { buildPageDataGranular, getOrBuildShowCard, updateSpecificCard } from './lib/pageDataNew.js';
import { makeRefresher, loadDeviceCode, saveDeviceCode, clearDeviceCode, getPublicHost, jsonLoad } from './lib/util.js';
import { dailyCounts } from './lib/graph.js';
import { readGraphCache, writeGraphCache } from './lib/graphCache.js';
import { computeStatsPro } from './lib/statsPro.js';
import { readStatsCache, writeStatsCache } from './lib/statsCache.js';
import { getWatchingsByDate, getCacheStats } from './lib/watchingsByDate.js';
import { generateRealHeatmapData } from './lib/heatmapData.js';
import { getMovieWatchingDetails, getShowWatchingDetails } from './lib/watchingDetails.js';
import { renderTemplate } from './lib/template.js';
import { checkEnvFile, generateEnvFile } from './lib/setup.js';
import { verifyPassword } from './lib/auth.js';
import { addProgressConnection, sendProgress, sendCompletion } from './lib/progressTracker.js';
import { startActivityMonitor, stopActivityMonitor, getMonitorStatus, setBroadcastFunction } from './lib/activityMonitor.js';
import { getRateLimitStats } from './lib/apiRateLimiter.js';
import { tmdbSearch } from './lib/tmdb.js';

dotenv.config();

// Système de broadcast pour Server-Sent Events (SSE)
const liveClients = new Set();
// Serveur WebSocket (initialisé après app.listen)
let wss = null;

function broadcastCardUpdate(type, traktId, cardData) {
  const eventData = {
    type: 'card-update',
    cardType: type,
    traktId: traktId,
    card: cardData,
    timestamp: Date.now()
  };
  
  const message = `data: ${JSON.stringify(eventData)}\n\n`;
  
  liveClients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      console.warn('[SSE] Client disconnected, removing from list');
      liveClients.delete(client);
    }
  });
  
  // Broadcast via WebSocket si disponible
  try {
    if (wss) {
      const json = JSON.stringify(eventData);
      wss.clients.forEach(ws => {
        // ws.OPEN constant is on ws instance
        if (ws.readyState === ws.OPEN) {
          ws.send(json);
        }
      });
    }
  } catch (e) {
    console.warn('[WS] Broadcast error:', e.message);
  }
  
  console.log(`[SSE/WS] Broadcasted ${type} ${traktId} update to ${liveClients.size} SSE + ${wss?.clients?.size || 0} WS clients`);
}

// Fonction générique pour broadcaster tous types d'événements
function broadcastEvent(eventType, traktId, data) {
  const eventData = {
    type: eventType,
    traktId: traktId,
    card: data,
    timestamp: Date.now()
  };
  
  const message = `data: ${JSON.stringify(eventData)}\n\n`;
  
  liveClients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      console.warn('[SSE] Client disconnected, removing from list');
      liveClients.delete(client);
    }
  });
  
  // Broadcast via WebSocket si disponible
  try {
    if (wss) {
      const json = JSON.stringify(eventData);
      wss.clients.forEach(ws => {
        if (ws.readyState === ws.OPEN) {
          ws.send(json);
        }
      });
    }
  } catch (e) {
    console.warn('[WS] Broadcast error:', e.message);
  }
  
  console.log(`[SSE/WS] Broadcasted ${eventType} for ${traktId} to ${liveClients.size} SSE + ${wss?.clients?.size || 0} WS clients`);
}

// Invalider TOUS les caches globaux (les 3 fichiers de merde qui restent)
async function invalidateGlobalCaches() {
  const globalCacheFiles = [
    path.join(DATA_DIR, '.cache_trakt', 'trakt_history_cache.json'),
    path.join(DATA_DIR, '.cache_trakt', 'trakt_master.json'), 
    path.join(DATA_DIR, '.cache_trakt', 'watched_shows_complete.json')
  ];
  
  for (const file of globalCacheFiles) {
    try {
      await fsp.unlink(file);
      console.log(`[Cache] 🗑️  Invalidated global cache: ${path.basename(file)}`);
    } catch (error) {
      // File might not exist, that's ok
    }
  }
}

// Lire la version depuis package.json au démarrage
const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
const APP_VERSION = packageJson.version;

const app = express();

// Trust proxy pour obtenir les vraies IPs derrière un reverse proxy
app.set('trust proxy', 1);

// Désactiver l'en-tête X-Powered-By pour masquer Express
app.disable('x-powered-by');

// Compression Brotli/Gzip (en premier pour tout comprimer)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6, // Balance compression/CPU
  threshold: 1024 // Compress files > 1KB
}));

// Middleware de sécurité (en premier)
app.use(securityHeaders);
app.use(attackDetection);

// Middleware de monitoring
app.use(requestLoggingMiddleware);

// Remplacer Morgan par notre système de logging (Morgan reste pour le développement)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('tiny'));
}

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Session sécurisée avec compatibilité Docker/Unraid et store persistant
const sessionSecret = process.env.SESSION_SECRET || 
  (fs.existsSync(path.join(DATA_DIR, '.session_secret')) ? 
    fs.readFileSync(path.join(DATA_DIR, '.session_secret'), 'utf8').trim() :
    (() => {
      const secret = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(path.join(DATA_DIR, '.session_secret'), secret);
      return secret;
    })());

// Configuration du FileStore pour sessions persistantes  
const SessionFileStore = FileStore(session);
const sessionStore = new SessionFileStore({
  path: SESSIONS_DIR, // Dossier sessions dans /data
  ttl: 24 * 60 * 60, // TTL 24h en secondes
  retries: 2, // Tentatives en cas d'erreur
  factor: 1, // Facteur de retry
  minTimeout: 50, // Timeout minimum
  maxTimeout: 100, // Timeout maximum
  encrypt: false, // Pas de double chiffrement
  encoding: 'utf8',
  encoder: JSON.stringify,
  decoder: JSON.parse,
  fileExtension: '.json',
  reapInterval: 3600, // Nettoyage toutes les heures
  reapMaxConcurrent: 10, // Max 10 nettoyages simultanés
  reapAsync: true, // Nettoyage asynchrone
  logFn: (message) => logger.debug(`FileStore: ${message}`)
});

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { 
    maxAge: 24*60*60*1000, // 24h
    httpOnly: true,
    secure: 'auto', // Express détecte automatiquement HTTPS
    sameSite: 'lax' // Plus permissif pour Docker
  },
  name: 'trakt.sid' // Nom personnalisé pour masquer Express
}));

// Middleware d'authentification basique
const authMiddleware = (req, res, next) => {
  // Routes qui n'ont pas besoin d'authentification  
  const publicPaths = [
    '/login',
    '/setup',
    '/oauth',
    '/auth',
    '/assets',
    '/locales',
    '/cache_imgs',
    '/api/progress',
    '/health',
    '/debug'
  ];
  
  // Vérifier si la route est publique
  const isPublic = publicPaths.some(path => req.path.startsWith(path));
  if (isPublic) {
    return next();
  }
  
  // Si AUTH_ENABLED n'est pas défini ou n'est pas configuré, rediriger vers setup
  if (process.env.AUTH_ENABLED === undefined || process.env.AUTH_ENABLED === '') {
    return res.redirect('/setup');
  }
  
  // Si l'authentification n'est pas activée (false), passer au suivant
  if (process.env.AUTH_ENABLED !== 'true') {
    return next();
  }
  
  // Si AUTH_USERNAME ou AUTH_PASSWORD est vide, rediriger vers setup
  if (!process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD) {
    return res.redirect('/setup');
  }
  
  // Vérifier si l'utilisateur est authentifié
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // Rediriger vers la page de login
  const returnUrl = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?returnUrl=${returnUrl}`);
};

// Middleware CSRF après les sessions
app.use(csrfTokenMiddleware);

// I18n middleware
app.use(serverI18n.middleware());

// Appliquer le middleware d'authentification
app.use(authMiddleware);

// --- Chemin du cache images
const ABS_CACHE_DIR   = '/data/cache_imgs';
const LOCAL_CACHE_DIR = path.join(process.cwd(), 'data', 'cache_imgs');
const CACHE_IMGS_DIR  = fs.existsSync(ABS_CACHE_DIR) ? ABS_CACHE_DIR : LOCAL_CACHE_DIR;

// --- IMPORTANT : ne pas coller "no-store" sur les posters
app.use((req, res, next) => {
  if (req.path.startsWith('/cache_imgs/')) {
    // Cache fort côté navigateur : 1 an + immutable + stale-while-revalidate
    res.setHeader('Cache-Control', 'public, max-age=31536000, stale-while-revalidate=86400, immutable');
  }
  next();
});

// --- Route pour les fichiers de traduction
app.use('/locales', express.static(path.join(process.cwd(), 'public', 'locales'), {
  maxAge: '1h',
  etag: true
}));

// --- Static pour les posters (avant toute autre route)

app.use('/cache_imgs', express.static(CACHE_IMGS_DIR, {
  fallthrough: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.webp') res.type('image/webp');
    else if (ext === '.png') res.type('image/png');
    else res.type('image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, stale-while-revalidate=86400, immutable');
  }
}));



// Assets statiques avec cache optimisé pour CSS/JS
app.use('/assets', express.static(path.join(process.cwd(), 'public', 'assets'), {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    // Cache long pour CSS/JS (3 mois)
    if (ext === '.css' || ext === '.js') {
      res.set('Cache-Control', 'public, max-age=7776000, stale-while-revalidate=86400'); // 3 mois + revalidation
    }
    // Cache moyen pour fonts/images
    else if (['.woff', '.woff2', '.ttf', '.eot', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico'].includes(ext)) {
      res.set('Cache-Control', 'public, max-age=2592000'); // 1 mois
    }
    // Cache court pour autres fichiers
    else {
      res.set('Cache-Control', 'public, max-age=86400'); // 1 jour
    }
  }
}));
app.use('/public', express.static(path.join(DATA_DIR, '..', 'public'), { maxAge: '30d' }));

// Servir les images statiques (placeholders, etc.)
app.use('/img', express.static(path.join(process.cwd(), 'public', 'img'), {
  etag: true,
  lastModified: true,
  maxAge: '7d'
}));

// si tu veux assurer la compatibilité .ico:
app.get('/favicon.ico', (req, res) => {
  const ico = path.join(process.cwd(), 'public', 'assets', 'favicon.ico');
  if (fs.existsSync(ico)) return res.sendFile(ico);
  return res.status(204).end(); // fallback silencieux
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: APP_VERSION,
    node: process.version,
    environment: process.env.NODE_ENV || 'development'
  };
  
  // Vérifier l'état des services critiques
  const checks = {
    filesystem: fs.existsSync(DATA_DIR),
    logs: fs.existsSync(path.join(process.cwd(), 'data', 'logs'))
  };
  
  const allChecksPass = Object.values(checks).every(check => check === true);
  
  if (allChecksPass) {
    healthStatus.checks = checks;
    logger.debug('Health check passed');
    res.status(200).json(healthStatus);
  } else {
    healthStatus.status = 'unhealthy';
    healthStatus.checks = checks;
    logger.warn('Health check failed', { checks });
    res.status(503).json(healthStatus);
  }
});

// Debug CSRF endpoint (pour diagnostiquer les problèmes Docker/Unraid)
app.get('/debug/csrf', (req, res) => {
  res.json({
    session: {
      id: req.sessionID,
      exists: !!req.session,
      csrf_token: req.session?.csrfToken,
      cookie: req.session?.cookie
    },
    headers: {
      host: req.get('host'),
      'x-forwarded-proto': req.get('x-forwarded-proto'),
      'x-forwarded-host': req.get('x-forwarded-host'),
      cookie: req.get('cookie'),
      'user-agent': req.get('user-agent')
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      SESSION_SECRET: process.env.SESSION_SECRET ? '[DÉFINI]' : '[AUTO-GÉNÉRÉ]'
    }
  });
});

// OAuth helper routes
app.get('/oauth/poll', asyncHandler(async (req, res) => {
  // Try to get device_code from session first, then from persistent storage
  let dc = req.session.device_code;
  if (!dc?.device_code) {
    dc = await loadDeviceCode();
    if (dc?.device_code) {
      req.session.device_code = dc; // Restore to session
    }
  }
  
  if (!dc?.device_code) return res.json({ ok:false, err:'no_device_code' });
  
  const tok = await deviceToken(dc.device_code, dc._client_id, dc._client_secret);
  if (tok?.access_token) {
    req.session.trakt = tok;
    await saveToken(tok);
    // Clear the device_code from both session and disk after successful auth
    delete req.session.device_code;
    await clearDeviceCode();
    return res.json({ ok:true });
  }
  if (tok?.error) {
    const err = String(tok.error);
    const fatal = ['expired_token','access_denied','invalid_grant','invalid_client','unsupported_grant_type'].includes(err);
    if (fatal) {
      // Clear expired/invalid device_code
      delete req.session.device_code;
      await clearDeviceCode();
    }
    return res.json({ ok:false, err, fatal });
  }
  return res.json({ ok:false, err:'network_or_empty_response', fatal:false });
}));

app.get('/oauth/new', asyncHandler(async (req, res) => { 
  delete req.session.device_code; 
  await clearDeviceCode(); 
  res.redirect('/'); 
}));

// New OAuth authorization flow
app.get('/auth', asyncHandler(async (req, res) => {
  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauth_state = state;
  
  // Redirect to Trakt OAuth authorization page
  const authUrl = getOAuthAuthorizeUrl(state);
  res.redirect(authUrl);
}));

// OAuth callback handler
app.get('/auth/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state for CSRF protection
  if (!state || state !== req.session.oauth_state) {
    logger.warn('OAuth callback: Invalid state parameter');
    return res.status(400).send('Invalid state parameter');
  }
  
  // Clear the state from session
  delete req.session.oauth_state;
  
  if (!code) {
    logger.warn('OAuth callback: No authorization code received');
    return res.status(400).send('No authorization code received');
  }
  
  try {
    // Exchange the code for an access token
    const token = await exchangeCodeForToken(code);
    
    if (token && token.access_token) {
      // Save the token
      await saveToken(token);
      req.session.trakt = token;
      
      logger.info('OAuth: Successfully authenticated user');
      
      // Redirect to loading page which will handle the rest
      res.redirect('/loading?auth=success');
    } else {
      throw new Error('Invalid token response');
    }
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed. Please try again.');
  }
}));

// Fonction pour effacer le dossier de cache Trakt
function clearTraktCache() {
  try {
    const traktCacheDir = path.join(DATA_DIR, '.cache_trakt');
    if (fs.existsSync(traktCacheDir)) {
      fs.rmSync(traktCacheDir, { recursive: true, force: true });
      logger.info('Dossier .cache_trakt effacé');
    } else {
      logger.info('Dossier .cache_trakt n\'existe pas');
    }
    
    // Recréer le dossier vide
    fs.mkdirSync(traktCacheDir, { recursive: true });
    logger.info('Dossier .cache_trakt recréé');
    
    logger.info('Nettoyage du cache Trakt terminé');
  } catch (err) {
    logger.error('Erreur lors du nettoyage du cache Trakt:', err.message);
    throw err;
  }
}

// Refresh / Full rebuild
app.post('/refresh', csrfProtection, (req, res) => { req.session.forceRefreshOnce = true; res.redirect('/'); });
app.post('/full_rebuild', csrfProtection, (req, res) => {
  const pwd = String(req.body.pwd || '');
  if (!FULL_REBUILD_PASSWORD) {
    req.session.flash = 'Mot de passe de full rebuild non configuré côté serveur.';
    res.redirect('/');
  } else if (!verifyPassword(pwd, FULL_REBUILD_PASSWORD)) {
    req.session.flash = 'Mot de passe incorrect.';
    res.redirect('/');
  } else {
    try {
      // Effacer le cache Trakt uniquement
      clearTraktCache();
      
      // Marquer pour full rebuild et rediriger vers loading
      req.session.allowFull = true;
      req.session.fullRebuildTriggered = true;
      res.redirect('/loading');
    } catch (err) {
      req.session.flash = `Erreur lors du full rebuild: ${err.message}`;
      res.redirect('/');
    }
  }
});

// API: Page data JSON
app.get('/api/data', performanceMiddleware('buildPageData'), async (req, res) => {
  try {
  const flash = req.session.flash || null;
  delete req.session.flash;

  const forceRefreshOnce = !!req.session.forceRefreshOnce;
  const allowFull = !!req.session.allowFull;
  delete req.session.forceRefreshOnce;
  delete req.session.allowFull;

  // Vérifier si les credentials sont configurés
  if (!hasValidCredentials()) {
    return res.status(412).json({ 
      ok: false, 
      error: 'Missing configuration',
      needsSetup: true,
      redirectTo: '/setup'
    });
  }

  // Vérifier si on a un token utilisateur
  const token = await loadToken();
  const headers = traktHeaders(token?.access_token);
  
  if (!token?.access_token) {
    // OAuth flow - n'envoyer que needsAuth sans générer de device code
    // L'interface affichera le bouton OAuth
    return res.json({
      title: TITLE,
      flash,
      needsAuth: true,
      devicePrompt: null, // Pas de device code = bouton OAuth
      showsRows: [],
      moviesRows: [],
      showsUnseenRows: [],
      moviesUnseenRows: []
    });
  }

  // On a les credentials et le token - construire les données normalement
  try {
    const pageData = await buildPageDataGranular(headers);
    
    res.setHeader('Cache-Control', 'no-store');
    res.json({ title: TITLE, flash, ...pageData });
  } catch (error) {
    logger.error('Error building page data', { error: error.message });
    
    // Check if it's an authentication error (multiple possible patterns)
    const isAuthError = error.message?.includes('authentication') || 
                        error.message?.includes('re-authenticate') || 
                        error.message?.includes('401') ||
                        error.message?.includes('Unauthorized') ||
                        error.status === 401 || 
                        error.statusCode === 401 ||
                        (error.message && error.message.includes('Response code 401'));
                        
    console.log('[api/data] Error details:', {
      message: error.message,
      status: error.status,
      statusCode: error.statusCode,
      isAuthError
    });
                        
    if (isAuthError) {
      // Token is invalid, clear it and ask for re-authentication
      await saveToken(null);
      console.log('[api/data] Authentication error detected, returning needsAuth: true');
      return res.json({
        title: TITLE,
        flash: 'Your authentication has expired. Please reconnect to Trakt.',
        needsAuth: true,
        devicePrompt: null,
        showsRows: [],
        moviesRows: [],
        showsUnseenRows: [],
        moviesUnseenRows: []
      });
    }
    
    // Other errors
    throw error;
  }
  } catch (middlewareError) {
    // Fallback error handling
    console.error('[api/data] Unhandled error:', middlewareError.message);
    res.status(500).json({ 
      error: 'Internal server error',
      details: middlewareError.message 
    });
  }
});

app.get('/api/stats', performanceMiddleware('userStats'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    const stats = await userStats(null, 'me');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok:true, stats });
  } catch (error) {
    logger.error('Error fetching user stats', { error: error.message });
    res.status(500).json({ ok:false, err:'stats_error' });
  }
}));

// API: Get monitor status
app.get('/api/monitor-status', requireAuth, performanceMiddleware('monitorStatus'), asyncHandler(async (req, res) => {
  try {
    const status = getMonitorStatus();
    res.json({ 
      ok: true, 
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting monitor status', { error: error.message });
    res.status(500).json({ ok: false, err: 'monitor_error', message: error.message });
  }
}));

// API: Get rate limit stats
app.get('/api/rate-limits', requireAuth, performanceMiddleware('rateLimits'), getRateLimitStats);

// API: Check if rebuild is in progress
app.get('/api/rebuild-status', requireAuth, performanceMiddleware('rebuildStatus'), asyncHandler(async (req, res) => {
  try {
    const status = getMonitorStatus();
    res.json({ 
      ok: true, 
      isRebuilding: status.isUpdating || false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting rebuild status', { error: error.message });
    res.status(500).json({ ok: false, err: 'rebuild_status_error', message: error.message });
  }
}));

// API: Control activity monitor
app.post('/api/monitor/:action', requireAuth, performanceMiddleware('monitorControl'), asyncHandler(async (req, res) => {
  try {
    const { action } = req.params;
    
    if (action === 'start') {
      const interval = Number(req.body.interval || 30000);
      startActivityMonitor(interval);
      res.json({ ok: true, message: 'Monitor started', interval });
    } else if (action === 'stop') {
      stopActivityMonitor();
      res.json({ ok: true, message: 'Monitor stopped' });
    } else {
      res.status(400).json({ ok: false, error: 'Invalid action. Use start or stop' });
    }
  } catch (error) {
    logger.error('Error controlling monitor', { error: error.message });
    res.status(500).json({ ok: false, err: 'monitor_control_error', message: error.message });
  }
}));

// API: Force cache refresh check
app.post('/api/force-cache-check', requireAuth, csrfProtection, asyncHandler(async (req, res) => {
  try {
    const { traktId, kind } = req.body;
    
    if (!traktId || !kind) {
      return res.status(400).json({ ok: false, error: 'Missing traktId or kind' });
    }
    
    // Invalider le cache watching details backend
    const { invalidateWatchingCache } = await import('./lib/watchingDetails.js');
    invalidateWatchingCache(traktId, kind);
    
    // Invalider la carte spécifique et récupérer les nouvelles données
    const tok = await loadToken();
    const headers = traktHeaders(tok.access_token);
    const updatedCard = await updateSpecificCard(kind === 'movie' ? 'movie' : 'show', traktId, headers);
    
    // Broadcaster l'invalidation du cache watching details au frontend
    broadcastEvent('invalidate-watching-cache', traktId, { kind });
    
    res.json({ 
      ok: true, 
      message: 'Cache invalidated and refreshed',
      updatedCard: updatedCard
    });
    
  } catch (error) {
    logger.error('Error forcing cache check', { error: error.message });
    res.status(500).json({ ok: false, error: error.message });
  }
}));

// API: Get token status
app.get('/api/token-status', performanceMiddleware('tokenStatus'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    const token = await loadToken();
    if (!token?.access_token) {
      return res.json({ 
        ok: true,
        hasToken: false,
        needsAuth: true,
        message: 'No token found - authentication required'
      });
    }
    
    // Calculate expiration
    const now = Math.floor(Date.now() / 1000);
    const createdAt = token.created_at || now;
    const expiresIn = token.expires_in || (7776000); // Default 90 days
    const expiresAt = createdAt + expiresIn;
    const timeUntilExpiry = expiresAt - now;
    
    const status = {
      ok: true,
      hasToken: true,
      hasRefreshToken: !!token.refresh_token,
      expiresIn: timeUntilExpiry,
      expiresInHours: Math.floor(timeUntilExpiry / 3600),
      expiresInDays: Math.floor(timeUntilExpiry / 86400),
      needsRefresh: timeUntilExpiry < 86400, // Less than 24 hours
      expired: timeUntilExpiry <= 0
    };
    
    res.json(status);
  } catch (error) {
    logger.error('Error checking token status', { error: error.message });
    res.status(500).json({ ok: false, err: 'status_error', message: error.message });
  }
}));

// API: Refresh Trakt token
app.post('/api/refresh-token', requireAuth, performanceMiddleware('refreshToken'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    // Load current token
    const currentToken = await loadToken();
    if (!currentToken?.refresh_token) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No refresh token available',
        message: 'Please re-authenticate with Trakt'
      });
    }
    
    // Use ensureValidToken which handles refresh automatically
    const newToken = await ensureValidToken();
    
    if (newToken?.access_token) {
      // Save the new token
      await saveToken(newToken);
      
      // Update session if exists
      if (req.session) {
        req.session.trakt = newToken;
      }
      
      res.json({ 
        ok: true, 
        message: 'Token refreshed successfully',
        expires_in: newToken.expires_in,
        created_at: newToken.created_at
      });
    } else {
      res.status(500).json({ 
        ok: false, 
        error: 'Failed to refresh token',
        details: newToken
      });
    }
  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    res.status(500).json({ ok: false, err: 'refresh_error', message: error.message });
  }
}));

// API: Get last activities from Trakt
app.get('/api/last-activities', requireAuth, performanceMiddleware('lastActivities'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    // Call the Trakt API to get last activities
    const activities = await getLastActivities();
    
    res.setHeader('Cache-Control', 'no-store');
    res.json({ 
      ok: true, 
      activities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching last activities', { error: error.message });
    res.status(500).json({ ok: false, err: 'activities_error', message: error.message });
  }
}));

// API: Get watch history from Trakt
app.get('/api/history', requireAuth, performanceMiddleware('history'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    // Get query parameters
    const { 
      type = null,        // movies, shows, seasons, episodes (null = all)
      item_id = null,     // Trakt ID, Trakt slug, or IMDB ID
      start_at = null,    // ISO 8601 date-time
      end_at = null,      // ISO 8601 date-time  
      page = 1,           // Page number
      limit = 100          // Results per page (max 100)
    } = req.query;
    
    // Call the Trakt API using the dedicated function
    const history = await getHistory({
      type,
      itemId: item_id,
      startAt: start_at,
      endAt: end_at,
      page,
      limit
    });
    
    // Get pagination info
    const paginationInfo = {
      page: parseInt(page),
      limit: parseInt(limit),
      itemCount: history.length
    };
    
    res.setHeader('Cache-Control', 'no-store');
    res.json({ 
      ok: true, 
      history,
      pagination: paginationInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching history', { error: error.message });
    res.status(500).json({ ok: false, err: 'history_error', message: error.message });
  }
}));

app.get('/api/graph', performanceMiddleware('graphData'), asyncHandler(async (req, res) => {
  if (!hasValidCredentials()) {
    return res.status(412).json({ 
      ok: false, 
      error: 'Missing configuration',
      needsSetup: true 
    });
  }

  const year = Number(req.query.year) || (new Date()).getFullYear();
  const t = String(req.query.type || 'all');
  const type = (t === 'movies') ? 'movies' : (t === 'shows' ? 'shows' : 'all');

  // 1) essaie le cache (TTL 2h)
  const cached = await readGraphCache(type, year, 2 * 3600 * 1000);
  if (cached) {
    return res.json({ ok: true, data: cached, cached: true });
  }

  // 2) calcule avec les vraies données depuis les fichiers progress
  const data = await generateRealHeatmapData(year, type);

  // 3) mémorise
  await writeGraphCache(type, year, data);

  return res.json({ ok: true, data, cached: false });
}));

app.get('/api/stats/pro', requireAuth, performanceMiddleware('proStats'), asyncHandler(async (req, res) => {
  if (!hasValidCredentials()) {
    return res.status(412).json({ 
      ok: false, 
      error: 'Missing configuration',
      needsSetup: true 
    });
  }

  const range = String(req.query.range || 'lastDays');
  const year = req.query.year ? Number(req.query.year) : undefined;
  const lastDays = req.query.lastDays ? Number(req.query.lastDays) : 365;
  const t = String(req.query.type || 'all');
  const type = (t === 'movies') ? 'movies' : (t === 'shows' ? 'shows' : 'all');

  const key = range === 'year'
    ? `pro-year-${year}-${type}`
    : `pro-last-${lastDays}-${type}`;

  const cached = await readStatsCache(key, 12 * 3600 * 1000);
  if (cached) return res.json({ ok:true, data: cached, cached:true });

  const data = await computeStatsPro({ range, year, lastDays, type });
  await writeStatsCache(key, data);
  return res.json({ ok:true, data, cached:false });
}));

// API: Test endpoint pour /users/{id}/watching
app.get('/api/watching/:userId?', requireAuth, performanceMiddleware('watching'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    const userId = req.params.userId || 'me';
    const watching = await get(`/users/${userId}/watching`);
    
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, watching });
  } catch (error) {
    logger.error('Error fetching watching data', { error: error.message, userId: req.params.userId });
    
    // Check for authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('re-authenticate') || 
        error.status === 401 || error.statusCode === 401) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication expired', 
        needsAuth: true,
        message: 'Please re-authenticate with Trakt'
      });
    }
    
    res.status(500).json({ ok: false, error: 'Failed to fetch watching data' });
  }
}));

// API: Marquer un épisode comme vu
app.post('/api/mark-watched', requireAuth, csrfProtection, asyncHandler(async (req, res) => {
  const { trakt_id, season, number } = req.body;
  
  if (!trakt_id || !season || !number) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: trakt_id, season, number' });
  }
  
  try {
    const tok = await loadToken();
    if (!tok?.access_token) {
      return res.status(401).json({ ok: false, error: 'No Trakt token available' });
    }
    
    const headers = traktHeaders(tok.access_token);
    const result = await markEpisodeWatched({ trakt_id, season, number }, headers);
    
    if (result?.added?.episodes > 0) {
      logger.info('Episode marked as watched', { trakt_id, season, number });
      
      // Mise à jour granulaire de la carte spécifique uniquement
      const updatedCard = await updateSpecificCard('show', trakt_id, headers);
      
      // TODO: Invalidation sélective intelligente des caches (pas tout supprimer!)
      // await invalidateGlobalCaches(); // DESACTIVÉ pour ne pas casser heatmap/stats
      
      // Broadcast LIVE de la mise à jour à tous les clients connectés
      if (updatedCard) {
        broadcastCardUpdate('show', trakt_id, updatedCard);
      }
      
      return res.json({ 
        ok: true, 
        message: 'Episode marked as watched successfully',
        updatedCard: updatedCard
      });
    } else {
      logger.warn('Failed to mark episode as watched', { trakt_id, season, number, result });
      return res.status(400).json({ ok: false, error: 'Failed to mark episode as watched' });
    }
  } catch (error) {
    logger.error('Error marking episode as watched', { error: error.message, trakt_id, season, number });
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}));

// Endpoint pour retirer un épisode de l'historique
app.post('/api/unmark-watched', requireAuth, csrfProtection, asyncHandler(async (req, res) => {
  const { trakt_id, season, number } = req.body;
  
  if (!trakt_id || !season || !number) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: trakt_id, season, number' });
  }
  
  try {
    const tok = await loadToken();
    if (!tok?.access_token) {
      return res.status(401).json({ ok: false, error: 'No Trakt token available' });
    }
    
    const result = await removeEpisodeFromHistory({ trakt_id, season, number });
    
    if (result?.deleted?.episodes > 0) {
      logger.info('Episode removed from history', { trakt_id, season, number });
      
      // Mise à jour granulaire de la carte spécifique uniquement
      const tok = await loadToken();
      const headers = traktHeaders(tok.access_token);
      const updatedCard = await updateSpecificCard('show', trakt_id, headers);
      
      // TODO: Invalidation sélective intelligente des caches (pas tout supprimer!)
      // await invalidateGlobalCaches(); // DESACTIVÉ pour ne pas casser heatmap/stats
      
      // Broadcast LIVE de la mise à jour à tous les clients connectés
      if (updatedCard) {
        broadcastCardUpdate('show', trakt_id, updatedCard);
      }
      
      return res.json({ 
        ok: true, 
        message: 'Episode removed from history successfully',
        updatedCard: updatedCard
      });
    } else {
      logger.warn('Failed to remove episode from history', { trakt_id, season, number, result });
      return res.json({ ok: false, error: 'Failed to remove episode from history' });
    }
  } catch (error) {
    logger.error('Error removing episode from history', { error: error.message, trakt_id, season, number });
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}));

// Endpoint pour retirer un film de l'historique
app.post('/api/unmark-movie-watched', requireAuth, csrfProtection, asyncHandler(async (req, res) => {
  const { trakt_id, history_id } = req.body;
  
  if (!trakt_id) {
    return res.status(400).json({ ok: false, error: 'Missing required field: trakt_id' });
  }
  
  try {
    const tok = await loadToken();
    if (!tok?.access_token) {
      return res.status(401).json({ ok: false, error: 'No Trakt token available' });
    }
    
    const result = await removeMovieFromHistory({ trakt_id, history_id });
    
    if (result?.deleted?.movies > 0) {
      logger.info('Movie removed from history', { trakt_id });
      
      // Mise à jour granulaire de la carte spécifique uniquement
      const tok = await loadToken();
      const headers = traktHeaders(tok.access_token);
      const updatedCard = await updateSpecificCard('movie', trakt_id, headers);
      
      return res.json({ 
        ok: true, 
        message: 'Movie removed from history successfully',
        updatedCard: updatedCard
      });
    } else {
      logger.warn('Failed to remove movie from history', { trakt_id, result });
      return res.json({ ok: false, error: 'Failed to remove movie from history' });
    }
  } catch (error) {
    logger.error('Error removing movie from history', { error: error.message, trakt_id });
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}));

// Endpoint pour récupérer les shows/movies watched
app.get('/api/watched/:type', requireAuth, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const validTypes = ['shows', 'movies'];
  
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Use "shows" or "movies"' });
  }
  
  try {
    const data = await get(`/sync/watched/${type}`);
    res.json(data);
  } catch (error) {
    logger.error('Error fetching watched data', { error: error.message, type });
    res.status(500).json({ error: 'Failed to fetch watched data' });
  }
}));

// Endpoint optimisé avec le nouveau système granulaire
app.get('/api/show-data/:traktId', requireAuth, asyncHandler(async (req, res) => {
  const { traktId } = req.params;
  const traktIdNum = parseInt(traktId);
  
  if (!traktIdNum) {
    return res.status(400).json({ error: 'Invalid trakt ID' });
  }
  
  try {
    // Utiliser le nouveau système de cache granulaire
    const token = await loadToken();
    const headers = traktHeaders(token?.access_token);
    
    const card = await getOrBuildShowCard(traktIdNum, headers);
    
    if (!card) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Retourner seulement les données nécessaires
    const response = {
      episodes: card.episodes,
      episodes_total: card.episodes_total,
      missing: card.missing,
      next: card.next,
      next_episode_data: card.next_episode_data,
      last_watched_at: card.last_watched_at
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Error fetching show data', { error: error.message, traktId });
    res.status(500).json({ error: 'Failed to fetch show data' });
  }
}));

app.post('/api/mark-movie-watched', requireAuth, csrfProtection, asyncHandler(async (req, res) => {
  const { trakt_id } = req.body;
  
  if (!trakt_id) {
    return res.status(400).json({ ok: false, error: 'Missing required field: trakt_id' });
  }
  
  try {
    const tok = await loadToken();
    if (!tok?.access_token) {
      return res.status(401).json({ ok: false, error: 'No Trakt token available' });
    }
    
    const headers = traktHeaders(tok.access_token);
    const result = await markMovieWatched({ trakt_id }, headers);
    
    if (result?.added?.movies > 0) {
      logger.info('Movie marked as watched', { trakt_id });
      
      // Mise à jour granulaire de la carte spécifique uniquement
      const updatedCard = await updateSpecificCard('movie', trakt_id, headers);
      
      // TODO: Invalidation sélective intelligente des caches (pas tout supprimer!)
      // await invalidateGlobalCaches(); // DESACTIVÉ pour ne pas casser heatmap/stats
      
      // Broadcast LIVE de la mise à jour à tous les clients connectés
      if (updatedCard) {
        broadcastCardUpdate('movie', trakt_id, updatedCard);
      }
      
      return res.json({ 
        ok: true, 
        message: 'Movie marked as watched successfully',
        updatedCard: updatedCard
      });
    } else {
      logger.warn('Failed to mark movie as watched', { trakt_id, result });
      return res.status(400).json({ ok: false, error: 'Failed to mark movie as watched' });
    }
  } catch (error) {
    logger.error('Error marking movie as watched', { error: error.message, trakt_id });
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}));

// Setup route - Configuration initiale
app.get('/setup', asyncHandler(async (req, res) => {
  const envStatus = checkEnvFile();
  
  if (envStatus.exists && envStatus.valid) {
    return res.redirect('/');
  }
  
  // Préparer les valeurs par défaut depuis les variables d'environnement existantes
  const currentConfig = {
    port: process.env.PORT || '30009',
    traktclientid: process.env.TRAKT_CLIENT_ID || '',
    traktclientsecret: process.env.TRAKT_CLIENT_SECRET || '',
    oauthredirecturi: process.env.OAUTH_REDIRECT_URI || '',
    tmdbapikey: process.env.TMDB_API_KEY || '',
    language: process.env.LANGUAGE || 'fr-FR',
    fullrebuildpassword: '', // Ne pas pré-remplir les mots de passe pour la sécurité
    enableauth: process.env.AUTH_ENABLED === 'true',
    authusername: process.env.AUTH_USERNAME || '',
    authpassword: '' // Ne pas pré-remplir les mots de passe
  };
  
  const templatePath = path.resolve('public/setup.html');
  const html = await renderTemplate(templatePath, {
    csrf_token: req.session.csrfToken || '',
    ...currentConfig
  });
  res.send(html);
}));

// Loading page route
app.get('/loading', asyncHandler(async (req, res) => {
  const templatePath = path.resolve('public/loading.html');
  const html = await renderTemplate(templatePath, {
    csrf_token: req.session.csrfToken || ''
  });
  res.send(html);
}));

// API pour récupérer les données du calendrier historique - utilise l'API individuelle qui fonctionne
app.get('/api/calendar/history', requireAuth, performanceMiddleware('calendarHistory'), asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  
  // Validation des paramètres
  if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
    return res.status(400).json({ 
      ok: false, 
      error: 'start_date parameter required in YYYY-MM-DD format' 
    });
  }
  
  if (!end_date || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
    return res.status(400).json({ 
      ok: false, 
      error: 'end_date parameter required in YYYY-MM-DD format' 
    });
  }
  
  try {
    const allWatchings = [];
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const currentDate = new Date(startDate);
    
    // Parcourir chaque jour de la période et utiliser l'API individuelle qui marche
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().slice(0, 10);
      
      try {
        // Appeler directement la fonction qui marche - elle retourne directement un tableau
        const dayWatchings = await getWatchingsByDate(dateStr);
        if (dayWatchings && dayWatchings.length > 0) {
          allWatchings.push(...dayWatchings);
        }
      } catch (err) {
        // Ignorer les erreurs pour les dates individuelles
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    res.json({
      ok: true,
      watchings: allWatchings,
      period: {
        start: start_date,
        end: end_date,
        count: allWatchings.length
      }
    });
    
  } catch (err) {
    logger.error('Erreur API calendar history:', err);
    res.status(500).json({ 
      ok: false,
      error: 'Erreur interne du serveur' 
    });
  }
}));

// API pour récupérer les visionnages d'une date
app.get('/api/watchings-by-date/:date', requireAuth, performanceMiddleware('watchingsByDate'), asyncHandler(async (req, res) => {
  const { date } = req.params;
  
  // Validation format date YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ 
      error: 'Format de date invalide. Utilisez YYYY-MM-DD' 
    });
  }
  
  try {
    const watchings = await getWatchingsByDate(date);
    
    res.json({
      date,
      count: watchings.length,
      watchings
    });
    
  } catch (err) {
    logger.error('Erreur API watchings-by-date:', err);
    res.status(500).json({ 
      error: 'Erreur interne du serveur' 
    });
  }
}));

// API: Calendrier des sorties Trakt
app.get('/api/calendar', requireAuth, performanceMiddleware('calendar'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }

    // Récupérer les paramètres de date
    const startDate = req.query.start_date || new Date().toISOString().slice(0, 10);
    const days = parseInt(req.query.days) || 7;

    // Valider les paramètres
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({ 
        error: 'Format de date invalide. Utilisez YYYY-MM-DD' 
      });
    }

    if (days < 1 || days > 31) {
      return res.status(400).json({ 
        error: 'Le nombre de jours doit être entre 1 et 31' 
      });
    }

    // Appeler l'API Trakt calendars/my/shows
    const calendarData = await get(`/calendars/my/shows/${startDate}/${days}`);
    
    // Enrichir avec les posters si possible
    if (calendarData && Array.isArray(calendarData)) {
      const { posterFromTraktId } = await import('./lib/tmdb.js');
      
      for (const dayEntry of calendarData) {
        if (dayEntry.show && dayEntry.show.ids && dayEntry.show.ids.trakt) {
          const poster = await posterFromTraktId(dayEntry.show.ids.trakt, 'show');
          if (poster) {
            dayEntry.show.poster = poster;
          }
        }
      }
    }

    res.json({
      ok: true,
      start_date: startDate,
      days,
      calendar: calendarData || []
    });
    
  } catch (err) {
    logger.error('Erreur API calendar:', err);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération du calendrier',
      details: err.message 
    });
  }
}));

// API: Récupérer la progression de lecture (playback progress)
app.get('/api/playback', requireAuth, performanceMiddleware('playback'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    const playback = await get('/sync/playback');
    
    // Enrichir chaque item avec l'URL du poster si disponible
    if (playback && Array.isArray(playback)) {
      const { posterFromTraktId } = await import('./lib/tmdb.js');
      
      for (const item of playback) {
        const traktId = item.type === 'movie' 
          ? item.movie?.ids?.trakt 
          : item.show?.ids?.trakt;
        
        if (traktId) {
          const posterUrl = await posterFromTraktId(traktId);
          if (posterUrl) {
            if (item.type === 'movie') {
              item.movie.poster = posterUrl;
            } else {
              if (!item.show) item.show = {};
              item.show.poster = posterUrl;
            }
          }
        }
      }
    }
    
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, playback });
  } catch (error) {
    logger.error('Error fetching playback progress', { error: error.message });
    
    // Check for authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('re-authenticate') || 
        error.status === 401 || error.statusCode === 401) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication expired', 
        needsAuth: true,
        message: 'Please re-authenticate with Trakt'
      });
    }
    
    res.status(500).json({ ok: false, error: 'Failed to fetch playback progress' });
  }
}));

// API: Supprimer un élément de progression de lecture (remove playback item)
app.delete('/api/playback/:id', performanceMiddleware('playback-remove'), asyncHandler(async (req, res) => {
  try {
    if (!hasValidCredentials()) {
      return res.status(412).json({ 
        ok: false, 
        error: 'Missing configuration',
        needsSetup: true 
      });
    }
    
    const { id } = req.params;
    
    // Validation de l'ID
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid playback ID. Must be a numeric value.' 
      });
    }
    
    // Appel à l'API Trakt pour supprimer l'élément de progression
    const result = await del(`/sync/playback/${id}`);
    
    res.json({ 
      ok: true, 
      message: 'Playback item removed successfully',
      id: parseInt(id),
      result
    });
  } catch (error) {
    logger.error('Error removing playback item', { error: error.message, id: req.params.id });
    res.status(500).json({ ok: false, error: 'Failed to remove playback item' });
  }
}));

// Debug cache stats (développement uniquement)
app.get('/api/watchings-cache-stats', requireAuth, (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    res.json(getCacheStats());
  } else {
    res.status(404).json({ error: 'Non disponible en production' });
  }
});

// API: Détails de visionnage pour films et séries
app.get('/api/watching-details/:kind/:traktId', requireAuth, asyncHandler(async (req, res) => {
  const { kind, traktId } = req.params;
  
  // Validation des paramètres
  if (!['movie', 'show'].includes(kind)) {
    return res.status(400).json({ 
      error: 'Type invalide. Utilisez "movie" ou "show".' 
    });
  }
  
  if (!traktId || !/^\d+$/.test(traktId)) {
    return res.status(400).json({ 
      error: 'ID Trakt invalide' 
    });
  }
  
  try {
    let details;
    
    if (kind === 'movie') {
      details = await getMovieWatchingDetails(traktId);
    } else {
      details = await getShowWatchingDetails(traktId);
    }
    
    // Pas de cache côté client pour que les données se mettent à jour immédiatement
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    res.json(details);
    
  } catch (err) {
    logger.error('Erreur API watching-details:', err);
    res.status(500).json({ 
      error: 'Erreur interne du serveur' 
    });
  }
}));

// Server-Sent Events pour les mises à jour live de cartes
app.get('/api/live-events', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Accel-Buffering': 'no' // Nginx fix pour SSE
  });
  
  // Ajouter le client à la liste des connexions live
  liveClients.add(res);
  console.log(`[SSE] Client connected, total: ${liveClients.size}`);
  
  // Envoyer un événement de connexion initiale
  res.write('data: {"type":"connected","timestamp":' + Date.now() + '}\n\n');
  
  // Nettoyer les connexions fermées
  req.on('close', () => {
    liveClients.delete(res);
    console.log(`[SSE] Client disconnected, total: ${liveClients.size}`);
  });
  
  req.on('error', () => {
    liveClients.delete(res);
    console.log(`[SSE] Client error, disconnected, total: ${liveClients.size}`);
  });
  
  // Heartbeat pour maintenir la connexion
  const heartbeat = setInterval(() => {
    try {
      res.write('data: {"type":"heartbeat","timestamp":' + Date.now() + '}\n\n');
    } catch (error) {
      clearInterval(heartbeat);
      liveClients.delete(res);
      console.warn(`[SSE] Heartbeat failed, client disconnected`);
    }
  }, 30000); // 30 secondes
  
  req.on('close', () => clearInterval(heartbeat));
});

// API: Search movies via TheMovieDB
app.get('/api/search/movies', performanceMiddleware('searchMovies'), asyncHandler(async (req, res) => {
  const { q, lang } = req.query;
  
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters long' });
  }

  try {
    const searchResults = await tmdbSearch('movie', q.trim(), null, lang);
    
    if (!searchResults) {
      return res.status(503).json({ error: 'TheMovieDB service unavailable' });
    }

    res.json(searchResults);
  } catch (error) {
    console.error('Movie search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// API: Search TV shows via TheMovieDB  
app.get('/api/search/tv', performanceMiddleware('searchTV'), asyncHandler(async (req, res) => {
  const { q, lang } = req.query;
  
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters long' });
  }

  try {
    const searchResults = await tmdbSearch('tv', q.trim(), null, lang);
    
    if (!searchResults) {
      return res.status(503).json({ error: 'TheMovieDB service unavailable' });
    }

    res.json(searchResults);
  } catch (error) {
    console.error('TV search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// API: Add movie/show to Trakt history
app.post('/api/add-to-history', requireAuth, csrfProtection, asyncHandler(async (req, res) => {
  const { type, title, year, tmdb_id, watched_at } = req.body;
  
  if (!type || !title || !watched_at) {
    return res.status(400).json({ error: 'Missing required fields: type, title, watched_at' });
  }
  
  if (!['movie', 'show'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "movie" or "show"' });
  }
  
  try {
    const result = await addToHistory({
      type,
      title,
      year,
      tmdb_id,
      watched_at
    });
    
    // Check if addition was successful
    const added = type === 'movie' ? result.added?.movies : result.added?.shows;
    if (added && added > 0) {
      res.json({ 
        success: true, 
        message: `Successfully added ${title} to history`,
        result: result
      });
    } else {
      // Item might already be in history or other issue
      res.json({ 
        success: false, 
        message: `Item may already be in history or could not be added`,
        result: result
      });
    }
    
  } catch (error) {
    console.error('[API] Add to history error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to add item to history' 
    });
  }
}));

// API pour vérifier s'il y a des changements récents (fallback pour SSE)
app.get('/api/live-status', requireAuth, (req, res) => {
  try {
    console.log('[API] /live-status called, getting monitor status...');
    const status = getMonitorStatus();
    console.log('[API] Monitor status:', JSON.stringify(status, null, 2));
    
    const response = {
      hasRecentChanges: status.hasRecentExternalChanges || false,
      monitorRunning: status.running,
      isUpdating: status.isUpdating,
      lastCheck: status.lastCheckTimestamp
    };
    
    console.log('[API] /live-status response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('[API] /live-status error:', error.message, error.stack);
    res.json({ hasRecentChanges: false, error: error.message });
  }
});

// Server-Sent Events pour le progrès de chargement
app.get('/api/loading-progress', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  addProgressConnection(res);
  
  // Envoyer un événement initial
  res.write('data: {"step": "auth", "status": "completed", "message": "Token vérifié"}\n\n');
  
  // Démarrer le chargement des données automatiquement
  setTimeout(async () => {
    try {
      const reqLike = { session: req.session || {} };
      const allowFull = !!req.session.allowFull;
      const forceRefreshOnce = true; // Toujours forcer le refresh sur la page de loading
      const fullRebuildTriggered = !!req.session.fullRebuildTriggered;
      
      
      // Nettoyer les flags de session après les avoir lus
      delete req.session.allowFull;
      delete req.session.forceRefreshOnce;
      delete req.session.fullRebuildTriggered;
      
      // Utiliser le nouveau système de cache granulaire
      const token = await loadToken();
      const headers = traktHeaders(token?.access_token);
      await buildPageDataGranular(headers);
    } catch (error) {
      console.error('Error during initial data loading:', error);
      res.write(`data: {"step": "final", "status": "error", "message": "Erreur: ${error.message}"}\n\n`);
      res.end();
    }
  }, 1000);
});

app.post('/setup', csrfProtection, asyncHandler(async (req, res) => {
  try {
    const config = req.body;
    
    // Validation basique
    if (!config.traktClientId || !config.traktClientSecret || !config.tmdbApiKey || !config.fullRebuildPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tous les champs sont requis' 
      });
    }
    
    // Générer le fichier .env
    const success = generateEnvFile(config);
    
    if (success) {
      // Injecter en mémoire pour utilisation immédiate sans redémarrage
      process.env.TRAKT_CLIENT_ID = config.traktClientId || '';
      process.env.TRAKT_CLIENT_SECRET = config.traktClientSecret || '';
      process.env.TMDB_API_KEY = config.tmdbApiKey || '';
      process.env.LANGUAGE = config.language || 'fr-FR';
      if (config.fullRebuildPassword) process.env.FULL_REBUILD_PASSWORD = config.fullRebuildPassword;
      if (config.oauthRedirectUri) process.env.OAUTH_REDIRECT_URI = config.oauthRedirectUri;
      
      // Gestion de l'authentification
      const authEnabled = config.enableAuth === true || config.enableAuth === 'on' || config.enableAuth === 'true';
      process.env.AUTH_ENABLED = authEnabled ? 'true' : 'false';
      if (authEnabled) {
        process.env.AUTH_USERNAME = config.authUsername || '';
        process.env.AUTH_PASSWORD = config.authPassword || '';
      }
      
      // Recharger les exports dynamiques du module config
      try { reloadEnv(); } catch {}
      
      logger.info('Configuration file created successfully');
      res.json({ success: true, message: 'Configuration créée avec succès' });
    } else {
      res.status(500).json({ success: false, error: 'Erreur lors de la création du fichier .env' });
    }
    
  } catch (error) {
    logger.error('Setup error:', error);
    res.status(500).json({ success: false, error: 'Erreur interne du serveur' });
  }
}));

// Routes de login/logout
app.get('/login', (req, res) => {
  // Si déjà connecté, rediriger vers la page principale
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  
  const loginPath = path.join(process.cwd(), 'public', 'login.html');
  const loginHTML = fs.readFileSync(loginPath, 'utf8');
  const htmlWithCSRF = loginHTML.replace(/<!-- CSRF_TOKEN -->/g, req.session?.csrfToken || '');
  res.send(htmlWithCSRF);
});

app.post('/login', csrfProtection, asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  
  // Vérifier les credentials
  const isValidUsername = username === process.env.AUTH_USERNAME;
  const isValidPassword = verifyPassword(password, process.env.AUTH_PASSWORD);
  
  if (isValidUsername && isValidPassword) {
    // Authentification réussie
    req.session.authenticated = true;
    req.session.username = username;
    
    logger.info(`User logged in: ${username}`);
    res.json({ success: true, message: 'Login successful' });
  } else {
    // Authentification échouée
    logger.warn(`Failed login attempt for username: ${username}`);
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
}));

app.get('/logout', (req, res) => {
  if (req.session) {
    const username = req.session.username;
    req.session.destroy((err) => {
      if (err) {
        logger.error('Error destroying session:', err);
      } else {
        logger.info(`User logged out: ${username}`);
      }
    });
  }
  res.redirect('/login');
});

// Main page (static HTML)
app.get('/', asyncHandler(async (req, res) => {
  // Vérifier si la configuration existe
  const envStatus = checkEnvFile();
  
  if (!envStatus.exists || !envStatus.valid) {
    return res.redirect('/setup');
  }
  
  const templatePath = path.resolve('public/app.html');
  const html = await renderTemplate(templatePath, {
    csrf_token: req.session.csrfToken || '',
    auth_enabled: process.env.AUTH_ENABLED === 'true'
  });
  res.send(html);
}));


// Middleware de gestion d'erreurs (doit être le dernier)
app.use(errorHandlingMiddleware);

const server = app.listen(PORT, () => {
  logger.info(`Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  });
  console.log(`→ http://localhost:${PORT}`);

  // Crée le refresher (utilise la même logique que /refresh)
  const refresher = makeRefresher(async (reason) => {
    const reqLike = {
      session: {},
      protocol: 'http',
      headers: { host: await getPublicHost(PORT) },
      get(name){ return this.headers[String(name).toLowerCase()]; }
    };
    
    // 🚨 SURVEILLANCE PROACTIVE DES TOKENS
    console.log(`[refresh] Starting refresh cycle (${reason})`);
    
    if (!hasValidCredentials()) {
      console.log('[refresh] Skipping - Trakt credentials not configured');
      return;
    }
    
    try {
      // Vérifier et rafraîchir le token AVANT de faire les appels API
      console.log('[refresh] Checking token validity...');
      const validToken = await ensureValidToken();
      
      if (!validToken?.access_token) {
        console.warn('[refresh] No valid token available - skipping data refresh');
        return;
      }
      
      console.log('[refresh] Token is valid, proceeding with data refresh');
      const headers = traktHeaders(validToken.access_token);
      await buildPageDataGranular(headers);
      
    } catch (error) {
      console.error('[refresh] Token validation/refresh failed:', error.message);
      
      // Si c'est une erreur d'authentification, ne pas faire planter le refresh
      if (error.message?.includes('authentication') || error.message?.includes('re-authenticate')) {
        console.warn('[refresh] Authentication error - users will need to re-authenticate');
      } else {
        // Pour les autres erreurs, les remonter
        throw error;
      }
    }
  });

  // lance : 1ère exécution immédiate, puis toutes les heures
  const EVERY = Number(process.env.REFRESH_EVERY_MS || 60*60*1000);
  const JITTER = Math.floor(Math.random() * 5000); // petit jitter optionnel
  refresher.schedule({ intervalMs: EVERY, initialDelayMs: JITTER });

  // Configure broadcast functions for activity monitor
  setBroadcastFunction(broadcastCardUpdate, broadcastEvent);
  console.log('[monitor] Broadcast functions configured for external change detection');
  
  // Start activity monitor (5 minutes par défaut, configurable via env)
  if (hasValidCredentials()) {
    const MONITOR_INTERVAL = Number(process.env.ACTIVITY_MONITOR_INTERVAL_MS || 300000); // 5 minutes par défaut
    startActivityMonitor(MONITOR_INTERVAL);
    console.log(`[monitor] Activity monitor started with LIVE UPDATES (checking every ${MONITOR_INTERVAL / 1000}s)`);
  } else {
    console.log('[monitor] Activity monitor not started (missing Trakt credentials)');
  }

  // (optionnel) endpoint manuel pour tester en live
  app.post('/_debug/refresh', asyncHandler(async (_req, res) => {
    logger.info('Manual refresh triggered via debug endpoint');
    await refresher.refreshNow('manual');
    res.json({ ok: true, timestamp: new Date().toISOString() });
  }));
});

// Initialiser le serveur WebSocket sur le même serveur HTTP
wss = new WebSocketServer({ server, path: '/ws/live' });

const WS_CLOSE = { AUTH_REQUIRED: 4001 };

wss.on('connection', async (ws, req) => {
  try {
    // Vérifier l'authentification (mono-utilisateur global)
    const token = await ensureValidToken().catch(() => null);
    if (!token?.access_token) {
      try { ws.close(WS_CLOSE.AUTH_REQUIRED, 'auth-required'); } catch {}
      return;
    }

    // Marquer comme vivant et envoyer un message de connexion
    ws.isAlive = true;
    try { ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() })); } catch {}

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', () => { /* no-op for now */ });
  } catch (err) {
    try { ws.close(1011, 'server-error'); } catch {}
  }
});

// Heartbeat: ping régulier pour nettoyer les connexions mortes
const wsHeartbeat = setInterval(() => {
  if (!wss) return;
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignore */ }
  });
}, 30000);

wss.on('close', () => clearInterval(wsHeartbeat));

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down gracefully...');
  stopActivityMonitor();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received, shutting down gracefully...');
  stopActivityMonitor();
  process.exit(0);
});
