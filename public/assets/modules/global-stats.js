export async function loadGlobalStats() {
  try {
    const response = await fetch('/api/stats');
    const data = await response.json();
    
    if (!data.ok || !data.stats) {
      console.error('Failed to load global stats');
      return;
    }
    
    const stats = data.stats;
    displayGlobalStats(stats);
  } catch (error) {
    console.error('Error loading global stats:', error);
  }
}

function displayGlobalStats(stats) {
  // Movies stats
  const moviesWatched = document.getElementById('moviesWatched');
  const moviesCollected = document.getElementById('moviesCollected');
  if (moviesWatched) moviesWatched.textContent = formatNumber(stats.movies?.watched || 0);
  if (moviesCollected) moviesCollected.textContent = formatNumber(stats.movies?.collected || 0);
  
  // Shows stats
  const showsWatched = document.getElementById('showsWatched');
  const showsCollected = document.getElementById('showsCollected');
  if (showsWatched) showsWatched.textContent = formatNumber(stats.shows?.watched || 0);
  if (showsCollected) showsCollected.textContent = formatNumber(stats.shows?.collected || 0);
  
  // Episodes stats
  const episodesWatched = document.getElementById('episodesWatched');
  const episodesCollected = document.getElementById('episodesCollected');
  if (episodesWatched) episodesWatched.textContent = formatNumber(stats.episodes?.watched || 0);
  if (episodesCollected) episodesCollected.textContent = formatNumber(stats.episodes?.collected || 0);
  
  // Watch time
  const totalMinutes = document.getElementById('totalMinutes');
  const totalTime = document.getElementById('totalTime');
  const minutes = stats.movies?.minutes + stats.episodes?.minutes || 0;
  if (totalMinutes) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    totalMinutes.textContent = `${days}d ${hours}h`;
  }
  if (totalTime) {
    totalTime.textContent = `${formatNumber(minutes)} min`;
  }
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}