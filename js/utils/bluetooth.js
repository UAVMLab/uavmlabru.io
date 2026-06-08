// Bluetooth communication module
import { encoder } from '../config/constants.js';
import { getCommandCharacteristic } from '../state.js';
import { appendLog } from './logUtils.js';

// ==================================================================================================== //


// Command queue to prevent concurrent GATT operations
let commandQueue = [];
let isProcessingQueue = false;

async function processCommandQueue() {
    if (isProcessingQueue || commandQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    while (commandQueue.length > 0) {
        const { command, resolve, reject } = commandQueue.shift();
        
        try {
            const commandCharacteristic = getCommandCharacteristic();
            if (!commandCharacteristic) {
                throw new Error('Нет подключения или характеристика команд недоступна.');
            }
            
            const jsonString = JSON.stringify(command);
            appendLog(`TX: ${jsonString}`);
            const encoded = encoder.encode(jsonString);
            
            await commandCharacteristic.writeValue(encoded);
            
            // Add delay between commands to prevent GATT conflicts
            await new Promise(resolve => setTimeout(resolve, 100));
            
            resolve();
        } catch (error) {
            reject(error);
        }
    }
    
    isProcessingQueue = false;
}

export async function sendCommand(cmd, additionalData = {}) {
    return new Promise((resolve, reject) => {
        const command = {
            cmd,
            ...additionalData,
            timestamp: Date.now()
        };
        
        commandQueue.push({ command, resolve, reject });
        processCommandQueue();
    });
}

export function clearCommandQueue() {
    commandQueue = [];
    isProcessingQueue = false;
}
