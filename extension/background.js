// LockIt Chrome Extension Background Script
// Monitors web navigation and blocks access to locked websites

const LOCKIT_SERVER_URL = 'http://localhost:4242';

// Blocked sites (will be loaded from LockIt app)
let blockedSites = [];

// Fetch blocked sites from LockIt app on startup
async function fetchBlockedSites() {
  try {
    const response = await fetch(`${LOCKIT_SERVER_URL}/blocklist`);
    if (response.ok) {
      const data = await response.json();
      blockedSites = data.sites || blockedSites;
      console.log('✅ Updated blocked sites from LockIt app:', blockedSites);
    }
  } catch (error) {
    console.log('⚠️ Could not fetch blocked sites from LockIt app, using defaults');
  }
}

// Check if a domain matches any blocked site
function isDomainBlocked(domain) {
  return blockedSites.some(site => 
    domain.includes(site) || 
    domain === site ||
    domain.endsWith('.' + site)
  );
}

// Check if LockIt monitoring is active
async function checkMonitoringStatus() {
  try {
    const response = await fetch(`${LOCKIT_SERVER_URL}/status`);
    if (response.ok) {
      const data = await response.json();
      return data.monitoring === true;
    }
  } catch (error) {
    console.log('⚠️ Could not check LockIt monitoring status:', error);
  }
  return false;
}

// Send block request to LockIt app (now for logging purposes only)
async function sendBlockRequest(site, tabId) {
  try {
    const response = await fetch(`${LOCKIT_SERVER_URL}/block`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site: site,
        source: 'chrome',
        tabId: tabId
      })
    });

    if (response.ok) {
      const data = await response.json();
      
      console.log('🔍 Block request response for', site, ':', data);
      
      if (data.temporaryUnlock) {
        console.log('🔓 Website is temporarily unlocked:', site);
        return { shouldBlock: false, reason: 'temporarily_unlocked' };
      } else if (data.monitoring === false) {
        console.log('📴 Monitoring disabled for:', site);
        return { shouldBlock: false, reason: 'monitoring_disabled' };
      } else {
        console.log('🚫 Website should be blocked:', site);
        return { shouldBlock: true, reason: 'blocked' };
      }
    } else {
      console.log('⚠️ LockIt app returned HTTP error for block request');
      return { shouldBlock: false, reason: 'http_error' };
    }
  } catch (error) {
    console.log('⚠️ Could not reach LockIt app:', error);
    return { shouldBlock: false, reason: 'connection_error' };
  }
}

// Handle web navigation events
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only process main frame navigation (not iframes)
  if (details.frameId !== 0) return;

  try {
    const url = new URL(details.url);
    const domain = url.hostname;

    // Skip local and special URLs
    if (domain === 'localhost' || 
        domain.startsWith('127.') || 
        url.protocol === 'chrome:' || 
        url.protocol === 'chrome-extension:' ||
        url.protocol === 'moz-extension:') {
      return;
    }

    console.log('🌐 Checking navigation to:', domain);

    if (isDomainBlocked(domain)) {
      console.log('🚫 Blocked site detected:', domain);
      
      // Send block request to LockIt app (this will check monitoring status and temporary unlocks)
      const blockResult = await sendBlockRequest(domain, details.tabId);
      
      if (blockResult.shouldBlock) {
        console.log('🚫 Redirecting to block page for:', domain);
        // Redirect to block page instead of closing tab
        chrome.tabs.update(details.tabId, {
          url: chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(domain)
        }).catch(err => {
          console.log('Could not redirect tab:', err);
        });
      } else if (blockResult.reason === 'temporarily_unlocked') {
        // Website is temporarily unlocked - allow access
        console.log('🔓 Allowing access to temporarily unlocked website:', domain);
      } else if (blockResult.reason === 'monitoring_disabled') {
        // Monitoring is disabled - allow access
        console.log('📴 LockIt monitoring is disabled - allowing access to:', domain);        } else if (blockResult.reason === 'connection_error') {
        // Fallback: redirect to a blocked page even if LockIt app is not running
        console.log('❌ LockIt app not responding - showing fallback blocked page for:', domain);
        chrome.tabs.update(details.tabId, {
          url: chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(domain)
        }).catch(err => {
          console.log('Could not redirect tab:', err);
        });
      } else {
        console.log('❓ Unknown block result reason:', blockResult.reason);
      }
    }
  } catch (error) {
    console.log('Error processing navigation:', error);
  }
}, { 
  url: [{ schemes: ["http", "https"] }] 
});

// Listen for tab updates (in case navigation events are missed)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;

      if (isDomainBlocked(domain)) {
        console.log('🚫 Blocked site detected via tab update:', domain);
        
        // Send block request to LockIt app (this will check monitoring status and temporary unlocks)
        const blockResult = await sendBlockRequest(domain, tabId);
        
        if (blockResult.shouldBlock) {
          console.log('🚫 Redirecting to block page via tab update for:', domain);
          chrome.tabs.update(tabId, {
            url: chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(domain)
          }).catch(err => {
            console.log('Could not redirect tab:', err);
          });
        } else if (blockResult.reason === 'temporarily_unlocked') {
          // Website is temporarily unlocked - allow access
          console.log('🔓 Allowing access to temporarily unlocked website via tab update:', domain);
        } else if (blockResult.reason === 'monitoring_disabled') {
          // Monitoring is disabled - allow access
          console.log('📴 LockIt monitoring is disabled - allowing access via tab update to:', domain);
        } else if (blockResult.reason === 'connection_error') {
          console.log('❌ LockIt app not responding - showing fallback blocked page via tab update for:', domain);
          chrome.tabs.update(tabId, {
            url: chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(domain)
          }).catch(err => {
            console.log('Could not redirect tab:', err);
          });
        } else {
          console.log('❓ Unknown block result reason via tab update:', blockResult.reason);
        }
      }
    } catch (error) {
      console.log('Error processing tab update:', error);
    }
  }
});

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('🧩 LockIt Chrome Extension installed');
  fetchBlockedSites();
});

// Periodically refresh blocked sites from LockIt app
setInterval(fetchBlockedSites, 30000); // Every 30 seconds

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getBlockedSites') {
    sendResponse({ sites: blockedSites });
  } else if (request.action === 'refreshBlockedSites') {
    fetchBlockedSites().then(() => {
      sendResponse({ success: true, sites: blockedSites });
    });
  }
  return true; // Keep message channel open for async response
});
