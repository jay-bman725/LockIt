const { ipcRenderer } = require('electron');

// State management
let state = {
    isMonitoring: false,
    lockedApps: [],
    availableApps: [],
    blockedWebsites: [],
    settings: {
        pin: null,
        unlockDuration: null
    }
};

// DOM elements
let elements = {};

// Initialize the application
async function init() {
    // Check if onboarding is complete
    const securityStatus = await ipcRenderer.invoke('get-security-status');
    if (!securityStatus.isOnboardingComplete) {
        // Redirect to onboarding
        window.location.href = 'onboarding.html';
        return;
    }
    
    // Cache DOM elements
    cacheElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data
    await loadData();
    
    // Render initial state
    render();
    
    console.log('✅ LockIt UI initialized');
}

// Cache frequently used DOM elements
function cacheElements() {
    elements = {
        // Header controls
        monitorToggle: document.getElementById('monitorToggle'),
        settingsBtn: document.getElementById('settingsBtn'),
        
        // Status indicators
        monitoringStatus: document.getElementById('monitoringStatus'),
        lockedAppsCount: document.getElementById('lockedAppsCount'),
        
        // Tab controls
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanels: document.querySelectorAll('.tab-panel'),
        
        // App lists
        lockedAppsList: document.getElementById('lockedAppsList'),
        availableAppsList: document.getElementById('availableAppsList'),
        
        // Controls
        refreshAppsBtn: document.getElementById('refreshAppsBtn'),
        clearAllBtn: document.getElementById('clearAllBtn'),
        appSearch: document.getElementById('appSearch'),
        
        // Settings
        pinInput: document.getElementById('pinInput'),
        unlockDuration: document.getElementById('unlockDuration'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
        resetSettingsBtn: document.getElementById('resetSettingsBtn'),
        
        // Master Password Modal
        masterPasswordModal: document.getElementById('masterPasswordModal'),
        modalMasterPasswordInput: document.getElementById('modalMasterPasswordInput'),
        verifyMasterPasswordBtn: document.getElementById('verifyMasterPasswordBtn'),
        cancelMasterPasswordBtn: document.getElementById('cancelMasterPasswordBtn'),
        
        // Toast
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toastMessage'),
        
        // Version
        appVersion: document.getElementById('appVersion'),
        
        // Update Modal
        updateModal: document.getElementById('updateModal'),
        currentVersionDisplay: document.getElementById('currentVersionDisplay'),
        newVersionDisplay: document.getElementById('newVersionDisplay'),
        changelogContent: document.getElementById('changelogContent'),
        declineUpdateBtn: document.getElementById('declineUpdateBtn'),
        dismissUpdateBtn: document.getElementById('dismissUpdateBtn'),
        downloadUpdateBtn: document.getElementById('downloadUpdateBtn'),
        checkUpdateBtn: document.getElementById('checkUpdateBtn'),
        
        // Website management elements
        websiteInput: document.getElementById('websiteInput'),
        addWebsiteBtn: document.getElementById('addWebsiteBtn'),
        blockedWebsitesList: document.getElementById('blockedWebsitesList'),
        clearAllWebsitesBtn: document.getElementById('clearAllWebsitesBtn'),
        serverStatus: document.getElementById('serverStatus'),
        extensionStatus: document.getElementById('extensionStatus'),
        downloadExtensionBtn: document.getElementById('downloadExtensionBtn'),
        testConnectionBtn: document.getElementById('testConnectionBtn')
    };
}

// Set up event listeners
function setupEventListeners() {
    // Monitor toggle
    elements.monitorToggle.addEventListener('click', toggleMonitoring);
    
    // Tab switching
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });
    
    // App controls
    elements.refreshAppsBtn.addEventListener('click', refreshApps);
    elements.clearAllBtn.addEventListener('click', clearAllLockedApps);
    elements.appSearch.addEventListener('input', filterApps);
    
    // Settings - require master password verification
    elements.saveSettingsBtn.addEventListener('click', () => requestMasterPasswordForAction('save'));
    elements.resetSettingsBtn.addEventListener('click', () => requestMasterPasswordForAction('reset'));
    
    // PIN Input - clear field when user clicks into it
    elements.pinInput.addEventListener('focus', () => {
        elements.pinInput.value = '';
    });
    
    // Master Password Modal
    elements.verifyMasterPasswordBtn.addEventListener('click', verifyMasterPasswordForAction);
    elements.cancelMasterPasswordBtn.addEventListener('click', hideMasterPasswordModal);
    elements.modalMasterPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyMasterPasswordForAction();
        }
    });
    
    // Close modal when clicking outside
    elements.masterPasswordModal.addEventListener('click', (e) => {
        if (e.target === elements.masterPasswordModal) {
            hideMasterPasswordModal();
        }
    });
    
    // Update functionality
    elements.checkUpdateBtn.addEventListener('click', checkForUpdatesManually);
    elements.declineUpdateBtn.addEventListener('click', declineUpdate);
    elements.dismissUpdateBtn.addEventListener('click', dismissUpdate);
    elements.downloadUpdateBtn.addEventListener('click', downloadUpdate);
    
    // Close update modal when clicking outside
    elements.updateModal.addEventListener('click', (e) => {
        if (e.target === elements.updateModal) {
            hideUpdateModal();
        }
    });
    
    // Website management
    elements.addWebsiteBtn.addEventListener('click', addWebsite);
    elements.clearAllWebsitesBtn.addEventListener('click', clearAllWebsites);
    elements.downloadExtensionBtn.addEventListener('click', downloadExtension);
    elements.testConnectionBtn.addEventListener('click', testServerConnection);
    elements.websiteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addWebsite();
        }
    });
    
    // IPC listeners
    ipcRenderer.on('show-preferences', () => {
        switchTab('settings');
    });
    
    // Listen for update notifications from main process
    ipcRenderer.on('update-available', (event, updateInfo) => {
        showUpdateModal(updateInfo);
    });
}

// Load initial data
async function loadData() {
    try {
        // Load locked apps
        state.lockedApps = await ipcRenderer.invoke('get-locked-apps');
        
        // Load settings
        state.settings = await ipcRenderer.invoke('get-settings');
        
        // Configure UI based on Chrome extension setting
        configureUIForChromeExtension();
        
        // Load blocked websites
        await loadBlockedWebsites();
        
        // Load app version
        const appVersion = await ipcRenderer.invoke('get-app-version');
        if (elements.appVersion) {
            elements.appVersion.textContent = appVersion;
        }
        
        // Validate settings - if PIN is missing, redirect to onboarding
        if (!state.settings.pin || !state.settings.unlockDuration) {
            console.warn('⚠️ Settings incomplete, redirecting to onboarding');
            window.location.href = 'onboarding.html';
            return;
        }
        
        // Load available apps
        await refreshApps();
        
        console.log('📊 Data loaded:', state);
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Error loading data', 'error');
    }
}

// Refresh available apps list
async function refreshApps() {
    try {
        showLoading(elements.availableAppsList);
        state.availableApps = await ipcRenderer.invoke('get-running-apps');
        renderAvailableApps();
        showToast('Applications refreshed successfully');
    } catch (error) {
        console.error('Error refreshing apps:', error);
        showToast('Error refreshing applications', 'error');
    }
}

// Toggle monitoring state
async function toggleMonitoring() {
    try {
        if (state.isMonitoring) {
            await ipcRenderer.invoke('stop-monitoring');
            state.isMonitoring = false;
            elements.monitorToggle.textContent = '▶️ Start Monitoring';
            elements.monitorToggle.className = 'btn btn-primary';
            showToast('Monitoring stopped');
        } else {
            await ipcRenderer.invoke('start-monitoring');
            state.isMonitoring = true;
            elements.monitorToggle.textContent = '⏸️ Stop Monitoring';
            elements.monitorToggle.className = 'btn btn-danger';
            showToast('Monitoring started');
        }
        updateStatus();
    } catch (error) {
        console.error('Error toggling monitoring:', error);
        showToast('Error toggling monitoring', 'error');
    }
}

// Switch between tabs
function switchTab(tabName) {
    // Update tab buttons
    elements.tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update tab panels
    elements.tabPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `${tabName}-tab`) {
            panel.classList.add('active');
        }
    });
    
    // Load tab-specific data
    if (tabName === 'settings') {
        loadSettingsForm();
    }
}

// Add app to locked list
async function lockApp(app) {
    try {
        if (!state.lockedApps.find(lockedApp => lockedApp.name === app.name)) {
            state.lockedApps.push(app);
            await ipcRenderer.invoke('set-locked-apps', state.lockedApps);
            render();
            showToast(`🔒 ${app.name} is now locked`);
        }
    } catch (error) {
        console.error('Error locking app:', error);
        showToast('Error locking application', 'error');
    }
}

// Remove app from locked list
async function unlockApp(appName) {
    try {
        state.lockedApps = state.lockedApps.filter(app => app.name !== appName);
        await ipcRenderer.invoke('set-locked-apps', state.lockedApps);
        render();
        showToast(`🔓 ${appName} is no longer locked`);
    } catch (error) {
        console.error('Error unlocking app:', error);
        showToast('Error unlocking application', 'error');
    }
}

// Clear all locked apps
async function clearAllLockedApps() {
    try {
        if (state.lockedApps.length === 0) {
            showToast('No locked applications to clear');
            return;
        }
        
        if (confirm('Are you sure you want to unlock all applications?')) {
            state.lockedApps = [];
            await ipcRenderer.invoke('set-locked-apps', state.lockedApps);
            render();
            showToast('All applications unlocked');
        }
    } catch (error) {
        console.error('Error clearing locked apps:', error);
        showToast('Error clearing locked applications', 'error');
    }
}

// Filter apps based on search
function filterApps() {
    const searchTerm = elements.appSearch.value.toLowerCase();
    const appItems = elements.availableAppsList.querySelectorAll('.app-item');
    
    appItems.forEach(item => {
        const appName = item.querySelector('h3').textContent.toLowerCase();
        if (appName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Load settings form
function loadSettingsForm() {
    elements.pinInput.value = state.settings.pin;
    elements.unlockDuration.value = state.settings.unlockDuration;
}

// Save settings
async function saveSettings() {
    try {
        const newSettings = {
            pin: elements.pinInput.value,
            unlockDuration: parseInt(elements.unlockDuration.value)
        };
        
        if (!newSettings.pin || newSettings.pin.length !== 5 || !/^\d{5}$/.test(newSettings.pin)) {
            showToast('PIN must be exactly 5 digits', 'error');
            return;
        }
        
        if (!newSettings.unlockDuration || newSettings.unlockDuration < 1000) {
            showToast('Please select a valid unlock duration', 'error');
            return;
        }
        
        await ipcRenderer.invoke('set-settings', newSettings);
        state.settings = newSettings;
        showToast('Settings saved successfully');
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
    }
}

// Reset settings to defaults
async function resetSettings() {
    if (confirm('This will redirect you to the onboarding screen to reconfigure all settings. Continue?')) {
        try {
            // Clear onboarding completion flag to force re-setup
            window.location.href = 'onboarding.html';
        } catch (error) {
            console.error('Error resetting settings:', error);
            showToast('Error resetting settings', 'error');
        }
    }
}

// Render the UI
function render() {
    renderLockedApps();
    renderAvailableApps();
    renderBlockedWebsites();
    updateStatus();
    updateServerStatus('checking');
    
    // Test server connection after a short delay
    setTimeout(() => {
        testServerConnection();
    }, 1000);
}

// Render locked apps list
function renderLockedApps() {
    if (state.lockedApps.length === 0) {
        elements.lockedAppsList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🔓</span>
                <p>No applications are currently locked.</p>
                <p>Switch to the "Available Apps" tab to lock some applications.</p>
            </div>
        `;
        return;
    }
    
    elements.lockedAppsList.innerHTML = state.lockedApps.map(app => `
        <div class="app-item">
            <div class="app-info">
                <div class="app-icon">🔒</div>
                <div class="app-details">
                    <h3>${escapeHtml(app.name)}</h3>
                    <p>Locked application</p>
                </div>
            </div>
            <div class="app-actions">
                <button class="btn btn-danger btn-small" onclick="unlockApp('${escapeHtml(app.name)}')">
                    🔓 Unlock
                </button>
            </div>
        </div>
    `).join('');
}

// Render available apps list
function renderAvailableApps() {
    if (state.availableApps.length === 0) {
        elements.availableAppsList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📱</span>
                <p>No applications found.</p>
                <p>Click "Refresh" to scan for running applications.</p>
            </div>
        `;
        return;
    }
    
    elements.availableAppsList.innerHTML = state.availableApps.map(app => {
        const isLocked = state.lockedApps.find(lockedApp => lockedApp.name === app.name);
        
        return `
            <div class="app-item">
                <div class="app-info">
                    <div class="app-icon">${isLocked ? '🔒' : '📱'}</div>
                    <div class="app-details">
                        <h3>${escapeHtml(app.name)}</h3>
                        <p>PID: ${app.pid}</p>
                    </div>
                </div>
                <div class="app-actions">
                    ${isLocked ? 
                        `<button class="btn btn-danger btn-small" onclick="unlockApp('${escapeHtml(app.name)}')">
                            🔓 Unlock
                        </button>` :
                        `<button class="btn btn-primary btn-small" onclick="lockApp(${JSON.stringify(app).replace(/"/g, '&quot;')})">
                            🔒 Lock
                        </button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// Update status indicators
function updateStatus() {
    // Monitoring status
    elements.monitoringStatus.textContent = state.isMonitoring ? 'Active' : 'Inactive';
    elements.monitoringStatus.className = `status-value ${state.isMonitoring ? 'status-active' : 'status-inactive'}`;
    
    // Locked apps count
    elements.lockedAppsCount.textContent = state.lockedApps.length;
}

// Show loading state
function showLoading(container) {
    container.innerHTML = `
        <div class="loading">
            <span class="loading-spinner">⏳</span>
            <p>Loading applications...</p>
        </div>
    `;
}

// Show toast notification
function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    elements.toast.className = `toast ${type}`;
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// Master Password Modal Management
let pendingAction = null;

function requestMasterPasswordForAction(action) {
    pendingAction = action;
    showMasterPasswordModal();
}

function showMasterPasswordModal() {
    elements.masterPasswordModal.classList.add('show');
    elements.modalMasterPasswordInput.value = '';
    elements.modalMasterPasswordInput.focus();
}

function hideMasterPasswordModal() {
    elements.masterPasswordModal.classList.remove('show');
    elements.modalMasterPasswordInput.value = '';
    pendingAction = null;
}

async function verifyMasterPasswordForAction() {
    const password = elements.modalMasterPasswordInput.value.trim();
    
    if (!password) {
        showToast('Please enter your master password', 'error');
        elements.modalMasterPasswordInput.focus();
        return;
    }
    
    try {
        const result = await ipcRenderer.invoke('verify-master-password', password);
        
        if (result.success) {
            hideMasterPasswordModal();
            
            // Execute the pending action
            if (pendingAction === 'save') {
                await saveSettings();
            } else if (pendingAction === 'reset') {
                await resetSettings();
            }
            
            pendingAction = null;
        } else {
            showToast('Invalid master password', 'error');
            elements.modalMasterPasswordInput.value = '';
            elements.modalMasterPasswordInput.focus();
        }
    } catch (error) {
        console.error('Error verifying master password:', error);
        showToast('Failed to verify master password', 'error');
        elements.modalMasterPasswordInput.focus();
    }
}

// Update Management Functions
let currentUpdateInfo = null;

async function checkForUpdatesManually() {
    try {
        // Disable button and show loading state
        elements.checkUpdateBtn.disabled = true;
        elements.checkUpdateBtn.textContent = '🔍 Checking...';
        
        const result = await ipcRenderer.invoke('check-for-updates', true);
        
        if (result.hasUpdate) {
            showUpdateModal(result);
            showToast('Update found! 🚀', 'success');
        } else if (result.error) {
            showToast(`Error checking for updates: ${result.error}`, 'error');
        } else {
            showToast(result.message || 'You are running the latest version! ✅', 'success');
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
        showToast('Failed to check for updates', 'error');
    } finally {
        // Restore button state
        elements.checkUpdateBtn.disabled = false;
        elements.checkUpdateBtn.textContent = '🔍 Check for Updates';
    }
}

function showUpdateModal(updateInfo) {
    currentUpdateInfo = updateInfo;
    
    // Update version displays
    elements.currentVersionDisplay.textContent = updateInfo.currentVersion;
    elements.newVersionDisplay.textContent = updateInfo.newVersion;
    
    // Format and display changelog
    formatChangelog(updateInfo.changelog);
    
    // Show modal
    elements.updateModal.classList.add('show');
    
    console.log('📋 Update modal shown:', updateInfo);
}

function formatChangelog(changelogText) {
    // Convert markdown-like formatting to HTML
    let formattedText = changelogText
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        
        // Version headers with brackets and dates
        .replace(/^\[([^\]]+)\]\s*-\s*([0-9]{4}-[0-9]{2}-[0-9]{2})$/gim, '<h3 class="version-header">🏷️ Version $1 <span class="version-date">($2)</span></h3>')
        
        // Bold text
        .replace(/^\*\*([^*]+)\*\*:?/gim, '<strong>$1:</strong>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        
        // Code blocks and inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        
        // Lists
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        
        // Line breaks and paragraphs
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    // Wrap consecutive list items in ul tags
    formattedText = formattedText.replace(/(<li>.*?<\/li>)(\s*<br>\s*<li>.*?<\/li>)*/gs, (match) => {
        const cleanMatch = match.replace(/<br>\s*/g, '');
        return '<ul>' + cleanMatch + '</ul>';
    });
    
    // Clean up extra line breaks around headers
    formattedText = formattedText.replace(/<br>\s*(<h[1-6])/g, '$1');
    formattedText = formattedText.replace(/(<\/h[1-6]>)\s*<br>/g, '$1');
    
    // Wrap in paragraphs if not starting with header or list
    if (!formattedText.startsWith('<h') && !formattedText.startsWith('<ul')) {
        formattedText = '<p>' + formattedText + '</p>';
    }
    
    elements.changelogContent.innerHTML = formattedText;
}

function hideUpdateModal() {
    elements.updateModal.classList.remove('show');
    currentUpdateInfo = null;
}

async function declineUpdate() {
    if (currentUpdateInfo) {
        await ipcRenderer.invoke('dismiss-update', currentUpdateInfo.newVersion, false);
        console.log('⏭️ Update declined for now');
    }
    hideUpdateModal();
    showToast('Update declined. You can check for updates later in Settings.', 'info');
}

async function dismissUpdate() {
    if (currentUpdateInfo) {
        await ipcRenderer.invoke('dismiss-update', currentUpdateInfo.newVersion, true);
        console.log('🚫 Update dismissed permanently');
        showToast(`Update ${currentUpdateInfo.newVersion} will not be shown again.`, 'info');
    }
    hideUpdateModal();
}

async function downloadUpdate() {
    if (currentUpdateInfo && currentUpdateInfo.downloadUrl) {
        try {
            await ipcRenderer.invoke('open-download-url', currentUpdateInfo.downloadUrl);
            console.log('🌐 Download page opened');
            showToast('Opening download page in your browser...', 'success');
            hideUpdateModal();
        } catch (error) {
            console.error('Error opening download URL:', error);
            showToast('Failed to open download page', 'error');
        }
    }
}

// Configure UI based on Chrome extension settings
function configureUIForChromeExtension() {
    const chromeExtensionEnabled = state.settings.chromeExtensionEnabled;
    
    // Find the websites tab button and panel
    const websitesTabBtn = document.querySelector('.tab-btn[data-tab="websites"]');
    const websitesTabPanel = document.getElementById('websites-tab');
    
    if (!chromeExtensionEnabled) {
        // Hide the websites tab and panel
        if (websitesTabBtn) {
            websitesTabBtn.style.display = 'none';
            console.log('🌐 Chrome extension disabled - hiding websites tab');
        }
        if (websitesTabPanel) {
            websitesTabPanel.style.display = 'none';
        }
        
        // If the websites tab was currently active, switch to locked apps tab
        if (websitesTabBtn && websitesTabBtn.classList.contains('active')) {
            switchTab('apps');
        }
    } else {
        // Ensure the websites tab is visible
        if (websitesTabBtn) {
            websitesTabBtn.style.display = 'block';
            console.log('🌐 Chrome extension enabled - showing websites tab');
        }
        if (websitesTabPanel) {
            websitesTabPanel.style.display = 'block';
        }
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Website Management Functions
async function addWebsite() {
    const website = elements.websiteInput.value.trim();
    
    if (!website) {
        showToast('Please enter a website URL', 'error');
        return;
    }
    
    // Clean up the URL
    let cleanedSite = website.toLowerCase()
        .replace(/^https?:\/\//, '')  // Remove protocol
        .replace(/^www\./, '')        // Remove www
        .replace(/\/.*$/, '');        // Remove path
    
    if (!cleanedSite) {
        showToast('Please enter a valid website URL', 'error');
        return;
    }
    
    if (state.blockedWebsites.includes(cleanedSite)) {
        showToast('Website is already blocked', 'warning');
        return;
    }
    
    // Add to state
    state.blockedWebsites.push(cleanedSite);
    
    // Save to store
    try {
        await ipcRenderer.invoke('save-blocked-websites', state.blockedWebsites);
        elements.websiteInput.value = '';
        renderBlockedWebsites();
        showToast(`Added ${cleanedSite} to blocked websites`, 'success');
    } catch (error) {
        console.error('Error saving blocked websites:', error);
        showToast('Failed to save blocked website', 'error');
        // Remove from state since save failed
        state.blockedWebsites = state.blockedWebsites.filter(site => site !== cleanedSite);
    }
}

async function removeWebsite(website) {
    if (!confirm(`Remove ${website} from blocked websites?`)) {
        return;
    }
    
    // Remove from state
    state.blockedWebsites = state.blockedWebsites.filter(site => site !== website);
    
    // Save to store
    try {
        await ipcRenderer.invoke('save-blocked-websites', state.blockedWebsites);
        renderBlockedWebsites();
        showToast(`Removed ${website} from blocked websites`, 'success');
    } catch (error) {
        console.error('Error saving blocked websites:', error);
        showToast('Failed to remove blocked website', 'error');
        // Re-add to state since save failed
        state.blockedWebsites.push(website);
    }
}

async function clearAllWebsites() {
    if (!confirm('Remove all blocked websites? This action cannot be undone.')) {
        return;
    }
    
    state.blockedWebsites = [];
    
    try {
        await ipcRenderer.invoke('save-blocked-websites', state.blockedWebsites);
        renderBlockedWebsites();
        showToast('All blocked websites cleared', 'success');
    } catch (error) {
        console.error('Error clearing blocked websites:', error);
        showToast('Failed to clear blocked websites', 'error');
    }
}

function renderBlockedWebsites() {
    const container = elements.blockedWebsitesList;
    
    if (state.blockedWebsites.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🌐</span>
                <p>No websites are currently blocked.</p>
                <p>Add websites above to block them in Chrome.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.blockedWebsites.map(website => `
        <div class="website-item">
            <div class="website-info">
                <span class="website-icon">🚫</span>
                <div class="website-details">
                    <h4>${escapeHtml(website)}</h4>
                    <div class="website-url">Blocked in Chrome Extension</div>
                </div>
            </div>
            <div class="website-actions">
                <button class="btn btn-danger btn-small" onclick="removeWebsite('${escapeHtml(website)}')">
                    🗑️ Remove
                </button>
            </div>
        </div>
    `).join('');
}

async function downloadExtension() {
    try {
        // Get current app version
        const version = await ipcRenderer.invoke('get-app-version');
        const githubUrl = `https://github.com/jay-bman725/LockIt/releases/tag/v${version}`;
        
        // Open GitHub releases page in default browser
        await ipcRenderer.invoke('open-external-url', githubUrl);
        showToast('GitHub releases page opened. Download the extension ZIP file.', 'success');
    } catch (error) {
        console.error('Error opening GitHub releases:', error);
        showToast('Failed to open GitHub releases page', 'error');
    }
}

async function testServerConnection() {
    const oldText = elements.testConnectionBtn.textContent;
    elements.testConnectionBtn.textContent = '🔄 Testing...';
    elements.testConnectionBtn.disabled = true;
    
    try {
        const isRunning = await ipcRenderer.invoke('test-http-server');
        if (isRunning) {
            showToast('HTTP server is running correctly', 'success');
            updateServerStatus('connected');
        } else {
            showToast('HTTP server is not responding', 'error');
            updateServerStatus('disconnected');
        }
    } catch (error) {
        console.error('Error testing server connection:', error);
        showToast('Failed to test server connection', 'error');
        updateServerStatus('disconnected');
    } finally {
        elements.testConnectionBtn.textContent = oldText;
        elements.testConnectionBtn.disabled = false;
    }
}

function updateServerStatus(status) {
    const statusElement = elements.serverStatus;
    const extensionElement = elements.extensionStatus;
    
    switch(status) {
        case 'connected':
            statusElement.textContent = 'Running';
            statusElement.className = 'status-value status-connected';
            extensionElement.textContent = 'Ready';
            extensionElement.className = 'status-value status-connected';
            break;
        case 'disconnected':
            statusElement.textContent = 'Stopped';
            statusElement.className = 'status-value status-disconnected';
            extensionElement.textContent = 'Not Available';
            extensionElement.className = 'status-value status-disconnected';
            break;
        default:
            statusElement.textContent = 'Checking...';
            statusElement.className = 'status-value status-checking';
            extensionElement.textContent = 'Unknown';
            extensionElement.className = 'status-value status-checking';
    }
}

async function loadBlockedWebsites() {
    // Only load blocked websites if Chrome extension is enabled
    if (!state.settings.chromeExtensionEnabled) {
        console.log('🌐 Chrome extension disabled - skipping blocked websites load');
        state.blockedWebsites = [];
        return;
    }
    
    try {
        const websites = await ipcRenderer.invoke('get-blocked-websites');
        state.blockedWebsites = websites || [];
        renderBlockedWebsites();
    } catch (error) {
        console.error('Error loading blocked websites:', error);
        state.blockedWebsites = [];
        renderBlockedWebsites();
    }
}

// Make functions available globally for onclick handlers
window.lockApp = lockApp;
window.unlockApp = unlockApp;
window.removeWebsite = removeWebsite;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

console.log('🚀 LockIt renderer loaded');
