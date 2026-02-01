// monitor.js
const symbol = 'SOLUSDT';
const interval = '1h';

async function checkMACD() {
    // Busca os candles da Binance (Sem autenticação)
    const res = await fetch(`https://api.binance.com{symbol}&interval=${interval}&limit=100`);
    const klines = await res.json();
    const closes = klines.map(k => parseFloat(k[4]));

    // Função simples de EMA (Exponencial Moving Average)
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

    // Lógica de Cruzamento: MACD cruza ACIMA da linha de sinal
    if (macdLine[prevIdx] <= signalLine[prevIdx] && macdLine[lastIdx] > signalLine[lastIdx]) {
        console.log("Cruzamento detectado! Enviando alerta...");
        await fetch('https://ntfy.sh', { // USE O NOME QUE VOCÊ CRIOU
            method: 'POST',
            body: `SOL/USDT Cruzamento de Alta MACD (1h) detectado!`
        });
    } else {
        console.log("Sem cruzamento no momento.");
    }
}

checkMACD();
