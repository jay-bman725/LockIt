const { app, BrowserWindow, ipcMain, dialog, Menu, shell, globalShortcut } = require('electron');
const path = require('node:path');
const Store = require('electron-store');
const https = require('https');
const express = require('express');
const cors = require('cors');

// Development mode detection
const isDevelopment = process.env.NODE_ENV === 'development' || process.argv.includes('--dev') || !app.isPackaged;

// Import ES modules dynamically
let activeWin, psList;
(async () => {
  try {
    activeWin = (await import('active-win')).default;
    psList = (await import('ps-list')).default;
    console.log('✅ ES modules loaded successfully');
  } catch (error) {
    console.error('Error loading ES modules:', error);
  }
})();

// Initialize secure storage
const store = new Store({
  name: 'lockit-settings',
  defaults: {
    lockedApps: [],
    pin: null, // No default PIN - user must set during onboarding
    unlockDuration: null, // No default - user must set during onboarding
    masterPassword: null, // Master password for security lockdown recovery
    chromeExtensionEnabled: false, // Chrome extension is opt-in during onboarding
    isFirstRun: true,
    isOnboardingComplete: false,
    pinAttempts: 0, // Track failed PIN attempts
    isInSecurityLockdown: false,
    lastLockdownTime: null,
    dismissedUpdates: [], // Track updates user chose not to see again
    lastUpdateCheck: null, // Track last update check time
    // Scheduled monitoring settings
    scheduledMonitoringEnabled: false, // Enable/disable scheduled monitoring
    scheduleStartTime: '09:00', // Default start time (24-hour format)
    scheduleEndTime: '17:00', // Default end time (24-hour format)
    scheduleDays: [1, 2, 3, 4, 5], // Default: Monday-Friday (0=Sunday, 6=Saturday)
    autoStartScheduledMonitoring: true, // Auto-start monitoring during scheduled hours
    // Auto-restart monitoring settings
    wasMonitoringEnabled: false, // Track if monitoring was active before shutdown
    lastShutdownTime: null, // Track when the app was last shut down
    autoRestartMonitoring: true, // Enable auto-restart on app reboot
    lastAppSession: null // Track app session for crash detection
  }
});

// Update checking configuration
const UPDATE_CONFIG = {
  versionUrl: 'https://raw.githubusercontent.com/jay-bman725/LockIt/refs/heads/main/version',
  changelogUrl: 'https://raw.githubusercontent.com/jay-bman725/LockIt/refs/heads/main/CHANGELOG.md',
  releaseBaseUrl: 'https://github.com/jay-bman725/LockIt/releases/tag/v',
  checkInterval: 24 * 60 * 60 * 1000 // Check once per day
};

let mainWindow;
let lockOverlay;
let isMonitoring = false;
let monitoringInterval;
let cleanupInterval;
let refocusInterval;
let securityLockdownRefocusInterval;
let lockOverlayRefocusInterval;
let temporaryUnlocks = new Map(); // Track temporary unlocks by process info
let currentLockedApp = null; // Track currently locked app details

// Scheduled monitoring variables
let scheduleCheckInterval = null; // Check schedule every minute
let isInScheduledHours = false; // Track if currently in scheduled hours
let wasAutoStarted = false; // Track if monitoring was auto-started by schedule

// HTTP Server for Chrome Extension Integration
let httpServer = null;
const HTTP_SERVER_PORT = 4242;

// Failsafe function to ensure security lockdown is properly handled
function ensureSecurityLockdownState() {
  if (isInSecurityLockdown()) {
    console.log('🚨 Failsafe: Ensuring security lockdown state is properly displayed');
    
    // Close main window if it exists and we're in lockdown
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('🚨 Closing main window - system is in security lockdown');
      mainWindow.close();
      mainWindow = null;
    }
    
    // Ensure lockdown screen is shown and focused
    if (!global.securityLockdownOverlay || global.securityLockdownOverlay.isDestroyed()) {
      console.log('🚨 Security lockdown overlay missing - creating it');
      showSecurityLockdownScreen();
    } else {
      // Verify focus and visibility
      if (!global.securityLockdownOverlay.isFocused()) {
        console.log('🚨 Security lockdown overlay not focused - refocusing');
        global.securityLockdownOverlay.focus();
        global.securityLockdownOverlay.moveTop();
      }
      
      if (!global.securityLockdownOverlay.isVisible()) {
        console.log('🚨 Security lockdown overlay not visible - showing');
        global.securityLockdownOverlay.show();
        global.securityLockdownOverlay.focus();
      }
      
      if (!global.securityLockdownOverlay.isFullScreen()) {
        console.log('🚨 Security lockdown overlay not fullscreen - forcing fullscreen');
        global.securityLockdownOverlay.setFullScreen(true);
      }
    }
    
    return true;
  }
  return false;
}

// Create the main application window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../assets/icon.png'), // We'll create this later
    show: false // Hide until ready
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Check if onboarding is needed
    const isOnboardingComplete = store.get('isOnboardingComplete', false);
    if (!isOnboardingComplete || store.get('isFirstRun', true)) {
      // Load onboarding screen instead
      mainWindow.loadFile(path.join(__dirname, '../renderer/onboarding.html'));
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create full-screen lock overlay
function createLockOverlay(appInfo) {
  // Don't create multiple overlays for the same process
  if (lockOverlay && !lockOverlay.isDestroyed()) {
    console.log('🔒 Lock overlay already exists, focusing it');
    lockOverlay.focus();
    return;
  }

  lockOverlay = new BrowserWindow({
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  lockOverlay.loadFile(path.join(__dirname, '../renderer/lock.html'));

  // Send app info to lock screen
  lockOverlay.webContents.once('dom-ready', () => {
    lockOverlay.webContents.send('app-locked', appInfo);
  });

  // Prevent closing and refocus
  lockOverlay.on('close', (event) => {
    event.preventDefault();
    console.log('🔒 Attempted to close lock overlay - preventing and refocusing');
    lockOverlay.focus();
  });

  // Prevent minimize and refocus
  lockOverlay.on('minimize', (event) => {
    event.preventDefault();
    console.log('🔒 Attempted to minimize lock overlay - preventing and refocusing');
    lockOverlay.restore();
    lockOverlay.focus();
  });

  // Refocus when losing focus - enhanced detection
  lockOverlay.on('blur', () => {
    console.log('🔒 Lock overlay lost focus - implementing enhanced refocus');
    setTimeout(() => {
      enforceWindowFocus(lockOverlay, 'lock-overlay');
    }, 100);
  });

  // Enhanced focus detection with aggressive monitoring
  lockOverlayRefocusInterval = createAggressiveFocusMonitoring(lockOverlay, 'lock-overlay', 1000);

  // Handle overlay destroyed (should only happen when properly unlocked)
  lockOverlay.on('closed', () => {
    console.log('🔒 Lock overlay closed');
    if (lockOverlayRefocusInterval) {
      clearInterval(lockOverlayRefocusInterval);
      lockOverlayRefocusInterval = null;
    }
    lockOverlay = null;
    currentLockedApp = null;
  });

  // Prevent navigation away from lock screen
  lockOverlay.webContents.on('will-navigate', (event) => {
    event.preventDefault();
    console.log('🔒 Prevented navigation from lock screen');
  });

  // Prevent new window creation
  lockOverlay.webContents.setWindowOpenHandler(() => {
    console.log('🔒 Prevented new window from lock screen');
    return { action: 'deny' };
  });

  // Add security event listeners
  addSecurityEventListeners(lockOverlay, 'lock-overlay');

  lockOverlay.focus();
}

// Security lockdown functions
function isInSecurityLockdown() {
  return store.get('isInSecurityLockdown', false);
}

function activateSecurityLockdown() {
  store.set('isInSecurityLockdown', true);
  store.set('lastLockdownTime', Date.now());
  console.log('🚨 Security lockdown activated!');
  
  // Close any existing lock overlays when transitioning to security lockdown
  if (lockOverlay && !lockOverlay.isDestroyed()) {
    console.log('🔒 Closing lock overlay for security lockdown transition');
    lockOverlay.removeAllListeners();
    lockOverlay.destroy();
    lockOverlay = null;
  }
  
  // Stop monitoring
  stopMonitoring();
  
  // Show lockdown screen
  showSecurityLockdownScreen();
}

function deactivateSecurityLockdown() {
  store.set('isInSecurityLockdown', false);
  store.set('pinAttempts', 0); // Reset PIN attempts
  console.log('✅ Security lockdown deactivated');
  
  // Close the security lockdown overlay if it exists
  if (global.securityLockdownOverlay && !global.securityLockdownOverlay.isDestroyed()) {
    console.log('🔒 Closing security lockdown overlay');
    
    // Clear the refocus interval
    if (global.securityLockdownOverlay.refocusInterval) {
      clearInterval(global.securityLockdownOverlay.refocusInterval);
    }
    
    global.securityLockdownOverlay.removeAllListeners();
    global.securityLockdownOverlay.destroy();
    global.securityLockdownOverlay = null;
  }
  
  // Create main window if it doesn't exist
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log('🪟 Creating main window after security lockdown');
    createMainWindow();
  } else {
    // Focus existing main window
    mainWindow.focus();
  }
}

function incrementPinAttempts() {
  const currentAttempts = store.get('pinAttempts', 0);
  const newAttempts = currentAttempts + 1;
  store.set('pinAttempts', newAttempts);
  
  console.log(`❌ Failed PIN attempt ${newAttempts}/10`);
  
  if (newAttempts >= 10) {
    activateSecurityLockdown();
    return true; // Indicates lockdown was triggered
  }
  
  return false;
}

function resetPinAttempts() {
  store.set('pinAttempts', 0);
}

function createSecurityLockdownOverlay() {
  const lockdownOverlay = new BrowserWindow({
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  lockdownOverlay.loadFile(path.join(__dirname, '../renderer/security-lockdown.html'));

  // Prevent all escape attempts
  lockdownOverlay.on('close', (event) => {
    event.preventDefault();
  });

  lockdownOverlay.on('minimize', (event) => {
    event.preventDefault();
    lockdownOverlay.restore();
    lockdownOverlay.focus();
  });

  lockdownOverlay.on('blur', () => {
    console.log('🚨 Security lockdown overlay lost focus - implementing enhanced refocus');
    setTimeout(() => {
      enforceWindowFocus(lockdownOverlay, 'security-lockdown');
    }, 50); // Faster response for security lockdown
  });

  // Enhanced focus detection with aggressive monitoring for security lockdown
  const lockdownRefocusInterval = createAggressiveFocusMonitoring(lockdownOverlay, 'security-lockdown', 500);

  // Store interval reference for cleanup
  lockdownOverlay.refocusInterval = lockdownRefocusInterval;

  lockdownOverlay.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  lockdownOverlay.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Add security event listeners
  addSecurityEventListeners(lockdownOverlay, 'security-lockdown');

  lockdownOverlay.focus();
  return lockdownOverlay;
}

function showSecurityLockdownScreen() {
  // Create lockdown overlay
  const lockdownOverlay = createSecurityLockdownOverlay();
  
  // Store reference globally for cleanup
  global.securityLockdownOverlay = lockdownOverlay;
}

// HTTP Server for Chrome Extension Integration
function startHttpServer() {
  if (httpServer) {
    console.log('🌐 HTTP server already running');
    return;
  }

  const expressApp = express();
  
  // Enable CORS for Chrome extension
  expressApp.use(cors({
    origin: ['chrome-extension://*', 'moz-extension://*'],
    credentials: true
  }));
  
  expressApp.use(express.json());

  // Status endpoint - check if LockIt is running
  expressApp.get('/status', (req, res) => {
    res.json({ 
      status: 'running', 
      app: 'LockIt',
      version: '1.0.5',
      monitoring: isMonitoring,
      timestamp: new Date().toISOString()
    });
  });

  // Block endpoint - for websites, just return if should block (extension handles UI)
  expressApp.post('/block', (req, res) => {
    const { site, source, tabId } = req.body;
    
    console.log(`🌐 Block request received from ${source}: ${site}`);
    
    if (!site || !source) {
      return res.status(400).json({ error: 'Missing required fields: site, source' });
    }

    // Only block if monitoring is active
    if (!isMonitoring) {
      console.log(`🌐 Monitoring is disabled - not blocking ${site}`);
      return res.json({ 
        success: false, 
        message: `Monitoring disabled - ${site} not blocked`,
        monitoring: false,
        timestamp: new Date().toISOString()
      });
    }

    // Check if website is temporarily unlocked
    const websiteKey = `website:${site}`;
    const tempUnlock = temporaryUnlocks.get(websiteKey);
    
    console.log(`🔍 Checking temporary unlock for ${site}:`, {
      websiteKey,
      tempUnlock: tempUnlock ? { ...tempUnlock, timeLeft: tempUnlock.expiry - Date.now() } : null,
      allTempUnlocks: Array.from(temporaryUnlocks.keys())
    });
    
    if (tempUnlock && tempUnlock.expiry > Date.now()) {
      console.log(`🔓 Website ${site} is temporarily unlocked - not blocking`);
      return res.json({ 
        success: false, 
        message: `${site} is temporarily unlocked`,
        temporaryUnlock: true,
        unlockExpiry: tempUnlock.expiry,
        timestamp: new Date().toISOString()
      });
    }

    // For websites, we don't create desktop overlays anymore - extension handles the block page
    console.log(`🚫 Website ${site} should be blocked - extension will show block page`);

    res.json({ 
      success: true, 
      message: `${site} should be blocked`,
      monitoring: true,
      timestamp: new Date().toISOString()
    });
  });

  // Blocklist endpoint - return list of blocked websites
  expressApp.get('/blocklist', (req, res) => {
    // Get blocked sites from settings 
    const blockedSites = store.get('blockedWebsites', []);

    res.json({ 
      sites: blockedSites,
      count: blockedSites.length,
      timestamp: new Date().toISOString()
    });
  });

  // Update blocklist endpoint
  expressApp.post('/blocklist', (req, res) => {
    const { sites } = req.body;
    
    if (!Array.isArray(sites)) {
      return res.status(400).json({ error: 'Sites must be an array' });
    }

    store.set('blockedWebsites', sites);
    console.log('🌐 Updated blocked websites list:', sites);

    res.json({ 
      success: true, 
      message: 'Blocked sites updated',
      sites: sites,
      timestamp: new Date().toISOString()
    });
  });

  // PIN verification endpoint for Chrome extension
  expressApp.post('/verify-pin', (req, res) => {
    const { pin, site, source } = req.body;
    
    console.log(`🔑 PIN verification request from ${source} for ${site}`);
    
    if (!pin) {
      return res.status(400).json({ success: false, error: 'PIN is required' });
    }

    // Check if system is in security lockdown
    if (isInSecurityLockdown()) {
      return res.status(423).json({ 
        success: false, 
        error: 'System is in security lockdown. Use master password to recover.' 
      });
    }
    
    const correctPin = store.get('pin');
    if (!correctPin) {
      return res.status(400).json({ 
        success: false, 
        error: 'PIN not configured. Please complete onboarding.' 
      });
    }
    
    if (pin === correctPin) {
      resetPinAttempts();
      console.log(`✅ PIN verified for ${site}`);
      
      res.json({ 
        success: true, 
        message: 'PIN verified successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      const lockdownTriggered = incrementPinAttempts();
      const remainingAttempts = 10 - store.get('pinAttempts', 0);
      
      console.log(`❌ Invalid PIN attempt for ${site}, ${remainingAttempts} attempts remaining`);
      
      if (lockdownTriggered) {
        res.status(423).json({ 
          success: false, 
          error: 'Too many failed attempts. System is now in security lockdown.' 
        });
      } else {
        res.status(401).json({ 
          success: false, 
          error: `Incorrect PIN. ${remainingAttempts} attempts remaining before security lockdown.` 
        });
      }
    }
  });

  // Website unlock endpoint for Chrome extension
  expressApp.post('/unlock-website', (req, res) => {
    const { site, source } = req.body;
    
    console.log(`🔓 Website unlock request from ${source} for ${site}`);
    
    if (!site) {
      return res.status(400).json({ success: false, error: 'Site is required' });
    }

    const unlockDuration = store.get('unlockDuration', 60000);
    const websiteKey = `website:${site}`;
    
    // Add temporary unlock
    temporaryUnlocks.set(websiteKey, {
      expiry: Date.now() + unlockDuration,
      site: site,
      source: source
    });
    
    console.log(`🔓 Website ${site} unlocked for ${unlockDuration / 1000} seconds`);
    
    res.json({ 
      success: true, 
      message: `${site} unlocked temporarily`,
      unlockDuration: unlockDuration,
      unlockExpiry: Date.now() + unlockDuration,
      timestamp: new Date().toISOString()
    });
  });

  // Error handling
  expressApp.use((err, req, res, next) => {
    console.error('🌐 HTTP Server Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  httpServer = expressApp.listen(HTTP_SERVER_PORT, 'localhost', () => {
    console.log(`🌐 LockIt HTTP server started on http://localhost:${HTTP_SERVER_PORT}`);
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${HTTP_SERVER_PORT} already in use. Chrome extension integration may not work.`);
    } else {
      console.error('🌐 HTTP Server Error:', err);
    }
  });
}

function stopHttpServer() {
  if (httpServer) {
    httpServer.close(() => {
      console.log('🌐 HTTP server stopped');
    });
    httpServer = null;
  }
}

// Start monitoring for locked apps
async function startMonitoring() {
  // Check if system is in security lockdown
  if (isInSecurityLockdown()) {
    console.log('🚨 Cannot start monitoring - system is in security lockdown');
    return false;
  }
  
  // Check if settings are configured
  const pin = store.get('pin');
  const unlockDuration = store.get('unlockDuration');
  if (!pin || !unlockDuration) {
    console.log('⚠️ Cannot start monitoring - settings not configured');
    return false;
  }
  
  if (isMonitoring) return true;
  
  // Ensure activeWin is loaded
  if (!activeWin) {
    try {
      activeWin = (await import('active-win')).default;
    } catch (error) {
      console.error('Error loading active-win:', error);
      return;
    }
  }
  
  isMonitoring = true;
  console.log('🔍 Starting app monitoring...');

  // Start periodic cleanup of expired unlocks
  cleanupInterval = setInterval(cleanupExpiredUnlocks, 60000); // Clean every minute

  monitoringInterval = setInterval(async () => {
    try {
      // Update monitoring state tracking periodically
      trackMonitoringState();
      
      // Clean up expired unlocks every monitoring cycle
      cleanupExpiredUnlocks();
      
      const activeWindow = await activeWin();
      if (!activeWindow || !activeWindow.owner) return;

      const lockedApps = store.get('lockedApps', []);
      const appName = activeWindow.owner.name ? activeWindow.owner.name.toLowerCase() : '';
      const processId = activeWindow.owner.processId || activeWindow.owner.pid;
      
      if (!appName || !processId) {
        console.log('⚠️ Unable to get app name or process ID from active window');
        return;
      }
      
      // Create unique identifier for this specific process instance
      // Use timestamp as fallback if processId is not available
      const processKey = processId ? `${appName}-${processId}` : `${appName}-${Date.now()}`;
      
      // Check if current app is locked - handle both display and original names
      const lockedApp = lockedApps.find(app => {
        const lockedAppName = app.name.toLowerCase().trim();
        const currentAppName = appName.toLowerCase().trim();
        
        // Try exact match first
        if (lockedAppName === currentAppName) {
          return true;
        }
        
        // On Windows, also try matching with/without .exe extension
        if (process.platform === 'win32') {
          // If locked app doesn't have .exe but current app does
          if (!lockedAppName.endsWith('.exe') && currentAppName.endsWith('.exe')) {
            return lockedAppName === currentAppName.slice(0, -4);
          }
          // If locked app has .exe but current app doesn't
          if (lockedAppName.endsWith('.exe') && !currentAppName.endsWith('.exe')) {
            return lockedAppName.slice(0, -4) === currentAppName;
          }
        }
        
        return false;
      });

      if (lockedApp) {
        console.log(`🔒 Locked app detected: ${appName} (PID: ${processId}) - matches locked app: ${lockedApp.name}`);
        
        // Check if this specific process instance is temporarily unlocked
        const tempUnlock = temporaryUnlocks.get(processKey);
        
        if (tempUnlock && Date.now() < tempUnlock.expiry) {
          // Occasionally log for debugging (every 10 seconds)
          if (Date.now() % 10000 < 1000) {
            console.log(`⏰ Process ${processKey} is temporarily unlocked (${Math.round((tempUnlock.expiry - Date.now()) / 1000)}s remaining)`);
          }
          return;
        }

        // Check if we're already showing a lock screen for this app
        if (currentLockedApp && 
            currentLockedApp.processKey === processKey && 
            lockOverlay && !lockOverlay.isDestroyed()) {
          console.log(`🔒 Lock screen already showing for ${processKey}`);
          return;
        }
        
        // Store current locked app info
        currentLockedApp = {
          name: lockedApp.name,
          processKey: processKey,
          processId: processId,
          appName: appName,
          activeWindow: activeWindow
        };
        
        createLockOverlay(currentLockedApp);
        
        // Start refocus interval if not already running
        if (!refocusInterval) {
          refocusInterval = setInterval(() => {
            if (lockOverlay && !lockOverlay.isDestroyed()) {
              if (!lockOverlay.isFocused()) {
                console.log('🔒 Refocusing lock overlay');
                lockOverlay.focus();
              }
            } else {
              // Clear interval if no lock overlay
              if (refocusInterval) {
                clearInterval(refocusInterval);
                refocusInterval = null;
              }
            }
          }, 2000); // Check every 2 seconds
        }
      } else {
        // If current app is not locked, clear the current locked app and refocus interval
        if (currentLockedApp && currentLockedApp.appName === appName) {
          currentLockedApp = null;
          if (refocusInterval) {
            clearInterval(refocusInterval);
            refocusInterval = null;
          }
        }
      }
    } catch (error) {
      console.error('Error during monitoring:', error);
    }
  }, 1000); // Check every second
  
  // Track monitoring state for auto-restart
  trackMonitoringState();
}

// Stop monitoring
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (refocusInterval) {
    clearInterval(refocusInterval);
    refocusInterval = null;
  }
  if (lockOverlayRefocusInterval) {
    clearInterval(lockOverlayRefocusInterval);
    lockOverlayRefocusInterval = null;
  }
  if (securityLockdownRefocusInterval) {
    clearInterval(securityLockdownRefocusInterval);
    securityLockdownRefocusInterval = null;
  }
  
  // Clean up lock overlay refocus interval if it exists
  if (lockOverlay && !lockOverlay.isDestroyed() && lockOverlay.refocusInterval) {
    clearInterval(lockOverlay.refocusInterval);
  }
  
  // Clean up security lockdown refocus interval if it exists
  if (global.securityLockdownOverlay && !global.securityLockdownOverlay.isDestroyed() && global.securityLockdownOverlay.refocusInterval) {
    clearInterval(global.securityLockdownOverlay.refocusInterval);
  }
  
  isMonitoring = false;
  currentLockedApp = null;
  
  // Update monitoring state tracking
  store.set('wasMonitoringEnabled', false);
  
  console.log('⏹️ Stopped app monitoring and cleaned up all focus intervals');
}

// Scheduled Monitoring Functions
function isCurrentlyInScheduledHours() {
  const settings = store.get();
  
  if (!settings.scheduledMonitoringEnabled) {
    return false;
  }
  
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
  const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight
  
  // Check if today is a scheduled day
  if (!settings.scheduleDays.includes(currentDay)) {
    return false;
  }
  
  // Parse start and end times
  const [startHour, startMin] = settings.scheduleStartTime.split(':').map(Number);
  const [endHour, endMin] = settings.scheduleEndTime.split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  // Handle overnight schedules (e.g., 22:00 to 06:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  } else {
    return currentTime >= startTime && currentTime < endTime;
  }
}

function startScheduleChecker() {
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval);
  }
  
  console.log('📅 Starting schedule checker');
  
  // Check schedule every minute
  scheduleCheckInterval = setInterval(() => {
    const shouldBeActive = isCurrentlyInScheduledHours();
    const settings = store.get();
    
    if (shouldBeActive && !isInScheduledHours) {
      // Entering scheduled hours
      isInScheduledHours = true;
      console.log('📅 Entering scheduled monitoring hours');
      
      if (settings.autoStartScheduledMonitoring && !isMonitoring) {
        console.log('🚀 Auto-starting monitoring for scheduled hours');
        startMonitoring();
        wasAutoStarted = true;
        
        // Notify UI if main window exists
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('schedule-status-changed', {
            inScheduledHours: true,
            autoStarted: true
          });
        }
      }
    } else if (!shouldBeActive && isInScheduledHours) {
      // Leaving scheduled hours
      isInScheduledHours = false;
      console.log('📅 Leaving scheduled monitoring hours');
      
      if (wasAutoStarted && isMonitoring) {
        console.log('⏹️ Auto-stopping monitoring after scheduled hours');
        stopMonitoring();
        wasAutoStarted = false;
        
        // Notify UI if main window exists
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('schedule-status-changed', {
            inScheduledHours: false,
            autoStopped: true
          });
        }
      }
    }
    
    // Update UI with current schedule status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('schedule-status-update', {
        inScheduledHours: isInScheduledHours,
        shouldBeActive: shouldBeActive
      });
    }
  }, 60000); // Check every minute
  
  // Initial check
  isInScheduledHours = isCurrentlyInScheduledHours();
  const settings = store.get();
  
  if (isInScheduledHours && settings.autoStartScheduledMonitoring && !isMonitoring) {
    console.log('🚀 Initial auto-start for scheduled hours');
    startMonitoring();
    wasAutoStarted = true;
  }
}

function stopScheduleChecker() {
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval);
    scheduleCheckInterval = null;
    console.log('📅 Stopped schedule checker');
  }
  
  isInScheduledHours = false;
  wasAutoStarted = false;
}

function getScheduleStatus() {
  const settings = store.get();
  const now = new Date();
  const inScheduledHours = isCurrentlyInScheduledHours();
  
  return {
    enabled: settings.scheduledMonitoringEnabled,
    inScheduledHours: inScheduledHours,
    startTime: settings.scheduleStartTime,
    endTime: settings.scheduleEndTime,
    scheduleDays: settings.scheduleDays,
    autoStart: settings.autoStartScheduledMonitoring,
    wasAutoStarted: wasAutoStarted,
    currentTime: now.toLocaleTimeString(),
    currentDay: now.getDay()
  };
}

// Auto-Restart Monitoring Functions
function trackMonitoringState() {
  // Update the stored monitoring state
  store.set('wasMonitoringEnabled', isMonitoring);
  store.set('lastAppSession', Date.now());
  
  if (isMonitoring) {
    console.log('📊 Tracking: Monitoring is currently ACTIVE');
  }
}

function wasUnexpectedShutdown() {
  const lastSession = store.get('lastAppSession');
  const lastShutdown = store.get('lastShutdownTime');
  const gracefulShutdownWindow = 5000; // 5 seconds
  
  if (!lastSession) {
    return false; // First run
  }
  
  // If no graceful shutdown was recorded, or shutdown was too long after last session
  if (!lastShutdown || (lastShutdown - lastSession) > gracefulShutdownWindow) {
    console.log('🚨 Detected unexpected shutdown (crash or force quit)');
    return true;
  }
  
  console.log('✅ Previous shutdown was graceful');
  return false;
}

function recordGracefulShutdown() {
  store.set('lastShutdownTime', Date.now());
  // DON'T clear wasMonitoringEnabled - we want to restart monitoring even after graceful shutdowns
  console.log('💾 Recording graceful shutdown - keeping monitoring state for restart');
}

function shouldAutoRestartMonitoring() {
  const settings = store.get();
  
  // Check if auto-restart is enabled
  if (!settings.autoRestartMonitoring) {
    console.log('🔴 Auto-restart monitoring is disabled');
    return false;
  }
  
  // Check if monitoring was active before shutdown
  if (!settings.wasMonitoringEnabled) {
    console.log('🔴 Monitoring was not active before shutdown');
    return false;
  }
  
  // ALWAYS restart if monitoring was enabled - remove graceful shutdown check
  console.log('� Monitoring was previously enabled - ALWAYS restarting regardless of shutdown type');
  
  // Check if we're in security lockdown
  if (isInSecurityLockdown()) {
    console.log('🔴 System is in security lockdown, not auto-restarting monitoring');
    return false;
  }
  
  console.log('✅ All conditions met for auto-restart monitoring');
  return true;
}

function attemptAutoRestartMonitoring() {
  if (shouldAutoRestartMonitoring()) {
    console.log('🚀 Auto-restarting monitoring after unexpected shutdown');
    
    setTimeout(() => {
      startMonitoring();
      
      // Notify UI if main window exists
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('monitoring-auto-restarted', {
          reason: 'unexpected-shutdown',
          timestamp: new Date().toLocaleString()
        });
      }
      
      // Clear the flag after successful restart
      store.set('wasMonitoringEnabled', false);
      
    }, 2000); // Small delay to ensure app is fully loaded
  }
}

// Enhanced security event listeners for both lock types
function addSecurityEventListeners(window, windowType) {
  if (!window || window.isDestroyed()) return;
  
  // Prevent all forms of navigation and escape
  window.webContents.on('before-input-event', (event, input) => {
    // Block system shortcuts that could escape the lock
    const blockedKeys = [
      'F3', 'F4', 'F9', 'F10', 'F11', // Mission Control, Exposé, etc.
      'Tab', // When combined with Cmd/Alt
    ];
    
    const blockedCombinations = [
      { key: 'Tab', meta: true }, // Cmd+Tab (macOS)
      { key: 'Tab', alt: true }, // Alt+Tab (Windows/Linux)
      { key: 'F4', alt: true }, // Alt+F4
      { key: 'w', meta: true }, // Cmd+W
      { key: 'q', meta: true }, // Cmd+Q
      { key: 'h', meta: true }, // Cmd+H (hide)
      { key: 'm', meta: true }, // Cmd+M (minimize)
      { key: '`', meta: true }, // Cmd+` (cycle windows)
      { key: 'Space', control: true }, // Ctrl+Space (Spotlight)
    ];
    
    // Check if key should be blocked
    if (blockedKeys.includes(input.key)) {
      console.log(`🚨 Blocked ${windowType} escape attempt: ${input.key}`);
      event.preventDefault();
      return;
    }
    
    // Check for blocked combinations
    for (const combo of blockedCombinations) {
      if (input.key === combo.key && 
          ((combo.meta && input.meta) || 
           (combo.alt && input.alt) || 
           (combo.control && input.control) || 
           (combo.shift && input.shift))) {
        console.log(`🚨 Blocked ${windowType} escape combination: ${JSON.stringify(combo)}`);
        event.preventDefault();
        
        // Force refocus after escape attempt
        setTimeout(() => {
          enforceWindowFocus(window, windowType);
        }, 100);
        return;
      }
    }
  });
  
  // Monitor for window state changes
  window.on('enter-full-screen', () => {
    console.log(`✅ ${windowType} entered fullscreen`);
  });
  
  window.on('leave-full-screen', () => {
    console.log(`🚨 ${windowType} left fullscreen - forcing back to fullscreen`);
    if (windowType === 'security-lockdown') {
      window.setFullScreen(true);
    }
  });
  
  // Monitor for show/hide events
  window.on('show', () => {
    console.log(`✅ ${windowType} shown`);
  });
  
  window.on('hide', () => {
    console.log(`🚨 ${windowType} hidden - forcing show`);
    window.show();
    enforceWindowFocus(window, windowType);
  });
}

// Enhanced focus enforcement functions
function enforceWindowFocus(window, windowType) {
  if (!window || window.isDestroyed()) return;
  
  console.log(`🔒 Enforcing focus for ${windowType} window`);
  
  // Multiple focus enforcement methods
  window.focus();
  window.moveTop();
  window.setAlwaysOnTop(true, 'screen-saver');
  window.show();
  
  // For security lockdown, ensure fullscreen
  if (windowType === 'security-lockdown' && !window.isFullScreen()) {
    window.setFullScreen(true);
  }
  
  // Send focus command to the window's web contents
  if (window.webContents && !window.webContents.isDestroyed()) {
    window.webContents.executeJavaScript('window.focus();').catch(() => {});
  }
}

function createAggressiveFocusMonitoring(window, windowType, interval = 500) {
  const focusInterval = setInterval(() => {
    if (!window || window.isDestroyed()) {
      clearInterval(focusInterval);
      return;
    }
    
    let needsRefocus = false;
    
    // Check focus status
    if (!window.isFocused()) {
      console.log(`🚨 ${windowType} window lost focus - refocusing`);
      needsRefocus = true;
    }
    
    // Check visibility
    if (!window.isVisible()) {
      console.log(`🚨 ${windowType} window not visible - showing`);
      needsRefocus = true;
    }
    
    // For security lockdown, check fullscreen
    if (windowType === 'security-lockdown' && !window.isFullScreen()) {
      console.log(`🚨 ${windowType} window not fullscreen - enforcing fullscreen`);
      needsRefocus = true;
    }
    
    if (needsRefocus) {
      enforceWindowFocus(window, windowType);
    }
  }, interval);
  
  return focusInterval;
}

// Debug helper to show current unlock status
function debugUnlockStatus() {
  console.log('🔍 Current unlock status:');
  console.log(`   Active unlocks: ${temporaryUnlocks.size}`);
  for (const [key, unlockInfo] of temporaryUnlocks.entries()) {
    const remaining = Math.max(0, unlockInfo.expiry - Date.now());
    console.log(`   - ${key}: ${remaining}ms remaining`);
  }
  if (currentLockedApp) {
    console.log(`   Current locked app: ${currentLockedApp.processKey}`);
  }
}

// Clean up expired temporary unlocks
function cleanupExpiredUnlocks() {
  const now = Date.now();
  for (const [key, unlockInfo] of temporaryUnlocks.entries()) {
    if (unlockInfo.expiry && now > unlockInfo.expiry) {
      temporaryUnlocks.delete(key);
      console.log(`🧹 Cleaned up expired unlock for ${key}`);
    }
  }
}

// Windows fallback using wmic command
async function getWindowsProcessesFallback() {
  try {
    console.log('🪟 Using Windows wmic fallback...');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Use wmic to get process list
    const { stdout } = await execAsync('wmic process get Name,ProcessId,ExecutablePath /format:csv');
    
    if (!stdout) {
      console.error('❌ No output from wmic command');
      return [];
    }
    
    const lines = stdout.split('\n').filter(line => line.trim());
    const processes = [];
    
    // Skip header line and parse CSV
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 3) {
        const name = parts[1]?.trim();
        const pid = parseInt(parts[2]?.trim());
        const execPath = parts[0]?.trim();
        
        if (name && pid && !isNaN(pid)) {
          processes.push({
            name: name,
            pid: pid,
            cmd: execPath || ''
          });
        }
      }
    }
    
    console.log(`✅ Windows fallback found ${processs.length} processes`);
    return processes;
    
  } catch (error) {
    console.error('❌ Windows fallback failed:', error);
    return [];
  }
}

// Get list of running applications
async function getRunningApps() {
  try {
    console.log('🔍 Starting getRunningApps function...');
    
    // Ensure ps-list is loaded
    if (!psList) {
      console.log('📦 Loading ps-list module...');
      try {
        const psListModule = await import('ps-list');
        psList = psListModule.default;
        console.log('✅ ps-list module loaded successfully');
      } catch (importError) {
        console.error('❌ Failed to import ps-list:', importError);
        if (process.platform === 'win32') {
          console.log('🪟 Trying Windows fallback immediately...');
          return await getWindowsProcessesFallback();
        }
        throw importError;
      }
    }
    
    console.log('🔄 Getting process list...');
    let processes;
    try {
      processes = await psList();
    } catch (psListError) {
      console.error('❌ ps-list execution failed:', psListError);
      if (process.platform === 'win32') {
        console.log('🪟 ps-list failed, trying Windows fallback...');
        return await getWindowsProcessesFallback();
      }
      throw psListError;
    }
    
    console.log(`📋 Raw process count: ${processes ? processes.length : 'null/undefined'}`);
    
    if (!processes || processes.length === 0) {
      console.error('❌ No processes returned from ps-list');
      console.log('🛠️ Trying alternative method for Windows...');
      
      // For Windows, try using wmic as fallback
      if (process.platform === 'win32') {
        const fallbackApps = await getWindowsProcessesFallback();
        if (fallbackApps.length > 0) {
          console.log(`✅ Using Windows fallback, found ${fallbackApps.length} processes`);
          return fallbackApps.map(proc => ({
            name: proc.name.toLowerCase().endsWith('.exe') ? proc.name.slice(0, -4) : proc.name,
            originalName: proc.name,
            pid: proc.pid,
            cmd: proc.cmd || ''
          })).sort((a, b) => a.name.localeCompare(b.name));
        }
      }
      
      // Ultimate fallback - return some common Windows applications for testing
      if (process.platform === 'win32') {
        console.log('🆘 Using ultimate fallback for Windows - returning common apps');
        return [
          { name: 'Notepad', originalName: 'notepad.exe', pid: 1234, cmd: 'C:\\Windows\\System32\\notepad.exe' },
          { name: 'Calculator', originalName: 'calc.exe', pid: 1235, cmd: 'C:\\Windows\\System32\\calc.exe' },
          { name: 'Paint', originalName: 'mspaint.exe', pid: 1236, cmd: 'C:\\Windows\\System32\\mspaint.exe' },
          { name: 'Command Prompt', originalName: 'cmd.exe', pid: 1237, cmd: 'C:\\Windows\\System32\\cmd.exe' }
        ];
      }
      
      return [];
    }
    
    // Log first few processes for debugging
    console.log('🔍 Sample processes:', processes.slice(0, 5).map(p => ({ 
      name: p.name, 
      pid: p.pid, 
      cmd: p.cmd ? p.cmd.substring(0, 50) + '...' : 'no cmd' 
    })));
    
    const platform = process.platform;
    console.log(`🖥️ Platform: ${platform}`);
    
    // Platform-specific filtering for system processes
    const apps = processes
      .filter(proc => {
        if (!proc.name || proc.name.length < 2) return false;
        
        // Platform-specific system process filtering
        if (platform === 'win32') {
          const lowerName = proc.name.toLowerCase();
          
          // Only exclude the most critical system processes
          const criticalSystemProcesses = [
            'system', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe',
            'services.exe', 'lsass.exe', 'svchost.exe', 'conhost.exe'
          ];
          
          // Exclude only critical system processes
          if (criticalSystemProcesses.some(sysProc => lowerName === sysProc)) {
            return false;
          }
          
          // For Windows, be very permissive - let users see most processes
          // They can choose what to lock themselves
          return true;
        } else if (platform === 'darwin') {
          // macOS system processes to exclude
          return !proc.name.startsWith('com.apple.') && 
                 !proc.name.startsWith('kernel') &&
                 !proc.name.includes('mdns') &&
                 !proc.name.includes('coreaudio');
        } else {
          // Linux/other platforms - basic filtering
          return !proc.name.startsWith('kthreadd') &&
                 !proc.name.startsWith('[') &&
                 !proc.name.includes('systemd');
        }
      })
      .reduce((unique, proc) => {
        // Clean up the name for display (remove .exe on Windows)
        let displayName = proc.name;
        if (platform === 'win32' && displayName.toLowerCase().endsWith('.exe')) {
          displayName = displayName.slice(0, -4);
        }
        
        const existing = unique.find(app => app.name === displayName);
        if (!existing) {
          unique.push({
            name: displayName,
            originalName: proc.name,
            pid: proc.pid,
            cmd: proc.cmd || ''
          });
        }
        return unique;
      }, [])
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`🔍 Found ${apps.length} applications on ${platform}`);
    if (platform === 'win32' && apps.length < 5) {
      console.log('⚠️ Very few apps found on Windows. This might indicate filtering is too aggressive.');
      console.log('Sample processes found:', processes.slice(0, 10).map(p => ({ name: p.name, cmd: p.cmd })));
    }
    return apps;
  } catch (error) {
    console.error('Error getting running apps:', error);
    return [];
  }
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'LockIt',
      submenu: [
        {
          label: 'About LockIt',
          click: () => {
            const packageJson = require('../../package.json');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About LockIt',
              message: `LockIt v${packageJson.version}`,
              detail: '🔐 Desktop Application Lock Utility\n\nLockIt helps you control access to applications on your computer.',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('show-preferences');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Update Service Functions
async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data.trim());
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function compareVersions(current, remote) {
  const currentParts = current.split('.').map(num => parseInt(num, 10));
  const remoteParts = remote.split('.').map(num => parseInt(num, 10));
  
  for (let i = 0; i < Math.max(currentParts.length, remoteParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const remotePart = remoteParts[i] || 0;
    
    if (currentPart > remotePart) return 1; // Current is newer
    if (currentPart < remotePart) return -1; // Remote is newer
  }
  
  return 0; // Versions are equal
}

async function checkForUpdates(manual = false) {
  try {
    console.log('🔍 Checking for updates...');
    
    // Get current version from package.json
    const currentVersion = require('../../package.json').version;
    
    // Fetch remote version
    const remoteVersion = await fetchUrl(UPDATE_CONFIG.versionUrl);
    
    console.log(`📦 Current version: ${currentVersion}`);
    console.log(`🌐 Remote version: ${remoteVersion}`);
    
    // Compare versions
    const comparison = compareVersions(currentVersion, remoteVersion);
    
    if (comparison >= 0) {
      // No update available (current is newer or equal)
      console.log('✅ No updates available');
      if (manual) {
        return { hasUpdate: false, message: 'You are running the latest version!' };
      }
      return { hasUpdate: false };
    }
    
    // Check if this update was dismissed
    const dismissedUpdates = store.get('dismissedUpdates', []);
    if (dismissedUpdates.includes(remoteVersion)) {
      console.log(`⏭️ Update ${remoteVersion} was dismissed by user`);
      if (manual) {
        return { hasUpdate: false, message: 'Update available but was previously dismissed.' };
      }
      return { hasUpdate: false };
    }
    
    // Fetch changelog
    const changelog = await fetchUrl(UPDATE_CONFIG.changelogUrl);
    
    console.log(`🚀 Update available: ${remoteVersion}`);
    
    return {
      hasUpdate: true,
      currentVersion,
      newVersion: remoteVersion,
      changelog,
      downloadUrl: `${UPDATE_CONFIG.releaseBaseUrl}${remoteVersion}`
    };
    
  } catch (error) {
    console.error('❌ Error checking for updates:', error);
    if (manual) {
      return { hasUpdate: false, error: error.message };
    }
    return { hasUpdate: false };
  }
}

function shouldCheckForUpdates() {
  const lastCheck = store.get('lastUpdateCheck');
  if (!lastCheck) return true;
  
  const now = Date.now();
  const timeSinceLastCheck = now - lastCheck;
  
  return timeSinceLastCheck >= UPDATE_CONFIG.checkInterval;
}

async function performUpdateCheck(manual = false) {
  if (!manual && !shouldCheckForUpdates()) {
    console.log('⏰ Skipping update check - too soon since last check');
    return { hasUpdate: false };
  }
  
  const result = await checkForUpdates(manual);
  
  // Update last check time regardless of result
  store.set('lastUpdateCheck', Date.now());
  
  return result;
}

// IPC Handlers
ipcMain.handle('get-active-window-info', async () => {
  try {
    if (!activeWin) {
      return { error: 'activeWin not loaded' };
    }
    
    const activeWindow = await activeWin();
    if (!activeWindow || !activeWindow.owner) {
      return { error: 'No active window or owner info' };
    }
    
    return {
      appName: activeWindow.owner.name,
      processId: activeWindow.owner.processId || activeWindow.owner.pid,
      title: activeWindow.title,
      bounds: activeWindow.bounds
    };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('get-debug-info', () => {
  const unlocks = [];
  for (const [key, unlockInfo] of temporaryUnlocks.entries()) {
    const remaining = Math.max(0, unlockInfo.expiry - Date.now());
    unlocks.push({
      key,
      appName: unlockInfo.appName,
      processId: unlockInfo.processId,
      remainingMs: remaining
    });
  }
  
  return {
    isMonitoring,
    currentLockedApp: currentLockedApp ? {
      name: currentLockedApp.name,
      processKey: currentLockedApp.processKey,
      processId: currentLockedApp.processId
    } : null,
    temporaryUnlocks: unlocks,
    hasLockOverlay: lockOverlay && !lockOverlay.isDestroyed()
  };
});

ipcMain.handle('get-running-apps', getRunningApps);

ipcMain.handle('get-locked-apps', () => {
  return store.get('lockedApps', []);
});

ipcMain.handle('set-locked-apps', (event, apps) => {
  store.set('lockedApps', apps);
  return true;
});

ipcMain.handle('get-settings', () => {
  return {
    pin: store.get('pin'),
    unlockDuration: store.get('unlockDuration'),
    chromeExtensionEnabled: store.get('chromeExtensionEnabled', false),
    scheduledMonitoringEnabled: store.get('scheduledMonitoringEnabled', false),
    scheduleStartTime: store.get('scheduleStartTime', '09:00'),
    scheduleEndTime: store.get('scheduleEndTime', '17:00'),
    scheduleDays: store.get('scheduleDays', [1, 2, 3, 4, 5]),
    autoStartScheduledMonitoring: store.get('autoStartScheduledMonitoring', true),
    autoRestartMonitoring: store.get('autoRestartMonitoring', true)
  };
});

ipcMain.handle('get-app-version', () => {
  const packageJson = require('../../package.json');
  return packageJson.version;
});

ipcMain.handle('set-settings', (event, settings) => {
  if (settings.pin !== undefined) store.set('pin', settings.pin);
  if (settings.unlockDuration !== undefined) store.set('unlockDuration', settings.unlockDuration);
  if (settings.chromeExtensionEnabled !== undefined) store.set('chromeExtensionEnabled', settings.chromeExtensionEnabled);
  
  // Handle scheduled monitoring settings
  if (settings.scheduledMonitoringEnabled !== undefined) {
    const wasEnabled = store.get('scheduledMonitoringEnabled', false);
    store.set('scheduledMonitoringEnabled', settings.scheduledMonitoringEnabled);
    
    // Restart schedule checker if settings changed
    if (wasEnabled !== settings.scheduledMonitoringEnabled) {
      if (settings.scheduledMonitoringEnabled) {
        startScheduleChecker();
      } else {
        stopScheduleChecker();
      }
    }
  }
  if (settings.scheduleStartTime !== undefined) store.set('scheduleStartTime', settings.scheduleStartTime);
  if (settings.scheduleEndTime !== undefined) store.set('scheduleEndTime', settings.scheduleEndTime);
  if (settings.scheduleDays !== undefined) store.set('scheduleDays', settings.scheduleDays);
  if (settings.autoStartScheduledMonitoring !== undefined) store.set('autoStartScheduledMonitoring', settings.autoStartScheduledMonitoring);
  if (settings.autoRestartMonitoring !== undefined) store.set('autoRestartMonitoring', settings.autoRestartMonitoring);
  
  return true;
});

ipcMain.handle('start-monitoring', () => {
  startMonitoring();
  return true;
});

ipcMain.handle('stop-monitoring', (event, enteredPin) => {
  // Require PIN verification to stop monitoring
  if (!enteredPin) {
    return { success: false, error: 'PIN required to stop monitoring.' };
  }
  
  // Check if in security lockdown
  if (isInSecurityLockdown()) {
    return { success: false, error: 'System is in security lockdown. Use master password to recover.' };
  }
  
  const correctPin = store.get('pin');
  if (!correctPin) {
    return { success: false, error: 'PIN not configured. Please complete onboarding.' };
  }
  
  if (enteredPin === correctPin) {
    resetPinAttempts();
    stopMonitoring();
    console.log('✅ Monitoring stopped after PIN verification');
    return { success: true };
  } else {
    const lockdownTriggered = incrementPinAttempts();
    if (lockdownTriggered) {
      return { success: false, error: 'Too many failed attempts. System is now in security lockdown.' };
    } else {
      const remainingAttempts = 10 - store.get('pinAttempts', 0);
      return { 
        success: false, 
        error: `Incorrect PIN. ${remainingAttempts} attempts remaining before security lockdown.` 
      };
    }
  }
});

ipcMain.handle('verify-pin', (event, enteredPin) => {
  // Check if in security lockdown
  if (isInSecurityLockdown()) {
    return { success: false, error: 'System is in security lockdown. Use master password to recover.' };
  }
  
  const correctPin = store.get('pin');
  if (!correctPin) {
    return { success: false, error: 'PIN not configured. Please complete onboarding.' };
  }
  
  if (enteredPin === correctPin) {
    resetPinAttempts();
    return { success: true };
  } else {
    const lockdownTriggered = incrementPinAttempts();
    if (lockdownTriggered) {
      return { success: false, error: 'Too many failed attempts. System is now in security lockdown.' };
    } else {
      const remainingAttempts = 10 - store.get('pinAttempts', 0);
      return { 
        success: false, 
        error: `Incorrect PIN. ${remainingAttempts} attempts remaining before security lockdown.` 
      };
    }
  }
});

ipcMain.handle('unlock-app', (event, appName) => {
  const unlockDuration = store.get('unlockDuration', 60000);
  
  console.log('🔓 Unlock request received:', { appName, currentLockedApp });
  
  // Check if this is a website unlock
  if (currentLockedApp && currentLockedApp.site) {
    // Website unlock
    const websiteKey = `website:${currentLockedApp.site}`;
    temporaryUnlocks.set(websiteKey, {
      expiry: Date.now() + unlockDuration,
      appName: currentLockedApp.site,
      processId: null,
      isWebsite: true
    });
    console.log(`🔓 Website ${currentLockedApp.site} unlocked for ${unlockDuration / 1000} seconds`);
  } else if (currentLockedApp && currentLockedApp.processKey) {
    // App unlock - use process key
    const processKey = currentLockedApp.processKey;
    temporaryUnlocks.set(processKey, {
      expiry: Date.now() + unlockDuration,
      appName: appName || currentLockedApp.name || 'Unknown',
      processId: currentLockedApp.processId
    });
    console.log(`🔓 App process ${processKey} unlocked for ${unlockDuration / 1000} seconds`);
  } else if (appName) {
    // Fallback: unlock by app name only (less precise) - only if appName exists
    const fallbackKey = appName.toLowerCase();
    temporaryUnlocks.set(fallbackKey, {
      expiry: Date.now() + unlockDuration,
      appName: appName,
      processId: null
    });
    console.log(`🔓 App ${appName} unlocked for ${unlockDuration / 1000} seconds (fallback)`);
  } else {
    console.log('🔓 No unlock target identified');
  }
  
  // Close the lock overlay immediately after successful PIN verification
  if (lockOverlay && !lockOverlay.isDestroyed()) {
    console.log('🔓 Forcefully closing lock overlay after successful PIN verification...');
    
    // Remove ALL event listeners to prevent interference
    lockOverlay.removeAllListeners();
    
    // Force close the window
    lockOverlay.destroy();
    lockOverlay = null;
    console.log('✅ Lock overlay destroyed successfully after PIN verification');
  }
  
  // Clear refocus intervals
  if (refocusInterval) {
    clearInterval(refocusInterval);
    refocusInterval = null;
  }
  if (lockOverlayRefocusInterval) {
    clearInterval(lockOverlayRefocusInterval);
    lockOverlayRefocusInterval = null;
  }
  
  // Clear current locked app
  currentLockedApp = null;
  
  return true;
});

ipcMain.handle('close-lock-overlay', () => {
  if (lockOverlay && !lockOverlay.isDestroyed()) {
    console.log('🔓 Forcefully closing lock overlay...');
    
    // Remove ALL event listeners to prevent interference
    lockOverlay.removeAllListeners();
    
    // Force close the window
    lockOverlay.destroy();
    lockOverlay = null;
    console.log('✅ Lock overlay destroyed successfully');
  }
  
  // Clear refocus intervals
  if (refocusInterval) {
    clearInterval(refocusInterval);
    refocusInterval = null;
  }
  if (lockOverlayRefocusInterval) {
    clearInterval(lockOverlayRefocusInterval);
    lockOverlayRefocusInterval = null;
  }
  
  currentLockedApp = null;
  return true;
});

// IPC Handlers for onboarding and security
ipcMain.handle('complete-onboarding', (event, settings) => {
  try {
    // Validate required settings
    if (!settings.pin || !settings.masterPassword || !settings.unlockDuration) {
      return { success: false, error: 'All settings are required' };
    }
    
    // Save all settings
    store.set('pin', settings.pin);
    store.set('masterPassword', settings.masterPassword);
    store.set('unlockDuration', settings.unlockDuration);
    store.set('chromeExtensionEnabled', settings.chromeExtension || false);
    store.set('isOnboardingComplete', true);
    store.set('isFirstRun', false);
    store.set('pinAttempts', 0);
    store.set('isInSecurityLockdown', false);
    
    console.log('✅ Onboarding completed successfully');
    console.log('🌐 Chrome extension enabled:', settings.chromeExtension);
    return { success: true };
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('verify-master-password', (event, enteredPassword) => {
  const masterPassword = store.get('masterPassword');
  
  if (!masterPassword) {
    console.log('❌ Master password not configured');
    return { success: false, error: 'Master password not configured' };
  }
  
  const isValid = enteredPassword === masterPassword;
  console.log(isValid ? '✅ Master password verified' : '❌ Invalid master password');
  
  return { success: isValid };
});

ipcMain.handle('recover-from-lockdown', async (event, newPin) => {
  try {
    console.log('🔓 Starting lockdown recovery process...');
    
    if (newPin) {
      store.set('pin', newPin);
      console.log('📝 PIN updated during lockdown recovery');
    }
    
    // Deactivate lockdown first
    deactivateSecurityLockdown();
    console.log('✅ Security lockdown deactivated');
    
    // Close lockdown overlay immediately - no delays
    if (global.securityLockdownOverlay && !global.securityLockdownOverlay.isDestroyed()) {
      console.log('🔓 Forcefully closing lockdown overlay...');
      
      // Clear the refocus interval
      if (global.securityLockdownOverlay.refocusInterval) {
        clearInterval(global.securityLockdownOverlay.refocusInterval);
      }
      
      global.securityLockdownOverlay.removeAllListeners();
      global.securityLockdownOverlay.destroy();
      global.securityLockdownOverlay = null;
      console.log('✅ Lockdown overlay destroyed immediately');
    }
    
    // Load main window immediately
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('🏠 Loading main application immediately...');
      await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      mainWindow.focus();
      mainWindow.show(); // Ensure window is visible
      console.log('✅ Main application loaded and focused');
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error recovering from lockdown:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-security-status', () => {
  return {
    isInLockdown: isInSecurityLockdown(),
    pinAttempts: store.get('pinAttempts', 0),
    isOnboardingComplete: store.get('isOnboardingComplete', false),
    lastLockdownTime: store.get('lastLockdownTime', null)
  };
});

ipcMain.handle('load-main-app', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    return { success: true };
  }
  return { success: false, error: 'Main window not available' };
});

// Update IPC Handlers
ipcMain.handle('check-for-updates', async (event, manual = false) => {
  return await performUpdateCheck(manual);
});

ipcMain.handle('dismiss-update', (event, version, permanent = false) => {
  if (permanent) {
    const dismissedUpdates = store.get('dismissedUpdates', []);
    if (!dismissedUpdates.includes(version)) {
      dismissedUpdates.push(version);
      store.set('dismissedUpdates', dismissedUpdates);
      console.log(`📝 Update ${version} dismissed permanently`);
    }
  }
  return { success: true };
});

ipcMain.handle('open-download-url', (event, url) => {
  try {
    shell.openExternal(url);
    console.log(`🌐 Opening download URL: ${url}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error opening download URL:', error);
    return { success: false, error: error.message };
  }
});

// Scheduled monitoring IPC handlers
ipcMain.handle('get-schedule-status', () => {
  return getScheduleStatus();
});

// Blocked websites IPC handlers
ipcMain.handle('get-blocked-websites', () => {
  return store.get('blockedWebsites', []);
});

ipcMain.handle('save-blocked-websites', (event, websites) => {
  store.set('blockedWebsites', websites);
  console.log('🌐 Blocked websites updated:', websites);
  return { success: true };
});

ipcMain.handle('test-http-server', () => {
  // Simple check if HTTP server is running
  return httpServer !== null;
});

ipcMain.handle('open-external-url', async (event, url) => {
  try {
    const { shell } = require('electron');
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

// App Event Handlers
app.whenReady().then(() => {
  // Start HTTP server for Chrome extension integration
  startHttpServer();
  
  // Register emergency exit key combo in development mode
  if (isDevelopment) {
    const emergencyKey = process.platform === 'darwin' ? 'CommandOrControl+Option+Shift+E' : 'Ctrl+Alt+Shift+E';
    
    globalShortcut.register(emergencyKey, () => {
      console.log('🚨 EMERGENCY EXIT TRIGGERED IN DEVELOPMENT MODE - FORCE CLOSING APP');
      app.exit(0);
    });
    
    console.log(`🔧 Development mode: Emergency exit registered (${emergencyKey})`);
  }
  
  // Check if system is in security lockdown on startup
  if (isInSecurityLockdown()) {
    console.log('🚨 System is in security lockdown - showing lockdown screen instead of main window');
    showSecurityLockdownScreen();
    createMenu(); // Still create menu for context menu access
  } else {
    createMainWindow();
    createMenu();
  }

  // Set up periodic security lockdown state check (every 30 seconds)
  setInterval(() => {
    ensureSecurityLockdownState();
  }, 30000);

  // Start scheduled monitoring checker
  startScheduleChecker();

  // Check for auto-restart monitoring after unexpected shutdown
  setTimeout(() => {
    attemptAutoRestartMonitoring();
  }, 3000); // Delay to ensure app is fully loaded

  // Check for updates after app is ready (delayed to avoid blocking startup)
  setTimeout(() => {
    performUpdateCheck(false).then((result) => {
      if (result.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
        // Send update notification to renderer
        mainWindow.webContents.send('update-available', result);
      }
    }).catch((error) => {
      console.error('❌ Error during startup update check:', error);
    });
  }, 3000); // Wait 3 seconds after startup

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Check security lockdown state when activating
      if (isInSecurityLockdown()) {
        console.log('🚨 App activated while in security lockdown - showing lockdown screen');
        showSecurityLockdownScreen();
      } else {
        createMainWindow();
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopMonitoringForShutdown();
    stopHttpServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  // Record graceful shutdown before stopping everything
  recordGracefulShutdown();
  
  stopMonitoringForShutdown();
  stopScheduleChecker();
  stopHttpServer();
  
  // Unregister global shortcuts
  if (isDevelopment) {
    globalShortcut.unregisterAll();
    console.log('🔧 Development mode: Emergency shortcut unregistered');
  }
});

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Ensure security lockdown state on startup
ensureSecurityLockdownState();

console.log('🔐 LockIt started successfully!');
