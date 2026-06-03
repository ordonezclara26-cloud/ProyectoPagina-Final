// CARGA DE VARIABLES DE ENTORNO
// Utiliza el módulo 'dotenv' para leer el archivo .env.
// Evita exponer contraseñas y URLs en el código fuente.
require('dotenv').config();

// IMPORTACIÓN DEL DRIVER DE BASE DE DATOS
// Usamos 'mysql2', que es la versión moderna y más rápida del driver de MySQL para Node.js.
const mysql = require('mysql2');

//CONFIGURACIÓN DE CONEXIÓN DINÁMICA
//Aquí reside la escalabilidad del proyecto. No usamos valores (fijos).
//'process.env.MYSQL_PUBLIC_URL' toma la cadena de conexión completa de Railway.
//Esto permite que el proyecto funcione igual en una PC que en el servidor real.

const db = mysql.createConnection(process.env.MYSQL_PUBLIC_URL);

//EJECUCIÓN Y VERIFICACIÓN DE LA CONEXIÓN
//El método .connect() intenta abrir el túnel de comunicación con el servidor remoto.
db.connect(err => {
    if (err) {
        // En caso de fallo (ej: falta de internet o credenciales inválidas)
        console.error(" Error de conexión:", err);
    } else {
        // Confirmación de éxito
        console.log(" Conectado a Railway MySQL");
    }
});

 //EXPORTACIÓN DEL MÓDULO
 //Exportamos el objeto 'db' para que el resto de archivos (rutas, controladores)
 //puedan realizar consultas (SELECT, INSERT, UPDATE) usando una sola conexión centralizada.

module.exports = db;