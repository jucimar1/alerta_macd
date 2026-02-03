const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');

// CONFIGURAÇÕES VIA AMBIENTE (SECRETS)
const SYMBOL = 'SOLUSDT';
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'seu_topico_padrao';
const RSI_PERIOD = 14;
const TOLERANCIA = 1.2;

const db = new sqlite3.Database('crypto_history.db');

// Cálculo Manual de RSI
function calculateRSI(candles, period = 14) {
    if (candles.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        let diff = candles[i].close - candles[i - 1].close;
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    let rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
}

async function run() {
    try {
        console.log(`🚀 Iniciando Sniper SOL: ${new Date().toISOString()}`);
        
        // 1. Fetch Binance
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=1h&limit=100`);
        const data = await res.json();
        const candles = data.map(d => ({
            time: d[0], close: parseFloat(d[4]), high: parseFloat(d[2]), low: parseFloat(d[3]), volume: parseFloat(d[5])
        }));

        // 2. Cálculos
        const lastPrice = candles[candles.length - 1].close;
        const candles24h = candles.slice(-24);
        const support = Math.min(...candles24h.map(c => c.low));
        const resistance = Math.max(...candles24h.map(c => c.high));
        const avgVol = candles24h.reduce((a, b) => a + b.volume, 0) / 24;
        const volRatio = candles[candles.length - 1].volume / avgVol;
        const rsi = calculateRSI(candles, RSI_PERIOD);

        const distSup = ((lastPrice - support) / support * 100);
        const distRes = ((resistance - lastPrice) / resistance * 100);

        console.log(`Preço: $${lastPrice} | RSI: ${rsi.toFixed(2)} | Vol: ${volRatio.toFixed(1)}x`);

        // 3. Lógica de Alerta
        let title = "", msg = "", tags = "";

        if (distSup <= TOLERANCIA || rsi < 30) {
            title = "🟢 COMPRA (LONG) SOL";
            msg = `Preço próximo ao suporte ($${support.toFixed(2)}) ou RSI baixo (${rsi.toFixed(1)}). Vol: ${volRatio.toFixed(1)}x`;
            tags = "gem,chart_with_upwards_trend";
        } else if (distRes <= TOLERANCIA || rsi > 70) {
            title = "🔴 VENDA (SHORT) SOL";
            msg = `Preço próximo à resistência ($${resistance.toFixed(2)}) ou RSI alto (${rsi.toFixed(1)}). Vol: ${volRatio.toFixed(1)}x`;
            tags = "warning,chart_with_downwards_trend";
        }

        if (title) {
            await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
                method: 'POST',
                body: msg,
                headers: { 'Title': title, 'Priority': 'high', 'Tags': tags }
            });
            console.log("✅ Alerta enviado!");
        }

    } catch (e) {
        console.error("Erro:", e.message);
    } finally {
        db.close();
    }
}

run();
