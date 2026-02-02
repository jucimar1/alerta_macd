const NTFY_TOPIC = 'sol_alert_macd_2026'; // Seu tópico

async function getData(symbol, interval, limit) {
    const res = await fetch(`https://api.binance.com{symbol}&interval=${interval}&limit=${limit}`);
    return await res.json();
}

// Cálculo simples de EMA para o MACD
function calcEMA(data, period) {
    const k = 2 / (period + 1);
    let emaArr = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
    }
    return emaArr;
}

async function checkStrategy() {
    // 1. DADOS 1H (Contexto)
    const data1h = await getData('SOLUSDT', '1h', 100);
    const closes1h = data1h.map(d => parseFloat(d[4]));
    const highs1h = data1h.map(d => parseFloat(d[2]));
    const lows1h = data1h.map(d => parseFloat(d[3]));

    const ema12 = calcEMA(closes1h, 12);
    const ema26 = calcEMA(closes1h, 26);
    const macd = ema12.map((v, i) => v - ema26[i]);
    const signal = calcEMA(macd, 9);
    const hist = macd.map((v, i) => v - signal[i]);

    const resistance = Math.max(...highs1h.slice(-24));
    const support = Math.min(...lows1h.slice(-24));
    const currentPrice = closes1h[closes1h.length - 1];

    // Condições 1h: Preço perto de S/R OU Histograma invertendo
    const pertoSuporte = currentPrice <= support * 1.01; // 1% de margem
    const histInvertendo = (hist[hist.length - 2] < 0 && hist[hist.length - 1] > hist[hist.length - 2]);

    if (pertoSuporte || histInvertendo) {
        // 2. DADOS 5M (Gatilho)
        const data5m = await getData('SOLUSDT', '5m', 30);
        const closes5m = data5m.map(d => parseFloat(d[4]));
        
        // BB Simples (Média 20 + 2 Desvios)
        const lastCloses5m = closes5m.slice(-20);
        const sma20 = lastCloses5m.reduce((a, b) => a + b) / 20;
        const diff = lastCloses5m.map(x => Math.pow(x - sma20, 2));
        const stdDev = Math.sqrt(diff.reduce((a, b) => a + b) / 20);
        const upperBB = sma20 + (stdDev * 2);
        const lowerBB = sma20 - (stdDev * 2);

        // Lógica: Tocou banda inferior e começou a lateralizar (últimos 3 candles estáveis)
        const tocouInferior = Math.min(...lows1h.slice(-3)) <= lowerBB;
        const lateralizou = Math.abs(closes5m[closes5m.length - 1] - closes5m[closes5m.length - 3]) < (currentPrice * 0.001);

        if (tocouInferior && lateralizou) {
            await fetch(`https://ntfy.sh{NTFY_TOPIC}`, {
                method: 'POST',
                body: `🔥 SOL OPORTUNIDADE: Contexto 1h favorável + Gatilho BB 5m detectado!`,
                headers: { 'Title': 'Estratégia Sniper SOL' }
            });
        }
    }
}

checkStrategy();
