
import fsp from 'node:fs/promises';
import path from 'node:path';

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export function nowIso() { return new Date().toISOString(); }

export async function jsonLoad(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return null; }
}
export async function jsonSave(file, data) {
  const tmp = `${file}.tmp${Math.random().toString(36).slice(2)}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.chmod(tmp, 0o644);
  await fsp.rename(tmp, file);
}

export function cachePath(dir, key, ext='json') {
  const safe = key.replace(/[^a-z0-9\-_.]/gi, '_');
  return path.join(dir, `${safe}.${ext}`);
}

export function h(s='') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  })[c]);
}

export function baseUrl(req) {
  // 1) Priorité à une URL publique si définie (déploiement derrière proxy/CDN)
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL;
  if (envUrl) {
    try {
      const u = new URL(envUrl);
      return `${u.protocol}//${u.host}`.replace(/\/+$/, '');
    } catch {
      return String(envUrl).replace(/\/+$/, '');
    }
  }

  // 2) Fallback robuste si on n'a pas de vraie requête (ex: tâches en arrière-plan)
  const headers = req?.headers || {};
  const xfProto = headers['x-forwarded-proto'];
  const proto = String(
    (Array.isArray(xfProto) ? xfProto[0] : xfProto) ||
    req?.protocol ||
    'http'
  ).split(',')[0];

  const host =
    headers['x-forwarded-host'] ||
    headers['host'] ||
    req?.get?.('host') ||
    'localhost:3000';

  return `${proto}://${host}`.replace(/\/+$/, '');
}


export function svgNoPoster() {
  return `data:image/svg+xml;utf8,` + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#475569" font-family="system-ui, sans-serif" font-size="32">No Poster</text></svg>`
  );
}

export function makeRefresher(task) {
  let running = false;
  let timer = null;

  async function refreshNow(reason = 'manual') {
    if (running) { 
      console.log(`[refresh] skip (${reason}) : déjà en cours`);
      return false; 
    }
    running = true;
    const t0 = Date.now();
    console.log(`[refresh] start (${reason})…`);
    try {
      await task(reason);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[refresh] OK (${reason}) en ${dt}s`);
    } catch (err) {
      console.error(`[refresh] ERROR (${reason})`, err);
    } finally {
      running = false;
    }
    return true;
  }

  function schedule({ intervalMs = 60 * 60 * 1000, initialDelayMs = 0 } = {}) {
    if (timer) clearInterval(timer);
  
    const first = Math.max(0, initialDelayMs);
    console.log(`[refresh] scheduler ON → every ${Math.round(intervalMs/1000)}s (first in ${first}ms)`);
  
    setTimeout(() => { refreshNow('startup'); }, first);
    timer = setInterval(() => { refreshNow('hourly'); }, intervalMs);
  
    return () => { clearInterval(timer); timer = null; console.log('[refresh] scheduler OFF'); };
  }


  return { refreshNow, schedule, isRunning: () => running };
}

