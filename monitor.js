const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('crypto_history.db');
const SYMBOL = 'SOLUSDT';
const NTFY_TOPIC = 'sol_alert_macd_2026'; // Mude para um nome único

// Utilitário para Queries SQL
const query = (sql, params = []) => new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => err ? rej(err) : res(rows));
});

// Funções Matemáticas
const math = {
    ema: (data, period) => {
        const k = 2 / (period + 1);
        return data.reduce((acc, val, i) => i === 0 ? val : val * k + acc * (1 - k), data[0]);
    },
    stdDev: (data) => {
        const mu = data.reduce((a, b) => a + b, 0) / data.length;
        return Math.sqrt(data.map(x => Math.pow(x - mu, 2)).reduce((a, b) => a + b, 0) / data.length);
    }
};

async function run() {
    try {
        // 1. Coletar Dados Binance
        const [res1h, res5m] = await Promise.all([
            fetch(`https://api.binance.com{SYMBOL}&interval=1h&limit=100`).then(r => r.json()),
            fetch(`https://api.binance.com{SYMBOL}&interval=5m&limit=40`).then(r => r.json())
        ]);

        // 2. Salvar no SQLite para histórico
        const stmt = db.prepare("INSERT OR REPLACE INTO candles (time, close, high, low, timeframe) VALUES (?, ?, ?, ?, ?)");
        res1h.forEach(k => stmt.run(k[0], parseFloat(k[4]), parseFloat(k[2]), parseFloat(k[3]), '1h'));
        stmt.finalize();

        // 3. Analisar Contexto (1h)
        const hist1h = await query("SELECT close, high, low FROM candles WHERE timeframe = '1h' ORDER BY time DESC LIMIT 50");
        const closes1h = hist1h.map(h => h.close).reverse();
        const currentPrice = closes1h[closes1h.length - 1];

        const ema12 = math.ema(closes1h, 12);
        const ema26 = math.ema(closes1h, 26);
        const macd = ema12 - ema26;
        const signal = math.ema(closes1h.slice(-9), 9); // Aproximação do sinal
        const histogram = macd - signal;

        const support = Math.min(...hist1h.slice(0, 24).map(h => h.low));
        const resistance = Math.max(...hist1h.slice(0, 24).map(h => h.high));

        // 4. Analisar Gatilho (5m)
        const closes5m = res5m.map(k => parseFloat(k[4]));
        const slice20 = closes5m.slice(-20);
        const sma20 = slice20.reduce((a, b) => a + b) / 20;
        const sd = math.stdDev(slice20);
        const lowerBB = sma20 - (sd * 2);
        const upperBB = sma20 + (sd * 2);

        // 5. Lógica de Alerta
        let msg = "";
        const pertoSuporte = currentPrice <= support * 1.01;
        const bbTocouInferior = closes5m[closes5m.length - 1] <= lowerBB;

        if (pertoSuporte && histogram > 0 && bbTocouInferior) {
            msg = `🚀 COMPRA SOL: Suporte 1h ($${support.toFixed(2)}) + BB 5m Inferior + MACD Positivo!`;
        } else if (currentPrice >= resistance * 0.99 && bbTocouInferior === false) {
            msg = `⚠️ ALERTA: SOL atingindo Resistência de 1h ($${resistance.toFixed(2)})`;
        }

        if (msg) {
            await fetch(`https://ntfy.sh{NTFY_TOPIC}`, { 
                method: 'POST', 
                body: msg,
                headers: { 'Title': 'SOL Sniper Pro', 'Priority': 'high' }
            });
            console.log("Alerta enviado!");
        }

    } catch (e) { console.error(e); }
    finally { db.close(); }
}

run();
