// Main application entry point
import { loadComponents } from './js/componentLoader.js';
import { setStatus } from './js/utils/statusUtil.js';
import { initNavigation } from './js/ui/navigation/navigationBarUI.js';

import { initConnectionTab } from './js/ui/tabs/connectionTab/connectionTabUI.js';
import { initProfilesTab, updateProfileList, handleProfileMessage, handleCurrentProfileMessage, getCurrentActiveProfile, getCurrentActiveProfileName } from './js/ui/tabs/profileTab/profilesTab.js';
import { initControlTab, initStatusDotHandlers } from './js/ui/tabs/controlTab/controlTabUI.js';
import { initResultsTab } from './js/ui/resultsTab.js';
import { initLogsTab } from './js/ui/tabs/logsTab/logsTabUI.js';
import { initAnalizeTab } from './js/ui/tabs/analizeTab/analizeTabUI.js';

// Expose functions globally so connectionTab can call them
window.updateProfileList = updateProfileList;
window.handleProfileMessage = handleProfileMessage;
window.handleCurrentProfileMessage = handleCurrentProfileMessage;
window.getCurrentActiveProfile = getCurrentActiveProfile;
window.getCurrentActiveProfileName = getCurrentActiveProfileName;

// Initialize all modules
async function initApp() {
    // Load HTML components first
    await loadComponents();
    
    // Initialize navigation
    initNavigation();
    
    // Initialize each tab
    initConnectionTab();
    initProfilesTab();
    initControlTab();
    initAnalizeTab();
    initResultsTab();
    initLogsTab();
    
    console.log('About to initialize status dot handlers...');
    // Initialize status dot handlers (after components are loaded)
    initStatusDotHandlers();
    console.log('Status dot handlers initialized');
    
    // Check Web Bluetooth support
    if (navigator.bluetooth) {
        setStatus('Web Bluetooth готов. Нажмите «Поиск и подключение» для начала работы.');
    } else {
        setStatus('Web Bluetooth НЕ поддерживается в этом браузере/платформе. Попробуйте Chrome на Android, ChromeOS, macOS или Windows.');
        const connectButton = document.getElementById('connectButton');
        if (connectButton) {
            connectButton.disabled = true;
        }
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
