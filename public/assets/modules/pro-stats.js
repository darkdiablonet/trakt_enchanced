/**
 * Pro Stats Module
 * Gestion des statistiques avancées
 */

import { renderTopSimple, renderTopTitles } from './rendering.js';
import { barChartSVG } from './graphs.js';

export function listTable(rows, {cols=[['name','Nom'],['minutes','Min'],['plays','Vus']], limit=10} = {}){
  const toNum = (x)=> typeof x === 'number' ? x : Number(x||0);
  const head = cols.map(([k,lab])=>`<th class="text-left py-1 pr-3 text-muted">${lab}</th>`).join('');
  const body = rows.slice(0, limit).map(r=>{
    return `<tr class="border-b border-white/5">
      ${cols.map(([k])=>`<td class="py-1 pr-3">${(k in r)?(typeof r[k]==='number'?r[k].toLocaleString('fr-FR'):String(r[k])):''}</td>`).join('')}
    </tr>`;
  }).join('');
  return `<table class="min-w-[280px] text-sm">${head?`<thead><tr>${head}</tr></thead>`:''}<tbody>${body||''}</tbody></table>`;
}

export async function loadStatsPro() {
  const type = document.getElementById('proType').value;
  const range = document.getElementById('proRange').value;
  const params = new URLSearchParams();
  params.set('type', type);
  if (range === 'year') {
    params.set('range','year');
    params.set('year', document.getElementById('proYear').value);
  } else {
    params.set('range','lastDays');
    params.set('lastDays', document.getElementById('proDays').value || '365');
  }
  const r = await fetch(`/api/stats/pro?${params.toString()}`, { cache:'no-store' }).then(x=>x.json());
  if (!r.ok) throw new Error(r.error || 'stats error');
  renderStatsPro(r.data);
}

export function renderStatsPro(data){
  // Résumé
  const sumEl = document.getElementById('proSummary');
  const T = data.totals || {};
  sumEl.innerHTML = `
    <div class="glass rounded-xl p-3"><div class="text-xs text-muted">Vus</div><div class="text-2xl font-semibold">${(T.plays||0).toLocaleString('fr-FR')}</div></div>
    <div class="glass rounded-xl p-3"><div class="text-xs text-muted">Films</div><div class="text-2xl font-semibold">${(T.movies||0).toLocaleString('fr-FR')}</div></div>
    <div class="glass rounded-xl p-3"><div class="text-xs text-muted">Épisodes</div><div class="text-2xl font-semibold">${(T.episodes||0).toLocaleString('fr-FR')}</div></div>
    <div class="glass rounded-xl p-3"><div class="text-xs text-muted">Heures</div><div class="text-2xl font-semibold">${(T.hours||0).toLocaleString('fr-FR')}</div></div>
  `;

  // Graphiques
  const labelsHours = Array.from({length:24}, (_,i)=>String(i));
  document.getElementById('proChartHours').innerHTML =
    barChartSVG(data.distributions.hours || [], { labels: labelsHours, w: 760, h: 180 });

  const labelsWeek = ['L','M','M','J','V','S','D'];
  document.getElementById('proChartWeek').innerHTML =
    barChartSVG(data.distributions.weekday || [], { labels: labelsWeek, w: 360, h: 180 });

  const monthsObj = data.distributions.months || {};
  const monthsKeys = Object.keys(monthsObj).sort();
  const monthLabels = monthsKeys.map(k => k.slice(5));
  const monthValues = monthsKeys.map(k => monthsObj[k].minutes || 0);
  document.getElementById('proChartMonths').innerHTML =
    barChartSVG(monthValues, { labels: monthLabels, w: Math.max(640, 36*monthValues.length), h: 180, titleFormatter:(v)=>`${v} min` });

  // Tops
  document.getElementById('proTopGenres').innerHTML = renderTopSimple(data.top.genres || []);
  document.getElementById('proTopNetworks').innerHTML = renderTopSimple(data.top.networks || []);
  document.getElementById('proTopStudios').innerHTML = renderTopSimple(data.top.studios || []);
  document.getElementById('proTopTitles').innerHTML = renderTopTitles(data.top.titles || []);

  // Métadonnées
  const meta = document.getElementById('graphMeta');
  if (meta) meta.textContent = `Fuseau: Europe/Paris · Période: ${data.start} → ${data.end}`;
}

// Initialisation du sélecteur d'année
(function initProYear(){
  const ySel = document.getElementById('proYear');
  if (ySel) {
    const nowY = new Date().getFullYear();
    const years = [];
    for (let y=nowY; y>=nowY-10; y--) years.push(y);
    ySel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
    ySel.value = String(nowY);
  }
})();

// Event listeners
document.getElementById('proRange')?.addEventListener('change', (e)=>{
  const isYear = e.target.value === 'year';
  document.getElementById('proYearWrap')?.classList.toggle('hidden', !isYear);
  document.getElementById('proDaysWrap')?.classList.toggle('hidden', isYear);
});

document.getElementById('proReload')?.addEventListener('click', loadStatsPro);
document.getElementById('proType')?.addEventListener('change', loadStatsPro);
document.getElementById('proYear')?.addEventListener('change', loadStatsPro);
document.getElementById('proDays')?.addEventListener('change', loadStatsPro);