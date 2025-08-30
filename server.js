import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import morgan from 'morgan';
import dotenv from 'dotenv';


import { DATA_DIR, IMG_DIR, PORT, FULL_REBUILD_PASS, TITLE } from './lib/config.js';
import { saveToken, deviceToken } from './lib/trakt.js';
import { buildPageData } from './lib/pageData.js';
import { makeRefresher } from './lib/util.js';
import { headers as traktHeaders } from './lib/trakt.js';
import { loadToken as loadTraktToken, userStats } from './lib/trakt.js';
import { dailyCounts } from './lib/graph.js';
import { loadToken } from './lib/trakt.js';
import { imageProxyRouter } from './lib/sharp.js';

dotenv.config();

const app = express();
app.use(morgan('tiny'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7*24*3600*1000 }
}));

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

// OAuth helper routes
app.get('/oauth/poll', async (req, res) => {
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
});

app.get('/oauth/new', (req, res) => { delete req.session.device_code; res.redirect('/'); });

// Refresh / Full rebuild
app.post('/refresh', (req, res) => { req.session.forceRefreshOnce = true; res.redirect('/'); });
app.post('/full_rebuild', (req, res) => {
  const pwd = String(req.body.pwd || '');
  if (!FULL_REBUILD_PASS) req.session.flash = 'Mot de passe de full rebuild non configuré côté serveur.';
  else if (pwd !== FULL_REBUILD_PASS) req.session.flash = 'Mot de passe incorrect.';
  else { req.session.allowFull = true; req.session.flash = 'Full rebuild autorisé ✅'; }
  res.redirect('/');
});

// API: Page data JSON
app.get('/api/data', async (req, res) => {
  const flash = req.session.flash || null;
  delete req.session.flash;

  const forceRefreshOnce = !!req.session.forceRefreshOnce;
  const allowFull = !!req.session.allowFull;
  delete req.session.forceRefreshOnce;
  delete req.session.allowFull;

  const pageData = await buildPageData(req, { forceRefreshOnce, allowFull });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ title: TITLE, flash, ...pageData });
});

app.get('/api/stats', async (req, res) => {
  try {
    const tok = await loadTraktToken();
    if (!tok?.access_token) return res.status(401).json({ ok:false, err:'no_token' });
    const headers = traktHeaders(tok.access_token);
    const stats = await userStats(headers, 'me');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok:true, stats });
  } catch (e) {
    res.status(500).json({ ok:false, err:String(e?.message || e) });
  }
});

app.get('/api/graph', async (req, res) => {
  try {
    const type = String(req.query.type || 'all');          // 'all' | 'movies' | 'shows'
    const year = Number(req.query.year) || (new Date()).getFullYear();

    const tok = await loadToken();
    if (!tok?.access_token) return res.status(401).json({ ok:false, error:'not_authed' });

    const data = await dailyCounts({ type, year, token: tok.access_token });
    res.json({ ok:true, data });
  } catch (e) {
    console.error('[graph]', e);
    res.status(500).json({ ok:false, error:String(e) });
  }
});


// Main page (static HTML)
app.get('/', (req, res) => {
  res.sendFile(path.resolve('public/app.html'));
});

app.listen(PORT, () => {
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
  app.post('/_debug/refresh', async (_req, res) => {
    await refresher.refreshNow('manual');
    res.json({ ok: true });
  });
});