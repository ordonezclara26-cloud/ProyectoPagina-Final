console.log("ESTE ES EL APP CORRECTO 🔥");
require('dotenv').config();

const express = require('express');
const app = express();
const db = require('./config/db');
const session = require('express-session');


// CONFIG
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'secreto123',
    resave: false,
    saveUninitialized: true
}));

app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario;
    next();
});

app.set('view engine', 'ejs');

// RUTAS
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// CLIENTE
app.get('/', (req, res) => {
    res.render('inicio');
});

app.get('/admin/login', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/inicio', (req, res) => {
    const carrito = req.session.carrito || {};
    res.render('inicio', {
        carritoCount: Object.values(carrito).reduce((a, b) => a + b, 0)
    });
});

// PRODUCTOS
app.get('/productos', (req, res) => {

    const categoria = req.query.categoria;

    let sql = `
        SELECT productos.*, categorias.nombre AS categoria
        FROM productos
        LEFT JOIN categorias ON productos.categoria_id = categorias.id
    `;

    let params = [];

    if (categoria) {
        sql += " WHERE productos.categoria_id = ?";
        params.push(categoria);
    }

    const mensaje = req.session.mensaje;
    req.session.mensaje = null;

    db.query(sql, params, (err, productos) => {

        db.query("SELECT * FROM categorias", (err2, categorias) => {

            const carrito = req.session.carrito || {};

            res.render('productos', {
                productos,
                categorias: categorias || [],
                mensaje: mensaje || null,
                carritoCount: Object.values(carrito).reduce((a, b) => a + b, 0)
            });
        });
    });
});

// 🛒 AGREGAR
app.post('/carrito/agregar', (req, res) => {

    const id = Number(req.body.id);

    if (!req.session.carrito) {
        req.session.carrito = {};
    }

    if (!req.session.carrito[id]) {
        req.session.carrito[id] = 1;
    } else {
        req.session.carrito[id]++;
    }

    res.sendStatus(200);
});

// ➖ RESTAR
app.post('/carrito/restar', (req, res) => {

    const id = Number(req.body.id);

    if (req.session.carrito && req.session.carrito[id]) {

        req.session.carrito[id]--;

        if (req.session.carrito[id] <= 0) {
            delete req.session.carrito[id];
        }
    }

    res.sendStatus(200);
});

// ❌ ELIMINAR
app.post('/carrito/eliminar', (req, res) => {

    const id = Number(req.body.id);

    if (req.session.carrito) {
        delete req.session.carrito[id];
    }

    res.redirect('/carrito');
});

// 🛒 VER CARRITO
app.get('/carrito', (req, res) => {

    const carrito = req.session.carrito || {};
    let total = 0;

    db.query("SELECT * FROM productos", (err, results) => {

        const lista = [];

        for (let id in carrito) {

            const p = results.find(x => x.id == id);

            if (p) {
                const cantidad = carrito[id];

                lista.push({
                    ...p,
                    cantidad: cantidad
                });

                total += p.precio * cantidad;
            }
        }

        res.render('carrito', {
            productos: lista,
            total,
            carritoCount: Object.values(carrito).reduce((a, b) => a + b, 0)
        });
    });
});

// 💳 CHECKOUT
app.get('/checkout', (req, res) => {
    res.render('checkout');
});

// 💰 COMPRA FINAL (ARREGLADO Y PRO)
app.post('/compra', (req, res) => {

    const carrito = req.session.carrito || {};
    const { nombre, correo, telefono, direccion, envio } = req.body;

    const metodo = "Contra entrega";

    if (Object.keys(carrito).length === 0) {
        return res.redirect('/carrito');
    }

    db.query("SELECT COUNT(*) AS total FROM pedidos", (err, result) => {

        const numero = result[0].total + 1;

        const fecha = new Date();
        const anio = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');

        const codigo = `FAC-${anio}${mes}${dia}-${numero.toString().padStart(5, '0')}`;

        db.query(
            `INSERT INTO pedidos 
            (codigo, nombre_cliente, correo_cliente, telefono, direccion, metodo_pago, metodo_envio, estado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                codigo,
                nombre,
                correo,
                telefono,
                direccion,
                metodo,
                envio,
                "Pendiente"
            ],
            (err2, result2) => {

                if (err2) {
                    console.log(err2);
                    return res.send("Error al guardar pedido");
                }

                const pedidoId = result2.insertId;

                for (let id in carrito) {
                    const cantidad = carrito[id];

                    for (let i = 0; i < cantidad; i++) {
                        db.query(
                            "INSERT INTO detalle_pedido (pedido_id, producto_id) VALUES (?, ?)",
                            [pedidoId, id]
                        );
                    }
                }

                // 🔥 MENSAJE PROFESIONAL
                db.query("SELECT * FROM productos", (err3, productosDB) => {

                    let productosTexto = "";
                    let total = 0;

                    for (let id in carrito) {

                        const producto = productosDB.find(p => p.id == id);

                        if (producto) {
                            const cantidad = carrito[id];
                            const subtotal = producto.precio * cantidad;

                            productosTexto += `• ${producto.nombre} (x${cantidad}) - L. ${subtotal}\n`;
                            total += subtotal;
                        }
                    }

                    const fechaTexto = new Date().toLocaleString();

                    const mensaje = `
==============================
        SICOS
   CONFIRMACIÓN DE PEDIDO
==============================

Código: ${codigo}
Fecha: ${fechaTexto}

Cliente: ${nombre}
Teléfono: ${telefono}
Dirección: ${direccion}

------------------------------
DETALLE DEL PEDIDO:
${productosTexto}
------------------------------

TOTAL: L. ${total}

Envío: Mandadito
Pago: Contra entrega

Gracias por su preferencia.
Nos comunicaremos con usted.
`;

                    const telefonoEmpresa = "50494143259";

                    const url = `https://wa.me/${telefonoEmpresa}?text=${encodeURIComponent(mensaje)}`;

                    req.session.carrito = {};

                    res.render('confirmacion', { codigo, url });
                });
            }
        );
    });
});

// CANTIDAD
app.get('/carrito/cantidad/:id', (req, res) => {

    const id = req.params.id;
    const carrito = req.session.carrito || {};

    res.json({
        cantidad: carrito[id] || 0
    });
});

// TOTAL
app.get('/carrito/total', (req, res) => {

    const carrito = req.session.carrito || {};
    const total = Object.values(carrito).reduce((a, b) => a + b, 0);

    res.json({ total });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

// 🔍 BUSCAR PRODUCTOS
app.get('/buscar', (req, res) => {

    const busqueda = req.query.q;

    const sql = `
        SELECT * FROM productos 
        WHERE nombre LIKE ? OR descripcion LIKE ?
    `;

    db.query(sql, [`%${busqueda}%`, `%${busqueda}%`], (err, productos) => {

        db.query("SELECT * FROM categorias", (err2, categorias) => {

            res.render('productos', {
                productos: productos || [],
                categorias: categorias || [],
                mensaje: null,
                carritoCount: 0
            });

        });

    });

});

// DEPARTAMENTOS
app.get('/soporte', (req, res) => {
    res.render('soporte');
});

app.get('/ciber', (req, res) => {
    res.render('ciber');
});

app.get('/visas', (req, res) => {
    res.render('visas');
});

// SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});