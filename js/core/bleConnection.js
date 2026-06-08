// Core BLE connection management
import { NUS_SERVICE_UUID, NUS_RX_CHARACTERISTIC_UUID, NUS_TX_CHARACTERISTIC_UUID, APP_DISCOVERY_SERVICE_UUID, APP_INFO_CHARACTERISTIC_UUID, decoder } from '../config/constants.js';
import { state, setBleDevice, setGattServer, setCommandCharacteristic, setTelemetryCharacteristic, getBleDevice } from '../state.js';
import { setStatus } from '../utils/statusUtil.js';
import { appendLog } from '../utils/logUtils.js';
import { vibrate, vibratePattern } from '../utils/haptics.js';
import { sendCommand, clearCommandQueue } from '../utils/bluetooth.js';
import { handleTelemetry } from './telemetryHandler.js';
import { startRSSIMonitoring, stopRSSIMonitoring } from './rssiMonitor.js';

/**
 * Connects to a BLE device via Web Bluetooth API
 * @param {Function} onConnectedCallback - Callback after successful connection
 * @param {Function} onDisconnectedCallback - Callback on disconnection
 */
export async function connectDevice(onConnectedCallback = null, onDisconnectedCallback = null) {
    vibrate(40);
    
    // Wait for components to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const scanAllDevicesCheckbox = document.getElementById('scanAllDevices');
    
    try {
        setStatus('Запрос Bluetooth-устройства...');
        appendLog('Запуск сканирования устройств...');

        const bleOptions = (scanAllDevicesCheckbox && scanAllDevicesCheckbox.checked)
            ? { acceptAllDevices: true, optionalServices: [NUS_SERVICE_UUID, APP_DISCOVERY_SERVICE_UUID] }
            : { filters: [{ services: [NUS_SERVICE_UUID] }], optionalServices: [APP_DISCOVERY_SERVICE_UUID] };

        const device = await navigator.bluetooth.requestDevice(bleOptions);
        setBleDevice(device);

        setStatus(`Подключение к ${device.name}...`);
        appendLog(`Выбрано устройство: ${device.name || 'Неизвестно'}`);

        device.addEventListener('gattserverdisconnected', () => {
            if (onDisconnectedCallback) onDisconnectedCallback();
        });

        const server = await device.gatt.connect();
        setGattServer(server);
        setStatus(`Подключено к ${device.name}. Обнаружение сервисов...`, true);
        appendLog('GATT-сервер подключён. Обнаружение сервисов...');

        const nusService = await server.getPrimaryService(NUS_SERVICE_UUID);
        appendLog('Сервис NUS найден.');

        const rxChar = await nusService.getCharacteristic(NUS_RX_CHARACTERISTIC_UUID);
        setCommandCharacteristic(rxChar);
        appendLog('Характеристика RX готова (запись на устройство).');

        const txChar = await nusService.getCharacteristic(NUS_TX_CHARACTERISTIC_UUID);
        setTelemetryCharacteristic(txChar);
        await txChar.startNotifications();
        txChar.addEventListener('characteristicvaluechanged', handleTelemetry);
        appendLog('Уведомления характеристики TX запущены (приём с устройства).');

        try {
            const appService = await server.getPrimaryService(APP_DISCOVERY_SERVICE_UUID);
            const infoChar = await appService.getCharacteristic(APP_INFO_CHARACTERISTIC_UUID);
            const infoValue = await infoChar.readValue();
            const appInfo = decoder.decode(infoValue);
            appendLog(`Информация о приложении: ${appInfo}`);
        } catch (err) {
            appendLog('Сервис App Discovery недоступен или не удалось прочитать.');
        }

        state.connectedDeviceId = device.id;
        
        setStatus(`Подключено к ${device.name}`, true);
        vibratePattern([50, 50, 100]);
        appendLog('Соединение успешно установлено!');
        
        // Request firmware version
        setTimeout(async () => {
            try {
                await sendCommand('get_version');
                appendLog('Запрошена версия прошивки с устройства.');
            } catch (err) {
                appendLog(`Не удалось запросить версию: ${err.message}`);
            }
        }, 1000);
        
        // Start RSSI monitoring
        startRSSIMonitoring(device);
        
        if (onConnectedCallback) onConnectedCallback(device);
        
        return device;
    } catch (error) {
        setStatus(`Ошибка подключения: ${error.message}`);
        vibratePattern([200]);
        appendLog(`Ошибка: ${error.message}`);
        console.error(error);
        throw error;
    }
}

/**
 * Disconnects from the currently connected BLE device
 * @param {Function} onDisconnectedCallback - Callback after disconnection
 */
export async function disconnectDevice(onDisconnectedCallback = null) {
    vibrate(20);
    const device = getBleDevice();
    
    if (!device) {
        appendLog('Нет устройства для отключения.');
        return;
    }
    
    if (device.gatt && device.gatt.connected) {
        try {
            device.gatt.disconnect();
            vibrate(80);
            appendLog('Отключение запрошено пользователем.');
            
            setTimeout(() => {
                if (device && !device.gatt.connected) {
                    if (onDisconnectedCallback) onDisconnectedCallback();
                }
            }, 500);
        } catch (error) {
            appendLog(`Ошибка отключения: ${error.message}`);
            console.error('Disconnect error:', error);
            if (onDisconnectedCallback) onDisconnectedCallback();
        }
    } else {
        appendLog('Устройство не подключено.');
        if (onDisconnectedCallback) onDisconnectedCallback();
    }
}

/**
 * Handles cleanup when device disconnects
 */
export function handleDisconnection() {
    stopRSSIMonitoring();
    setStatus('Устройство отключено.');
    
    state.connectedDeviceId = null;
    clearCommandQueue();
    appendLog('Устройство отключено.');
    
    setBleDevice(null);
    setGattServer(null);
    setCommandCharacteristic(null);
    setTelemetryCharacteristic(null);
}

/**
 * Remembers a discovered device
 * @param {BluetoothDevice} device 
 */
export function rememberDevice(device) {
    if (!device) return;
    const exists = state.discoveredDevices.some((entry) => entry.id === device.id);
    if (!exists) {
        state.discoveredDevices.push({ id: device.id, name: device.name || 'Неизвестное устройство' });
    }
}

/**
 * Sets the device ID on the connected device
 * @param {number} deviceId - Device ID (0-255)
 */
export async function setDeviceId(deviceId) {
    if (isNaN(deviceId) || deviceId < 0 || deviceId > 255) {
        setStatus('Недопустимый ID устройства. Должен быть от 0 до 255.', false);
        vibrate(50);
        throw new Error('Недопустимый ID устройства');
    }
    
    const idVal = { value: deviceId };
    
    await sendCommand('set_dev_id', idVal);
    setStatus(`Установка ID устройства: ${deviceId}... Для отображения нового имени потребуется переподключение.`, true);
    appendLog(`Отправка команды set_dev_id: ${deviceId}. Для обновления имени требуется переподключение.`);
    vibrate(20);
}
