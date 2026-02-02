// monitor.js
const symbol = 'SOLUSDT';
const interval = '1h';
const NTFY_TOPIC = 'sol_alert_99x_2026'; // Certifique-se que é o mesmo do seu app ntfy

async function runMonitor() {
    try {
        // 1. Busca 150 velas para ter margem de cálculo
        const res = await fetch(`https://api.binance.com{symbol}&interval=${interval}&limit=150`);
        const klines = await res.json();
        
        const closes = klines.map(k => parseFloat(k[4]));
        const highs = klines.map(k => parseFloat(k[2]));
        const lows = klines.map(k => parseFloat(k[3]));
        const currentPrice = closes[closes.length - 1];

        // --- CÁLCULO MACD ---
        const ema = (data, period) => {
            const k = 2 / (period + 1);
            let emaArr = [data[0]];
            for (let i = 1; i < data.length; i++) {
                emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
            }
            return emaArr;
        };

        const ema12 = ema(closes, 12);
        const ema26 = ema(closes, 26);
        const macdLine = ema12.map((v, i) => v - ema26[i]);
        const signalLine = ema(macdLine, 9);

        const lastIdx = macdLine.length - 1;
        const prevIdx = lastIdx - 1;

        // --- CÁLCULO SUPORTE / RESISTÊNCIA (24h) ---
        // Pegamos os últimos 24 candles de 1h
        const recentHighs = highs.slice(-24);
        const recentLows = lows.slice(-24);
        const resistance = Math.max(...recentHighs);
        const support = Math.min(...recentLows);

        let messages = [];

        // Lógica de Cruzamento MACD
        if (macdLine[prevIdx] <= signalLine[prevIdx] && macdLine[lastIdx] > signalLine[lastIdx]) {
            messages.push("🚀 MACD: Cruzamento de Alta detectado!");
        }

        // Lógica de Suporte e Resistência
        if (currentPrice >= resistance) {
            messages.push(`📈 PREÇO: Rompendo Resistência ($${resistance.toFixed(2)})`);
        } else if (currentPrice <= support) {
            messages.push(`📉 PREÇO: Tocando/Rompendo Suporte ($${support.toFixed(2)})`);
        }

        // Enviar Alerta se houver alguma condição atendida
        if (messages.length > 0) {
            const finalMessage = `SOL/USDT: $${currentPrice.toFixed(2)}\n${messages.join('\n')}`;
            console.log("Enviando alerta:", finalMessage);
            
            await fetch(`https://ntfy.sh{NTFY_TOPIC}`, {
                method: 'POST',
                body: finalMessage,
                headers: { 'Title': 'Alerta Crypto SOL' }
            });
        } else {
            console.log(`Monitorando... Preço: ${currentPrice} | Sem sinais claros agora.`);
        }

    } catch (error) {
        console.error("Erro ao processar dados:", error);
    }
}

runMonitor();
