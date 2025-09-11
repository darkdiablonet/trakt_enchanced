/**
 * Charts Module - Chart.js integration
 * Graphiques responsives avec Chart.js
 */

import { UNIFIED_PALETTE } from './graphs.js';
import i18n from './i18n.js';

// Configuration par défaut pour tous les graphiques
const defaultConfig = {
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: window.innerWidth <= 640 ? 1.8 : 2.5, // Ratio plus compact sur mobile
  animation: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: UNIFIED_PALETTE.background + 'e6',  // 90% opacity
      titleColor: '#e2e8f0',
      bodyColor: '#cbd5e1',
      borderColor: UNIFIED_PALETTE.border,
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: false
    }
  },
  scales: {
    x: {
      grid: {
        color: UNIFIED_PALETTE.border + '0d',  // 5% opacity
        borderColor: UNIFIED_PALETTE.border + '1a'  // 10% opacity
      },
      ticks: {
        color: '#64748b',
        font: {
          size: 11
        }
      }
    },
    y: {
      grid: {
        color: UNIFIED_PALETTE.border + '0d',  // 5% opacity
        borderColor: UNIFIED_PALETTE.border + '1a'  // 10% opacity
      },
      ticks: {
        color: '#64748b',
        font: {
          size: 11
        }
      }
    }
  }
};

// Configuration pour graphique en barres
const barConfig = {
  ...defaultConfig,
  plugins: {
    ...defaultConfig.plugins,
    tooltip: {
      ...defaultConfig.plugins.tooltip,
      callbacks: {
        title: function(context) {
          return context[0].label;
        },
        label: function(context) {
          return context.parsed.y + ' min';
        }
      }
    }
  }
};

// Stockage des instances Chart.js
const chartInstances = {};

// Fonction pour détruire un graphique existant
function destroyChart(chartId) {
  if (chartInstances[chartId]) {
    chartInstances[chartId].destroy();
    delete chartInstances[chartId];
  }
}

// Créer graphique des heures
export function createHoursChart(data) {
  // Sauvegarder les données pour re-render lors du changement de langue
  lastChartsData.hours = data;
  
  destroyChart('proChartHours');
  
  const ctx = document.getElementById('proChartHours');
  if (!ctx) return;
  
  const labels = Array.from({length: 24}, (_, i) => i + 'h');
  
  chartInstances['proChartHours'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data || Array(24).fill(0),
        backgroundColor: UNIFIED_PALETTE.colors[3],  // Vert vif de la heatmap
        borderColor: UNIFIED_PALETTE.colors[2],      // Bleu moyen
        borderWidth: 1,
        borderRadius: 2,
        borderSkipped: false
      }]
    },
    options: {
      ...barConfig,
      plugins: {
        ...barConfig.plugins,
        tooltip: {
          ...barConfig.plugins.tooltip,
          callbacks: {
            title: function(context) {
              return `${context[0].label}`;
            },
            label: function(context) {
              return `${context.parsed.y} minutes`;
            }
          }
        }
      }
    }
  });
}

// Créer graphique des jours de la semaine
export function createWeekChart(data) {
  // Sauvegarder les données pour re-render lors du changement de langue
  lastChartsData.weekday = data;
  
  destroyChart('proChartWeek');
  
  const ctx = document.getElementById('proChartWeek');
  if (!ctx) return;
  
  const labels = i18n.t('calendar.weekdays_chart');
  
  chartInstances['proChartWeek'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data || Array(7).fill(0),
        backgroundColor: UNIFIED_PALETTE.colors[3],  // Vert vif de la heatmap
        borderColor: UNIFIED_PALETTE.colors[2],      // Bleu moyen
        borderWidth: 1,
        borderRadius: 2,
        borderSkipped: false
      }]
    },
    options: {
      ...barConfig,
      plugins: {
        ...barConfig.plugins,
        tooltip: {
          ...barConfig.plugins.tooltip,
          callbacks: {
            title: function(context) {
              return labels[context[0].dataIndex];
            },
            label: function(context) {
              return `${context.parsed.y} minutes`;
            }
          }
        }
      }
    }
  });
}

// Créer graphique d'évolution par mois
export function createMonthsChart(monthsObj) {
  // Sauvegarder les données pour re-render lors du changement de langue
  lastChartsData.months = monthsObj;
  
  destroyChart('proChartMonths');
  
  const ctx = document.getElementById('proChartMonths');
  if (!ctx) return;
  
  const monthsKeys = Object.keys(monthsObj || {}).sort();
  const labels = monthsKeys.map(k => k.slice(5));
  const data = monthsKeys.map(k => monthsObj[k].minutes || 0);
  
  chartInstances['proChartMonths'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: UNIFIED_PALETTE.colors[3] + '1a',  // Vert vif + 10% opacity
        borderColor: UNIFIED_PALETTE.colors[3],              // Vert vif
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: UNIFIED_PALETTE.colors[4],  // Orange
        pointBorderColor: UNIFIED_PALETTE.colors[1],       // Bleu sombre
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      ...defaultConfig,
      plugins: {
        ...defaultConfig.plugins,
        tooltip: {
          ...defaultConfig.plugins.tooltip,
          callbacks: {
            title: function(context) {
              return `Mois ${context[0].label}`;
            },
            label: function(context) {
              return `${context.parsed.y} minutes`;
            }
          }
        }
      },
      scales: {
        ...defaultConfig.scales,
        y: {
          ...defaultConfig.scales.y,
          beginAtZero: true
        }
      }
    }
  });
}

// Fonction pour redimensionner tous les graphiques
export function resizeAllCharts() {
  Object.values(chartInstances).forEach(chart => {
    chart.resize();
  });
}

// Note: fonction createHeatmap supprimée - on utilise maintenant renderHeatmapSVG

// Nettoyage lors du changement de page
export function destroyAllCharts() {
  Object.keys(chartInstances).forEach(chartId => {
    destroyChart(chartId);
  });
}

// Variable pour stocker les dernières données des charts
let lastChartsData = {
  hours: null,
  weekday: null,
  months: null
};

// Re-créer les graphiques quand la langue change
window.addEventListener('languageChanged', () => {
  
  // Re-créer les graphiques avec les nouvelles traductions si on a les données
  if (lastChartsData.hours !== null) {
    createHoursChart(lastChartsData.hours);
  }
  if (lastChartsData.weekday !== null) {
    createWeekChart(lastChartsData.weekday);
  }
  if (lastChartsData.months !== null) {
    createMonthsChart(lastChartsData.months);
  }
  
});