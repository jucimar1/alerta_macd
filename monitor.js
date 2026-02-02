const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('crypto_history.db');

const SYMBOL = 'SOLUSDT';
const NTFY_TOPIC = 'sol_alert_macd_2026'; // Certifique-se de que é o mesmo no app ntfy

// Promisify para SQLite
const query = (sql, params = []) => new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => err ? rej(err) : res(rows));
});

const runQuery = (sql, params = []) => new Promise((res, rej) => {
    db.run(sql, params, (err) => err ? rej(err) : res());
});

// Funções Matemáticas Robustas
const math = {
    ema: (data, period) => {
        const k = 2 / (period + 1);
        return data.reduce((acc, val, i) => i === 0 ? val : val * k + acc * (1 - k), data[0]);
    },
    stdDev: (data) => {
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        return Math.sqrt(data.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / data.length);
    }
};

async function initDB() {
    await runQuery(`CREATE TABLE IF NOT EXISTS candles (
        time INTEGER, close REAL, high REAL, low REAL, timeframe TEXT, PRIMARY KEY (time, timeframe)
    )`);
}

async function getBinanceData(interval, limit) {
    const res = await fetch(`https://api.binance.com{SYMBOL}&interval=${interval}&limit=${limit}`);
    const data = await res.json();
    return data.map(d => ({
        time: parseInt(d[0]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
    }));
}

async function start() {
    try {
        await initDB();

        // 1. Coleta e Salva dados de 1h
        const data1h = await getBinanceData('1h', 100);
        for (const k of data1h) {
            await runQuery("INSERT OR REPLACE INTO candles VALUES (?, ?, ?, ?, ?)", [k.time, k.close, k.high, k.low, '1h']);
        }

        // 2. Recupera do Banco para cálculos de Contexto (1h)
        const history1h = await query("SELECT * FROM candles WHERE timeframe = '1h' ORDER BY time DESC LIMIT 50");
        const closes1h = history1h.map(h => h.close).reverse();
        const highs1h = history1h.map(h => h.high);
        const lows1h = history1h.map(h => h.low);

        const currentPrice = closes1h[closes1h.length - 1];
        const support = Math.min(...lows1h.slice(-24));
        const resistance = Math.max(...highs1h.slice(-24));

        // MACD 1h
        const ema12 = math.ema(closes1h, 12);
        const ema26 = math.ema(closes1h, 26);
        const macdLine = ema12 - ema26;
        const signalLine = math.ema(closes1h.slice(-9), 9); // Aproximação do sinal
        const histogram = macdLine - signalLine;

        // 3. Verificação de Gatilho (5m)
        const data5m = await getBinanceData('5m', 20);
        const closes5m = data5m.map(d => d.close);
        const low5m = data5m[data5m.length - 1].low;
        const high5m = data5m[data5m.length - 1].high;

        const basis = closes5m.reduce((a, b) => a + b) / 20;
        const dev = math.stdDev(closes5m) * 2;
        const lowerBB = basis - dev;
        const upperBB = basis + dev;

        // 4. Lógica de Alerta Robustecida
        const distSup = (((currentPrice - support) / support) * 100).toFixed(2);
        const pertoSuporte = currentPrice <= support * 1.01; // 1% de margem
        const tocouBBInferior = low5m <= lowerBB;

        if (pertoSuporte && tocouBBInferior) {
            const finalMsg = `🎯 COMPRA SOL: $${currentPrice.toFixed(2)}
📊 Dist. Suporte (1h): ${distSup}%
📉 MACD Hist: ${histogram.toFixed(4)}
🛡️ BB 5m: Preço tocou banda inferior e suporte.`;

            await fetch(`https://ntfy.sh{NTFY_TOPIC}`, { 
                method: 'POST', 
                body: finalMsg,
                headers: { 'Title': 'ALERTA SNIPER SOL' }
            });
            console.log("Alerta enviado!");
        }

        // Limpeza: Deleta dados com mais de 7 dias
        await runQuery("DELETE FROM candles WHERE time < ?", [Date.now() - 7 * 24 * 60 * 60 * 1000]);

    } catch (err) {
        console.error("Erro:", err);
    } finally {
        db.close();
    }
}

start();
