const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');

// REGISTER (admin)
router.post('/register', async (req, res) => {
    const { nombre, correo, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    db.query(
        "INSERT INTO usuarios (nombre, correo, password, rol_id, estado, ultimo_login) VALUES (?, ?, ?, 1, 1, NOW())",
        [nombre, correo, hash],
        (err) => {
            if (err) return res.send('Error');

            res.redirect('/admin/login');
        }
    );
});

// LOGIN
router.post('/login', (req, res) => {
    const { correo, password } = req.body;

    db.query("SELECT * FROM usuarios WHERE correo = ?", [correo], async (err, results) => {

        // 🔥 ESTA LÍNEA FALTABA
        if (err) {
            console.log("❌ Error DB:", err);
            return res.send("Error del servidor");
        }

        if (!results || results.length === 0) {
            return res.render('login', {
                error: "Usuario no existe ❌"
            });
        }

        const user = results[0];

        if (user.estado === 0) {
            return res.render('login', {
                error: "Usuario bloqueado 🔒"
            });
        }

        if (user.ultimo_login) {
            const dias = (new Date() - new Date(user.ultimo_login)) / (1000 * 60 * 60 * 24);

            if (dias > 20) {
                return res.render('login', {
                    error: "Cuenta inactiva por más de 20 días ❌"
                });
            }
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.render('login', {
                error: "Contraseña incorrecta ❌"
            });
        }

        db.query("UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?", [user.id]);

        req.session.usuario = user;

        res.redirect('/admin');
    });
});

// LOGOUT
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/inicio'); // 👈 aquí
    });
});
module.exports = router;