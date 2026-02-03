const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

const SYMBOL = 'SOLUSDT';
const NTFY_TOPIC = 'sol_alert_macd_2026'; // Inscreva-se neste tópico no app ntfy

const EMAS_SHORT = 12;
const EMAS_LONG = 26;

async function run() {
    // Abre o banco de dados persistido pelo GitHub Actions
    const db = new sqlite3.Database('crypto_history.db');
    
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS candles (
            time INTEGER PRIMARY KEY, 
            close REAL, 
            high REAL, 
            low REAL
        )`);
    });

    try {
        // 1. URL Corrigida para API da Binance
        const url = `https://api.binance.com{SYMBOL}&interval=1h&limit=100`;
        const response = await axios.get(url);
        
        const candles = response.data.map(d => ({
            time: d[0], 
            close: parseFloat(d[4]), 
            high: parseFloat(d[2]), 
            low: parseFloat(d[3])
        }));

        // 2. Salvar no SQLite
        const stmt = db.prepare("INSERT OR REPLACE INTO candles VALUES (?, ?, ?, ?)");
        candles.forEach(c => stmt.run(c.time, c.close, c.high, c.low));
        stmt.finalize();

        // 3. Cálculos Sniper
        const closes = candles.map(c => c.close);
        const lastPrice = closes[closes.length - 1];
        const support24h = Math.min(...candles.slice(-24).map(c => c.low));

        const shortEMA = closes.slice(-EMAS_SHORT).reduce((a,b) => a+b) / EMAS_SHORT;
        const longEMA = closes.slice(-EMAS_LONG).reduce((a,b) => a+b) / EMAS_LONG;
        const trend = shortEMA > longEMA ? "ALTA 🟢" : "BAIXA 🔴";

        const distSup = ((lastPrice - support24h) / support24h * 100);

        // 4. Envio de Alerta via [ntfy.sh](https://ntfy.sh)
        if (distSup < 1.0) {
            const message = `🎯 SOL Sniper: $${lastPrice.toFixed(2)} | Suporte: $${support24h.toFixed(2)} | Tendência: ${trend}`;
            await axios.post(`https://ntfy.sh{NTFY_TOPIC}`, message, {
                headers: { 
                    'Title': 'Alerta Sniper SOL',
                    'Priority': 'high',
                    'Tags': 'chart_with_upwards_trend,moneybag'
                }
            });
            console.log("🚀 Alerta enviado para o celular!");
        }

        console.log(`[${new Date().toLocaleTimeString()}] SOL: $${lastPrice} | Suporte: $${support24h} | Dist: ${distSup.toFixed(2)}%`);

    } catch (error) {
        console.error("❌ Erro na execução:", error.message);
    } finally {
        db.close();
    }
}

run();
