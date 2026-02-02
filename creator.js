const fs = require('fs');
const { execSync } = require('child_process');
if (!fs.existsSync('package.json')) {
    const pkg = { dependencies: { "sqlite3": "^5.1.7", "node-fetch": "^2.7.0" } };
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
}
execSync('npm install', { stdio: 'inherit' });
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('crypto_history.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS candles (time INTEGER PRIMARY KEY, close REAL, high REAL, low REAL, timeframe TEXT)`);
});
db.close();
