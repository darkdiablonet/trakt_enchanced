/* DOM */
const toggleWidth   = document.getElementById('toggleWidth');
const mainContainer = document.getElementById('mainContainer');

const flashBox  = document.getElementById('flashBox');
const deviceBox = document.getElementById('deviceBox');

const tabBtns = {
  shows: document.getElementById('tabBtnShows'),
  movies: document.getElementById('tabBtnMovies'),
  shows_unseen: document.getElementById('tabBtnShowsUnseen'),
  movies_unseen: document.getElementById('tabBtnMoviesUnseen'),
  stats: document.getElementById('tabBtnStats'),
};

const panels = {
  shows: document.getElementById('panelShows'),
  movies: document.getElementById('panelMovies'),
  shows_unseen: document.getElementById('panelShowsUnseen'),
  movies_unseen: document.getElementById('panelMoviesUnseen'),
  stats: document.getElementById('panelStats'),
};
const grids = {
  shows: document.getElementById('gridS'),
  movies: document.getElementById('gridM'),
  shows_unseen: document.getElementById('gridSU'),
  movies_unseen: document.getElementById('gridMU'),
};

const sortActive = document.getElementById('sortActive');
const SORT_ALL = Array.from(sortActive.querySelectorAll('option')).map(o => ({
  value: o.value,
  label: o.textContent,
  for: (o.getAttribute('data-for') || '')
}));
const qActive    = document.getElementById('qActive');

const openFullModal  = document.getElementById('openFullModal');
const closeFullModal = document.getElementById('closeFullModal');
const fullModal      = document.getElementById('fullModal');

/* State */
let state = JSON.parse(localStorage.getItem('trakt_state') || '{}');
state.tab   = state.tab   || 'shows';
state.sort  = state.sort  || { field:'watched_at', dir:'desc' };
state.q     = (typeof state.q === 'string') ? state.q : '';
state.width = state.width || 'limited';
// normaliser anciens "field:dir"
if (state.sort && typeof state.sort.field === 'string' && state.sort.field.includes(':')) {
  const [f, d] = state.sort.field.split(':');
  state.sort = { field:f, dir:d || state.sort.dir || 'desc' };
}
function saveState(){ localStorage.setItem('trakt_state', JSON.stringify(state)); }

/* Données */
let DATA = { showsRows:[], moviesRows:[], showsUnseenRows:[], moviesUnseenRows:[], devicePrompt:null, cacheHit:false, cacheAge:0, title:'UNFR — Trakt History', flash:null };

/* Helpers UI */
function applyWidth(){
  const full = state.width === 'full';
  if (full) {
	mainContainer.classList.remove('max-w-7xl','mx-auto');
	mainContainer.classList.add('w-full','max-w-none');
	toggleWidth?.querySelector('span')?.replaceChildren(document.createTextNode('Largeur limitée'));
  } else {
	mainContainer.classList.add('max-w-7xl','mx-auto');
	mainContainer.classList.remove('w-full','max-w-none');
	toggleWidth?.querySelector('span')?.replaceChildren(document.createTextNode('Pleine largeur'));
  }
}

function posterURL(u) {
  if (!u) return '';
  const retina = (window.devicePixelRatio || 1) > 1.25;
  const preset = retina ? 'cardx2' : 'card';
  const clean  = u.replace(/^\/+/, '');
  const v = 'webp1'; // ↑ incrémente si tu changes l’encodage/preset
  return `/img/p/${preset}/${clean}?v=${v}`;
}

/* Rendu */
function escapeAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/[\r\n]+/g,' '); }

function card(r, kind){
  const posterRaw = String(r.poster||'');
  const poster = (typeof posterURL === 'function') ? posterURL(posterRaw) : posterRaw; // garde ton proxy si présent
  const y = r.year || '';
  const url = r.trakt_url || '#';
  const tmdburl = r.tmdb_url || '';
  const next = r.next || '';
  const isUnseen = (state.tab === 'shows_unseen' || state.tab === 'movies_unseen');

  // === METRICS (identiques à ton rendu actuel)
  let metrics = '';
  if (isUnseen){
	if (kind === 'show') {
	  const missing = Number(r.missing ?? 0);
	  metrics = [
		(missing > 0)
		  ? `<span class="chip"><i class="fa-solid fa-list-check mr-1"></i>${missing} à voir</span>`
		  : `<span class="chip"><i class="fa-regular fa-eye-slash mr-1"></i>Non vu</span>`,
		next ? `<span class="chip"><i class="fa-solid fa-forward-step mr-1"></i>${next}</span>` : ''
	  ].filter(Boolean).join('');
	} else {
	  metrics = `<span class="chip"><i class="fa-regular fa-eye-slash mr-1"></i>Non vu</span>`;
	}
  } else if (kind === 'show') {
	const w0 = Number(r.episodes ?? 0);
	const t  = Number(r.episodes_total ?? 0);
	const w  = t > 0 ? Math.min(w0, t) : w0;
	const hasT = t > 0;
	const diff = hasT && w !== t;
	const cls  = diff ? 'border-amber-400/50 text-amber-200' : '';
	const text = hasT ? `${w}/${t}` : `${w}`;
	metrics = `<span class="chip ${cls}"><i class="fa-solid fa-film mr-1"></i>${text}</span>`;
  } else {
	metrics = `<span class="chip"><i class="fa-solid fa-play mr-1"></i>${r.plays||0}</span>`;
  }

  const ov = escapeAttr(r.overview || '');
  const title = escapeAttr(r.title || '');

  return `
	<article class="card p-3 hover:shadow-xl hover:shadow-sky-900/10 transition-shadow">
	  <div class="poster-wrap mb-3">
		<div class="poster" style="background-image:url('${poster}')"></div>
		<button class="ov-btn js-ov"
		  data-title="${title}"
		  data-year="${escapeAttr(y)}"
		  data-overview="${ov}"
		  data-poster="${escapeAttr(poster)}"
		  data-trakt="${escapeAttr(url)}"
		  data-tmdb="${escapeAttr(tmdburl)}"
		  data-kind="${escapeAttr(kind)}"
		  title="Synopsis">
		  <i class="fa-solid fa-circle-info"></i><span>Synopsis</span>
		</button>
		${ next ? `<span class="badge-next"><i class="fa-solid fa-forward-step"></i>${next}</span>` : '' }
	  </div>
	  <h3 class="text-base font-semibold leading-tight line-clamp-2">${title}</h3>
	  <div class="mt-2 flex items-center gap-2 text-sm">
		<span class="chip"><i class="fa-regular fa-calendar mr-1"></i>${y}</span>
		${metrics}
	  </div>
	  <div class="mt-2 flex items-center gap-2 text-sm">
		<a class="chip" href="${url}" target="_blank"><i class="fa-solid fa-link mr-1"></i>Trakt</a>
		${tmdburl ? `<a class="chip" href="${tmdburl}" target="_blank"><i class="fa-solid fa-clapperboard mr-1"></i>TMDB</a>` : ''}
	  </div>
	</article>`;
}


function renderInto(el, rows, kind){ el.innerHTML = rows.map(r => card(r, kind)).join(''); }
function filterItems(items, q){
  const s = (q||'').trim().toLowerCase();
  if (!s) return items;
  return items.filter(it => String(it.title||'').toLowerCase().includes(s));
}
function sortItems(items, field, dir){
  return items.slice().sort((a,b)=>{
	if (field==='title'){
	  return dir==='asc'
		? String(a.title||'').localeCompare(String(b.title||''))
		: String(b.title||'').localeCompare(String(a.title||''));
	}
	if (field==='watched_at' || field==='collected_at'){
	  const taRaw = field==='collected_at'
		? (a.collected_at_ts ?? Date.parse(a.collected_at ?? ''))
		: Date.parse(a.watched_at ?? '');
	  const tbRaw = field==='collected_at'
		? (b.collected_at_ts ?? Date.parse(b.collected_at ?? ''))
		: Date.parse(b.watched_at ?? '');
	  const ta = Number.isFinite(taRaw) ? taRaw : (dir==='asc' ? -Infinity : Infinity);
	  const tb = Number.isFinite(tbRaw) ? tbRaw : (dir==='asc' ? -Infinity : Infinity);
	  return dir==='asc' ? (ta-tb) : (tb-ta);
	}
	if (field==='missing'){
	  const na = Number(a.missing||0), nb = Number(b.missing||0);
	  return dir==='asc' ? na-nb : nb-na;
	}
	if (field==='episodes' || field==='plays' || field==='year'){
	  const na = Number(a[field]||0), nb = Number(b[field]||0);
	  return dir==='asc' ? na-nb : nb-na;
	}
	return 0;
  });
}
function dataForTab(tab){
  if (tab==='shows') return { arr:DATA.showsRows, kind:'show' };
  if (tab==='movies') return { arr:DATA.moviesRows, kind:'movie' };
  if (tab==='shows_unseen') return { arr:DATA.showsUnseenRows, kind:'show' };
  if (tab==='movies_unseen') return { arr:DATA.moviesUnseenRows, kind:'movie' };
  return { arr:[], kind:'show' };
}
function renderCurrent(){
  const { arr, kind } = dataForTab(state.tab);
  const filtered = filterItems(arr, state.q);
  const sorted   = sortItems(filtered, state.sort.field, state.sort.dir);
  if (state.tab==='shows') renderInto(grids.shows, sorted, kind);
  if (state.tab==='movies') renderInto(grids.movies, sorted, kind);
  if (state.tab==='shows_unseen') renderInto(grids.shows_unseen, sorted, kind);
  if (state.tab==='movies_unseen') renderInto(grids.movies_unseen, sorted, kind);
}

/* Tri par onglet */
function rebuildSortOptions(tab){
  const allowed = SORT_ALL.filter(opt =>
	opt.for.split(',').map(s => s.trim()).includes(tab)
  );
  const defaultByTab = {
	shows: 'watched_at:desc',
	movies: 'watched_at:desc',
	shows_unseen: 'collected_at:desc',
	movies_unseen: 'collected_at:desc'
  };
  const currentKey = `${state.sort.field}:${state.sort.dir}`;
  const selectedKey = allowed.some(o => o.value === currentKey) ? currentKey : defaultByTab[tab];
  sortActive.innerHTML = allowed
	.map(o => `<option value="${o.value}" data-for="${o.for}">${o.label}</option>`)
	.join('');
  sortActive.value = selectedKey;
  const [f, d] = selectedKey.split(':');
  state.sort = { field: f, dir: d };
  saveState();
}

/* Tabs */
const filtersSec = document.querySelector('section.filters');

function setTab(tab){
  state.tab = tab; saveState();

  // activer le bouton courant / masquer les autres panneaux
  Object.entries(tabBtns).forEach(([k,b]) => b?.classList.toggle('tab-btn-active', k===tab));
  Object.entries(panels).forEach(([k,p]) => p?.classList.toggle('hidden', k!==tab));

  // cacher les filtres sur "stats" uniquement
  const isStats = (tab === 'stats');
  filtersSec?.classList.toggle('hidden', isStats);

  if (isStats) {
	// (les cartes stats sont rendues dans loadData)
	// on déclenche / rafraîchit le heatmap ici
	loadAndRenderGraph();
	return;
  }

  // listes classiques
  rebuildSortOptions(tab);
  renderCurrent();
}

/* Stats helpers */
function humanMinutes(min) {
  const m = Number(min||0);
  const d = Math.floor(m / (60*24));
  const h = Math.floor((m % (60*24)) / 60);
  const r = m % 60;
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${r}m`;
  return `${m}m`;
}
function statCard(title, items=[]) {
  const rows = items
	.filter(it => it && it.label)
	.map(it => `<div class="flex justify-between"><span class="text-slate-400">${it.label}</span><span class="font-semibold">${it.value}</span></div>`)
	.join('');
  return `<article class="card p-4"><h3 class="text-base font-semibold mb-3">${title}</h3><div class="space-y-1 text-sm">${rows || '<span class="text-slate-500">—</span>'}</div></article>`;
}
function renderStats(stats){
  const s = stats || {};
  const movies   = s.movies || {};
  const shows    = s.shows  || {};
  const seasons  = s.seasons || {};
  const episodes = s.episodes || {};
  const network  = s.network || {};
  const ratings  = s.ratings || {};
  const comments = s.comments || {};
  const lists    = s.lists || {};

  const cards = [];
  cards.push(statCard('🎬 Films', [
	{ label:'Vus',        value: movies.watched ?? 0 },
	{ label:'Lectures',   value: movies.plays ?? 0 },
	{ label:'Collection', value: movies.collected ?? 0 },
	{ label:'Durée',      value: humanMinutes(movies.minutes ?? 0) },
	{ label:'Notes',      value: movies.ratings ?? 0 },
	{ label:'Commentaires', value: movies.comments ?? 0 },
  ]));
  cards.push(statCard('📺 Séries', [
	{ label:'Vues',       value: shows.watched ?? 0 },
	{ label:'Saisons',    value: shows.seasons ?? seasons.watched ?? 0 },
	{ label:'Épisodes',   value: shows.episodes ?? episodes.watched ?? 0 },
	{ label:'Collection', value: shows.collected ?? 0 },
	{ label:'Notes',      value: shows.ratings ?? 0 },
	{ label:'Commentaires', value: shows.comments ?? 0 },
  ]));
  cards.push(statCard('📼 Épisodes', [
	{ label:'Vus',      value: episodes.watched ?? 0 },
	{ label:'Lectures', value: episodes.plays ?? 0 },
	{ label:'Durée',    value: humanMinutes(episodes.minutes ?? 0) },
  ]));
  cards.push(statCard('⭐ Ratings & Listes', [
	{ label:'Notes',         value: ratings.total ?? (movies.ratings ?? 0) + (shows.ratings ?? 0) },
	{ label:'Listes',        value: lists.total ?? 0 },
	{ label:'Commentaires',  value: comments.total ?? 0 },
	{ label:'Amis (Network)',value: network.friends ?? 0 },
	{ label:'Abonnements',   value: network.following ?? 0 },
	{ label:'Abonnés',       value: network.followers ?? 0 },
  ]));
  document.getElementById('statsBox').innerHTML = cards.join('');
}

/* Data loader */
async function loadData(){
  const resp = await fetch('/api/data', { cache:'no-store' });
  const js = await resp.json();
  DATA = js;

  if (js.stats) {
	renderStats(js.stats);
  } else {
	try {
	  const s = await fetch('/api/stats').then(r => r.ok ? r.json() : null);
	  if (s?.ok && s.stats) renderStats(s.stats);
	} catch {}
  }
  
  if (state.tab === 'stats') { loadAndRenderGraph(); }

  if (js.flash) { flashBox.textContent = js.flash; flashBox.classList.remove('hidden'); }
  else { flashBox.classList.add('hidden'); }

  if (js.devicePrompt && js.devicePrompt.user_code) {
	deviceBox.innerHTML = `
	  <h2 class="text-lg font-semibold mb-2">Connecter votre compte Trakt</h2>
	  <p class="text-slate-300 text-sm mb-2">Rendez-vous sur <a class="text-sky-400 underline" href="${js.devicePrompt.verification_url}" target="_blank">${js.devicePrompt.verification_url}</a> et entrez le code :</p>
	  <div class="text-2xl font-bold tracking-widest bg-black/40 inline-block px-3 py-2 rounded">${js.devicePrompt.user_code}</div>
	  <div class="text-xs text-slate-400 mt-2">Ce code expire le ${new Date(js.devicePrompt.expires_in*1000 + Date.now()).toLocaleString()}.</div>
	  <div class="mt-3 flex items-center gap-2">
		<button id="pollBtn" class="btn"><i class="fa-solid fa-arrows-rotate mr-1"></i>J'ai validé, vérifier</button>
		<a href="/oauth/new" class="btn"><i class="fa-solid fa-qrcode"></i>Nouveau code</a>
	  </div>
	  <div id="pollMsg" class="text-sm mt-2 text-slate-400"></div>
	`;
	deviceBox.classList.remove('hidden');
	const pollBtn = deviceBox.querySelector('#pollBtn');
	const pollMsg = deviceBox.querySelector('#pollMsg');
	pollBtn?.addEventListener('click', async () => {
	  pollMsg.textContent = 'Vérification en cours...';
	  try {
		const r = await fetch('/oauth/poll').then(x=>x.json());
		if (r.ok) { pollMsg.textContent = 'Connecté ! Rechargement...'; setTimeout(()=>location.reload(), 800); }
		else { pollMsg.textContent = r.fatal ? ('Erreur : '+r.err) : 'Toujours en attente, réessayez.'; }
	  } catch { pollMsg.textContent = 'Erreur réseau.'; }
	});
  } else {
	deviceBox.classList.add('hidden');
  }

  applyWidth();
  setTab(state.tab);
  qActive.value = state.q || '';
}

/* Events */
toggleWidth?.addEventListener('click', () => { state.width = (state.width==='full') ? 'limited' : 'full'; saveState(); applyWidth(); });
Object.values(tabBtns).forEach(btn => btn?.addEventListener('click', () => setTab(btn.dataset.tab)));
document.getElementById('sortActive').addEventListener('change', () => {
  const [f,d] = String(document.getElementById('sortActive').value).split(':'); state.sort = { field:f, dir:d||'asc' }; saveState(); renderCurrent();
});
qActive.addEventListener('input', () => { state.q = qActive.value || ''; saveState(); renderCurrent(); });
document.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey) && e.key==='/'){ e.preventDefault(); qActive?.focus(); } });
openFullModal?.addEventListener('click', ()=>{ fullModal.classList.remove('hidden'); });
closeFullModal?.addEventListener('click', ()=>{ fullModal.classList.add('hidden'); });

/* === HEATMAP (Graph tab) === */
const graphTypeSel = document.getElementById('graphType');
const graphYearSel = document.getElementById('graphYear');
const graphContainer = document.getElementById('graphContainer');
const graphMeta = document.getElementById('graphMeta');

function fillYearsSelect(selectEl, minYear = 2010) {
  const yNow = new Date().getFullYear();
  selectEl.innerHTML = '';
  for (let y = yNow; y >= minYear; y--) {
	const opt = document.createElement('option');
	opt.value = String(y);
	opt.textContent = String(y);
	selectEl.appendChild(opt);
  }
}
function colorFor(level) {
  // 0 = vide, 1..4 = intensité
  const palette = [
	'#0b1220',  // 0: empty
	'#14532d',  // 1
	'#166534',  // 2
	'#22c55e',  // 3
	'#4ade80'   // 4 (max)
  ];
  return palette[level] || palette[0];
}

function levelFor(count, max) {
  if (count <= 0) return 0;
  if (max <= 1) return 4;            // tout au max si max=1
  const r = count / max;
  if (r > 0.80) return 4;
  if (r > 0.60) return 3;
  if (r > 0.35) return 2;
  return 1;
}
function datesOfYear(year) {
  const start = new Date(Date.UTC(year,0,1));
  const end   = new Date(Date.UTC(year,11,31));
  const days = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate()+1)) {
	days.push(new Date(d));
  }
  return days;
}
function renderHeatmapSVG({ year, max, days }, { cell=12, gap=3, top=28, left=38 } = {}) {
  // --- données
  const dates = datesOfYear(year);
  const map = new Map(days.map(d => [d.date, d.count]));
  const dayIndex = (d) => (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1); // Mon=0..Sun=6

  // colonne = semaine ISO (lundi)
  const colIndex = (d) => {
	const jan1 = new Date(Date.UTC(year,0,1));
	const jan1Dow = dayIndex(jan1);
	const monday0 = new Date(jan1); monday0.setUTCDate(jan1.getUTCDate() - jan1Dow);
	const diffDays = Math.floor((d - monday0) / 86400000);
	return Math.floor(diffDays / 7);
  };

  // nombre de colonnes (semaines affichées)
  const last = new Date(Date.UTC(year,11,31));
  const cols = Math.max(53, colIndex(last) + 1);

  // dimensions
  const monthsRow = 16; // hauteur ligne des mois
  const legendH   = 24; // hauteur zone légende
  const W = left + cols*(cell+gap);
  const H = top + monthsRow + 7*(cell+gap) + legendH;

  // utilitaires affichage
  const txt = (x,y,s,anchor='start') =>
	`<text x="${x}" y="${y}" fill="#94a3b8" font-size="${s}" text-anchor="${anchor}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial">`;

  // positions des étiquettes de mois (première semaine de chaque mois)
  const mois = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const monthCols = [];
  for (let m=0; m<12; m++){
	const d0 = new Date(Date.UTC(year, m, 1));
	monthCols.push({ label: mois[m], col: colIndex(d0) });
  }

  // axe vertical (lundi→dimanche)
  const jours = ['L','M','M','J','V','S','D'];

  // SVG
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trakt heatmap ${year}">
	<rect x="0" y="0" width="${W}" height="${H}" fill="#0b1220" rx="8" />`;

  // ligne des mois
  svg += `<g transform="translate(${left},${top})">`;
  for (const m of monthCols) {
	const x = m.col*(cell+gap);
	svg += `${txt(x,12,10)}${m.label}</text>`;
  }
  svg += `</g>`;

  // axe jours (gauche)
  svg += `<g transform="translate(0,${top+monthsRow})">`;
  for (let i=0;i<7;i++){
	const y = i*(cell+gap) + cell; // baseline du texte
	svg += `${txt(left-10, y, 9, 'end')}${jours[i]}</text>`;
  }
  svg += `</g>`;

  // cellules
  svg += `<g transform="translate(${left},${top+monthsRow})">`;
  for (const d of dates) {
	const ci = colIndex(d);
	const ri = dayIndex(d);
	const x = ci*(cell+gap);
	const y = ri*(cell+gap);
	const key = d.toISOString().slice(0,10);
	const count = map.get(key) || 0;
	const lvl = levelFor(count, max);
	const fill = colorFor(lvl);
	const title = `${key} · ${count} visionnage${count>1?'s':''}`;
	svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" ry="2" fill="${fill}"><title>${title}</title></rect>`;
  }
  svg += `</g>`;

  // légende
  const legendX = left;
  const legendY = top + monthsRow + 7*(cell+gap) + 16;
  svg += `<g transform="translate(${legendX},${legendY})">
	  ${txt(0,0,10)}Moins</text>`;
  const sw = cell, sg = 6;
  for (let l=1; l<=4; l++){
	const x = 34 + (l-1)*(sw+sg);
	svg += `<rect x="${x}" y="-10" width="${sw}" height="${sw}" rx="2" ry="2" fill="${colorFor(l)}"></rect>`;
  }
  svg += `${txt(34 + 4*(sw+sg) + 8, 0, 10)}Plus</text></g>`;

  svg += `</svg>`;
  return svg;
}

async function loadAndRenderGraph() {
  if (!graphYearSel.options.length) {
	fillYearsSelect(graphYearSel, 2010);
	graphYearSel.value = String(new Date().getFullYear());
  }
  const year = Number(graphYearSel.value) || (new Date()).getFullYear();
  const type = graphTypeSel.value || 'all';
  try {
	const r = await fetch(`/api/graph?year=${year}&type=${encodeURIComponent(type)}`, { cache:'no-store' }).then(x=>x.json());
	if (!r.ok) { graphContainer.innerHTML = '<div class="text-rose-300">Erreur de chargement.</div>'; return; }
	const { data } = r;
	const svg = renderHeatmapSVG(data, {});
	graphContainer.innerHTML = svg;
	graphMeta.textContent = `Total ${type==='all'?'(films+séries)':type} ${year} : ${data.sum} visionnage(s) · jours actifs : ${data.daysWithCount} · max/jour : ${data.max}`;
  } catch {
	graphContainer.innerHTML = '<div class="text-rose-300">API /api/graph indisponible.</div>';
  }
}
graphTypeSel?.addEventListener('change', loadAndRenderGraph);
graphYearSel?.addEventListener('change', loadAndRenderGraph);

// --- Overview modal logic ---
const ovModal  = document.getElementById('ovModal');
const ovClose  = document.getElementById('ovClose');
const ovTitle  = document.getElementById('ovTitle');
const ovChips  = document.getElementById('ovChips');
const ovBody   = document.getElementById('ovBody');
const ovText   = document.getElementById('ovText');
const ovLinks  = document.getElementById('ovLinks');

function openOverview(d){
  ovTitle.textContent = d.title || '';
  ovChips.innerHTML = `
	${d.year ? `<span class="chip"><i class="fa-regular fa-calendar mr-1"></i>${d.year}</span>` : ''}
	${d.kind ? `<span class="chip"><i class="fa-solid ${d.kind==='show'?'fa-tv':'fa-film'} mr-1"></i>${d.kind==='show'?'Série':'Film'}</span>` : ''}
  `;
  ovText.textContent = d.overview || '—';
  ovLinks.innerHTML = `
	${d.trakt ? `<a class="chip" href="${d.trakt}" target="_blank"><i class="fa-solid fa-link mr-1"></i>Trakt</a>` : ''}
	${d.tmdb  ? `<a class="chip" href="${d.tmdb}"  target="_blank"><i class="fa-solid fa-clapperboard mr-1"></i>TMDB</a>` : ''}
  `;

  ovModal.classList.remove('hidden');
}

function closeOverview(){ ovModal.classList.add('hidden'); }


ovClose?.addEventListener('click', closeOverview);
ovModal?.addEventListener('click', (e)=>{ if (e.target === ovModal) closeOverview(); });
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && !ovModal.classList.contains('hidden')) closeOverview(); });

// délégation : bouton Synopsis sur les cartes
document.addEventListener('click', (e)=>{
  const b = e.target.closest('.js-ov');
  if (!b) return;
  openOverview(b.dataset);
});


/* Go */
applyWidth();
loadData();
