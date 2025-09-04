/**
 * Live Updates Module
 * Automatic updates when new data is available from monitor
 */

import { loadData } from './data.js';
import { state } from './state.js';
import { renderCurrent } from './rendering.js';

let updateInterval = null;
let lastActivityTimestamp = null;
let isUpdating = false;

// Configuration
const CHECK_INTERVAL = 45000; // Check every 45 seconds
const MIN_UPDATE_INTERVAL = 30000; // Minimum 30s between data reloads

/**
 * Check if new data is available by comparing activity timestamps
 */
async function checkForUpdates() {
  if (isUpdating) {
    console.log('[live-updates] Update already in progress, skipping...');
    return;
  }

  try {
    // Check monitor status and last activities
    const response = await fetch('/api/monitor-status', { cache: 'no-store' });
    if (!response.ok) return;
    
    const monitorData = await response.json();
    
    if (!monitorData.ok || !monitorData.running) {
      console.log('[live-updates] Monitor not running');
      return;
    }

    // Get last activities to compare timestamps
    const activitiesResponse = await fetch('/api/last-activities', { cache: 'no-store' });
    if (!activitiesResponse.ok) return;
    
    const activitiesData = await activitiesResponse.json();
    if (!activitiesData.ok) return;

    // Check if there are new watch activities
    const currentWatchedAt = Math.max(
      new Date(activitiesData.activities?.episodes?.watched_at || 0).getTime(),
      new Date(activitiesData.activities?.movies?.watched_at || 0).getTime()
    );

    // If we have a previous timestamp and it's different, reload data
    if (lastActivityTimestamp !== null && currentWatchedAt > lastActivityTimestamp) {
      console.log('[live-updates] New watch activity detected, updating data...');
      await updateData();
    } else if (Math.random() < 0.05) { // Log status occasionally (5% chance)
      console.log('[live-updates] No new activity detected');
    }
    
    lastActivityTimestamp = currentWatchedAt;
    
  } catch (error) {
    console.error('[live-updates] Error checking for updates:', error.message);
  }
}

/**
 * Wait for server rebuild to complete before updating data
 */
async function waitForRebuildComplete(maxWaitTime = 15000) {
  const startWait = Date.now();
  
  while (Date.now() - startWait < maxWaitTime) {
    try {
      const response = await fetch('/api/rebuild-status', { cache: 'no-store' });
      if (!response.ok) break;
      
      const status = await response.json();
      if (!status.isRebuilding) {
        console.log('[live-updates] Server rebuild completed, proceeding with client update');
        return true;
      }
      
      console.log('[live-updates] Waiting for server rebuild to complete...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
    } catch (error) {
      console.warn('[live-updates] Error checking rebuild status:', error.message);
      break;
    }
  }
  
  console.log('[live-updates] Proceeding with update (rebuild wait timeout or error)');
  return false;
}

/**
 * Update the page data and re-render
 */
async function updateData() {
  if (isUpdating) return;
  
  isUpdating = true;
  
  try {
    console.log('[live-updates] New activity detected, waiting for server rebuild...');
    
    // Show updating notification
    showUpdatingNotification();
    
    // Wait for server rebuild to complete
    await waitForRebuildComplete();
    
    console.log('[live-updates] Refreshing page data...');
    const startTime = Date.now();
    
    // Reload data
    await loadData();
    
    // Re-render current tab
    renderCurrent();
    
    // Show a subtle notification
    showUpdateNotification();
    
    const duration = Date.now() - startTime;
    console.log(`[live-updates] Data refreshed in ${duration}ms`);
    
  } catch (error) {
    console.error('[live-updates] Error updating data:', error.message);
  } finally {
    isUpdating = false;
  }
}

/**
 * Show updating notification
 */
function showUpdatingNotification() {
  const notification = document.createElement('div');
  notification.id = 'updating-notification';
  notification.className = 'fixed top-4 right-4 z-50 bg-blue-600/90 text-white px-4 py-2 rounded-lg shadow-lg text-sm backdrop-blur-sm';
  notification.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Updating data...';
  
  document.body.appendChild(notification);
  
  // Animate in
  notification.style.transform = 'translateX(100%)';
  notification.style.transition = 'transform 0.3s ease-out';
  
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  return notification;
}

/**
 * Show a subtle notification that data was updated
 */
function showUpdateNotification() {
  // Remove updating notification if exists
  const updatingNotification = document.getElementById('updating-notification');
  if (updatingNotification) {
    updatingNotification.remove();
  }
  
  // Create success notification
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 z-50 bg-green-600/90 text-white px-4 py-2 rounded-lg shadow-lg text-sm backdrop-blur-sm';
  notification.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Data updated';
  
  document.body.appendChild(notification);
  
  // Animate in
  notification.style.transform = 'translateX(100%)';
  notification.style.transition = 'transform 0.3s ease-out';
  
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

/**
 * Start live updates
 */
export function startLiveUpdates() {
  if (updateInterval) {
    console.log('[live-updates] Live updates already started');
    return;
  }
  
  console.log(`[live-updates] Starting live updates (checking every ${CHECK_INTERVAL/1000}s)`);
  
  // Initial check
  checkForUpdates();
  
  // Set up interval
  updateInterval = setInterval(checkForUpdates, CHECK_INTERVAL);
}

/**
 * Stop live updates
 */
export function stopLiveUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('[live-updates] Live updates stopped');
  }
}

/**
 * Get live updates status
 */
export function getLiveUpdatesStatus() {
  return {
    active: !!updateInterval,
    lastCheck: lastActivityTimestamp,
    isUpdating
  };
}

// Manual update function for debugging
export function forceUpdate() {
  console.log('[live-updates] Force updating...');
  updateData();
}