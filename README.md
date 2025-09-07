[![Aperçu de l'UI](docs/img/title.png)](docs/img/title.png)

# Trakt Enhanced (Node.js, modular, HTML séparé)

**🌐 Languages:** [Français](#-français) | [English](#-english)

---

## 🇫🇷 Français

[![Aperçu de l'UI](docs/img/screenshot.webp)](docs/img/screenshot.webp)

App web pour parcourir ton historique **Trakt** avec :
- **UI 100% HTML** modifiable facilement (`public/app.html`)
- **Tri / recherche** (Séries, Films, Séries à voir, Films à voir)
- **Cartes** avec posters TMDB mis en cache local
- **Rafraîchissement automatique** au démarrage puis à intervalle régulier
- **Build CSS** Tailwind (sans CDN) + Font Awesome locaux


## 🚀 Installation rapide

### Installation classique (Node.js)

```bash
git clone https://github.com/diabolino/trakt_enhanced
cd trakt_enhanced
npm install
npm run build
npm start
```

### Installation Docker

📦 **[Documentation complète Docker](docker.md)**

```bash
docker run -d \
    --name=trakt_enhanced \
    -p 30009:30009 \
    -v ~/trakt_enhanced/data:/app/data \
    -v ~/trakt_enhanced/config:/app/config \
    --restart unless-stopped \
    docker.io/diabolino/trakt_enhanced:latest
```

---

## ‼️ IMPORTANT — Paramétrage Trakt

Crée une application sur **Trakt → Settings → Your API Apps** et récupère **Client ID** / **Client Secret** pour les variables d’environnement.  
Utiliser votre url de type http(s)://votre-site.com/auth/callback au niveau de de l'ur de redirection.

![Trakt api](docs/img/trakt-api.png)

Ajuster ce paramètres dans les réglages :
  
![Trakt settings](docs/img/trakt-setting.png)

## ⚙️ Configuration (.env)

Variables **recommandées** :
```env
TRAKT_CLIENT_ID=xxx
TRAKT_CLIENT_SECRET=xxx
TMDB_API_KEY=xxx
SESSION_SECRET=un-secret-long
FULL_REBUILD_PASSWORD=un-autre-secret
```

Variables **optionnelles** :
```env
# Rafraîchissement auto (par défaut 1h)
REFRESH_EVERY_MS=3600000

# Les posters sont servis depuis /cache_imgs, mappé vers :
# /data/cache_imgs (si présent) ou ./data/cache_imgs (fallback)
```

---

## 🗂️ Arborescence (résumé)

```
public/
  app.html                # l’UI éditable
  assets/
    tailwind.css          # CSS généré
    fa/                   # Font Awesome local (css + webfonts)
data/
  .secrets                # trackt secret
  .cache_tmdb             # json TMDB 
  cache_imgs/             # posters TMDB (si fallback local)
  .cache_trakt/
    progress/             # JSON par série: watched_<traktId>.json
lib/
  pageData.js             # construit les 4 listes et la réponse API
  trakt.js                # appels Trakt + enrichissement progress (par lots + cache)
  tmdb.js                 # métadonnées + cache posters, URL locales /cache_imgs
  util.js                 # scheduler (auto-refresh), helpers JSON, baseUrl tolérant
server.js                 # Express: routes, statiques, scheduler
```

---

## 🌐 Endpoints utiles

- `GET /` → page HTML
- `GET /api/data` → JSON { devicePrompt?, showsRows, moviesRows, showsUnseenRows, moviesUnseenRows, ... }
- `POST /refresh` → reconstruit la page (ignore le TTL)
- `POST /full_rebuild` → full rebuild du cache master (protégé par `FULL_REBUILD_PASSWORD`)
- `GET /cache_imgs/<fichier>` → posters TMDB (servi statiquement avec cache HTTP long)

---

## 📦 Caches & performances

### Posters TMDB
- Stockés sous `/data/cache_imgs` (ou `./data/cache_imgs` en fallback).
- Servis via `/cache_imgs/...` avec **Cache-Control long + immutable**.
- Les URLs d’images générées sont **relatives** (`/cache_imgs/...`), donc valides quel que soit l’hôte.

### Progress Trakt (par série)
- JSON par série : `data/.cache_trakt/progress/watched_<traktId>.json`
- Remplis par lots (40) avec **pause** entre lots (1200 ms).
- TTL 6h pour éviter de recharger trop souvent.

---

## 🔁 Rafraîchissement automatique

- Au **démarrage** de l’app : un refresh reconstruit la page.
- Ensuite **toutes les X ms** (`REFRESH_EVERY_MS`, défaut 1h).
- Anti-chevauchement intégré (un seul refresh à la fois).

> Un endpoint debug peut être exposé (facultatif) :
> `POST /_debug/refresh` → déclenche un refresh manuel.

---

## 🎨 CSS (sans CDN)

- **Tailwind v4** (CLI) : fichier d’entrée `src/tailwind.css` minimal :
  ```css
  @import "tailwindcss";
  /* sources scannées */
  @source "./public/**/*.html";
  @source "./public/**/*.js";
  @source "./lib/**/*.js";
  @source "./server.js";
  /* classes dynamiques utilisées uniquement via JS */
  @source inline("max-w-none text-amber-200 border-amber-400/50");
  /* fallback clamp si besoin */
  .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  ```
- **Font Awesome local** : `public/assets/fa/css/all.min.css` + `webfonts/`
- Dans `public/app.html` :
  ```html
  <link rel="stylesheet" href="/assets/tailwind.css">
  <link rel="stylesheet" href="/assets/fa/css/all.min.css">
  ```

---

## 🛠️ Dépannage

- **Pas d’images** : vérifie le mapping `/cache_imgs` dans `server.js` et que le dossier cible existe.
- **Pas de cache progress** : regarde les logs:
  - `[progress] dir -> ...` (chemin utilisé)
  - `[progress] wrote watched_<id>.json` (écriture OK)
  - si `headers sans Authorization` → token manquant pour Trakt.
- **Styles “cassés” après build** : rebuild `npm run build` et safeliste les classes générées en JS (voir `@source inline(...)`).
- **/favicon.ico 404** : ajoute un favicon dans `/public/assets/` ou renvoie 204 pour `/favicon.ico`.

---

## ✅ Statut

- Améliorations apportées : build Tailwind local, posters relatifs, scheduler, enrichissement **complet** des séries (par lots avec cache).

---

## 🧩 Notes de configuration

- Les clés Trakt/TMDB ne sont plus fournies en dur; elles doivent être présentes dans `.env` ou saisies via `/setup`.
- Après le formulaire `/setup`, l'application recharge automatiquement la configuration en mémoire (pas besoin de redémarrage).
- Les paramètres techniques de progression (taille de lot, délai, TTL) sont désormais fixes dans le code pour simplifier la configuration.

---

## 🇺🇸 English

[![UI Preview](docs/img/screenshot.webp)](docs/img/screenshot.webp)

Web app to browse your **Trakt** history with:
- **100% HTML UI** easily editable (`public/app.html`)
- **Sort / search** (Shows, Movies, Shows to watch, Movies to watch)
- **Cards** with TMDB posters cached locally
- **Automatic refresh** at startup then at regular intervals
- **CSS build** Tailwind (without CDN) + local Font Awesome

## 🚀 Quick Installation

### Classic Installation (Node.js)

```bash
git clone https://github.com/diabolino/trakt_enhanced
cd trakt_enhanced
npm install
npm run build
npm start
```

### Docker Installation

📦 **[Complete Docker Documentation](docker.md)**

```bash
docker run -d \
    --name=trakt_enhanced \
    -p 30009:30009 \
    -v ~/trakt_enhanced/data:/app/data \
    -v ~/trakt_enhanced/config:/app/config \
    --restart unless-stopped \
    docker.io/diabolino/trakt_enhanced:latest
```

---

## ‼️ IMPORTANT — Trakt Setup

Create an application on **Trakt → Settings → Your API Apps** and get **Client ID** / **Client Secret** for environment variables.  
Use the **Device Code Flow** (no redirect URL needed).
use your url http(s)://your-site.com/auth/callback for redirect URI.

![Trakt api](docs/img/trakt-api.png)

Adjust these settings in the configuration:
  
![Trakt settings](docs/img/trakt-setting.png)

## ⚙️ Configuration (.env)

**Recommended** variables:
```env
TRAKT_CLIENT_ID=xxx
TRAKT_CLIENT_SECRET=xxx
TMDB_API_KEY=xxx
LANGUAGE=en-US
SESSION_SECRET=a-long-secret
FULL_REBUILD_PASSWORD=another-secret
```

**Optional** variables:
```env
# Auto refresh (default 1h)
REFRESH_EVERY_MS=3600000

# Posters are served from /cache_imgs, mapped to:
# /data/cache_imgs (if present) or ./data/cache_imgs (fallback)
```

---

## 🗂️ Directory Structure (summary)

```
public/
  app.html                # editable UI
  assets/
    tailwind.css          # generated CSS
    fa/                   # local Font Awesome (css + webfonts)
data/
  .secrets                # trakt secret
  .cache_tmdb             # TMDB json 
  cache_imgs/             # TMDB posters (if local fallback)
  .cache_trakt/
    progress/             # JSON per series: watched_<traktId>.json
lib/
  pageData.js             # builds the 4 lists and API response
  trakt.js                # Trakt calls + progress enrichment (batched + cached)
  tmdb.js                 # metadata + poster cache, local URLs /cache_imgs
  util.js                 # scheduler (auto-refresh), JSON helpers, tolerant baseUrl
server.js                 # Express: routes, static files, scheduler
```

---

## 🌐 Useful Endpoints

- `GET /` → HTML page
- `GET /api/data` → JSON { devicePrompt?, showsRows, moviesRows, showsUnseenRows, moviesUnseenRows, ... }
- `POST /refresh` → rebuilds page (ignores TTL)
- `POST /full_rebuild` → full rebuild of master cache (protected by `FULL_REBUILD_PASSWORD`)
- `GET /cache_imgs/<file>` → TMDB posters (served statically with long HTTP cache)

---

## 📦 Caches & Performance

### TMDB Posters
- Stored under `/data/cache_imgs` (or `./data/cache_imgs` as fallback).
- Served via `/cache_imgs/...` with **long Cache-Control + immutable**.
- Generated image URLs are **relative** (`/cache_imgs/...`), so valid regardless of host.

### Trakt Progress (per series)
- JSON per series: `data/.cache_trakt/progress/watched_<traktId>.json`
- Filled in batches (40) with **pause** between batches (1200ms).
- 6h TTL to avoid reloading too often.

---

## 🔁 Automatic Refresh

- At **app startup**: a refresh rebuilds the page.
- Then **every X ms** (`REFRESH_EVERY_MS`, default 1h).
- Built-in anti-overlap (only one refresh at a time).

> A debug endpoint can be exposed (optional):
> `POST /_debug/refresh` → triggers manual refresh.

---

## 🎨 CSS (without CDN)

- **Tailwind v4** (CLI): minimal entry file `src/tailwind.css`:
  ```css
  @import "tailwindcss";
  /* scanned sources */
  @source "./public/**/*.html";
  @source "./public/**/*.js";
  @source "./lib/**/*.js";
  @source "./server.js";
  /* dynamic classes used only via JS */
  @source inline("max-w-none text-amber-200 border-amber-400/50");
  /* fallback clamp if needed */
  .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  ```
- **Local Font Awesome**: `public/assets/fa/css/all.min.css` + `webfonts/`
- In `public/app.html`:
  ```html
  <link rel="stylesheet" href="/assets/tailwind.css">
  <link rel="stylesheet" href="/assets/fa/css/all.min.css">
  ```

---

## 🛠️ Troubleshooting

- **No images**: check `/cache_imgs` mapping in `server.js` and that target folder exists.
- **No progress cache**: look at logs:
  - `[progress] dir -> ...` (path used)
  - `[progress] wrote watched_<id>.json` (write OK)
  - if `headers without Authorization` → missing token for Trakt.
- **"Broken" styles after build**: rebuild `npm run build` and safelist JS-generated classes (see `@source inline(...)`).
- **/favicon.ico 404**: add a favicon in `/public/assets/` or return 204 for `/favicon.ico`.

---

## ✅ Status

- Improvements made: local Tailwind build, relative posters, scheduler, **complete** series enrichment (batched with cache).

---

## 🧩 Configuration Notes

- Trakt/TMDB keys are no longer provided hardcoded; they must be present in `.env` or entered via `/setup`.
- After the `/setup` form, the application automatically reloads configuration in memory (no restart needed).
- Technical progress parameters (batch size, delay, TTL) are now fixed in code to simplify configuration.


