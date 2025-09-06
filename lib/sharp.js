// lib/sharp.js (ESM) - Using Jimp instead of sharp
import express from 'express';
import { Jimp } from 'jimp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function resolveCacheImgsDir() {
  const ABS_CACHE_DIR   = '/data/cache_imgs';
  const LOCAL_CACHE_DIR = path.join(process.cwd(), 'data', 'cache_imgs');
  return fs.existsSync(ABS_CACHE_DIR) ? ABS_CACHE_DIR : LOCAL_CACHE_DIR;
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function isAllowedSrc(src, allowedPrefixes) {
  return allowedPrefixes.some(p => src.startsWith(p));
}
function chooseOutput(acceptHeader, fmt) {
  // Note: Jimp doesn't support WebP natively, we'll use PNG as fallback
  if (fmt === 'webp') return { ext: 'png', type: 'image/png', mime: 'image/png' };
  if (fmt === 'jpg' || fmt === 'jpeg') return { ext: 'jpg', type: 'image/jpeg', mime: 'image/jpeg' };
  if (fmt === 'png') return { ext: 'png', type: 'image/png', mime: 'image/png' };
  const accept = acceptHeader || '';
  const supportsWebp = /\bimage\/webp\b/.test(accept);
  return supportsWebp ? 
    { ext: 'png', type: 'image/png', mime: 'image/png' } : 
    { ext: 'jpg', type: 'image/jpeg', mime: 'image/jpeg' };
}

// ——— Presets d'URL « propres »
const PRESETS = {
  card:   { w: 342, dpr: 1, fmt: 'auto', we: '1', fit: 'inside' },
  cardx2: { w: 342, dpr: 2, fmt: 'auto', we: '1', fit: 'inside' },
};

export function imageProxyRouter({
  cacheDir = path.resolve(process.cwd(), 'data', 'processed_imgs'),
  allowedPrefixes = [
    '/cache_imgs/',                   // source locale
    'https://image.tmdb.org/t/p/',    // optionnel: TMDB direct
  ],
} = {}) {
  ensureDir(cacheDir);
  const CACHE_IMGS_DIR = resolveCacheImgsDir();
  const router = express.Router();

  async function serve(params, req, res) {
    try {
      const src = String(params.src || '');
      if (!src || !isAllowedSrc(src, allowedPrefixes)) {
        return res.status(400).send('Bad src');
      }
      const dpr = Math.max(1, Math.min(3, Math.round(Number(params.dpr || 1))));
      const wIn = Math.max(1, Math.min(2000, Number(params.w || 342)));
      const w   = Math.round(wIn * dpr);
      const fmt = String(params.fmt || 'auto');
      const fitQ = String(params.fit || 'inside'); // 'inside' | 'cover' | 'contain'
      const noUpscale = String(params.we || '1') === '1';

      const { ext, type, mime } = chooseOutput(req.headers.accept, fmt);
      const key = crypto
        .createHash('sha1')
        .update(`${src}|${w}|${fmt}|${fitQ}|${noUpscale}`)
        .digest('hex');
      const outPath = path.join(cacheDir, `${key}.${ext}`);

      // cache disque → hit
      try {
        const stat = await fsp.stat(outPath);
        const etag = `"${key}-${stat.mtime.getTime()}"`;
        
        res.setHeader('Cache-Control', 'public, max-age=31536000, stale-while-revalidate=2592000, immutable');
        res.setHeader('Vary', 'Accept');
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', stat.mtime.toUTCString());
        
        // Check if client has cached version
        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }
        
        res.type(type);
        return res.sendFile(outPath);
      } catch { /* miss */ }

      // charge la source
      let inputBuf;
      if (src.startsWith('/cache_imgs/')) {
        const file = path.join(CACHE_IMGS_DIR, path.basename(src));
        inputBuf = await fsp.readFile(file);
      } else {
        const r = await fetch(src);
        if (!r.ok) return res.status(404).send('src fetch failed');
        inputBuf = Buffer.from(await r.arrayBuffer());
      }

      // Process with Jimp - using static method
      const image = await Jimp.fromBuffer(inputBuf);
      const origWidth = image.bitmap.width;
      const origHeight = image.bitmap.height;
      
      // Calculate target dimensions
      const targetWidth = noUpscale && origWidth ? Math.min(w, origWidth) : w;
      const aspectRatio = origHeight / origWidth;
      const targetHeight = Math.round(targetWidth * aspectRatio);
      
      // Apply resize based on fit mode
      if (fitQ === 'cover') {
        // Cover: fill the entire area, cropping if necessary
        image.cover({ w: targetWidth, h: targetHeight });
      } else if (fitQ === 'contain') {
        // Contain: fit entirely within bounds, with potential padding
        image.contain({ w: targetWidth, h: targetHeight });
      } else {
        // Inside (default): resize to fit inside bounds, maintaining aspect ratio
        image.resize({ w: targetWidth });
      }
      
      // Get buffer with correct mime type
      const outBuf = await image.getBuffer(mime);
      
      // Save to disk cache
      await fsp.writeFile(outPath, outBuf);

      const etag = `"${key}-${Date.now()}"`;
      res.setHeader('Cache-Control', 'public, max-age=31536000, stale-while-revalidate=2592000, immutable');
      res.setHeader('Vary', 'Accept');
      res.setHeader('ETag', etag);
      res.type(type).send(outBuf);
    } catch (err) {
      console.error('[img-proxy] error', err);
      res.status(500).send('img error');
    }
  }

  // 1) Route « query » (compat)
  router.get('/', async (req, res) => {
    const p = {
      src: req.query.src,
      w: req.query.w,
      dpr: req.query.dpr,
      fmt: req.query.fmt,
      we: req.query.we,
      fit: req.query.fit,
    };
    return serve(p, req, res);
  });

  // 2) Route « preset » /img/p/:preset/*  → propre et courte
  router.get('/p/:preset/*', async (req, res) => {
    const preset = PRESETS[req.params.preset];
    if (!preset) return res.status(404).send('Unknown preset');
    // req.params[0] = le reste du chemin après le pattern
    let src = req.params[0];
    // Si ce n'est pas une URL absolue, c'est un fichier local dans cache_imgs
    if (!src.startsWith('http')) {
      // Extraire juste le nom du fichier (ex: trakt_123.jpg)
      const filename = src.split('/').pop();
      src = '/cache_imgs/' + filename;
    }
    const p = { src, ...preset };
    return serve(p, req, res);
  });

  // 3) Route « pretty » paramétrée /img/w-342/dpr-2/fmt-webp/* (optionnelle)
  router.get('/w-:w/dpr-:dpr/fmt-:fmt/*', async (req, res) => {
    let src = `/${req.params[0]}`;
    if (!src.startsWith('/cache_imgs/') && !src.startsWith('http')) {
      src = '/cache_imgs/' + src.replace(/^\/+/, '');
    }
    const p = {
      src,
      w: req.params.w,
      dpr: req.params.dpr,
      fmt: req.params.fmt,
      we: req.query.we || '1',
      fit: req.query.fit || 'inside',
    };
    return serve(p, req, res);
  });

  return router;
}