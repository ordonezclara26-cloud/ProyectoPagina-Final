// CONFIGURACIÓN E INICIALIZACIÓN
console.log("ESTE ES EL APP CORRECTO");
require('dotenv').config(); // Carga de variables de entorno (.env)

const express = require('express');
const app = express();
const db = require('./config/db'); // Importación de la conexión a la base de datos
const session = require('express-session'); // Gestión de carritos y usuarios


// CONFIGURACIÓN DE MIDDLEWARES
app.use(express.json()); // Permite recibir datos en formato JSON
app.use(express.urlencoded({ extended: true })); // Permite recibir datos de formularios
app.use(express.static('public')); // Define la carpeta para archivos (CSS, Imágenes, JS)

// CONFIGURACIÓN DE SESIONES: Vital para que el carrito no se pierda al navegar
app.use(session({
    secret: 'secreto123',
    resave: false,
    saveUninitialized: true
}));

// VARIABLES GLOBALES: Permite que la variable 'usuario' esté disponible en todos los archivos .ejs
app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario;
    next();
});

app.set('view engine', 'ejs'); // Motor de plantillas

// SISTEMA DE RUTAS CENTRALIZADAS
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// CLIENTE
app.get('/', (req, res) => {

    if (process.env.ADMIN_APP) {
        return res.redirect('/admin/login');
    }

    res.render('inicio');
});

app.get('/admin/login', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {

    if (!req.session.usuario) {
        return res.send('Acceso denegado');
    }

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

// LÓGICA DEL CARRITO DE COMPRAS
// AGREGAR: Almacena el ID del producto en el objeto de sesión 'carrito'
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

// RESTAR
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

// ELIMINAR
app.post('/carrito/eliminar', (req, res) => {

    const id = Number(req.body.id);

    if (req.session.carrito) {
        delete req.session.carrito[id];
    }

    res.redirect('/carrito');
});

// VER CARRITO: Cruza los IDs de la sesión con los datos de la DB para mostrar nombres y precios
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

// CHECKOUT
app.get('/checkout', (req, res) => {

    const carrito = req.session.carrito || {};

    db.query("SELECT * FROM productos", (err, productos) => {

        let total = 0;

        for (let id in carrito) {

            const producto = productos.find(p => p.id == id);

            if (producto) {
                total += producto.precio * carrito[id];
            }
        }

        res.render('checkout', { total });

    });

});

// PROCESAMIENTO DE ORDENES Y GENERACIÓN DE FACTURA
app.post('/compra', (req, res) => {

    const carrito = req.session.carrito || {};
    const { nombre, correo, telefono, direccion, envio } = req.body;

    const metodo = "Contra entrega";

    if (Object.keys(carrito).length === 0) {
        return res.redirect('/carrito');
    }

    // GENERACIÓN DE CÓDIGO DE FACTURA ÚNICO (FAC-YYYYMMDD-NUM)
    db.query("SELECT COUNT(*) AS total FROM pedidos", (err, result) => {

        const numero = result[0].total + 1;

        const fecha = new Date();
        const anio = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');

        const codigo = `PED-${anio}${mes}${dia}-${numero.toString().padStart(5, '0')}`;

        // INSERCIÓN EN TABLA 'PEDIDOS'
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

                // INSERCIÓN DE DETALLES: Registra cada producto comprado en 'detalle_pedido'
                for (let id in carrito) {
                    const cantidad = carrito[id];

                    for (let i = 0; i < cantidad; i++) {
                        db.query(
                            "INSERT INTO detalle_pedido (pedido_id, producto_id) VALUES (?, ?)",
                            [pedidoId, id]
                        );
                    }
                }

                // INTEGRACIÓN CON WHATSAPP: Construye el mensaje de confirmación automático
                db.query("SELECT * FROM productos", (err3, productosDB) => {

                    let productosTexto = "";
                    let total = 0;

                    for (let id in carrito) {

                        const producto = productosDB.find(p => p.id == id);

                        if (producto) {
                            const cantidad = carrito[id];
                            const subtotal = producto.precio * cantidad;

                            productosTexto += `• ${producto.nombre} x${cantidad} - L. ${subtotal}\n`;
                            total += subtotal;
                        }
                    }

                    let costoEnvio = 0;

if (envio === "juticalpa") {
    costoEnvio = 60;
}

if (envio === "jutiquile") {
    costoEnvio = 80;
}

if (envio === "catacamas") {
    costoEnvio = 120;
}

total += costoEnvio;

let destino = "";

if (envio === "juticalpa") destino = "Juticalpa";
if (envio === "jutiquile") destino = "Jutiquile";
if (envio === "catacamas") destino = "Catacamas";

                    const fechaTexto = new Date().toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa'
});

                    const mensaje =
`SICOS - CONFIRMACIÓN DE PEDIDO\n\n` +

`Código: ${codigo}\n` +
`Fecha: ${fechaTexto}\n\n` +

`CLIENTE\n` +
`Nombre: ${nombre}\n` +
`Teléfono: ${telefono}\n` +
`Dirección: ${direccion}\n\n` +

`DETALLE DEL PEDIDO\n` +
`${productosTexto}\n` +

`Destino de entrega: ${destino}\n` +
`Costo de envío: L. ${costoEnvio}\n` +
`Total a pagar: L. ${total}\n\n` +

`Pedido pendiente de confirmación`;

                    const telefonoEmpresa = "50494143259";

                    const url = `https://wa.me/${telefonoEmpresa}?text=${encodeURIComponent(mensaje)}`;

                    // Limpia el carrito después de la compra
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

// BUSCAR PRODUCTOS
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

// SERVIDOR
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});