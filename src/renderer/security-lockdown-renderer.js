const { ipcRenderer } = require('electron');

let masterPasswordVerified = false;

// Initialize security lockdown screen
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚨 Security lockdown screen initialized');
    
    // Get and display lockdown information
    await loadSecurityStatus();
    
    // Focus on master password input
    const masterPasswordInput = document.getElementById('masterPasswordInput');
    if (masterPasswordInput) {
        masterPasswordInput.focus();
    }
});

async function loadSecurityStatus() {
    try {
        const status = await ipcRenderer.invoke('get-security-status');
        
        // Update lockdown time
        if (status.lastLockdownTime) {
            const lockdownTimeEl = document.getElementById('lockdownTime');
            if (lockdownTimeEl) {
                const lockdownDate = new Date(status.lastLockdownTime);
                lockdownTimeEl.textContent = formatLockdownTime(lockdownDate);
            }
        }
        
        console.log('📊 Security status loaded:', status);
    } catch (error) {
        console.error('Error loading security status:', error);
    }
}

function formatLockdownTime(date) {
    // Always display the actual date and time instead of relative time
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    };
    
    return date.toLocaleString('en-US', options);
}

async function verifyMasterPassword() {
    const masterPasswordInput = document.getElementById('masterPasswordInput');
    const password = masterPasswordInput.value.trim();
    
    if (!password) {
        showError('Please enter your master password');
        masterPasswordInput.focus();
        return;
    }
    
    try {
        showLoading('Verifying master password...');
        
        const result = await ipcRenderer.invoke('verify-master-password', password);
        
        hideLoading(); // Hide loading immediately after verification
        
        if (result.success) {
            masterPasswordVerified = true;
            console.log('✅ Master password verified');
            
            // Show PIN options instead of immediately closing
            showPinChangeOptions();
        } else {
            showError(result.error || 'Invalid master password');
            masterPasswordInput.value = '';
            masterPasswordInput.focus();
        }
    } catch (error) {
        hideLoading();
        console.error('Error verifying master password:', error);
        showError('Failed to verify master password');
    }
}

function showPinChangeOptions() {
    // Hide master password form with animation
    const masterPasswordForm = document.getElementById('masterPasswordForm');
    if (masterPasswordForm) {
        masterPasswordForm.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        masterPasswordForm.style.opacity = '0';
        masterPasswordForm.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            masterPasswordForm.style.display = 'none';
        }, 300);
    }
    
    // Show PIN change section with animation
    const pinChangeSection = document.getElementById('pinChangeSection');
    if (pinChangeSection) {
        setTimeout(() => {
            pinChangeSection.style.display = 'block';
            pinChangeSection.style.opacity = '0';
            pinChangeSection.style.transform = 'translateY(20px)';
            pinChangeSection.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            
            setTimeout(() => {
                pinChangeSection.style.opacity = '1';
                pinChangeSection.style.transform = 'translateY(0)';
                pinChangeSection.scrollIntoView({ behavior: 'smooth' });
            }, 50);
        }, 300);
    }
}

function showPinChangeForm() {
    // Hide PIN options
    const pinChangeSection = document.getElementById('pinChangeSection');
    if (pinChangeSection) {
        pinChangeSection.style.display = 'none';
    }
    
    // Show PIN change form
    const pinChangeForm = document.getElementById('pinChangeForm');
    if (pinChangeForm) {
        pinChangeForm.style.display = 'block';
        pinChangeForm.scrollIntoView({ behavior: 'smooth' });
        
        // Focus on new PIN input
        const newPinInput = document.getElementById('newPinInput');
        if (newPinInput) {
            newPinInput.focus();
        }
    }
}

function backToOptions() {
    // Hide PIN change form
    const pinChangeForm = document.getElementById('pinChangeForm');
    if (pinChangeForm) {
        pinChangeForm.style.display = 'none';
    }
    
    // Show PIN options
    const pinChangeSection = document.getElementById('pinChangeSection');
    if (pinChangeSection) {
        pinChangeSection.style.display = 'block';
        pinChangeSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Clear form
    document.getElementById('newPinInput').value = '';
    document.getElementById('confirmNewPinInput').value = '';
}

async function changePin() {
    const newPinInput = document.getElementById('newPinInput');
    const confirmPinInput = document.getElementById('confirmNewPinInput');
    
    const newPin = newPinInput.value.trim();
    const confirmPin = confirmPinInput.value.trim();
    
    // Validation
    if (!newPin) {
        showError('Please enter a new PIN');
        newPinInput.focus();
        return;
    }
    
    if (newPin.length !== 5 || !/^\d{5}$/.test(newPin)) {
        showError('PIN must be exactly 5 digits');
        newPinInput.focus();
        return;
    }
    
    if (newPin !== confirmPin) {
        showError('PINs do not match');
        confirmPinInput.focus();
        return;
    }
    
    try {
        showLoading('Updating PIN...');
        
        const result = await ipcRenderer.invoke('recover-from-lockdown', newPin);
        
        if (result.success) {
            console.log('✅ PIN changed and system recovered - window will close immediately');
            // The main process handles closing the window immediately
        } else {
            hideLoading();
            showError(result.error || 'Failed to update PIN and recover system');
        }
    } catch (error) {
        hideLoading();
        console.error('Error changing PIN:', error);
        showError('Failed to update PIN');
    }
}

async function recoverWithCurrentPin() {
    try {
        showLoading('Keeping current PIN and recovering system...');
        
        const result = await ipcRenderer.invoke('recover-from-lockdown', null);
        
        if (result.success) {
            console.log('✅ System recovered with current PIN - window will close immediately');
            // The main process handles closing the window immediately
        } else {
            hideLoading();
            showError(result.error || 'Failed to recover system');
        }
    } catch (error) {
        hideLoading();
        console.error('Error recovering system:', error);
        showError('Failed to recover system');
    }
}

function showLoading(message) {
    const loadingState = document.getElementById('loadingState');
    const loadingMessage = document.getElementById('loadingMessage');
    
    if (loadingState && loadingMessage) {
        loadingMessage.textContent = message;
        loadingState.style.display = 'flex';
        
        // Add a subtle animation to show progress
        loadingState.style.opacity = '0';
        setTimeout(() => {
            loadingState.style.opacity = '1';
        }, 50);
    }
}

function hideLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }
}

function showError(message) {
    const errorToast = document.getElementById('errorToast');
    const errorMessage = document.getElementById('errorMessage');
    
    if (errorToast && errorMessage) {
        errorMessage.textContent = message;
        errorToast.classList.add('show');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideError();
        }, 5000);
    }
    
    console.error('❌ Security lockdown error:', message);
}

function hideError() {
    const errorToast = document.getElementById('errorToast');
    if (errorToast) {
        errorToast.classList.remove('show');
    }
}

// Handle form submissions with Enter key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        
        const masterPasswordForm = document.getElementById('masterPasswordForm');
        const pinChangeForm = document.getElementById('pinChangeForm');
        
        if (masterPasswordForm && masterPasswordForm.style.display !== 'none') {
            verifyMasterPassword();
        } else if (pinChangeForm && pinChangeForm.style.display !== 'none') {
            changePin();
        }
    }
});

// Prevent common escape attempts
document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

document.addEventListener('keydown', (event) => {
    // Prevent Alt+Tab, Cmd+Tab, Alt+F4, etc.
    if (
        (event.altKey && event.code === 'Tab') ||
        (event.metaKey && event.code === 'Tab') ||
        (event.altKey && event.code === 'F4') ||
        (event.ctrlKey && event.shiftKey && event.code === 'KeyI') ||
        (event.metaKey && event.altKey && event.code === 'KeyI') ||
        event.code === 'F12'
    ) {
        event.preventDefault();
        console.log('🔒 Prevented escape attempt');
    }
});

console.log('🚨 Security lockdown renderer loaded');
