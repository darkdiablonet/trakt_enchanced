/**
 * Pro Stats Module
 * Gestion des statistiques avancées
 */

import { renderTopSimple, renderTopTitles, applyProgressBars } from './rendering.js';
import { createHoursChart, createWeekChart, createMonthsChart } from './charts.js';
import { datesOfYear, renderHeatmapSVG } from './graphs.js';

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
  await renderStatsPro(r.data);
}

export async function renderStatsPro(data){
  // Récupérer les vraies données heatmap depuis l'API
  const year = Number(document.getElementById('proYear')?.value || new Date().getFullYear());
  const type = document.getElementById('proType')?.value || 'all';
  
  let heatmapData = { daysWithCount: 0, max: 0 };
  try {
    const response = await fetch(`/api/graph?year=${year}&type=${type}`);
    const result = await response.json();
    if (result.ok && result.data) {
      heatmapData = result.data;
    }
  } catch (err) {
    console.error('Erreur lors du chargement des données heatmap:', err);
  }
  
  // Résumé avec animations (6 tuiles maintenant)
  const sumEl = document.getElementById('proSummary');
  const T = data.totals || {};
  sumEl.innerHTML = `
    <div class="glass rounded-xl p-3 animate-fade-in-up hover:scale-105 transition-transform cursor-pointer delay-200">
      <div class="text-xs text-muted">Vus</div>
      <div class="text-2xl font-semibold animate-count-up delay-600">${(T.plays||0).toLocaleString('fr-FR')}</div>
    </div>
    <div class="glass rounded-xl p-3 animate-fade-in-up hover:scale-105 transition-transform cursor-pointer delay-400">
      <div class="text-xs text-muted">Films</div>
      <div class="text-2xl font-semibold animate-count-up delay-800">${(T.movies||0).toLocaleString('fr-FR')}</div>
    </div>
    <div class="glass rounded-xl p-3 animate-fade-in-up hover:scale-105 transition-transform cursor-pointer delay-600">
      <div class="text-xs text-muted">Épisodes</div>
      <div class="text-2xl font-semibold animate-count-up delay-1000">${(T.episodes||0).toLocaleString('fr-FR')}</div>
    </div>
    <div class="glass rounded-xl p-3 animate-fade-in-up hover:scale-105 transition-transform cursor-pointer delay-800">
      <div class="text-xs text-muted">Heures</div>
      <div class="text-2xl font-semibold animate-count-up delay-1200">${(T.hours||0).toLocaleString('fr-FR')}</div>
    </div>
    <div class="glass rounded-xl p-3 animate-fade-in-up hover:scale-105 transition-transform cursor-pointer delay-1000">
      <div class="text-xs text-muted">Jours actifs</div>
      <div class="text-2xl font-semibold animate-count-up delay-1400">${heatmapData.daysWithCount || 0}</div>
    </div>
    <div class="glass rounded-xl p-3 animate-fade-in-up hover:scale-105 transition-transform cursor-pointer delay-1200">
      <div class="text-xs text-muted">Max/jour</div>
      <div class="text-2xl font-semibold animate-count-up delay-1600">${heatmapData.max || 0}</div>
    </div>
  `;

  // Graphiques Chart.js
  createHoursChart(data.distributions.hours || []);
  createWeekChart(data.distributions.weekday || []);
  createMonthsChart(data.distributions.months || {});
  
  // Afficher la heatmap avec les vraies données
  const heatmapContainer = document.getElementById('graphContainer');
  if (heatmapContainer && heatmapData) {
    const svg = renderHeatmapSVG(heatmapData, {});
    heatmapContainer.innerHTML = svg;
  }

  // Tops
  document.getElementById('proTopGenres').innerHTML = renderTopSimple(data.top.genres || []);
  document.getElementById('proTopNetworks').innerHTML = renderTopSimple(data.top.networks || []);
  document.getElementById('proTopStudios').innerHTML = renderTopSimple(data.top.studios || []);
  document.getElementById('proTopTitles').innerHTML = renderTopTitles(data.top.titles || []);

  // Appliquer les styles après rendu
  setTimeout(() => applyProgressBars(), 10);
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
document.getElementById('proDays')?.addEventListener('change', loadStatsPro); // Jours n'affecte que Pro Stats