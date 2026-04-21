const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'roundhouse.proxy.rlwy.net',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || 'TU_PASSWORD_REAL',
    database: process.env.MYSQLDATABASE || 'railway',
    port: process.env.MYSQLPORT || 38330
});

db.connect(err => {
    if (err) {
        console.error("❌ Error de conexión:", err);
    } else {
        console.log("🔥 Conectado a Railway MySQL");
    }
});

module.exports = db;