// Results tab module
import { state } from '../state.js';

export function initResultsTab() {
    // Initialize charts
    drawCharts();
}

export function drawCharts() {
    drawChart('powerChart', state.lastTestResults.power, 'Мощность (Вт)', '#0b5cff');
    drawChart('thrustChart', state.lastTestResults.thrust, 'Тяга (г)', '#2ecc71');
    drawChart('thermalChart', state.lastTestResults.thermal, 'Температура (°C)', '#f39c12');
}

function drawChart(canvasId, data, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    if (!data || data.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных', width / 2, height / 2);
        return;
    }

    const padding = 30;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxVal = Math.max(...data, 1);
    const minVal = Math.min(...data, 0);
    const range = maxVal - minVal || 1;

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((value, index) => {
        const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
        const y = height - padding - ((value - minVal) / range) * chartHeight;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, padding, padding - 10);
    ctx.textAlign = 'right';
    ctx.fillText(`Макс.: ${maxVal.toFixed(1)}`, width - padding, padding - 10);
}
