const LOCKIT_SERVER_URL = 'http://localhost:4242';
let currentSite = '';
let isUnlocking = false;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🔍 LockIt Block Page: DOM loaded');
  console.log('🔍 LockIt Block Page: Current URL:', window.location.href);
  
  // Get the blocked site from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const siteName = urlParams.get('site') || 'Unknown Website';
  currentSite = siteName;
  
  console.log('🔍 LockIt Block Page: Site name:', siteName);
  console.log('🔍 LockIt Block Page: URL params:', window.location.search);
  console.log('🔍 LockIt Block Page: All URL params:', Object.fromEntries(urlParams));
  
  // Update the site name in the DOM
  const siteNameElement = document.getElementById('siteName');
  if (siteNameElement) {
    siteNameElement.textContent = siteName;
    console.log('✅ LockIt Block Page: Site name updated in DOM to:', siteName);
  } else {
    console.error('❌ LockIt Block Page: Could not find siteName element');
  }
  
  // Update page title
  document.title = `${siteName} - Blocked by LockIt`;

  // DOM elements
  const pinInput = document.getElementById('pinInput');
  const unlockBtn = document.getElementById('unlockBtn');
  const errorMessage = document.getElementById('errorMessage');
  const statusMessage = document.getElementById('statusMessage');

  // Verify elements exist
  if (!pinInput || !unlockBtn || !errorMessage || !statusMessage) {
    console.error('❌ LockIt Block Page: Missing required DOM elements');
    return;
  }

  // Event listeners
  pinInput.addEventListener('input', handlePinInput);
  pinInput.addEventListener('keypress', handlePinKeypress);
  unlockBtn.addEventListener('click', attemptUnlock);

  // Focus on PIN input
  pinInput.focus();
  
  console.log('✅ LockIt Block Page: Initialization complete');
});

// Also try immediate execution as fallback
const urlParams = new URLSearchParams(window.location.search);
const siteName = urlParams.get('site') || 'Unknown Website';
currentSite = siteName;

// Try to update immediately if element exists
const siteNameElement = document.getElementById('siteName');
if (siteNameElement) {
  siteNameElement.textContent = siteName;
}

// Update page title
document.title = `${siteName} - Blocked by LockIt`;

// DOM elements
const pinInput = document.getElementById('pinInput');
const unlockBtn = document.getElementById('unlockBtn');
const errorMessage = document.getElementById('errorMessage');
const statusMessage = document.getElementById('statusMessage');

// Event listeners (will be attached again in DOMContentLoaded, but that's okay)
if (pinInput && unlockBtn) {
  pinInput.addEventListener('input', handlePinInput);
  pinInput.addEventListener('keypress', handlePinKeypress);
  unlockBtn.addEventListener('click', attemptUnlock);
}

function handlePinInput() {
  clearMessages();
  // Auto-attempt unlock when PIN reaches 5 digits
  if (pinInput.value.length === 5) {
    setTimeout(attemptUnlock, 300);
  }
}

function handlePinKeypress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    attemptUnlock();
  }
}

async function attemptUnlock() {
  if (isUnlocking) return;
  
  const enteredPin = pinInput.value.trim();
  
  if (!enteredPin) {
    showError('Please enter your PIN');
    return;
  }

  if (enteredPin.length !== 5) {
    showError('PIN must be 5 digits');
    return;
  }

  isUnlocking = true;
  unlockBtn.disabled = true;
  unlockBtn.textContent = '🔄 Verifying...';
  unlockBtn.classList.add('pulse');

  try {
    // Verify PIN with LockIt desktop app
    const response = await fetch(`${LOCKIT_SERVER_URL}/verify-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pin: enteredPin,
        site: currentSite,
        source: 'chrome-extension'
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // PIN is correct - request unlock
      await requestUnlock();
    } else {
      showError(result.error || 'Incorrect PIN');
      pinInput.value = '';
      pinInput.focus();
    }
  } catch (error) {
    console.error('Error verifying PIN:', error);
    showError('Unable to connect to LockIt app. Make sure it\'s running.');
  } finally {
    isUnlocking = false;
    unlockBtn.disabled = false;
    unlockBtn.textContent = '🔓 Unlock';
    unlockBtn.classList.remove('pulse');
  }
}

async function requestUnlock() {
  try {
    showStatus('PIN verified! Requesting unlock...');
    
    const response = await fetch(`${LOCKIT_SERVER_URL}/unlock-website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site: currentSite,
        source: 'chrome-extension'
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showStatus('✅ Website unlocked! Redirecting...');
      
      // Wait a moment then redirect to the original site
      setTimeout(() => {
        window.location.href = `https://${currentSite}`;
      }, 1500);
    } else {
      showError(result.error || 'Failed to unlock website');
    }
  } catch (error) {
    console.error('Error requesting unlock:', error);
    showError('Failed to unlock website. Please try again.');
  }
}

function showError(message) {
  clearMessages();
  errorMessage.textContent = message;
}

function showStatus(message) {
  clearMessages();
  if (statusMessage) {
    statusMessage.textContent = message;
  }
}

function clearMessages() {
  if (errorMessage) errorMessage.textContent = '';
  if (statusMessage) statusMessage.textContent = '';
}
