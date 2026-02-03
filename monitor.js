const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch'); // Usando a biblioteca que você definiu no creator.js

const SYMBOL = 'SOLUSDT';
const NTFY_TOPIC = 'sol_alert_macd_2026';

async function run() {
    const db = new sqlite3.Database('crypto_history.db');
    
    try {
        // Busca dados da Binance
        const response = await fetch(`https://api.binance.com{SYMBOL}&interval=1h&limit=100`);
        const data = await response.json();
        
        const candles = data.map(d => ({
            time: d[0], 
            close: parseFloat(d[4]), 
            high: parseFloat(d[2]), 
            low: parseFloat(d[3])
        }));

        // Salva no Banco de Dados
        db.serialize(() => {
            const stmt = db.prepare("INSERT OR REPLACE INTO candles (time, close, high, low, timeframe) VALUES (?, ?, ?, ?, ?)");
            candles.forEach(c => stmt.run(c.time, c.close, c.high, c.low, '1h'));
            stmt.finalize();
        });

        // Lógica Sniper
        const lastPrice = candles[candles.length - 1].close;
        const support24h = Math.min(...candles.slice(-24).map(c => c.low));
        const distSup = ((lastPrice - support24h) / support24h * 100);

        console.log(`[${new Date().toISOString()}] SOL: $${lastPrice} | Suporte: $${support24h.toFixed(2)}`);

        // Disparo de Alerta ntfy
        if (distSup < 1.0) {
            await fetch(`https://ntfy.sh{NTFY_TOPIC}`, {
                method: 'POST',
                body: `🎯 SOL Sniper: Preço $${lastPrice} encostando no suporte de 24h ($${support24h.toFixed(2)})!`,
                headers: { 'Title': 'ALERTA SOL 2026', 'Priority': 'high' }
            });
        }

    } catch (err) {
        console.error("Erro no Monitor:", err);
    } finally {
        // Aguarda um pouco antes de fechar para garantir o DB
        setTimeout(() => db.close(), 2000);
    }
}

run();
