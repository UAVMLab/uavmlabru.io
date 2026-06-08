// Profiles tab module
import { state } from '../../../state.js';
import { sendCommand } from '../../../utils/bluetooth.js';
import { vibrate, vibratePattern } from '../../../utils/haptics.js';
import { appendLog } from '../../../utils/logUtils.js';

let currentProfile = null;
let receivedProfiles = [];
let currentActiveProfileName = null;
let hasReceivedCurrentProfile = false; // Track if we've received the current profile

// Getter for current active profile name
export function getCurrentActiveProfileName() {
    return currentActiveProfileName;
}

// Getter for current active profile data
export function getCurrentActiveProfile() {
    if (!currentActiveProfileName) return null;
    return receivedProfiles.find(p => p.profileName === currentActiveProfileName) || null;
}

// Reset active profile (called on disconnect)
export function resetActiveProfile() {
    currentActiveProfileName = null;
    hasReceivedCurrentProfile = false;
}

// Mark that current profile needs to be requested again
export function invalidateCurrentProfile() {
    hasReceivedCurrentProfile = false;
}

export function initProfilesTab() {
    const loadProfilesButton = document.getElementById('loadProfilesButton');
    const addProfileButton = document.getElementById('addProfileButton');
    const modifyCheckbox = document.getElementById('modifyProfileCheckbox');
    const profileForm = document.getElementById('profileForm');
    const setProfileButton = document.getElementById('setProfileButton');
    const removeProfileButton = document.getElementById('removeProfileButton');
    const downloadProfileButton = document.getElementById('downloadProfileButton');
    const saveProfileButton = document.getElementById('saveProfileButton');
    const cancelModifyButton = document.getElementById('cancelModifyButton');

    loadProfilesButton.addEventListener('click', loadProfilesFromDevice);
    addProfileButton.addEventListener('click', addNewProfile);
    modifyCheckbox.addEventListener('change', toggleModifyMode);
    profileForm.addEventListener('submit', saveProfile);
    setProfileButton.addEventListener('click', setActiveProfile);
    removeProfileButton.addEventListener('click', removeProfile);
    downloadProfileButton.addEventListener('click', downloadProfile);
    cancelModifyButton.addEventListener('click', cancelModify);
    
    // Set up callback for when profiles tab is opened
    window.onProfilesTabOpen = onProfilesTabOpen;
    
    // Initialize profile display
    renderProfileList();
}

function onProfilesTabOpen() {
    // Auto-load profiles when tab is opened if connected
    if (state.connected) {
        loadProfilesFromDevice();
    }
}

async function loadProfilesFromDevice() {
    vibrate(30); // Light feedback for load action
    try {
        // Clear previous profiles
        receivedProfiles = [];
        renderProfileList();
        
        await sendCommand('get_profile_list');
        appendLog('Запрос списка профилей с устройства...');
        
        // Only request current active profile if we haven't received it yet
        if (!hasReceivedCurrentProfile) {
            setTimeout(async () => {
                try {
                    await sendCommand('get_cur_profile');
                    appendLog('Запрос текущего активного профиля...');
                } catch (error) {
                    appendLog(`Не удалось запросить текущий профиль: ${error.message}`);
                }
            }, 2000);
        }
    } catch (error) {
        appendLog(`Не удалось загрузить профили: ${error.message}`);
    }
}

export function handleProfileMessage(profile) {
    // Convert device profile format to internal format
    const normalizedProfile = {
        profileName: profile.name,
        motorKV: profile.mKV,
        propDiameter: profile.propDiam,
        propPitch: profile.propPitch,
        propBlades: profile.propBlades,
        batteryCellCount: profile.bat,
        motorPoles: profile.mPoles,
        motorReverse: profile.mRev,
        armThrottle: profile.armThrot,
        maxRPM: profile.mRpmLim,
        maxESCTemp: profile.escTempLim,
        maxMotorTemp: profile.mTempLim,
        maxCurrent: profile.curLim,
        maxThrust: profile.thrustLim || 10.0
    };
    
    // Check if profile already exists (prevent duplicates)
    const existingIndex = receivedProfiles.findIndex(p => p.profileName === normalizedProfile.profileName);
    if (existingIndex !== -1) {
        // Update existing profile instead of adding duplicate
        receivedProfiles[existingIndex] = normalizedProfile;
    } else {
        // Add new profile
        receivedProfiles.push(normalizedProfile);
    }
    
    // Update the profiles in state
    if (!state.lastRxProfiles) {
        state.lastRxProfiles = { profiles: [] };
    }
    state.lastRxProfiles.profiles = receivedProfiles;
    
    // Re-render the list
    renderProfileList();
    appendLog(`Профиль «${profile.name}» получен.`);
}

export function handleCurrentProfileMessage(profileName) {
    currentActiveProfileName = profileName;
    hasReceivedCurrentProfile = true; // Mark as received
    console.log('Current active profile set to:', `"${currentActiveProfileName}"`);
    console.log('Available profiles:', receivedProfiles.map(p => `"${p.profileName}"`));
    appendLog(`Текущий активный профиль: «${profileName}»`);
    renderProfileList();
}

function renderProfileList() {
    const profileList = document.getElementById('profileList');
    profileList.innerHTML = '';
    
    if (!state.lastRxProfiles || !state.lastRxProfiles.profiles || state.lastRxProfiles.profiles.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'Нет доступных профилей.';
        profileList.appendChild(empty);
        return;
    }

    // Sort profiles: current active profile first, then alphabetically
    const sortedProfiles = [...state.lastRxProfiles.profiles].sort((a, b) => {
        if (a.profileName === currentActiveProfileName) return -1;
        if (b.profileName === currentActiveProfileName) return 1;
        return a.profileName.localeCompare(b.profileName);
    });

    sortedProfiles.forEach((profile) => {
        const item = document.createElement('div');
        item.className = 'profile-list-item';
        
        console.log('Comparing:', profile.profileName, 'with current:', currentActiveProfileName, 'Match:', profile.profileName === currentActiveProfileName);
        
        // Highlight current active profile
        if (profile.profileName === currentActiveProfileName) {
            item.classList.add('current-active');
        }
        
        // Highlight selected profile for viewing/editing
        if (currentProfile && currentProfile.profileName === profile.profileName) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <div class="profile-list-name">
                ${profile.profileName === currentActiveProfileName ? '✓ ' : ''}${profile.profileName}
            </div>
            <div class="profile-list-details">${profile.motorKV}KV • ${profile.propDiameter}×${profile.propPitch} ${profile.propBlades}B</div>
        `;
        item.addEventListener('click', () => {
            vibrate(25);
            showProfileDetails(profile);
        });
        profileList.appendChild(item);
    });
}

function showProfileDetails(profile) {
    currentProfile = profile;
    
    // Show the details card
    const detailsCard = document.getElementById('profileDetailsCard');
    detailsCard.style.display = 'block';
    
    // Populate form fields
    document.getElementById('profileName').value = profile.profileName || '';
    document.getElementById('motorKV').value = profile.motorKV || '';
    document.getElementById('propDiameter').value = profile.propDiameter || '';
    document.getElementById('propPitch').value = profile.propPitch || '';
    document.getElementById('propBlades').value = profile.propBlades || 3;
    document.getElementById('batteryCellCount').value = profile.batteryCellCount || 0;
    document.getElementById('motorPoles').value = profile.motorPoles || 14;
    document.getElementById('motorReverse').checked = profile.motorReverse || false;
    document.getElementById('armThrottle').value = profile.armThrottle || 48;
    document.getElementById('maxRPM').value = profile.maxRPM || 0;
    document.getElementById('maxESCTemp').value = profile.maxESCTemp || 0;
    document.getElementById('maxMotorTemp').value = profile.maxMotorTemp || 0;
    document.getElementById('maxCurrent').value = profile.maxCurrent || 0;
    document.getElementById('maxThrust').value = profile.maxThrust || 10.0;
    
    // Reset modify mode
    document.getElementById('modifyProfileCheckbox').checked = false;
    toggleModifyMode();
    
    // Update active state in list
    renderProfileList();
}

function toggleModifyMode() {
    const isModifying = document.getElementById('modifyProfileCheckbox').checked;
    vibrate(isModifying ? 40 : 30); // Stronger for enable, lighter for disable
    const formFields = document.querySelectorAll('#profileForm input, #profileForm select');
    const profileActions = document.getElementById('profileActions');
    const modifyActions = document.getElementById('profileModifyActions');
    const profileNameField = document.getElementById('profileName');
    
    // Check if this is a new profile (name is "New Profile" or not in existing profiles)
    const existingProfiles = state.lastRxProfiles?.profiles || receivedProfiles;
    const isNewProfile = !currentProfile || 
                         currentProfile.profileName === 'Новый профиль' ||
                         !existingProfiles.some(p => p.profileName === currentProfile.profileName);
    
    // Enable/disable form fields
    formFields.forEach(field => {
        if (field.id === 'profileName') {
            // Allow editing name for new profiles, disable for existing profiles
            field.disabled = !isModifying || !isNewProfile;
        } else if (field.id !== 'modifyProfileCheckbox') {
            field.disabled = !isModifying;
        }
    });
    
    // Toggle action button visibility
    if (isModifying) {
        profileActions.style.display = 'none';
        modifyActions.style.display = 'flex';
    } else {
        profileActions.style.display = 'flex';
        modifyActions.style.display = 'none';
    }
}

async function saveProfile(e) {
    e.preventDefault();
    
    if (!currentProfile) return;
    
    const enteredName = document.getElementById('profileName').value.trim();
    
    // Convert to device format
    const profileData = {
        name: enteredName,
        mKV: parseInt(document.getElementById('motorKV').value),
        propDiam: parseFloat(document.getElementById('propDiameter').value),
        propPitch: parseFloat(document.getElementById('propPitch').value),
        propBlades: parseInt(document.getElementById('propBlades').value),
        bat: parseInt(document.getElementById('batteryCellCount').value),
        mPoles: parseInt(document.getElementById('motorPoles').value),
        mRev: document.getElementById('motorReverse').checked,
        armThrot: parseInt(document.getElementById('armThrottle').value),
        mRpmLim: parseInt(document.getElementById('maxRPM').value),
        escTempLim: parseFloat(document.getElementById('maxESCTemp').value),
        mTempLim: parseFloat(document.getElementById('maxMotorTemp').value),
        curLim: parseFloat(document.getElementById('maxCurrent').value),
        thrustLim: parseFloat(document.getElementById('maxThrust').value)
    };
    
    // Validate motor poles (must be even)
    if (profileData.mPoles % 2 !== 0 || profileData.mPoles < 2) {
        appendLog('ОШИБКА: Количество полюсов мотора должно быть чётным числом не менее 2.');
        return;
    }
    
    // Check if this is a new profile or name changed
    const existingProfiles = state.lastRxProfiles?.profiles || receivedProfiles;
    const profileExists = existingProfiles.some(p => p.profileName === enteredName);
    const isNewOrRenamed = !profileExists || (currentProfile.profileName !== enteredName);
    
    const command = isNewOrRenamed ? 'create_profile' : 'save_profile';
    
    try {
        await sendCommand(command, profileData);
        vibratePattern([80, 40, 80]); // Success pattern for save
        appendLog(`Запрошено ${isNewOrRenamed ? 'создание' : 'сохранение'} профиля «${profileData.name}».`);
        
        // Mark that we need to refresh current profile info
        invalidateCurrentProfile();
        
        // Update current profile name
        currentProfile.profileName = enteredName;
        
        // Exit modify mode
        document.getElementById('modifyProfileCheckbox').checked = false;
        toggleModifyMode();
    } catch (error) {
        vibratePattern([300]); // Error vibration
        appendLog(`Не удалось ${isNewOrRenamed ? 'создать' : 'сохранить'} профиль: ${error.message}`);
    }
}

function cancelModify() {
    vibrate(30); // Light feedback for cancel
    // Reset form to current profile values
    if (currentProfile) {
        showProfileDetails(currentProfile);
    }
    
    document.getElementById('modifyProfileCheckbox').checked = false;
    toggleModifyMode();
}

async function setActiveProfile() {
    if (!currentProfile) return;
    
    try {
        await sendCommand('load_profile', { value: currentProfile.profileName });
        vibratePattern([50, 30, 80]); // Success pattern for set active
        appendLog(`Профиль «${currentProfile.profileName}» установлен как активный.`);
        
        // Mark that we need to refresh current profile info
        invalidateCurrentProfile();
        
        // Refresh the profile list to update the current active profile highlighting
        setTimeout(() => {
            loadProfilesFromDevice();
        }, 500);
    } catch (error) {
        vibratePattern([300]); // Error vibration
        appendLog(`Не удалось установить профиль: ${error.message}`);
    }
}

async function removeProfile() {
    if (!currentProfile) return;
    
    if (!confirm(`Вы уверены, что хотите удалить профиль «${currentProfile.profileName}»?`)) {
        vibrate(30); // Cancelled
        return;
    }
    
    try {
        await sendCommand('delete_profile', { value: currentProfile.profileName });
        vibratePattern([100, 50, 100]); // Warning pattern for delete
        appendLog(`Запрошено удаление профиля «${currentProfile.profileName}».`);
        
        // Mark that we need to refresh current profile info
        invalidateCurrentProfile();
        
        // Hide details card and clear current profile
        document.getElementById('profileDetailsCard').style.display = 'none';
        currentProfile = null;
    } catch (error) {
        vibratePattern([300]); // Error vibration
        appendLog(`Не удалось удалить профиль: ${error.message}`);
    }
}

function downloadProfile() {
    if (!currentProfile) return;
    
    vibrate(50); // Medium feedback for download
    const dataStr = JSON.stringify(currentProfile, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProfile.profileName.replace(/[^a-z0-9]/gi, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    appendLog(`Профиль «${currentProfile.profileName}» скачан.`);
}

function addNewProfile() {
    vibrate(40); // Feedback for new profile
    // Create a new empty profile
    const newProfile = {
        profileName: 'Новый профиль',
        motorKV: '',
        propDiameter: '',
        propPitch: '',
        propBlades: 3,
        batteryCellCount: 0,
        motorPoles: 14,
        motorReverse: false,
        armThrottle: 48,
        maxRPM: 0,
        maxESCTemp: 0,
        maxMotorTemp: 0,
        maxCurrent: 0,
        maxThrust: 10.0
    };
    
    showProfileDetails(newProfile);
    
    // Automatically enable modify mode for new profile
    document.getElementById('modifyProfileCheckbox').checked = true;
    toggleModifyMode();
}

// Export function to update profile list when new data arrives
export function updateProfileList() {
    renderProfileList();
}

// Export function to reset profiles tab UI on disconnect
export function resetProfilesTabUI() {
    // Clear profile list
    receivedProfiles = [];
    currentProfile = null;
    
    // Re-render empty list
    renderProfileList();
    
    // Hide profile details card
    const profileDetailsCard = document.getElementById('profileDetailsCard');
    if (profileDetailsCard) {
        profileDetailsCard.style.display = 'none';
    }
    
    // Uncheck modify checkbox
    const modifyCheckbox = document.getElementById('modifyProfileCheckbox');
    if (modifyCheckbox) {
        modifyCheckbox.checked = false;
    }
}
