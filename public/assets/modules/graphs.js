/**
 * Graphs Module
 * Gestion des graphiques et heatmaps
 */

const graphTypeSel = document.getElementById('graphType');
const graphYearSel = document.getElementById('graphYear');
const graphContainer = document.getElementById('graphContainer');
const graphMeta = document.getElementById('graphMeta');

export function fillYearsSelect(selectEl, minYear = 2010) {
  const yNow = new Date().getFullYear();
  selectEl.innerHTML = '';
  for (let y = yNow; y >= minYear; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    selectEl.appendChild(opt);
  }
}

export function colorFor(level) {
  const palette = [
    '#0b1220',  // 0: empty
    '#14532d',  // 1
    '#166534',  // 2
    '#22c55e',  // 3
    '#4ade80'   // 4 (max)
  ];
  return palette[level] || palette[0];
}

export function levelFor(count, max) {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const r = count / max;
  if (r > 0.80) return 4;
  if (r > 0.60) return 3;
  if (r > 0.35) return 2;
  return 1;
}

export function datesOfYear(year) {
  const start = new Date(Date.UTC(year,0,1));
  const end = new Date(Date.UTC(year,11,31));
  const days = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate()+1)) {
    days.push(new Date(d));
  }
  return days;
}

export function renderHeatmapSVG({ year, max, days }, { cell=12, gap=3, top=28, left=38 } = {}) {
  const dates = datesOfYear(year);
  const map = new Map(days.map(d => [d.date, d.count]));
  const dayIndex = (d) => (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1);

  const colIndex = (d) => {
    const jan1 = new Date(Date.UTC(year,0,1));
    const jan1Dow = dayIndex(jan1);
    const monday0 = new Date(jan1); monday0.setUTCDate(jan1.getUTCDate() - jan1Dow);
    const diffDays = Math.floor((d - monday0) / 86400000);
    return Math.floor(diffDays / 7);
  };

  const last = new Date(Date.UTC(year,11,31));
  const cols = Math.max(53, colIndex(last) + 1);

  const monthsRow = 16;
  const legendH = 24;
  const W = left + cols*(cell+gap);
  const H = top + monthsRow + 7*(cell+gap) + legendH;

  const txt = (x,y,s,anchor='start') =>
    `<text x="${x}" y="${y}" fill="#94a3b8" font-size="${s}" text-anchor="${anchor}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial">`;

  const mois = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const monthCols = [];
  for (let m=0; m<12; m++){
    const d0 = new Date(Date.UTC(year, m, 1));
    monthCols.push({ label: mois[m], col: colIndex(d0) });
  }

  const jours = ['L','M','M','J','V','S','D'];

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trakt heatmap ${year}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#0b1220" rx="8" />`;

  // Ligne des mois
  svg += `<g transform="translate(${left},${top})">`;
  for (const m of monthCols) {
    const x = m.col*(cell+gap);
    svg += `${txt(x,12,10)}${m.label}</text>`;
  }
  svg += `</g>`;

  // Axe jours
  svg += `<g transform="translate(0,${top+monthsRow})">`;
  for (let i=0;i<7;i++){
    const y = i*(cell+gap) + cell;
    svg += `${txt(left-10, y, 9, 'end')}${jours[i]}</text>`;
  }
  svg += `</g>`;

  // Cellules
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
    svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" ry="2" 
             fill="${fill}" 
             style="cursor:pointer; transition: all 0.2s ease;"
             onmouseover="this.style.transform='scale(1.2)'; this.style.stroke='#0ea5e9'; this.style.strokeWidth='1'"
             onmouseout="this.style.transform='scale(1)'; this.style.stroke='none'">
      <title>${title}</title>
    </rect>`;
  }
  svg += `</g>`;

  // Légende
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

export async function loadAndRenderGraph() {
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

export function barChartSVG(values, {labels=[], w=640, h=160, pad=24, yTicks=3, titleFormatter=(v)=>v} = {}){
  const n = values.length; if (!n) return '';
  const vmax = Math.max(1, ...values);
  const cw = Math.max(4, Math.floor((w - pad*2) / n));
  const gap = Math.max(1, Math.floor(cw/6));
  const barW = cw - gap;
  const ih = h - pad*2;

  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" class="animate-fade-in">`;
  
  // Gradient definitions
  svg += `<defs>
    <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#22c55e"/>
      <stop offset="100%" style="stop-color:#16a34a"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>`;
  
  svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#0b1220" rx="8"/>`;

  // Axes Y avec style amélioré
  for (let i=0;i<=yTicks;i++){
    const y = pad + ih - Math.round(ih * (i/yTicks));
    const val = Math.round(vmax * (i/yTicks));
    svg += `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="#1e293b" stroke-width="1" opacity="0.7"/>`;
    svg += `<text x="${pad-6}" y="${y+3}" fill="#94a3b8" font-size="10" text-anchor="end" font-family="ui-sans-serif">${titleFormatter(val)}</text>`;
  }

  // Barres avec effets hover
  for (let i=0;i<n;i++){
    const v = values[i];
    const bh = Math.round(ih * (v / vmax));
    const x = pad + i*cw + gap/2;
    const y = pad + ih - bh;
    
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3" fill="url(#barGradient)" 
             style="cursor:pointer; transition: all 0.3s ease;"
             onmouseover="this.style.filter='url(#glow)'; this.style.transform='scaleY(1.05)'"
             onmouseout="this.style.filter='none'; this.style.transform='scaleY(1)'">
      <title>${labels[i] ?? i}: ${titleFormatter(v)}</title>
    </rect>`;
    
    if (labels[i] != null){
      const lbl = String(labels[i]);
      svg += `<text x="${x + barW/2}" y="${h-6}" fill="#94a3b8" font-size="9" text-anchor="middle" 
               font-family="ui-sans-serif">${lbl}</text>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

// Event listeners
if (graphTypeSel) graphTypeSel.addEventListener('change', loadAndRenderGraph);
if (graphYearSel) graphYearSel.addEventListener('change', loadAndRenderGraph);