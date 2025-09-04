import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
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

import { DATA_DIR, IMG_DIR, SESSIONS_DIR, PORT, FULL_REBUILD_PASS, TITLE, reloadEnv } from './lib/config.js';
import { saveToken, deviceToken, headers as traktHeaders, loadToken, userStats, markEpisodeWatched, markMovieWatched, hasValidCredentials, get, del, getLastActivities, getHistory, ensureValidToken } from './lib/trakt.js';
import { buildPageData, invalidatePageCache, updateShowInCache } from './lib/pageData.js';
import { makeRefresher, loadDeviceCode, clearDeviceCode, getPublicHost } from './lib/util.js';
import { dailyCounts } from './lib/graph.js';
import { imageProxyRouter } from './lib/sharp.js';
import { readGraphCache, writeGraphCache } from './lib/graphCache.js';
import { computeStatsPro } from './lib/statsPro.js';
import { readStatsCache, writeStatsCache } from './lib/statsCache.js';
import { getWatchingsByDate, getCacheStats } from './lib/watchingsByDate.js';
import { generateRealHeatmapData } from './lib/heatmapData.js';
import { getMovieWatchingDetails, getShowWatchingDetails } from './lib/watchingDetails.js';
import { renderTemplate } from './lib/template.js';
import { checkEnvFile, generateEnvFile } from './lib/setup.js';
import { addProgressConnection, sendProgress, sendCompletion } from './lib/progressTracker.js';
import { startActivityMonitor, stopActivityMonitor, getMonitorStatus } from './lib/activityMonitor.js';

dotenv.config();

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
    secure: false, // Force HTTP pour compatibilité Unraid
    sameSite: 'lax' // Plus permissif pour Docker
  },
  name: 'trakt.sid' // Nom personnalisé pour masquer Express
}));

// Middleware CSRF après les sessions
app.use(csrfTokenMiddleware);

// I18n middleware
app.use(serverI18n.middleware());

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

app.use('/img', imageProxyRouter({
  cacheDir: path.resolve(process.cwd(), 'data', 'processed_imgs'),
  allowedPrefixes: ['/cache_imgs/', 'https://image.tmdb.org/t/p/']
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
      csrf_token: req.session?.csrf_token,
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
  if (!FULL_REBUILD_PASS) {
    req.session.flash = 'Mot de passe de full rebuild non configuré côté serveur.';
    res.redirect('/');
  } else if (pwd !== FULL_REBUILD_PASS) {
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
app.get('/api/data', performanceMiddleware('buildPageData'), asyncHandler(async (req, res) => {
  const flash = req.session.flash || null;
  delete req.session.flash;

  const forceRefreshOnce = !!req.session.forceRefreshOnce;
  const allowFull = !!req.session.allowFull;
  delete req.session.forceRefreshOnce;
  delete req.session.allowFull;

  const pageData = await buildPageData(req, { forceRefreshOnce, allowFull });
  
  // Si les credentials sont manquants, rediriger vers setup
  if (pageData.needsSetup) {
    return res.status(412).json({ 
      ok: false, 
      error: 'Missing configuration',
      needsSetup: true,
      redirectTo: '/setup'
    });
  }
  
  res.setHeader('Cache-Control', 'no-store');
  res.json({ title: TITLE, flash, ...pageData });
}));

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
app.get('/api/monitor-status', performanceMiddleware('monitorStatus'), asyncHandler(async (req, res) => {
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

// API: Check if rebuild is in progress
app.get('/api/rebuild-status', performanceMiddleware('rebuildStatus'), asyncHandler(async (req, res) => {
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
app.post('/api/monitor/:action', performanceMiddleware('monitorControl'), asyncHandler(async (req, res) => {
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
app.post('/api/refresh-token', performanceMiddleware('refreshToken'), asyncHandler(async (req, res) => {
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
app.get('/api/last-activities', performanceMiddleware('lastActivities'), asyncHandler(async (req, res) => {
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
app.get('/api/history', performanceMiddleware('history'), asyncHandler(async (req, res) => {
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
      limit = 10          // Results per page (max 100)
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

  // 1) essaie le cache (TTL 24h)
  const cached = await readGraphCache(type, year, 24 * 3600 * 1000);
  if (cached) {
    return res.json({ ok: true, data: cached, cached: true });
  }

  // 2) calcule avec les vraies données depuis les fichiers progress
  const data = await generateRealHeatmapData(year, type);

  // 3) mémorise
  await writeGraphCache(type, year, data);

  return res.json({ ok: true, data, cached: false });
}));

app.get('/api/stats/pro', performanceMiddleware('proStats'), asyncHandler(async (req, res) => {
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
app.get('/api/watching/:userId?', performanceMiddleware('watching'), asyncHandler(async (req, res) => {
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
    res.status(500).json({ ok: false, error: 'Failed to fetch watching data' });
  }
}));

// API: Marquer un épisode comme vu
app.post('/api/mark-watched', csrfProtection, asyncHandler(async (req, res) => {
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
      
      // Mettre à jour uniquement cette série dans le cache (plus rapide)
      await updateShowInCache(trakt_id, headers);
      
      return res.json({ ok: true, message: 'Episode marked as watched successfully' });
    } else {
      logger.warn('Failed to mark episode as watched', { trakt_id, season, number, result });
      return res.status(400).json({ ok: false, error: 'Failed to mark episode as watched' });
    }
  } catch (error) {
    logger.error('Error marking episode as watched', { error: error.message, trakt_id, season, number });
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}));

app.post('/api/mark-movie-watched', csrfProtection, asyncHandler(async (req, res) => {
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
      
      // Invalider le cache pour forcer le refresh
      await invalidatePageCache();
      
      return res.json({ ok: true, message: 'Movie marked as watched successfully' });
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
  
  const templatePath = path.resolve('public/setup.html');
  const html = await renderTemplate(templatePath, {
    csrf_token: req.session.csrfToken || ''
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

// API pour récupérer les visionnages d'une date
app.get('/api/watchings-by-date/:date', performanceMiddleware('watchingsByDate'), asyncHandler(async (req, res) => {
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

// API: Récupérer la progression de lecture (playback progress)
app.get('/api/playback', performanceMiddleware('playback'), asyncHandler(async (req, res) => {
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
app.get('/api/watchings-cache-stats', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    res.json(getCacheStats());
  } else {
    res.status(404).json({ error: 'Non disponible en production' });
  }
});

// API: Détails de visionnage pour films et séries
app.get('/api/watching-details/:kind/:traktId', asyncHandler(async (req, res) => {
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
    
    // Cache côté client possible car ces données changent rarement
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1h
    
    res.json(details);
    
  } catch (err) {
    logger.error('Erreur API watching-details:', err);
    res.status(500).json({ 
      error: 'Erreur interne du serveur' 
    });
  }
}));

// Server-Sent Events pour le progrès de chargement
app.get('/api/loading-progress', (req, res) => {
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
      
      await buildPageData(reqLike, { forceRefreshOnce, allowFull });
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

// Main page (static HTML)
app.get('/', asyncHandler(async (req, res) => {
  // Vérifier si la configuration existe
  const envStatus = checkEnvFile();
  
  if (!envStatus.exists || !envStatus.valid) {
    return res.redirect('/setup');
  }
  
  const templatePath = path.resolve('public/app.html');
  const html = await renderTemplate(templatePath, {
    csrf_token: req.session.csrfToken || ''
  });
  res.send(html);
}));


// Middleware de gestion d'erreurs (doit être le dernier)
app.use(errorHandlingMiddleware);

app.listen(PORT, () => {
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
    await buildPageData(reqLike, { forceRefreshOnce: true, allowFull: false });
  });

  // lance : 1ère exécution immédiate, puis toutes les heures
  const EVERY = Number(process.env.REFRESH_EVERY_MS || 60*60*1000);
  const JITTER = Math.floor(Math.random() * 5000); // petit jitter optionnel
  refresher.schedule({ intervalMs: EVERY, initialDelayMs: JITTER });

  // Start activity monitor (30 seconds interval)
  if (hasValidCredentials()) {
    const MONITOR_INTERVAL = Number(process.env.ACTIVITY_MONITOR_INTERVAL_MS || 30000);
    startActivityMonitor(MONITOR_INTERVAL);
    console.log(`[monitor] Activity monitor started (checking every ${MONITOR_INTERVAL / 1000}s)`);
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
