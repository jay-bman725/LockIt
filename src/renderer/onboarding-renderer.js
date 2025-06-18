const { ipcRenderer } = require('electron');

let currentStep = 1;
let settings = {
    pin: '',
    masterPassword: '',
    unlockDuration: 60000,
    chromeExtension: false
};

// Initialize onboarding
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔐 Onboarding initialized');
    
    // Update duration summary when selection changes
    const durationSelect = document.getElementById('unlockDurationSetup');
    if (durationSelect) {
        durationSelect.addEventListener('change', updateDurationSummary);
        updateDurationSummary(); // Set initial value
    }
    
    // Initialize Chrome extension options
    initializeChromeExtensionStep();
    
    // Set up GitHub download link
    setupGitHubDownloadLink();
});

function nextStep() {
    if (currentStep < 5) {
        showStep(currentStep + 1);
    }
}

function prevStep() {
    if (currentStep > 1) {
        showStep(currentStep - 1);
    }
}

function showStep(step) {
    // Hide current step
    const currentStepEl = document.querySelector(`.step-content[data-step="${currentStep}"]`);
    if (currentStepEl) {
        currentStepEl.style.display = 'none';
    }
    
    // Show new step
    const newStepEl = document.querySelector(`.step-content[data-step="${step}"]`);
    if (newStepEl) {
        newStepEl.style.display = 'block';
    }
    
    // Update progress
    updateProgress(currentStep, step);
    
    currentStep = step;
}

function updateProgress(fromStep, toStep) {
    // Mark previous steps as completed
    for (let i = 1; i < toStep; i++) {
        const progressStep = document.querySelector(`.progress-step[data-step="${i}"]`);
        const progressLine = progressStep?.nextElementSibling;
        
        if (progressStep) {
            progressStep.classList.add('completed');
            progressStep.classList.remove('active');
        }
        if (progressLine && progressLine.classList.contains('progress-line')) {
            progressLine.classList.add('completed');
        }
    }
    
    // Set current step as active
    const currentProgressStep = document.querySelector(`.progress-step[data-step="${toStep}"]`);
    if (currentProgressStep) {
        currentProgressStep.classList.add('active');
        currentProgressStep.classList.remove('completed');
    }
    
    // Remove active class from future steps
    for (let i = toStep + 1; i <= 5; i++) {
        const futureStep = document.querySelector(`.progress-step[data-step="${i}"]`);
        if (futureStep) {
            futureStep.classList.remove('active', 'completed');
        }
    }
}

function validatePinAndNext() {
    const pinInput = document.getElementById('pinSetup');
    const confirmInput = document.getElementById('pinConfirm');
    
    const pin = pinInput.value.trim();
    const confirmPin = confirmInput.value.trim();
    
    // Validation
    if (!pin) {
        showError('Please enter a PIN');
        pinInput.focus();
        return;
    }
    
    if (pin.length !== 5 || !/^\d{5}$/.test(pin)) {
        showError('PIN must be exactly 5 digits');
        pinInput.focus();
        return;
    }
    
    if (pin !== confirmPin) {
        showError('PINs do not match');
        confirmInput.focus();
        return;
    }
    
    // Save PIN
    settings.pin = pin;
    console.log('✅ PIN validated and saved');
    
    nextStep();
}

function validateMasterPasswordAndNext() {
    const passwordInput = document.getElementById('masterPasswordSetup');
    const confirmInput = document.getElementById('masterPasswordConfirm');
    
    const password = passwordInput.value.trim();
    const confirmPassword = confirmInput.value.trim();
    
    // Validation
    if (!password) {
        showError('Please enter a master password');
        passwordInput.focus();
        return;
    }
    
    if (password.length < 6) {
        showError('Master password must be at least 6 characters long');
        passwordInput.focus();
        return;
    }
    
    if (password === settings.pin) {
        showError('Master password must be different from your PIN');
        passwordInput.focus();
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Master passwords do not match');
        confirmInput.focus();
        return;
    }
    
    // Save master password
    settings.masterPassword = password;
    console.log('✅ Master password validated and saved');
    
    nextStep();
}

function updateDurationSummary() {
    const durationSelect = document.getElementById('unlockDurationSetup');
    const summaryElement = document.getElementById('durationSummary');
    
    if (!durationSelect || !summaryElement) return;
    
    const value = parseInt(durationSelect.value);
    settings.unlockDuration = value;
    
    const durationText = getDurationText(value);
    summaryElement.textContent = durationText;
}

function getDurationText(milliseconds) {
    const seconds = milliseconds / 1000;
    if (seconds < 60) {
        return `${seconds} seconds`;
    } else if (seconds < 3600) {
        return `${seconds / 60} minute${seconds / 60 !== 1 ? 's' : ''}`;
    } else {
        return `${seconds / 3600} hour${seconds / 3600 !== 1 ? 's' : ''}`;
    }
}

async function completeOnboarding() {
    try {
        // Show loading state
        showCompletionState();
        
        // Final validation
        if (!settings.pin || !settings.masterPassword || !settings.unlockDuration) {
            throw new Error('Missing required settings');
        }
        
        console.log('🔐 Completing onboarding with settings:', {
            pinLength: settings.pin.length,
            masterPasswordLength: settings.masterPassword.length,
            unlockDuration: settings.unlockDuration
        });
        
        // Send settings to main process
        const result = await ipcRenderer.invoke('complete-onboarding', settings);
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to complete onboarding');
        }
        
        console.log('✅ Onboarding completed successfully');
        
        // Wait a moment then load main app
        setTimeout(async () => {
            const loadResult = await ipcRenderer.invoke('load-main-app');
            if (!loadResult.success) {
                console.error('Failed to load main app:', loadResult.error);
                showError('Failed to load main application');
            }
        }, 2000);
        
    } catch (error) {
        console.error('Error completing onboarding:', error);
        showError(error.message || 'Failed to complete setup');
        hideCompletionState();
    }
}

function showCompletionState() {
    // Hide all step content
    document.querySelectorAll('.step-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // Show completion state
    const completionEl = document.querySelector('.completion-state');
    if (completionEl) {
        completionEl.style.display = 'block';
    }
}

function hideCompletionState() {
    // Hide completion state
    const completionEl = document.querySelector('.completion-state');
    if (completionEl) {
        completionEl.style.display = 'none';
    }
    
    // Show current step
    showStep(currentStep);
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
    
    console.error('❌ Onboarding error:', message);
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
        
        switch (currentStep) {
            case 1:
                nextStep();
                break;
            case 2:
                validatePinAndNext();
                break;
            case 3:
                validateMasterPasswordAndNext();
                break;
            case 4:
                validateChromeExtensionAndNext();
                break;
            case 5:
                completeOnboarding();
                break;
        }
    }
});

// Clear stored settings to ensure fresh start
settings = {
    pin: '',
    masterPassword: '',
    unlockDuration: 60000,
    chromeExtension: false
};

console.log('🚀 Onboarding renderer loaded');

function initializeChromeExtensionStep() {
    // Add click handlers for option cards
    const optionCards = document.querySelectorAll('.option-card');
    optionCards.forEach(card => {
        card.addEventListener('click', () => {
            const option = card.getAttribute('data-option');
            selectChromeExtensionOption(option);
        });
    });
}

function selectChromeExtensionOption(option) {
    // Remove previous selections
    document.querySelectorAll('.option-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Select the chosen option
    const selectedCard = document.querySelector(`.option-card[data-option="${option}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    // Update settings
    settings.chromeExtension = (option === 'enable');
    
    // Show/hide instructions based on selection
    const instructions = document.getElementById('extensionInstructions');
    if (option === 'enable') {
        instructions.style.display = 'block';
    } else {
        instructions.style.display = 'none';
    }
    
    // Enable continue button
    const nextButton = document.getElementById('chromeExtensionNext');
    if (nextButton) {
        nextButton.disabled = false;
    }
    
    // Update summary
    updateExtensionSummary();
    
    console.log('🌐 Chrome extension option selected:', option);
}

function validateChromeExtensionAndNext() {
    if (settings.chromeExtension === undefined || settings.chromeExtension === null) {
        showError('Please select an option for the Chrome extension');
        return;
    }
    
    console.log('✅ Chrome extension choice validated:', settings.chromeExtension);
    nextStep();
}

async function setupGitHubDownloadLink() {
    const downloadLink = document.getElementById('extensionDownloadLink');
    if (downloadLink) {
        try {
            // Get version from main process
            const version = await ipcRenderer.invoke('get-app-version');
            
            // Update link text with version
            downloadLink.textContent = `📦 Download LockIt Extension v${version}`;
        } catch (error) {
            console.error('Error setting up GitHub download link:', error);
            // Fallback to default version
            const version = '1.1.0';
            downloadLink.textContent = `📦 Download LockIt Extension v${version}`;
        }
    }
}

async function openGitHubReleases() {
    try {
        const version = await ipcRenderer.invoke('get-app-version');
        const githubUrl = `https://github.com/jay-bman725/LockIt/releases/tag/v${version}`;
        
        // Open in default browser via IPC
        await ipcRenderer.invoke('open-external-url', githubUrl);
        console.log('✅ GitHub releases page opened in default browser');
    } catch (error) {
        console.error('Error opening GitHub releases:', error);
        showError('Failed to open GitHub releases page');
    }
}

function updateExtensionSummary() {
    const summaryElement = document.getElementById('extensionSummary');
    if (summaryElement) {
        summaryElement.textContent = settings.chromeExtension ? 'Enabled' : 'Disabled';
    }
}

function showTemporaryMessage(message) {
    const originalShowError = showError;
    
    // Temporarily override error styling for success message
    const errorToast = document.getElementById('errorToast');
    const originalBgColor = errorToast?.style.backgroundColor;
    
    if (errorToast) {
        errorToast.style.backgroundColor = '#4CAF50';
    }
    
    originalShowError(message);
    
    // Restore original styling after message is shown
    setTimeout(() => {
        if (errorToast) {
            errorToast.style.backgroundColor = originalBgColor || '';
        }
    }, 100);
}
