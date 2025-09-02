/**
 * Charts Module - Chart.js integration
 * Graphiques responsives avec Chart.js
 */

// Configuration par défaut pour tous les graphiques
const defaultConfig = {
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: 2.5,
  animation: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleColor: '#e2e8f0',
      bodyColor: '#cbd5e1',
      borderColor: '#334155',
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: false
    }
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.1)'
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
        color: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.1)'
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
        backgroundColor: '#22c55e',
        borderColor: '#16a34a',
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
  destroyChart('proChartWeek');
  
  const ctx = document.getElementById('proChartWeek');
  if (!ctx) return;
  
  const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  
  chartInstances['proChartWeek'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data || Array(7).fill(0),
        backgroundColor: '#22c55e',
        borderColor: '#16a34a',
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
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderColor: '#22c55e',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#22c55e',
        pointBorderColor: '#16a34a',
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

// Nettoyage lors du changement de page
export function destroyAllCharts() {
  Object.keys(chartInstances).forEach(chartId => {
    destroyChart(chartId);
  });
}