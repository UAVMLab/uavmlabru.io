// Control tab module
import { sendCommand } from '../../../utils/bluetooth.js';
import { vibrate, vibratePattern } from '../../../utils/haptics.js';
import { appendLog } from '../../../utils/logUtils.js';
import { state } from '../../../state.js';
import { getCurrentActiveProfileName } from '../profileTab/profilesTab.js';

// ====================================================================================

/**
 * Updates the availability of control tab elements based on connection and profile status.
 */
export function updateControlsAvailability() {
    const controlElements = document.querySelectorAll('[data-profile-required]');
    const controlStatus = document.getElementById('controlStatus');
    const telemetryCard = document.querySelector('#tab-control .card:first-child');
    
    const activeProfileName = getCurrentActiveProfileName();
    const hasActiveProfile = activeProfileName !== null && activeProfileName !== '';
    
    console.log('updateControlsAvailability called, connected:', state.connected, 'activeProfileName:', activeProfileName, 'hasActiveProfile:', hasActiveProfile);
    
    // Check connection status first
    if (!state.connected) {
        // Device not connected - disable all controls
        controlElements.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.disabled = true;
            } else {
                el.classList.add('disabled');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.5';
            }
        });
        if (controlStatus) {
            controlStatus.textContent = 'Подключите устройство для активации управления.';
            controlStatus.style.color = '#6c757d';
        }
        if (telemetryCard) {
            telemetryCard.style.opacity = '0.5';
        }
    } else if (!hasActiveProfile) {
        // Connected but no profile set
        controlElements.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.disabled = true;
            } else {
                // For DIV elements like slide-to-arm, add disabled class and prevent interaction
                el.classList.add('disabled');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.5';
            }
        });
        if (controlStatus) {
            controlStatus.textContent = '⚠️ Активный профиль не выбран. Выберите профиль на вкладке «Профили».';
            controlStatus.style.color = '#f39c12';
        }
        // Dim telemetry card to indicate it's not active
        if (telemetryCard) {
            telemetryCard.style.opacity = '0.5';
        }
    } else {
        // Connected and profile is set - enable controls
        controlElements.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.disabled = false;
            } else {
                // For DIV elements, remove disabled state
                el.classList.remove('disabled');
                el.style.pointerEvents = '';
                el.style.opacity = '';
            }
        });
        if (controlStatus) {
            controlStatus.textContent = 'Готово к управлению мотором.';
            controlStatus.style.color = '';
        }
        // Restore telemetry card opacity
        if (telemetryCard) {
            telemetryCard.style.opacity = '1';
        }
    }
}

// Throttle state for slider
let throttleSendTimeout = null;
let lastThrottleValue = null;
let isThrottleSending = false;
let lastHapticValue = null;

// Auto-disarm timeout - triggers if armed but not spinning
let autoDisarmTimeout = null;
let autoDisarmInProgress = false;

function onControlTabOpen() {
    // Update control availability when tab is opened
    updateControlsAvailability();
}

// Slide to arm state
let isDragging = false;
let startX = 0;
let currentX = 0;
let isArmed = false;
let lastVibrateProgress = 0; // Track progress for continuous vibration

// Fixed disarm button
let fixedDisarmButton = null;
let fixedDisarmContainer = null;

export function initControlTab() {
    // (Reverted) No disabling logic for Control Actions card
    const slideToArm = document.getElementById('slideToArm');
    const slideButton = document.getElementById('slideButton');
    const disarmButton = document.getElementById('disarmButton');
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    const throttleSlider = document.getElementById('throttleSlider');
    const throttleValue = document.getElementById('throttleValue');
    const testDurationInput = document.getElementById('testDuration');
    const testModeSelect = document.getElementById('testMode');
    const runTestButton = document.getElementById('runTestButton');
    const stopTestButton = document.getElementById('stopTestButton');

    // Set up callback for when control tab is opened
    window.onControlTabOpen = onControlTabOpen;

    // Slide to arm event listeners
    if (slideButton) {
        slideButton.addEventListener('mousedown', handleSlideStart);
        slideButton.addEventListener('touchstart', handleSlideStart, { passive: false });
        document.addEventListener('mousemove', handleSlideMove);
        document.addEventListener('touchmove', handleSlideMove, { passive: false });
        document.addEventListener('mouseup', handleSlideEnd);
        document.addEventListener('touchend', handleSlideEnd);
    }

    if (disarmButton) disarmButton.addEventListener('click', handleDisarm);
    if (forceArmCheckbox) forceArmCheckbox.addEventListener('change', handleForceArmChange);
    if (throttleSlider) {
        throttleSlider.addEventListener('input', handleThrottleInput);
        throttleSlider.addEventListener('change', handleThrottleChange);
    }
    if (testModeSelect) testModeSelect.addEventListener('change', handleTestModeChange);
    if (testDurationInput) testDurationInput.addEventListener('change', handleTestDurationChange);
    if (runTestButton) runTestButton.addEventListener('click', handleRunTest);
    if (stopTestButton) stopTestButton.addEventListener('click', handleStopTest);
    
    // Initialize fixed disarm button
    fixedDisarmButton = document.getElementById('fixedDisarmButton');
    fixedDisarmContainer = document.getElementById('fixed-disarm-container');
    if (fixedDisarmButton) {
        fixedDisarmButton.addEventListener('click', handleDisarm);
    }
}

export function initStatusDotHandlers() {
    const statusDots = document.querySelectorAll('.status-dot');
    const fixedStatusBar = document.getElementById('fixed-status-indicators');
    
    console.log('Status dots found:', statusDots.length);
    console.log('Fixed status bar:', fixedStatusBar);
    
    let activeLabel = null;
    
    statusDots.forEach(dot => {
        // Touch events for mobile
        dot.addEventListener('touchstart', (e) => {
            e.preventDefault();
            
            // Remove previous active label
            if (activeLabel && activeLabel !== dot) {
                activeLabel.classList.remove('show-label');
            }
            
            // Toggle current label
            if (dot.classList.contains('show-label')) {
                dot.classList.remove('show-label');
                activeLabel = null;
                if (fixedStatusBar) fixedStatusBar.classList.remove('expanded');
            } else {
                dot.classList.add('show-label');
                activeLabel = dot;
                if (fixedStatusBar) fixedStatusBar.classList.add('expanded');
                vibrate(25);
                
                // Auto-hide after 2 seconds
                setTimeout(() => {
                    if (activeLabel === dot) {
                        dot.classList.remove('show-label');
                        activeLabel = null;
                        if (fixedStatusBar) fixedStatusBar.classList.remove('expanded');
                    }
                }, 2000);
            }
        });
        
        // Click events for desktop
        dot.addEventListener('click', (e) => {
            e.preventDefault();
            vibrate(25);
        });
        
        // Hover events for desktop
        dot.addEventListener('mouseenter', () => {
            if (fixedStatusBar) fixedStatusBar.classList.add('expanded');
        });
        
        dot.addEventListener('mouseleave', () => {
            // Only remove expanded if no label is actively shown
            if (!activeLabel) {
                if (fixedStatusBar) fixedStatusBar.classList.remove('expanded');
            }
        });
    });
    
    // Close label when clicking elsewhere
    document.addEventListener('touchstart', (e) => {
        if (activeLabel && !e.target.classList.contains('status-dot')) {
            activeLabel.classList.remove('show-label');
            activeLabel = null;
            if (fixedStatusBar) fixedStatusBar.classList.remove('expanded');
        }
    });
}

function handleSlideStart(event) {
    const slideToArm = document.getElementById('slideToArm');
    if (!slideToArm || slideToArm.hasAttribute('disabled') || isArmed) return;
    
    event.preventDefault();
    isDragging = true;
    startX = event.type.includes('mouse') ? event.clientX : event.touches[0].clientX;
    lastVibrateProgress = 0;
    vibrate(25);
}

function handleSlideMove(event) {
    if (!isDragging) return;
    
    event.preventDefault();
    const slideButton = document.getElementById('slideButton');
    const slideToArm = document.getElementById('slideToArm');
    if (!slideButton || !slideToArm) return;
    
    const clientX = event.type.includes('mouse') ? event.clientX : event.touches[0].clientX;
    const deltaX = clientX - startX;
    const maxSlide = slideToArm.offsetWidth - slideButton.offsetWidth - 8;
    
    currentX = Math.max(0, Math.min(deltaX, maxSlide));
    slideButton.style.transform = `translateX(${currentX}px) translateY(-50%)`;
    
    // Continuous haptic feedback that increases with progress
    const progress = currentX / maxSlide;
    
    // Vibrate every 5% of progress with increasing intensity
    const progressStep = Math.floor(progress * 20); // 0-19 (for 5% steps)
    if (progressStep > lastVibrateProgress && progress > 0) {
        lastVibrateProgress = progressStep;
        
        // Calculate vibration duration: starts at 15ms, increases to 60ms at 85%
        const minDuration = 100;
        const maxDuration = 1000;
        const duration = Math.round(minDuration + (maxDuration - minDuration) * (progress / 0.85));
        
        vibrate(Math.min(duration, maxDuration));
    }
}

function handleSlideEnd(event) {
    if (!isDragging) return;
    
    isDragging = false;
    const slideButton = document.getElementById('slideButton');
    const slideToArm = document.getElementById('slideToArm');
    if (!slideButton || !slideToArm) return;
    
    const maxSlide = slideToArm.offsetWidth - slideButton.offsetWidth - 8;
    const progress = currentX / maxSlide;
    
    // If slid more than 85%, trigger arm
    if (progress > 0.85) {
        slideButton.style.transform = `translateX(${maxSlide}px) translateY(-50%)`;
        vibratePattern([2000, 500, 2000]); // Very strong warning vibration
        handleArm();
    } else {
        // Reset position with animation
        slideButton.style.transition = 'transform 0.3s ease-out';
        slideButton.style.transform = 'translateX(0) translateY(-50%)';
        lastVibrateProgress = 0;
        vibrate(30);
        setTimeout(() => {
            slideButton.style.transition = '';
        }, 300);
    }
    
    currentX = 0;
}

async function handleArm() {
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    const slideToArm = document.getElementById('slideToArm');
    const slideButton = document.getElementById('slideButton');
    const slideText = document.querySelector('.slide-text');
    const isForceArm = forceArmCheckbox?.checked || false;
    const cmd = isForceArm ? 'force_arm' : 'arm';
    
    try {
        await sendCommand(cmd);
        isArmed = true;
        vibratePattern([100, 50, 150]); // Success pattern
        setControlStatus(`Мотор ${isForceArm ? 'принудительно ' : ''}взведён.`);
        
        // Show fixed disarm button
        if (fixedDisarmContainer) {
            fixedDisarmContainer.style.display = 'flex';
        }
        
        // Update UI
        if (slideButton) slideButton.classList.add('armed');
        if (slideToArm) slideToArm.classList.add('armed');
        if (slideText) slideText.textContent = 'ВЗВЕДЁН ✓';
    } catch (error) {
        vibratePattern([300]); // Long vibration for error
        setControlStatus(`Ошибка взведения: ${error.message}`, false);
        resetSlideToArm();
    }
}

// Export function to check motor status and trigger auto-disarm if needed
export function checkMotorStatus(status) {
    const STATUS_BITS = {
        MOTOR_ARMED: 1 << 8,
        MOTOR_SPINNING: 1 << 9
    };
    
    const isMotorArmed = (status & STATUS_BITS.MOTOR_ARMED) !== 0;
    const isMotorSpinning = (status & STATUS_BITS.MOTOR_SPINNING) !== 0;
    
    console.log('checkMotorStatus - Armed:', isMotorArmed, 'Spinning:', isMotorSpinning, 'Status:', status);
    
    // If motor is armed but not spinning, start auto-disarm countdown
    if (isMotorArmed && !isMotorSpinning) {
        if (!autoDisarmTimeout && !autoDisarmInProgress) {
            console.log('Auto-disarm: Motor armed but not spinning, starting 2s countdown...');
            autoDisarmTimeout = setTimeout(() => {
                // Double-check status still shows armed but not spinning
                const motorArmedDot = document.getElementById('status-armed');
                const motorSpinningDot = document.getElementById('status-spinning');
                
                const stillArmed = motorArmedDot?.classList.contains('active');
                const stillNotSpinning = !motorSpinningDot?.classList.contains('active');
                
                console.log('Auto-disarm check after 2s - stillArmed:', stillArmed, 'stillNotSpinning:', stillNotSpinning);
                
                if (stillArmed && stillNotSpinning) {
                    appendLog('Авторазвзведение: мотор взведён, но не вращается более 2 секунд.');
                    vibratePattern([150, 70, 150]); // Warning pattern
                    autoDisarmInProgress = true;
                    handleDisarm().finally(() => {
                        autoDisarmInProgress = false;
                    });
                }
                
                autoDisarmTimeout = null;
            }, 2000);
        }
    } else {
        // Motor is either not armed or is spinning - cancel auto-disarm
        if (autoDisarmTimeout) {
            console.log('Auto-disarm cancelled - Armed:', isMotorArmed, 'Spinning:', isMotorSpinning);
            clearTimeout(autoDisarmTimeout);
            autoDisarmTimeout = null;
        }
    }
}

async function handleDisarm() {
    vibrate(40); // Light vibration on button press
    try {
        await sendCommand('disarm');
        vibrate(80); // Medium vibration for disarm
        setControlStatus('Мотор развзведён.');
        resetSlideToArm();
    } catch (error) {
        vibratePattern([300]); // Long vibration for error
        setControlStatus(`Ошибка развзведения: ${error.message}`, false);
    }
}

function resetSlideToArm() {
    isArmed = false;
    const slideButton = document.getElementById('slideButton');
    const slideToArm = document.getElementById('slideToArm');
    const slideText = document.querySelector('.slide-text');
    
    // Hide fixed disarm button
    if (fixedDisarmContainer) {
        fixedDisarmContainer.style.display = 'none';
    }
    
    if (slideButton) {
        slideButton.classList.remove('armed');
        slideButton.style.transition = 'transform 0.3s ease-out';
        slideButton.style.transform = 'translateX(0) translateY(-50%)';
        setTimeout(() => {
            slideButton.style.transition = '';
        }, 300);
    }
    if (slideToArm) slideToArm.classList.remove('armed');
    if (slideText) slideText.textContent = 'Сдвиньте для взвода >> ';
}

// Export function to reset control tab UI on disconnect
export function resetControlTabUI() {
    // Reset slide to arm
    resetSlideToArm();
    
    // Reset throttle slider
    const throttleSlider = document.getElementById('throttleSlider');
    const throttleValue = document.getElementById('throttleValue');
    if (throttleSlider) throttleSlider.value = 48;
    if (throttleValue) throttleValue.textContent = '0.00';
    
    // Clear any pending throttle timeout
    if (throttleSendTimeout) {
        clearTimeout(throttleSendTimeout);
        throttleSendTimeout = null;
    }
    
    // Reset throttle state
    lastThrottleValue = null;
    lastHapticValue = null;
    
    // Clear auto-disarm timeout
    if (autoDisarmTimeout) {
        clearTimeout(autoDisarmTimeout);
        autoDisarmTimeout = null;
    }
    autoDisarmInProgress = false;
    
    // Reset telemetry values
    const telemetryMetrics = [
        'voltageMetric', 'currentMetric', 'powerMetric',
        'rpmMetric', 'thrustMetric', 'escTempMetric', 'motorTempMetric'
    ];
    telemetryMetrics.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '--';
    });
    
    // Clear control status
    const controlStatus = document.getElementById('controlStatus');
    if (controlStatus) {
        controlStatus.textContent = '';
        controlStatus.style.color = '';
    }
    
    // Uncheck force arm
    const forceArmCheckbox = document.getElementById('forceArmCheckbox');
    if (forceArmCheckbox) forceArmCheckbox.checked = false;
}

function handleForceArmChange(event) {
    if (event.target.checked) {
        vibratePattern([150, 70, 150]); // Warning pattern
        const confirmed = confirm(
            '⚠️ ПРЕДУПРЕЖДЕНИЕ: Принудительное взведение\n\n' +
            'Вы собираетесь включить режим ПРИНУДИТЕЛЬНОГО ВЗВЕДЕНИЯ. Это обходит проверки безопасности и может быть опасно.\n\n' +
            'Вы уверены, что хотите продолжить?'
        );
        if (!confirmed) {
            event.target.checked = false;
            vibrate(80); // Cancelled
        } else {
            vibratePattern([80, 40, 80, 40, 80]); // Confirmed pattern
        }
    } else {
        vibrate(40); // Light vibration for unchecking
    }
}

async function handleThrottleInput() {
    const throttleSlider = document.getElementById('throttleSlider');
    const throttleValue = document.getElementById('throttleValue');
    const value = Number(throttleSlider.value);
    
    // Convert raw value (48-2047) to percentage (0-100) with 2 decimals
    const percentage = ((value - 48) / (2047 - 48) * 100).toFixed(2);
    
    // Haptic feedback at 5% intervals (approximately every 100 raw value units)
    const currentStep = Math.floor(value / 100);
    if (lastHapticValue !== currentStep) {
        vibrate(15); // Very light haptic tick
        lastHapticValue = currentStep;
    }
    
    // Update displayed throttle percentage immediately
    throttleValue.textContent = percentage;
    
    // Store value for debounced send
    lastThrottleValue = value;
    
    // Clear existing timeout
    if (throttleSendTimeout) {
        clearTimeout(throttleSendTimeout);
    }
    
    // Debounce: wait 100ms after last input before sending
    throttleSendTimeout = setTimeout(() => {
        sendThrottleCommand(value, percentage);
    }, 100);
}

async function handleThrottleChange() {
    // Called when slider is released - ensure final value is sent
    if (throttleSendTimeout) {
        clearTimeout(throttleSendTimeout);
    }
    
    const throttleSlider = document.getElementById('throttleSlider');
    const value = Number(throttleSlider.value);
    const percentage = ((value - 48) / (2047 - 48) * 100).toFixed(2);
    
    await sendThrottleCommand(value, percentage);
}

async function sendThrottleCommand(value, percentage) {
    // Prevent concurrent sends
    if (isThrottleSending) {
        return;
    }
    
    isThrottleSending = true;
    
    try {
        await sendCommand('set_throttle', { value: value });
        setControlStatus(`Газ установлен на ${percentage}% (${value}).`);
    } catch (error) {
        vibratePattern([200]); // Long vibration for error
        setControlStatus(`Ошибка изменения газа: ${error.message}`, false);
        appendLog(`Ошибка газа: ${error.message}`, 'error');
    } finally {
        isThrottleSending = false;
    }
}

// async function handleThrottleChange() {
//     vibrate(15); // Feedback when releasing slider
//     const throttleSlider = document.getElementById('throttleSlider');
//     const value = Number(throttleSlider.value);
//     const percentage = ((value - 48) / (2047 - 48) * 100).toFixed(2);
    
//     try {
//         // Send raw value (28-2047) to device
//         await sendCommand('set_throttle', { value: value });
//         vibrate(30); // Confirm command sent
//         setControlStatus(`Газ установлен на ${percentage}% (${value}).`);
//     } catch (error) {
//         vibratePattern([200]); // Long vibration for error
//         setControlStatus(`Ошибка изменения газа: ${error.message}`, false);
//     }
// }

async function handleTestModeChange() {
    vibrate(30); // Light vibration on select change
    const testModeSelect = document.getElementById('testMode');
    try {
        await sendCommand('SET_TEST_MODE', { mode: testModeSelect.value });
        vibrate(50); // Confirm command sent
        setControlStatus(`Режим теста установлен: ${testModeSelect.value}.`);
    } catch (error) {
        vibratePattern([300]); // Long vibration for error
        setControlStatus(`Не удалось установить режим теста: ${error.message}`, false);
    }
}

async function handleTestDurationChange() {
    vibrate(30); // Light vibration on input change
    const testDurationInput = document.getElementById('testDuration');
    try {
        await sendCommand('SET_TEST_DURATION', { duration: Number(testDurationInput.value) });
        vibrate(50); // Confirm command sent
    } catch (error) {
        appendLog(`Не удалось обновить длительность теста: ${error.message}`);
    }
}

async function handleRunTest() {
    vibratePattern([80, 40, 80]); // Start test pattern
    const testDurationInput = document.getElementById('testDuration');
    const testModeSelect = document.getElementById('testMode');
    try {
        await sendCommand('RUN_TEST', { duration: Number(testDurationInput.value), mode: testModeSelect.value });
        vibratePattern([150, 70, 150]); // Test running confirmation
        setControlStatus('Тест выполняется...');
    } catch (error) {
        vibratePattern([300, 150, 300]); // Error pattern
        setControlStatus(`Ошибка запуска теста: ${error.message}`, false);
    }
}

async function handleStopTest() {
    vibratePattern([50, 30, 50]); // Stop pattern
    try {
        await sendCommand('STOP_TEST');
        vibrate(80); // Stop confirmed
        setControlStatus('Сигнал остановки отправлен.');
    } catch (error) {
        vibratePattern([300]); // Long vibration for error
        setControlStatus(`Ошибка остановки теста: ${error.message}`, false);
    }
}

function setControlStatus(message, isPositive = true) {
    const controlStatus = document.getElementById('controlStatus');
    if (controlStatus) {
        controlStatus.textContent = message;
        controlStatus.style.color = isPositive ? '#2ecc71' : '#dc3545';
    }
}
