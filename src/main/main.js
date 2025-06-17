const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const Store = require('electron-store');
const https = require('https');

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
    isFirstRun: true,
    isOnboardingComplete: false,
    pinAttempts: 0, // Track failed PIN attempts
    isInSecurityLockdown: false,
    lastLockdownTime: null,
    dismissedUpdates: [], // Track updates user chose not to see again
    lastUpdateCheck: null // Track last update check time
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
  console.log('⏹️ Stopped app monitoring and cleaned up all focus intervals');
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
    unlockDuration: store.get('unlockDuration')
  };
});

ipcMain.handle('get-app-version', () => {
  const packageJson = require('../../package.json');
  return packageJson.version;
});

ipcMain.handle('set-settings', (event, settings) => {
  if (settings.pin) store.set('pin', settings.pin);
  if (settings.unlockDuration) store.set('unlockDuration', settings.unlockDuration);
  return true;
});

ipcMain.handle('start-monitoring', () => {
  startMonitoring();
  return true;
});

ipcMain.handle('stop-monitoring', () => {
  stopMonitoring();
  return true;
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
  
  // If we have current locked app info, use the specific process key
  if (currentLockedApp) {
    const processKey = currentLockedApp.processKey;
    temporaryUnlocks.set(processKey, {
      expiry: Date.now() + unlockDuration,
      appName: appName,
      processId: currentLockedApp.processId
    });
    console.log(`🔓 Process ${processKey} unlocked for ${unlockDuration / 1000} seconds`);
  } else {
    // Fallback: unlock by app name only (less precise)
    const fallbackKey = appName.toLowerCase();
    temporaryUnlocks.set(fallbackKey, {
      expiry: Date.now() + unlockDuration,
      appName: appName,
      processId: null
    });
    console.log(`🔓 App ${appName} unlocked for ${unlockDuration / 1000} seconds (fallback)`);
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
  
  // Clear refocus interval
  if (refocusInterval) {
    clearInterval(refocusInterval);
    refocusInterval = null;
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
  
  // Clear refocus interval
  if (refocusInterval) {
    clearInterval(refocusInterval);
    refocusInterval = null;
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
    store.set('isOnboardingComplete', true);
    store.set('isFirstRun', false);
    store.set('pinAttempts', 0);
    store.set('isInSecurityLockdown', false);
    
    console.log('✅ Onboarding completed successfully');
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

// App Event Handlers
app.whenReady().then(() => {
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
    stopMonitoring();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopMonitoring();
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
