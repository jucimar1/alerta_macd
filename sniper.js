const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const fs = require('fs'); // Módulo para manipular arquivos (para criar o HTML)

// --- CONFIGURAÇÕES ---
const SYMBOL = 'SOLUSDT';
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'seu_topico_padrao'; // Usará SECRETS no GitHub
const RSI_PERIOD = 14;
const TOLERANCIA = 1.2;
const VOLUME_THRESHOLD = 1.5; // Alerta se o volume for 50% maior que a média

const db = new sqlite3.Database('crypto_history.db');

// --- FUNÇÕES AUXILIARES ---
function calculateRSI(candles, period = 14) {
    if (candles.length <= period + 1) return 50; // +1 para garantir vela anterior
    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
        let diff = candles[i].close - candles[i - 1].close;
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) return 100; // Evita divisão por zero se não houver perdas
    let rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

async function sendAlert(title, message, tags) {
    try {
        await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            body: message,
            headers: { 'Title': title, 'Priority': 'high', 'Tags': tags }
        });
        console.log(`🚀 Notificação: ${title}`);
    } catch (e) {
        console.error("Erro ao enviar ntfy:", e.message);
    }
}

// --- FUNÇÃO PRINCIPAL: SNIPER COM GERAÇÃO DE DASHBOARD ---
async function run() {
    let dashboardHtml = ""; // Variável para armazenar o HTML gerado

    try {
        console.log(`\n--- Sniper SOL Pro: ${new Date().toLocaleTimeString()} ---`);
        
        // 1. Fetch Binance Data
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=1h&limit=100`);
        if (!response.ok) throw new Error(`Binance API Error: ${response.statusText}`);
        const data = await response.json();
        
        const candles = data.map(d => ({
            time: d[0], 
            close: parseFloat(d[4]), 
            high: parseFloat(d[2]), 
            low: parseFloat(d[3]),
            volume: parseFloat(d[5])
        }));

        const lastCandle = candles[candles.length - 1];
        const lastPrice = lastCandle.close;
        const candlesLast24 = candles.slice(-24);

        // 2. Cálculos de Indicadores
        const support24h = Math.min(...candlesLast24.map(c => c.low));
        const resistance24h = Math.max(...candlesLast24.map(c => c.high));
        const avgVolume24h = candlesLast24.reduce((acc, c) => acc + c.volume, 0) / 24;
        const volumeRatio = lastCandle.volume / avgVolume24h;
        const rsiValue = calculateRSI(candles, RSI_PERIOD);

        const distSup = ((lastPrice - support24h) / support24h * 100);
        const distRes = ((resistance24h - lastPrice) / resistance24h * 100);

        // 3. Log no Console
        console.log(`💵 Preço: $${lastPrice.toFixed(2)} | RSI: ${rsiValue.toFixed(2)} | Vol Ratio: ${volumeRatio.toFixed(2)}x`);
        console.log(`🛡️ Sup: $${support24h.toFixed(2)} (${distSup.toFixed(2)}%) | 🚩 Res: $${resistance24h.toFixed(2)} (${distRes.toFixed(2)}%)`);

        // 4. Lógica de Alerta e Notificação Ntfy
        let alertMessage = "";
        let ntfyTags = "";
        let ntfyTitle = "";

        if (distSup <= TOLERANCIA || rsiValue < 30) {
            ntfyTitle = "🟢 COMPRA (LONG) SOL";
            alertMessage = `Preço: $${lastPrice.toFixed(2)}. Suporte ($${support24h.toFixed(2)}) ou RSI baixo (${rsiValue.toFixed(1)}). Vol: ${volumeRatio.toFixed(1)}x`;
            ntfyTags = (rsiValue < 30 && distSup < 1) ? "gem,chart_with_upwards_trend" : "chart_with_upwards_trend";
            if (volumeRatio >= VOLUME_THRESHOLD) ntfyTags += ",rocket"; // Adiciona foguete se volume alto
            await sendAlert(ntfyTitle, alertMessage, ntfyTags);
        } else if (distRes <= TOLERANCIA || rsiValue > 70) {
            ntfyTitle = "🔴 VENDA (SHORT) SOL";
            alertMessage = `Preço: $${lastPrice.toFixed(2)}. Resistência ($${resistance24h.toFixed(2)}) ou RSI alto (${rsiValue.toFixed(1)}). Vol: ${volumeRatio.toFixed(1)}x`;
            ntfyTags = (rsiValue > 70 && distRes < 1) ? "collision,chart_with_downwards_trend" : "chart_with_downwards_trend";
            if (volumeRatio >= VOLUME_THRESHOLD) ntfyTags += ",sos"; // Adiciona SOS se volume alto
            await sendAlert(ntfyTitle, alertMessage, ntfyTags);
        }

        // --- GERAÇÃO DO DASHBOARD HTML ---
        // Detalhes para o dashboard
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); // Horário de Brasília
        const rsiStatus = rsiValue < 30 ? 'Sobrevendido (COMPRA)' : (rsiValue > 70 ? 'Sobrecomprado (VENDA)' : 'Neutro');
        const rsiColor = rsiValue < 30 ? 'green' : (rsiValue > 70 ? 'red' : 'white');
        const volStatus = volumeRatio >= VOLUME_THRESHOLD ? 'Alto' : 'Normal';
        const volColor = volumeRatio >= VOLUME_THRESHOLD ? 'orange' : 'white';
        const distSupColor = distSup <= TOLERANCIA ? 'green' : 'white';
        const distResColor = distRes <= TOLERANCIA ? 'red' : 'white';

        dashboardHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SOL Sniper Dashboard</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #0d1117; /* Fundo escuro */
            color: #c9d1d9; /* Texto claro */
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            background-color: #161b22;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            padding: 30px;
            width: 90%;
            max-width: 600px;
            text-align: center;
            margin-bottom: 20px;
            border: 1px solid #30363d;
        }
        h1 {
            color: #58a6ff; /* Azul GitHub */
            margin-bottom: 25px;
            font-size: 2.5em;
        }
        .price-display {
            font-size: 3.5em;
            font-weight: bold;
            color: #28a745; /* Verde para preço */
            margin-bottom: 20px;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px dashed #30363d;
            font-size: 1.1em;
        }
        .metric:last-child {
            border-bottom: none;
        }
        .metric-label {
            font-weight: bold;
            color: #8b949e;
        }
        .metric-value {
            color: white;
        }
        .status-badge {
            padding: 5px 10px;
            border-radius: 6px;
            font-weight: bold;
            margin-left: 10px;
        }
        .status-badge.green { background-color: #28a745; color: white; }
        .status-badge.red { background-color: #dc3545; color: white; }
        .status-badge.orange { background-color: #ffc107; color: #333; }
        .status-badge.blue { background-color: #58a6ff; color: white; }
        .status-badge.white { background-color: #6c757d; color: white; }

        .last-update {
            font-size: 0.9em;
            color: #8b949e;
            margin-top: 20px;
        }
        .alert-message {
            margin-top: 25px;
            padding: 15px;
            border-radius: 8px;
            font-weight: bold;
            font-size: 1.2em;
        }
        .alert-message.buy {
            background-color: #213c25;
            color: #28a745;
            border: 1px solid #28a745;
        }
        .alert-message.sell {
            background-color: #40232c;
            color: #dc3545;
            border: 1px solid #dc3545;
        }
        .alert-message.none {
            background-color: #1e2228;
            color: #8b949e;
            border: 1px solid #30363d;
        }
        .icon {
            margin-right: 8px;
        }
        .green-text { color: #28a745; }
        .red-text { color: #dc3545; }
        .orange-text { color: #ffc107; }
        .white-text { color: #c9d1d9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>SOL Sniper Dashboard <span class="icon">🎯</span></h1>
        
        <div class="price-display">
            $${lastPrice.toFixed(2)} <span style="font-size: 0.6em; color: #8b949e;">USDT</span>
        </div>

        <div class="alert-message ${ntfyTitle.includes('COMPRA') ? 'buy' : (ntfyTitle.includes('VENDA') ? 'sell' : 'none')}">
            ${alertMessage || 'Nenhum alerta ativo no momento.'}
        </div>

        <div class="metric">
            <span class="metric-label">RSI (${RSI_PERIOD}h):</span>
            <span class="metric-value" style="color: ${rsiColor};">${rsiValue.toFixed(2)}</span>
            <span class="status-badge ${rsiColor}">${rsiStatus}</span>
        </div>
        
        <div class="metric">
            <span class="metric-label">Suporte 24h:</span>
            <span class="metric-value" style="color: ${distSupColor};">$${support24h.toFixed(2)}</span>
            <span class="status-badge ${distSupColor}">${distSup.toFixed(2)}% de dist.</span>
        </div>

        <div class="metric">
            <span class="metric-label">Resistência 24h:</span>
            <span class="metric-value" style="color: ${distResColor};">$${resistance24h.toFixed(2)}</span>
            <span class="status-badge ${distResColor}">${distRes.toFixed(2)}% de dist.</span>
        </div>
        
        <div class="metric">
            <span class="metric-label">Volume Atual:</span>
            <span class="metric-value" style="color: ${volColor};">${lastCandle.volume.toFixed(2)}</span>
            <span class="status-badge ${volColor}">${volumeRatio.toFixed(1)}x (Comparado à média 24h)</span>
        </div>

        <p class="last-update">Última atualização: ${timestamp}</p>
    </div>
</body>
</html>
        `;
        
        fs.writeFileSync('index.html', dashboardHtml);
        console.log("✅ Dashboard HTML gerado: index.html");

    } catch (err) {
        console.error("❌ Erro no Sniper:", err.message);
        // Em caso de erro, ainda tenta gerar um HTML de erro para o dashboard
        const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>SOL Sniper Error</title>
    <style>body { background: #0d1117; color: #dc3545; font-family: sans-serif; text-align: center; padding: 50px; }</style>
</head>
<body>
    <h1>❌ Erro no Sniper Dashboard</h1>
    <p>Não foi possível buscar os dados da Binance. Tente novamente mais tarde.</p>
    <p>Detalhes do erro: ${err.message}</p>
    <p>Última atualização (erro): ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
</body>
</html>`;
        fs.writeFileSync('index.html', errorHtml);
    } finally {
        db.close();
    }
}

// Inicia o processo
run();
