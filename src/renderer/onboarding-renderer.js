const { ipcRenderer } = require('electron');

let currentStep = 1;
let settings = {
    pin: '',
    masterPassword: '',
    unlockDuration: 60000
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
});

function nextStep() {
    if (currentStep < 4) {
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
    for (let i = toStep + 1; i <= 4; i++) {
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
                completeOnboarding();
                break;
        }
    }
});

// Clear stored settings to ensure fresh start
settings = {
    pin: '',
    masterPassword: '',
    unlockDuration: 60000
};

console.log('🚀 Onboarding renderer loaded');
