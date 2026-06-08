// Core telemetry handling and message processing
import { decoder } from '../config/constants.js';
import { state } from '../state.js';
import { appendLog } from '../utils/logUtils.js';
import { setStatus } from '../utils/statusUtil.js';
import { updateStatusIndicators } from './statusManager.js';
import { 
    updateBatteryIndicator, 
    updateCurrentIndicator, 
    updateRPMIndicator, 
    updateThrustIndicator, 
    updateESCTempIndicator, 
    updateMotorTempIndicator,
    updateBatteryIndicatorAnalize,
    updateCurrentIndicatorAnalize,
    updateRPMIndicatorAnalize,
    updateThrustIndicatorAnalize,
    updateESCTempIndicatorAnalize,
    updateMotorTempIndicatorAnalize
} from './metricIndicators.js';
import { updateRSSIDisplay } from './rssiMonitor.js';

/**
 * Handles incoming telemetry data from BLE device
 * @param {Event} event - Characteristic value changed event
 */
export function handleTelemetry(event) {
    const voltageMetric = document.getElementById('voltageMetric');
    const currentMetric = document.getElementById('currentMetric');
    const powerMetric = document.getElementById('powerMetric');
    const rpmMetric = document.getElementById('rpmMetric');
    const thrustMetric = document.getElementById('thrustMetric');
    const escTempMetric = document.getElementById('escTempMetric');
    const motorTempMetric = document.getElementById('motorTempMetric');
    const firmwareVersion = document.getElementById('firmwareVersion');
    const batteryLevel = document.getElementById('batteryLevel');
    const temperature = document.getElementById('temperature');
    
    const value = event.target.value;
    const data = decoder.decode(value);
    appendLog(`RX: ${data}`);

    try {
        const msg = JSON.parse(data);
        
        // Route message to appropriate handler
        switch(msg.type) {
            case 'data':
                handleDataMessage(msg, { voltageMetric, currentMetric, powerMetric, rpmMetric, thrustMetric, escTempMetric, motorTempMetric });
                break;
            case 'status':
                handleStatusMessage(msg);
                break;
            case 'profiles':
                handleProfilesMessage(msg);
                break;
            case 'profile':
                handleProfileMessage(msg);
                break;
            case 'cur_profile':
                handleCurrentProfileMessage(msg);
                break;
            case 'version':
                handleVersionMessage(msg, firmwareVersion);
                break;
            case 'ACK':
            case 'ack':
                handleAckMessage(msg);
                break;
            case 'DEVICE_INFO':
                handleDeviceInfoMessage(msg, { firmwareVersion, batteryLevel, temperature });
                break;
            default:
                // Handle legacy format with payload
                if (msg.payload) {
                    handleLegacyDataMessage(msg.payload, { voltageMetric, currentMetric, rpmMetric, escTempMetric, motorTempMetric });
                }
        }
    } catch (err) {
        console.warn('Received non-JSON telemetry:', data, err);
        resetTelemetryToNA();
    }
}

/**
 * Resets all live telemetry display elements to N/A.
 * Called on parse failure or disconnection.
 */
export function resetTelemetryToNA() {
    const ids = [
        ['voltageMetric',   'analizeVoltage'],
        ['currentMetric',   'analizeCurrent'],
        ['powerMetric',     'analizePower'],
        ['rpmMetric',       'analizeRpm'],
        ['thrustMetric',    'analizeThrust'],
        ['escTempMetric',   'analizeEscTemp'],
        ['motorTempMetric', 'analizeMotorTemp'],
    ];
    for (const [ctrlId, analizeId] of ids) {
        const el = document.getElementById(ctrlId);
        if (el) el.textContent = 'н/д';
        const el2 = document.getElementById(analizeId);
        if (el2) el2.textContent = 'н/д';
    }
}

const KISS_TELEM_READ_OK_BIT = 1 << 11;

/**
 * Returns true if the KISS telemetry read was valid in the given message.
 * Falls back to the last known status when the message has no status field.
 */
function isTelemReadOk(msg) {
    let statusBits;
    if (msg.status !== undefined) {
        statusBits = typeof msg.status === 'number' ? msg.status : constructStatusBits(msg);
    } else if (state.lastRxStatus !== undefined) {
        const s = state.lastRxStatus;
        statusBits = typeof s.status === 'number' ? s.status : constructStatusBits(s);
    } else {
        return true; // no status info — don't suppress
    }
    return !!(statusBits & KISS_TELEM_READ_OK_BIT);
}

/**
 * Handles 'data' type messages (telemetry data)
 */
function handleDataMessage(msg, elements) {
    // Store in global state
    state.lastRxData = msg;

    // Update status indicators first so isTelemReadOk reflects the current packet
    if (msg.status !== undefined) {
        state.lastRxStatus = msg;
        updateStatusIndicators(msg.status);
    }

    // When KISS telem read failed, blank out ESC-sourced fields so garbage isn't shown
    const telemOk = isTelemReadOk(msg);
    const safeMsg = telemOk ? msg : {
        ...msg,
        voltage:  undefined,
        current:  undefined,
        power:    undefined,
        rpm:      undefined,
        escTemp:  undefined,
    };

    // Update telemetry displays (both Control and Analyze tabs)
    updateTelemetryUI(safeMsg, elements);
    updateAnalizeTabTelemetry(safeMsg);
}

/**
 * Updates telemetry UI elements for Control tab
 */
function updateTelemetryUI(msg, { voltageMetric, currentMetric, powerMetric, rpmMetric, thrustMetric, escTempMetric, motorTempMetric }) {
    if (msg.voltage !== undefined) {
        voltageMetric.textContent = `${msg.voltage.toFixed(2)} V`;
        updateBatteryIndicator(msg.voltage);
    } else {
        voltageMetric.textContent = 'н/д';
    }
    if (msg.current !== undefined) {
        currentMetric.textContent = `${msg.current.toFixed(2)} A`;
        updateCurrentIndicator(msg.current);
    } else {
        currentMetric.textContent = 'н/д';
    }
    if (msg.power !== undefined) {
        const power = (msg.voltage !== undefined && msg.current !== undefined)
            ? msg.voltage * msg.current
            : msg.power;
        powerMetric.textContent = `${power.toFixed(2)} W`;
    } else {
        powerMetric.textContent = 'н/д';
    }
    if (msg.rpm !== undefined) {
        rpmMetric.textContent = msg.rpm;
        updateRPMIndicator(msg.rpm);
    } else {
        rpmMetric.textContent = 'н/д';
    }
    if (msg.thrust !== undefined && msg.thrust !== null && !isNaN(msg.thrust)) {
        thrustMetric.textContent = `${msg.thrust.toFixed(2)} g`;
        updateThrustIndicator(msg.thrust);
    } else {
        thrustMetric.textContent = 'н/д';
    }
    if (msg.escTemp !== undefined) {
        escTempMetric.textContent = `${msg.escTemp.toFixed(1)} °C`;
        updateESCTempIndicator(msg.escTemp);
    } else {
        escTempMetric.textContent = 'н/д';
    }
    if (msg.motorTemp !== undefined && msg.motorTemp !== null && !isNaN(msg.motorTemp)) {
        motorTempMetric.textContent = `${msg.motorTemp.toFixed(1)} °C`;
        updateMotorTempIndicator(msg.motorTemp);
    } else {
        motorTempMetric.textContent = 'н/д';
    }
}

/**
 * Updates telemetry for Analize tab
 */
function updateAnalizeTabTelemetry(msg) {
    const aV = document.getElementById('analizeVoltage');
    const aC = document.getElementById('analizeCurrent');
    const aP = document.getElementById('analizePower');
    const aRPM = document.getElementById('analizeRpm');
    const aT = document.getElementById('analizeThrust');
    const aET = document.getElementById('analizeEscTemp');
    const aMT = document.getElementById('analizeMotorTemp');

    if (aV) {
        if (msg.voltage !== undefined) {
            aV.textContent = `${msg.voltage.toFixed(2)} V`;
            updateBatteryIndicatorAnalize(msg.voltage);
        } else { aV.textContent = 'н/д'; }
    }
    if (aC) {
        if (msg.current !== undefined) {
            aC.textContent = `${msg.current.toFixed(2)} A`;
            updateCurrentIndicatorAnalize(msg.current);
        } else { aC.textContent = 'н/д'; }
    }
    if (aP) {
        if (msg.power !== undefined) {
            const power = (msg.voltage !== undefined && msg.current !== undefined)
                ? msg.voltage * msg.current
                : msg.power;
            aP.textContent = `${power.toFixed(2)} W`;
        } else { aP.textContent = 'н/д'; }
    }
    if (aRPM) {
        if (msg.rpm !== undefined) {
            aRPM.textContent = `${msg.rpm}`;
            updateRPMIndicatorAnalize(msg.rpm);
        } else { aRPM.textContent = 'н/д'; }
    }
    if (aT) {
        if (msg.thrust !== undefined && msg.thrust !== null && !isNaN(msg.thrust)) {
            aT.textContent = `${msg.thrust.toFixed(2)} g`;
            updateThrustIndicatorAnalize(msg.thrust);
        } else { aT.textContent = 'н/д'; }
    }
    if (aET) {
        if (msg.escTemp !== undefined) {
            aET.textContent = `${msg.escTemp.toFixed(1)} °C`;
            updateESCTempIndicatorAnalize(msg.escTemp);
        } else { aET.textContent = 'н/д'; }
    }
    if (aMT) {
        if (msg.motorTemp !== undefined && msg.motorTemp !== null && !isNaN(msg.motorTemp)) {
            aMT.textContent = `${msg.motorTemp.toFixed(1)} °C`;
            updateMotorTempIndicatorAnalize(msg.motorTemp);
        } else { aMT.textContent = 'н/д'; }
    }
}

/**
 * Handles 'status' type messages
 */
function handleStatusMessage(msg) {
    console.log('Status message received:', msg);
    let statusBits = constructStatusBits(msg);
    
    state.lastRxStatus = { ...msg, status: statusBits };
    updateStatusIndicators(statusBits);
    
    // Forward warnings to Analize status
    forwardWarningsToAnalize(statusBits);
}

/**
 * Constructs status bitmask from message
 */
function constructStatusBits(msg) {
    let statusBits = msg.status;
    
    if (typeof statusBits !== 'number') {
        statusBits = 0;
        const bitMapping = {
            usrCfgProfOk: 1 << 0,
            dshotOk: 1 << 1,
            kissTelemOk: 1 << 2,
            hx711Ok: 1 << 3,
            ntcSensorOk: 1 << 4,
            dshotTaskRunning: 1 << 5,
            kissTelemTaskRunning: 1 << 6,
            sensorTaskRunning: 1 << 7,
            armed: 1 << 8,
            spinning: 1 << 9,
            dshotSendOk: 1 << 10,
            kissTelemReadOk: 1 << 11,
            hx711TareOk: 1 << 12,
            hx711ReadOk: 1 << 13,
            ntcSensorReadOk: 1 << 14,
            warnBatteryLow: 1 << 15,
            warnEscOverheat: 1 << 16,
            warnMotorOverheat: 1 << 17,
            warnOverCurrent: 1 << 18,
            warnOverRpm: 1 << 19,
            warnMotorStall: 1 << 20,
            warnFullUsrCfgPrfls: 1 << 21
        };
        
        const statusObj = typeof msg.status === 'object' && msg.status !== null ? msg.status : msg;
        for (const [key, bit] of Object.entries(bitMapping)) {
            if (statusObj[key]) statusBits |= bit;
        }
    }
    
    return statusBits;
}

/**
 * Forwards warnings to Analize tab
 */
function forwardWarningsToAnalize(statusBits) {
    if (typeof window.updateAnalizeStatusUI !== 'function') return;
    
    const STATUS_BITS = {
        WARN_BATTERY_LOW: 1 << 15,
        WARN_ESC_OVERHEAT: 1 << 16,
        WARN_MOTOR_OVERHEAT: 1 << 17,
        WARN_OVER_CURRENT: 1 << 18,
        WARN_OVER_RPM: 1 << 19,
        WARN_MOTOR_STALL: 1 << 20,
        WARN_FULL_USR_CFG_PRFLS: 1 << 21
    };
    
    const warnings = [];
    if (statusBits & STATUS_BITS.WARN_BATTERY_LOW) warnings.push('Низкий заряд АКБ');
    if (statusBits & STATUS_BITS.WARN_ESC_OVERHEAT) warnings.push('Перегрев ESC');
    if (statusBits & STATUS_BITS.WARN_MOTOR_OVERHEAT) warnings.push('Перегрев мотора');
    if (statusBits & STATUS_BITS.WARN_OVER_CURRENT) warnings.push('Превышение тока');
    if (statusBits & STATUS_BITS.WARN_OVER_RPM) warnings.push('Превышение оборотов');
    if (statusBits & STATUS_BITS.WARN_MOTOR_STALL) warnings.push('Заторможенный мотор');
    if (statusBits & STATUS_BITS.WARN_FULL_USR_CFG_PRFLS) warnings.push('Профили заполнены');
    
    if (warnings.length) {
        window.updateAnalizeStatusUI({ warn: warnings.join(', ') });
    }
}

/**
 * Handles 'profiles' type messages
 */
function handleProfilesMessage(msg) {
    state.lastRxProfiles = msg;
    
    if (msg.profiles && Array.isArray(msg.profiles)) {
        state.profiles = msg.profiles;
        
        if (typeof window.updateProfileList === 'function') {
            window.updateProfileList();
        }
    }
}

/**
 * Handles individual 'profile' messages
 */
function handleProfileMessage(msg) {
    if (typeof window.handleProfileMessage === 'function') {
        window.handleProfileMessage(msg);
    }
}

/**
 * Handles 'cur_profile' messages
 */
function handleCurrentProfileMessage(msg) {
    console.log('Received cur_profile message:', msg);
    if (msg.name !== undefined && typeof window.handleCurrentProfileMessage === 'function') {
        window.handleCurrentProfileMessage(msg.name);
        console.log('Profile set to:', msg.name);
    }
}

/**
 * Handles 'version' type messages
 */
function handleVersionMessage(msg, firmwareElement) {
    if (msg.firmware !== undefined && firmwareElement) {
        firmwareElement.textContent = `${msg.firmware}v`;
        appendLog(`Версия прошивки: ${msg.firmware}`);
    }
}

/**
 * Handles acknowledgment messages
 */
function handleAckMessage(msg) {
    appendLog(`Получено подтверждение для команды: ${msg.command || 'неизвестно'}`);
    
    if (msg.command === 'set_dev_id') {
        setStatus('ID устройства успешно обновлён. Отключитесь и переподключитесь, чтобы увидеть новое имя устройства.', true);
        appendLog('ID устройства изменён — рекомендуется переподключение для обновления отображения.');
    }
}

/**
 * Handles device info messages
 */
function handleDeviceInfoMessage(msg, { firmwareVersion, batteryLevel, temperature }) {
    if (msg.payload) {
        if (firmwareVersion) {
            firmwareVersion.textContent = msg.payload.firmware ? `v${msg.payload.firmware}` : 'v0.0.1';
        }
        if (batteryLevel) {
            batteryLevel.textContent = msg.payload.battery || '--';
        }
        if (temperature) {
            temperature.textContent = msg.payload.temperature || '--';
        }
        if (msg.payload.rssi !== undefined) {
            updateRSSIDisplay(msg.payload.rssi);
        }
    }
}

/**
 * Handles legacy data messages with payload structure
 */
function handleLegacyDataMessage(payload, { voltageMetric, currentMetric, rpmMetric, escTempMetric, motorTempMetric }) {
    if (payload.voltage !== undefined && voltageMetric) {
        voltageMetric.textContent = `${payload.voltage.toFixed(2)} V`;
    }
    if (payload.current !== undefined && currentMetric) {
        currentMetric.textContent = `${payload.current.toFixed(2)} A`;
    }
    if (payload.rpm !== undefined && rpmMetric) {
        rpmMetric.textContent = payload.rpm;
    }
    if (payload.escTemp !== undefined && escTempMetric) {
        escTempMetric.textContent = `${payload.escTemp.toFixed(1)} °C`;
    }
    if (payload.motorTemp !== undefined && motorTempMetric) {
        motorTempMetric.textContent = `${payload.motorTemp.toFixed(1)} °C`;
    }
}

/**
 * Checks if there's an active profile set
 */
function checkActiveProfile() {
    if (typeof window.getCurrentActiveProfileName === 'function') {
        const profileName = window.getCurrentActiveProfileName();
        return profileName !== null && profileName !== '';
    }
    return false;
}
