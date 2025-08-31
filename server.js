import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Import du système de monitoring et sécurité
import { logger } from './lib/logger.js';
import { requestLoggingMiddleware, errorHandlingMiddleware, performanceMiddleware, asyncHandler } from './lib/middleware.js';
import { securityHeaders, csrfTokenMiddleware, csrfProtection, attackDetection, rateLimitByIP } from './lib/security.js';


import { DATA_DIR, IMG_DIR, PORT, FULL_REBUILD_PASS, TITLE } from './lib/config.js';
import { saveToken, deviceToken } from './lib/trakt.js';
import { buildPageData } from './lib/pageData.js';
import { makeRefresher } from './lib/util.js';
import { headers as traktHeaders } from './lib/trakt.js';
import { loadToken as loadTraktToken, userStats } from './lib/trakt.js';
import { dailyCounts } from './lib/graph.js';
import { loadToken } from './lib/trakt.js';
import { imageProxyRouter } from './lib/sharp.js';
import { readGraphCache, writeGraphCache } from './lib/graphCache.js';
import { computeStatsPro } from './lib/statsPro.js';
import { readStatsCache, writeStatsCache } from './lib/statsCache.js';
import { renderTemplate } from './lib/template.js';

dotenv.config();

const app = express();

// Trust proxy pour obtenir les vraies IPs derrière un reverse proxy
app.set('trust proxy', 1);

// Middleware de sécurité (en premier)
app.use(securityHeaders);
app.use(attackDetection);
app.use(rateLimitByIP);

// Middleware de monitoring
app.use(requestLoggingMiddleware);

// Remplacer Morgan par notre système de logging (Morgan reste pour le développement)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('tiny'));
}

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Session sécurisée
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { 
    maxAge: 24*60*60*1000, // 24h au lieu de 7 jours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  },
  name: 'trakt.sid' // Nom personnalisé pour masquer Express
}));

// Middleware CSRF après les sessions
app.use(csrfTokenMiddleware);

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


app.use('/assets', express.static(path.join(process.cwd(), 'public', 'assets')));
app.use('/public', express.static(path.join(DATA_DIR, '..', 'public'), { maxAge: '30d' }));

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
    version: process.env.npm_package_version || '1.5.0',
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

// OAuth helper routes
app.get('/oauth/poll', asyncHandler(async (req, res) => {
  const dc = req.session.device_code;
  if (!dc?.device_code) return res.json({ ok:false, err:'no_device_code' });
  const tok = await deviceToken(dc.device_code, dc._client_id, dc._client_secret);
  if (tok?.access_token) {
    req.session.trakt = tok;
    await saveToken(tok);
    return res.json({ ok:true });
  }
  if (tok?.error) {
    const err = String(tok.error);
    const fatal = ['expired_token','access_denied','invalid_grant','invalid_client','unsupported_grant_type'].includes(err);
    return res.json({ ok:false, err, fatal });
  }
  return res.json({ ok:false, err:'network_or_empty_response', fatal:false });
}));

app.get('/oauth/new', (req, res) => { delete req.session.device_code; res.redirect('/'); });

// Refresh / Full rebuild
app.post('/refresh', csrfProtection, (req, res) => { req.session.forceRefreshOnce = true; res.redirect('/'); });
app.post('/full_rebuild', csrfProtection, (req, res) => {
  const pwd = String(req.body.pwd || '');
  if (!FULL_REBUILD_PASS) req.session.flash = 'Mot de passe de full rebuild non configuré côté serveur.';
  else if (pwd !== FULL_REBUILD_PASS) req.session.flash = 'Mot de passe incorrect.';
  else { req.session.allowFull = true; req.session.flash = 'Full rebuild autorisé ✅'; }
  res.redirect('/');
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
  res.setHeader('Cache-Control', 'no-store');
  res.json({ title: TITLE, flash, ...pageData });
}));

app.get('/api/stats', performanceMiddleware('userStats'), asyncHandler(async (req, res) => {
  const tok = await loadTraktToken();
  if (!tok?.access_token) return res.status(401).json({ ok:false, err:'no_token' });
  const headers = traktHeaders(tok.access_token);
  const stats = await userStats(headers, 'me');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok:true, stats });
}));

app.get('/api/graph', performanceMiddleware('graphData'), asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || (new Date()).getFullYear();
  const t = String(req.query.type || 'all');
  const type = (t === 'movies') ? 'movies' : (t === 'shows' ? 'shows' : 'all');

  // 1) essaie le cache (TTL 24h)
  const cached = await readGraphCache(type, year, 24 * 3600 * 1000);
  if (cached) {
    return res.json({ ok: true, data: cached, cached: true });
  }

  // 2) calcule si pas en cache
  const data = await dailyCounts({ type, year });

  // 3) mémorise
  await writeGraphCache(type, year, data);

  return res.json({ ok: true, data, cached: false });
}));

app.get('/api/stats/pro', performanceMiddleware('proStats'), asyncHandler(async (req, res) => {
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


// Main page (static HTML)
app.get('/', asyncHandler(async (req, res) => {
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
      headers: { host: process.env.PUBLIC_HOST || `localhost:${PORT}` },
      get(name){ return this.headers[String(name).toLowerCase()]; }
    };
    await buildPageData(reqLike, { forceRefreshOnce: true, allowFull: false });
  });

  // lance : 1ère exécution immédiate, puis toutes les heures
  const EVERY = Number(process.env.REFRESH_EVERY_MS || 60*60*1000);
  const JITTER = Math.floor(Math.random() * 5000); // petit jitter optionnel
  refresher.schedule({ intervalMs: EVERY, initialDelayMs: JITTER });

  // (optionnel) endpoint manuel pour tester en live
  app.post('/_debug/refresh', asyncHandler(async (_req, res) => {
    logger.info('Manual refresh triggered via debug endpoint');
    await refresher.refreshNow('manual');
    res.json({ ok: true, timestamp: new Date().toISOString() });
  }));
});