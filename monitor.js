/**
 * SOL Sniper Pro - Logic Engine 2026
 * Conecta via WebSocket à Binance e gerencia indicadores em tempo real.
 */

const CONFIG = {
    symbol: 'solusdt',
    interval: '1m', // Timeframe para o Sniper (curto prazo)
    initialBalance: 10000,
    apiUrl: 'https://api.binance.com',
    wsUrl: 'wss://://stream.binance.com'
};

let state = {
    balance: CONFIG.initialBalance,
    lastPrice: 0,
    history: [],
    support: 0,
    resistance: 0,
    trades: []
};

// 1. Inicialização do Gráfico (Lightweight Charts)
const chartElement = document.getElementById('chart');
const chart = LightweightCharts.createChart(chartElement, {
    layout: { background: { color: '#0b0e11' }, textColor: '#848e9c' },
    grid: { vertLines: { color: '#1f2226' }, horzLines: { color: '#1f2226' } },
    timeScale: { timeVisible: true, secondsVisible: false }
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#0ecb81', downColor: '#f6465d', 
    borderVisible: false, wickUpColor: '#0ecb81', wickDownColor: '#f6465d'
});

// 2. Coleta de Dados Históricos (REST API)
async function fetchHistory() {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/klines?symbol=${CONFIG.symbol.toUpperCase()}&interval=${CONFIG.interval}&limit=100`);
        const data = await response.json();
        
        state.history = data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4])
        }));

        candleSeries.setData(state.history);
        updateTechnicalLevels();
    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
    }
}

// 3. Conexão Real-Time (WebSocket)
function initWebSocket() {
    const socket = new WebSocket(`${CONFIG.wsUrl}/${CONFIG.symbol}@kline_${CONFIG.interval}`);

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const k = msg.k; // Dados da Candle

        const candle = {
            time: k.t / 1000,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c)
        };

        // Atualiza gráfico e estado
        candleSeries.update(candle);
        state.lastPrice = candle.close;
        
        // Se a candle fechar, recalculamos suporte/resistência
        if (k.x) {
            state.history.push(candle);
            if (state.history.length > 100) state.history.shift();
            updateTechnicalLevels();
        }

        updateUI();
    };

    socket.onclose = () => {
        console.log("WebSocket desconectado. Tentando reconectar...");
        setTimeout(initWebSocket, 5000);
    };
}

// 4. Cálculos Matemáticos (Sniper Strategy)
function updateTechnicalLevels() {
    const last24 = state.history.slice(-24);
    state.support = Math.min(...last24.map(c => c.low));
    state.resistance = Math.max(...last24.map(c => c.high));
}

function updateUI() {
    // Atualiza Preço e Indicadores na Tela
    document.getElementById('price').innerText = `$${state.lastPrice.toFixed(2)}`;
    document.getElementById('sup').innerText = `$${state.support.toFixed(2)}`;
    document.getElementById('res').innerText = `$${state.resistance.toFixed(2)}`;

    // Cálculo da distância do suporte (%)
    const distSup = ((state.lastPrice - state.support) / state.support * 100).toFixed(2);
    const dSupElement = document.getElementById('dSup');
    dSupElement.innerText = `${distSup}%`;
    
    // Alerta visual: se menos de 0.5% do suporte, fica verde brilhante (Sniper Zone)
    dSupElement.style.color = distSup < 0.5 ? '#00ff88' : '#f0b90b';
}

// 5. Sistema de Ordens (Paper Trading)
function executeTrade(type) {
    const tradeData = {
        type: type,
        price: state.lastPrice,
        time: new Date().toLocaleTimeString(),
        id: Math.random().toString(36).substr(2, 9)
    };

    // Lógica de saldo simples para simulação
    const tradeValue = 1000; // Cada clique opera $1000
    if (type === 'BUY') {
        state.balance -= tradeValue;
    } else {
        state.balance += tradeValue;
    }

    // Registrar no Log
    state.trades.push(tradeData);
    const logBox = document.getElementById('logs');
    const color = type === 'BUY' ? '#0ecb81' : '#f6465d';
    
    logBox.innerHTML = `<div><b style="color:${color}">${type}</b> @ $${tradeData.price.toFixed(2)} [${tradeData.time}]</div>` + logBox.innerHTML;
    
    document.getElementById('balance').innerText = `U$ ${state.balance.toLocaleString('pt-BR')}`;
}

// Iniciar Aplicação
window.onload = () => {
    fetchHistory().then(initWebSocket);
};
