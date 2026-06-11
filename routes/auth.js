// IMPORTACIÓN DE DEPENDENCIAS DE SEGURIDAD
const express = require('express');
const router = express.Router();
const db = require('../config/db');
// bcrypt es una librería de funciones de hash criptográfico diseñada para proteger contraseñas.
const bcrypt = require('bcrypt');

//REGISTRO DE ADMINISTRADORES
//Esta ruta convierte contraseñas planas en 'hashes' antes de guardarlas.
router.post('/register', async (req, res) => {

const { nombre, correo, password } = req.body;

if(password.length < 10 || password.length > 13){

    return res.render('register', {
        error: 'La contraseña debe tener entre 10 y 13 caracteres'
    });

}

const hash = await bcrypt.hash(password, 10);

db.query(
"SELECT id FROM usuarios WHERE correo=?",
[correo],
async (err, data) => {

if (err) return res.send("Error");

if (data.length > 0) {

return res.render('register', {
error: "Correo ya registrado"
});

}

db.query(
"INSERT INTO usuarios (nombre, correo, password, rol_id, estado, ultimo_login) VALUES (?, ?, ?, 1, 1, NOW())",
[nombre, correo, hash],
(err) => {

if (err) return res.send("Error");

res.redirect('/admin/login');

}
);

}
);

});

//LOGUEO DE USUARIOS (SISTEMA DE SEGURIDAD)
//Aquí se validan múltiples capas antes de permitir el acceso.
router.post('/login', (req, res) => {
    const { correo, password } = req.body;

    // Buscamos al usuario por su identificador único (correo)
    db.query("SELECT * FROM usuarios WHERE correo = ?", [correo], async (err, results) => {

        if (err) {
            console.log(" Error DB:", err);
            return res.send("Error del servidor");
        }

        // CAPA 1: Validación de existencia
        if (!results || results.length === 0) {
            return res.render('login', {
                error: "Usuario no existe"
            });
        }

        const user = results[0];

        // CAPA 2: Validación de estado administrativo (Bloqueo manual)
        if (user.estado === 0) {
            return res.render('login', {
                error: "Usuario bloqueado"
            });
        }

        // CAPA 3: Lógica de Inactividad (Regla de Negocio de 20 días)
        // Calculamos la diferencia de tiempo entre hoy y el último acceso.
        if (user.ultimo_login) {
            const dias = (new Date() - new Date(user.ultimo_login)) / (1000 * 60 * 60 * 24);

            if (dias > 20) {
                return res.render('login', {
                    error: "Cuenta inactiva por más de 20 días"
                });
            }
        }

        // CAPA 4: Validación Criptográfica
        // Comparamos la contraseña enviada con el hash guardado en la base de datos.
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.render('login', {
                error: "Contraseña incorrecta"
            });
        }

        // Actualizamos la fecha de acceso y creamos la sesión
        db.query("UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?", [user.id]);

        // Guardamos los datos del usuario en la memoria del servidor (Sesión)
        req.session.usuario = user;
        res.redirect('/admin');
    });
});

//CIERRE DE SESIÓN
//Destruye la sesión del servidor para evitar que alguien más use la cuenta.
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/inicio');
    });
});
module.exports = router;