// logUtils.js
// Logging utilities for the UAVMLab web app
import { MAX_LOG_LINES } from '../config/constants.js';
import { state } from '../state.js';

// Log buffer and filter state
export const logBuffer = [{ timestamp: new Date(), type: 'info', message: 'Готово.' }];
export const logFilters = {
    info: true,
    warning: true,
    error: true,
    rx: false,
    tx: false
};

/**
 * Determines the log type from message content.
 * @param {string} message
 * @returns {string} Log type
 */
export function detectLogType(message) {
    const lowerMsg = message.toLowerCase();
    if (message.startsWith('RX:') || message.startsWith('←')) return 'rx';
    if (message.startsWith('TX:') || message.startsWith('→')) return 'tx';
    if (lowerMsg.includes('error') || lowerMsg.includes('failed') || lowerMsg.includes('disconnect') ||
        lowerMsg.includes('ошибка') || lowerMsg.includes('не удалось') || lowerMsg.includes('сбой') || lowerMsg.includes('отключ')) return 'error';
    if (lowerMsg.includes('warning') || lowerMsg.includes('warn') || lowerMsg.includes('предупреждение')) return 'warning';
    return 'info';
}

/**
 * Appends a log message to the buffer and updates the display.
 * @param {string} message
 * @param {string|null} type
 */
export function appendLog(message, type = null) {
    const timestamp = new Date();
    const logType = type || detectLogType(message);
    logBuffer.push({ timestamp, type: logType, message });
    while (logBuffer.length > MAX_LOG_LINES) {
        logBuffer.shift();
    }
    updateLogDisplay();
}

/**
 * Updates the log display in the UI.
 */
export function updateLogDisplay() {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) return;
    const filteredLogs = logBuffer.filter(log => logFilters[log.type]);
    const logHTML = filteredLogs.map(log => {
        const timeStr = log.timestamp.toLocaleTimeString();
        const colorClass = `log-${log.type}`;
        return `<span class="${colorClass}">[${timeStr}] ${log.message}</span>`;
    }).join('\n');
    logOutput.innerHTML = logHTML || 'Нет записей для отображения.';
    logOutput.scrollTop = logOutput.scrollHeight;
}
