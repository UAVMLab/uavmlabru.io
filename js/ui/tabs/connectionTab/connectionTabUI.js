// ===== Connection tab module ======================================================== //
// ==================================================================================== //

/**
 * This module manages the Connection tab UI and its interactions with the BLE core functions.
 * 
 * Functions:
 * - `initConnectionTab`            : Initializes event listeners for connection tab elements.
 * - `connectDevice`                : Handles device connection process and UI updates.
 * - `disconnectDevice`             : Handles device disconnection process and UI updates.
 * - `onDisconnected`               : Callback for handling UI updates after disconnection.
 */ 



// Import state and utilities
import { state } from '../../../state.js';
import { setStatus } from "../../../utils/statusUtil.js";
import { appendLog } from '../../../utils/logUtils.js';
import { vibrate } from '../../../utils/haptics.js';

// Import profile tab functions
import { resetActiveProfile, resetProfilesTabUI } from '../profileTab/profilesTab.js';
import { resetControlTabUI, updateControlsAvailability } from '../controlTab/controlTabUI.js';

// Import core functions
import { 
    connectDevice as coreConnectDevice, 
    disconnectDevice as coreDisconnectDevice, 
    handleDisconnection, 
    rememberDevice as coreRememberDevice, 
    setDeviceId as coreSetDeviceId 
} from '../../../core/bleConnection.js';
import { resetTelemetryToNA } from '../../../core/telemetryHandler.js';

// ==================================================================================================== //

export function initConnectionTab() {
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const setDeviceIdButton = document.getElementById('setDeviceIdButton');
    // const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');

    if (connectButton) {
        connectButton.addEventListener('click', connectDevice);
    }
    if (disconnectButton) {
        disconnectButton.addEventListener('click', disconnectDevice);
    }
    if (setDeviceIdButton) {
        setDeviceIdButton.addEventListener('click', handleSetDeviceId);
    }
    
    // Initialize device list
    renderDeviceList();
}

function renderDeviceList() {
    const deviceList = document.getElementById('deviceList');
    deviceList.innerHTML = '';
    if (!state.discoveredDevices.length) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'Устройства пока не обнаружены.';
        deviceList.appendChild(empty);
        return;
    }

    state.discoveredDevices.forEach((device) => {
        const li = document.createElement('li');
        li.textContent = device.name;
        if (device.id === state.connectedDeviceId) {
            li.classList.add('active');
        }
        deviceList.appendChild(li);
    });
}


async function handleSetDeviceId() {
    const deviceIdInput = document.getElementById('deviceIdInput');
    const deviceId = parseInt(deviceIdInput.value, 10);
    
    try {
        await coreSetDeviceId(deviceId);
    } catch (error) {
        // Error already handled in core function
    }
}

async function connectDevice() {
    const deviceNameDisplay = document.getElementById('deviceName');
    
    try {
        const device = await coreConnectDevice(
            // onConnected callback
            (device) => {
                coreRememberDevice(device);
                
                if (deviceNameDisplay) {
                    deviceNameDisplay.textContent = `Устройство: ${device.name || 'Неизвестно'}`;
                }
                
                // Update button states
                const connectButton = document.getElementById('connectButton');
                const disconnectButton = document.getElementById('disconnectButton');
                if (connectButton) connectButton.disabled = true;
                if (disconnectButton) disconnectButton.disabled = false;
                
                renderDeviceList();
                updateControlsAvailability();
            },
            // onDisconnected callback
            onDisconnected
        );
    } catch (error) {
        // Error already handled in core function
    }
}

async function disconnectDevice() {
    await coreDisconnectDevice(onDisconnected);
}

function onDisconnected() {
    const deviceNameDisplay = document.getElementById('deviceName');
    
    // Call core disconnection handler
    handleDisconnection();
    resetTelemetryToNA();
    
    if (deviceNameDisplay) {
        deviceNameDisplay.textContent = 'Устройство: н/д';
    }
    
    // Update button states
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    if (connectButton) connectButton.disabled = false;
    if (disconnectButton) disconnectButton.disabled = true;
    
    resetActiveProfile(); // Clear active profile on disconnect
    renderDeviceList();
    
    // Reset UI for control and profiles tabs
    resetControlTabUI();
    resetProfilesTabUI();
    
    updateControlsAvailability();
}






