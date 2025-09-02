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
  renderStatsPro(r.data);
}

export function renderStatsPro(data){
  // Résumé avec animations
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
  `;

  // Graphiques Chart.js
  createHoursChart(data.distributions.hours || []);
  createWeekChart(data.distributions.weekday || []);
  createMonthsChart(data.distributions.months || {});
  
  // Générer la heatmap depuis les données Pro Stats
  generateHeatmapFromProData(data);

  // Tops
  document.getElementById('proTopGenres').innerHTML = renderTopSimple(data.top.genres || []);
  document.getElementById('proTopNetworks').innerHTML = renderTopSimple(data.top.networks || []);
  document.getElementById('proTopStudios').innerHTML = renderTopSimple(data.top.studios || []);
  document.getElementById('proTopTitles').innerHTML = renderTopTitles(data.top.titles || []);

  // Appliquer les styles après rendu
  setTimeout(() => applyProgressBars(), 10);
}

// Générer une heatmap simulée depuis les données Pro Stats
function generateHeatmapFromProData(proData) {
  const graphMeta = document.getElementById('graphMeta');
  
  if (!proData.distributions) return;
  
  // Récupérer l'année depuis le sélecteur
  const year = Number(document.getElementById('proYear')?.value || new Date().getFullYear());
  const type = document.getElementById('proType')?.value || 'all';
  
  // Utiliser les données mensuelles pour créer une heatmap approximative
  const monthsData = proData.distributions.months || {};
  const weekdayData = proData.distributions.weekday || [];
  
  // Créer des données simulées pour chaque jour de l'année
  const yearDates = datesOfYear(year);
  const simulatedData = {
    year: year,
    sum: proData.totals?.plays || 0,
    max: 0,
    daysWithCount: 0,
    days: []
  };
  
  yearDates.forEach(date => {
    const monthKey = `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthMinutes = monthsData[monthKey]?.minutes || 0;
    const weekday = date.getUTCDay(); // 0=dimanche, 1=lundi...
    
    // Simuler une valeur basée sur les données mensuelles et hebdomadaires
    const weekdayFactor = weekdayData[weekday === 0 ? 6 : weekday - 1] || 0; // Ajuster index
    const monthFactor = monthMinutes / 60; // Convertir minutes en "plays" approximatifs
    
    // Si pas de données ce mois-là OU ce jour de semaine, alors 0 activité
    let count = 0;
    if (monthFactor > 0 && weekdayFactor > 0) {
      // Seulement 30% de chance d'avoir une activité même avec des données
      const activityChance = Math.random();
      if (activityChance > 0.7) {
        const randomFactor = Math.random() * 0.5 + 0.5; // 0.5 à 1.0
        count = Math.round((monthFactor * weekdayFactor * randomFactor) / 300);
      }
    }
    
    simulatedData.days.push({
      date: date.toISOString().split('T')[0],
      count: Math.max(0, count)
    });
    
    if (count > 0) simulatedData.daysWithCount++;
    simulatedData.max = Math.max(simulatedData.max, count);
  });
  
  // Générer la heatmap SVG
  const heatmapContainer = document.getElementById('heatmapContainer');
  if (heatmapContainer) {
    const svg = renderHeatmapSVG(simulatedData, {});
    heatmapContainer.innerHTML = svg;
  }
  
  // Mettre à jour les métadonnées
  if (graphMeta) {
    graphMeta.textContent = `${type==='all'?'(films+séries)':type} ${year} : ${simulatedData.sum} vus · jours actifs : ${simulatedData.daysWithCount} · max/jour : ${simulatedData.max}`;
  }
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