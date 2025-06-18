// LockIt Chrome Extension Popup Script

const LOCKIT_SERVER_URL = 'http://localhost:4242';

// Check if LockIt app is running
async function checkLockItConnection() {
  const statusElement = document.getElementById('status');
  
  try {
    const response = await fetch(`${LOCKIT_SERVER_URL}/status`, {
      method: 'GET',
      timeout: 3000
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.monitoring) {
        statusElement.className = 'status connected';
        statusElement.innerHTML = '✅ Connected - Monitoring Active';
      } else {
        statusElement.className = 'status monitoring-disabled';
        statusElement.innerHTML = '⚠️ Connected - Monitoring Disabled';
      }
      
      return { connected: true, monitoring: data.monitoring };
    } else {
      throw new Error('LockIt app responded with error');
    }
  } catch (error) {
    statusElement.className = 'status disconnected';
    statusElement.innerHTML = '❌ LockIt App Not Running';
    return { connected: false, monitoring: false };
  }
}

// Display blocked sites
function displayBlockedSites(sites) {
  const siteList = document.getElementById('siteList');
  
  if (!sites || sites.length === 0) {
    siteList.innerHTML = '<div style="text-align: center; color: #999; font-size: 12px;">No blocked sites configured</div>';
    return;
  }
  
  siteList.innerHTML = sites.map(site => 
    `<div class="site-item">${site}</div>`
  ).join('');
}

// Load blocked sites from background script
async function loadBlockedSites() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getBlockedSites' });
    displayBlockedSites(response.sites);
  } catch (error) {
    console.error('Error loading blocked sites:', error);
    document.getElementById('siteList').innerHTML = 
      '<div style="text-align: center; color: #f00; font-size: 12px;">Error loading sites</div>';
  }
}

// Refresh blocked sites from LockIt app
async function refreshBlockedSites() {
  const refreshBtn = document.getElementById('refreshBtn');
  const originalText = refreshBtn.innerHTML;
  
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '🔄 Refreshing...';
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'refreshBlockedSites' });
    if (response.success) {
      displayBlockedSites(response.sites);
      
      // Show success feedback
      refreshBtn.innerHTML = '✅ Refreshed!';
      setTimeout(() => {
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
      }, 1500);
    } else {
      throw new Error('Failed to refresh');
    }
  } catch (error) {
    console.error('Error refreshing blocked sites:', error);
    refreshBtn.innerHTML = '❌ Failed';
    setTimeout(() => {
      refreshBtn.innerHTML = originalText;
      refreshBtn.disabled = false;
    }, 2000);
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Check connection status
  await checkLockItConnection();
  
  // Load blocked sites
  await loadBlockedSites();
  
  // Set up refresh button
  document.getElementById('refreshBtn').addEventListener('click', refreshBlockedSites);
});

// Refresh connection status every 5 seconds
setInterval(checkLockItConnection, 5000);
