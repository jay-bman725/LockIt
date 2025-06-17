const { ipcRenderer } = require('electron');

// State
let lockedAppInfo = null;
let settings = {
    pin: null,
    unlockDuration: null
};
let isUnlocking = false;

// DOM elements
let elements = {};

// Initialize lock screen
async function init() {
    // Cache DOM elements
    cacheElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load settings
    await loadSettings();
    
    // Prevent common escape attempts
    preventEscape();
    
    console.log('🔒 Lock screen initialized');
}

// Cache DOM elements
function cacheElements() {
    elements = {
        appMessage: document.getElementById('appMessage'),
        pinInput: document.getElementById('pinInput'),
        unlockBtn: document.getElementById('unlockBtn'),
        errorMessage: document.getElementById('errorMessage'),
        unlockDuration: document.getElementById('unlockDuration'),
        settingsBtn: document.getElementById('settingsBtn'),
        helpBtn: document.getElementById('helpBtn')
    };
}

// Set up event listeners
function setupEventListeners() {
    // PIN input
    elements.pinInput.addEventListener('input', handlePinInput);
    elements.pinInput.addEventListener('keypress', handlePinKeypress);
    
    // Unlock button
    elements.unlockBtn.addEventListener('click', attemptUnlock);
    
    // Action buttons
    elements.settingsBtn.addEventListener('click', showSettings);
    elements.helpBtn.addEventListener('click', showHelp);
    
    // IPC listeners
    ipcRenderer.on('app-locked', (event, appInfo) => {
        lockedAppInfo = appInfo;
        updateAppMessage();
    });
    
    // Focus PIN input
    elements.pinInput.focus();
}

// Load settings from main process
async function loadSettings() {
    try {
        settings = await ipcRenderer.invoke('get-settings');
        if (settings.unlockDuration) {
            updateUnlockDurationDisplay();
        } else {
            // If no settings are configured, hide the duration display
            elements.unlockDuration.textContent = 'PIN required to unlock';
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        elements.unlockDuration.textContent = 'PIN required to unlock';
    }
}

// Update app message
function updateAppMessage() {
    if (lockedAppInfo) {
        elements.appMessage.textContent = `${lockedAppInfo.name} is protected by LockIt`;
    }
}

// Update unlock duration display
function updateUnlockDurationDisplay() {
    const duration = settings.unlockDuration;
    let durationText;
    
    if (duration < 60000) {
        durationText = `${duration / 1000} seconds`;
    } else if (duration < 3600000) {
        durationText = `${duration / 60000} minute(s)`;
    } else {
        durationText = `${duration / 3600000} hour(s)`;
    }
    
    elements.unlockDuration.textContent = `Unlock duration: ${durationText}`;
}

// Handle PIN input
function handlePinInput(event) {
    // Clear any previous error
    clearError();
    
    // Auto-attempt unlock for short PINs when they reach expected length
    if (event.target.value.length >= 5) {
        // Optional: auto-unlock after a short delay
        setTimeout(() => {
            if (elements.pinInput.value.length >= 5) {
                attemptUnlock();
            }
        }, 500);
    }
}

// Handle PIN keypress
function handlePinKeypress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        attemptUnlock();
    }
}

// Attempt to unlock
async function attemptUnlock() {
    if (isUnlocking) return;
    
    const enteredPin = elements.pinInput.value.trim();
    
    if (!enteredPin) {
        showError('Please enter your PIN');
        return;
    }
    
    isUnlocking = true;
    elements.unlockBtn.disabled = true;
    elements.unlockBtn.textContent = '🔓 Unlocking...';
    
    try {
        const result = await ipcRenderer.invoke('verify-pin', enteredPin);
        
        if (result.success) {
            // PIN is correct - unlock the app immediately
            showSuccess();
            
            // Only call unlock-app, which will handle closing the overlay
            if (lockedAppInfo) {
                await ipcRenderer.invoke('unlock-app', lockedAppInfo.name);
            } else {
                // If no locked app info, just close the overlay
                await ipcRenderer.invoke('close-lock-overlay');
            }
        } else {
            // PIN is incorrect - show error and clear input
            showError(result.error || 'Incorrect PIN');
            elements.pinInput.value = '';
            elements.pinInput.focus();
            
            // Don't close the window - keep it open for retry
            // Security lockdown screen will be handled by main process if triggered
        }
    } catch (error) {
        console.error('Error verifying PIN:', error);
        showError('Unable to verify PIN. Please try again.');
        elements.pinInput.value = '';
        elements.pinInput.focus();
    }
    
    isUnlocking = false;
    elements.unlockBtn.disabled = false;
    elements.unlockBtn.textContent = '🔓 Unlock';
}

// Show success state
function showSuccess() {
    elements.unlockBtn.textContent = '✅ Unlocked!';
    elements.unlockBtn.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';
    elements.pinInput.style.borderColor = '#48bb78';
    elements.pinInput.style.background = '#c6f6d5';
    clearError();
}

// Show error message
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.animation = 'none';
    setTimeout(() => {
        elements.errorMessage.style.animation = 'errorShake 0.5s ease-in-out';
    }, 10);
}

// Clear error message
function clearError() {
    elements.errorMessage.textContent = '';
}

// Show settings dialog
function showSettings() {
    alert('Settings can be accessed from the main LockIt application.');
}

// Show help dialog
function showHelp() {
    alert(`LockIt Help\n\n` +
          `• Enter your PIN to unlock this application\n` +
          `• The application will remain unlocked for the configured duration\n` +
          `• You can change settings in the main LockIt application\n` +
          `• Default PIN is "1234" if you haven't changed it\n\n` +
          `If you forgot your PIN, you may need to restart LockIt or contact your administrator.`);
}

// Prevent common escape attempts
function preventEscape() {
    // Disable common keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Prevent Alt+Tab, Alt+F4, Cmd+Tab, etc.
        if (event.altKey || event.metaKey) {
            if (event.key === 'Tab' || event.key === 'F4' || event.key === '`' || 
                event.key === 'w' || event.key === 'q') {
                event.preventDefault();
                event.stopPropagation();
                console.log('🚨 Blocked key combination:', event.key);
                // Refocus aggressively
                window.focus();
                elements.pinInput.focus();
                return false;
            }
        }
        
        // Prevent Ctrl+Alt+Del, Ctrl+Shift+Esc, Ctrl+W, etc.
        if (event.ctrlKey) {
            if ((event.altKey && event.key === 'Delete') ||
                (event.shiftKey && event.key === 'Escape') ||
                (event.key === 'w' || event.key === 'W')) {
                event.preventDefault();
                event.stopPropagation();
                console.log('🚨 Blocked Ctrl key combination:', event.key);
                // Refocus aggressively
                window.focus();
                elements.pinInput.focus();
                return false;
            }
        }
        
        // Prevent Windows key and Escape
        if (event.key === 'Meta' || event.key === 'OS' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            console.log('🚨 Blocked system key:', event.key);
            // Refocus aggressively
            window.focus();
            elements.pinInput.focus();
            return false;
        }
        
        // Prevent F keys that might cause issues
        if (event.key.startsWith('F') && event.key.length <= 3) {
            const fNum = parseInt(event.key.substring(1));
            if (fNum >= 1 && fNum <= 12 && fNum !== 5) { // Allow F5 for refresh
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        }
    });
    
    // Disable right-click context menu
    document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        return false;
    });
    
    // Disable drag and drop
    document.addEventListener('dragstart', (event) => {
        event.preventDefault();
        return false;
    });
    
    document.addEventListener('drop', (event) => {
        event.preventDefault();
        return false;
    });
    
    // Disable text selection in most areas
    document.addEventListener('selectstart', (event) => {
        if (event.target.tagName !== 'INPUT') {
            event.preventDefault();
            return false;
        }
    });
    
    // Disable printing
    window.addEventListener('beforeprint', (event) => {
        event.preventDefault();
        return false;
    });
    
    // Attempt to prevent screenshot (limited effectiveness)
    document.body.style.webkitUserSelect = 'none';
    document.body.style.mozUserSelect = 'none';
    document.body.style.msUserSelect = 'none';
    document.body.style.userSelect = 'none';
    
    // Monitor for window blur (potential app switching)
    window.addEventListener('blur', () => {
        console.log('🚨 Window lost focus - potential escape attempt');
        // Re-focus immediately and aggressively
        window.focus();
        elements.pinInput.focus();
        
        // Re-focus again after delays to handle various escape attempts
        setTimeout(() => {
            window.focus();
            elements.pinInput.focus();
        }, 50);
        
        setTimeout(() => {
            window.focus();
            elements.pinInput.focus();
        }, 200);
    });
    
    // Monitor for visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('🚨 Page hidden - potential escape attempt');
        } else {
            console.log('🔒 Page visible again');
            elements.pinInput.focus();
        }
    });
}

// Aggressive focus maintenance
function aggressiveFocusMaintenance() {
    setInterval(() => {
        // Force focus back to window and input
        if (!document.hasFocus()) {
            console.log('🔒 Forcing window focus');
            window.focus();
        }
        
        if (document.activeElement !== elements.pinInput && !isUnlocking) {
            console.log('🔒 Forcing input focus');
            elements.pinInput.focus();
        }
        
        // Ensure the window is visible and on top
        if (document.hidden) {
            console.log('🔒 Document hidden, attempting to show');
            window.focus();
        }
    }, 200); // Check very frequently - every 200ms
}

// Keep focus on the lock screen
function maintainFocus() {
    setInterval(() => {
        if (!document.hasFocus()) {
            console.log('🔒 Regaining focus');
            window.focus();
        }
        if (document.activeElement !== elements.pinInput && !isUnlocking) {
            elements.pinInput.focus();
        }
    }, 500); // Check more frequently - every 500ms
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    maintainFocus();
    aggressiveFocusMaintenance();
});

// Handle window focus
window.addEventListener('focus', () => {
    if (elements.pinInput) {
        elements.pinInput.focus();
    }
});

console.log('🔒 Lock renderer loaded');
