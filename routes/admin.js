// IMPORTACIÓN DE MÓDULOS Y CONFIGURACIÓN
const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Conexión a la base de datos
const multer = require('multer'); // Middleware para gestión de archivos (imágenes)
const path = require('path');

// CONFIGURACIÓN DE ALMACENAMIENTO DE IMÁGENES
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Renombra el archivo con la fecha actual para evitar duplicados
        cb(null, 'public/img'); // Carpeta donde se guardarán las fotos de productos
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// MIDDLEWARE DE PROTECCIÓN (SEGURIDAD)
// Verifica que el usuario esté logueado y que sea Administrador (rol_id === 1)
function verificarAdmin(req, res, next) {

    if (!req.session.usuario) {
        return res.redirect('/admin/login');
    }

    if (req.session.usuario.rol_id !== 1) {
        return res.send('Acceso denegado');
    }

    next(); // Si todo es correcto, permite continuar a la ruta
}

// DASHBOARD
router.get('/', verificarAdmin, (req, res) => {
    res.render('admin/dashboard');
});

// GESTIÓN DE USUARIOS (BLOQUEO Y ACTIVACIÓN)
router.get('/usuarios', verificarAdmin, (req, res) => {

    const mensaje = req.session.mensaje;
    req.session.mensaje = null;

    db.query("SELECT * FROM usuarios", (err, results) => {
        if (err) return res.send('Error');

        res.render('admin/usuarios', {
            usuarios: results,
            mensaje: mensaje
        });
    });
});

router.post('/usuarios/bloquear', verificarAdmin, (req, res) => {

    const id = req.body.id;

    db.query("UPDATE usuarios SET estado = 0 WHERE id = ?", [id], () => {
        req.session.mensaje = "Usuario bloqueado";
        res.redirect('/admin/usuarios');
    });
});

router.post('/usuarios/activar', verificarAdmin, (req, res) => {

    const id = req.body.id;

    db.query("UPDATE usuarios SET estado = 1 WHERE id = ?", [id], () => {
        req.session.mensaje = "Usuario activado";
        res.redirect('/admin/usuarios');
    });
});

// GESTIÓN DE PRODUCTOS (CRUD MULTIMEDIA)
router.get('/productos', verificarAdmin, (req, res) => {

    // Consulta con JOIN para traer el nombre de la categoría en lugar de solo el ID
    db.query(`
        SELECT productos.*, categorias.nombre AS categoria
        FROM productos
        LEFT JOIN categorias ON productos.categoria_id = categorias.id
    `, (err, results) => {

        if (err) return res.send('Error');

        res.render('admin/adminProductos', {
            productos: results
        });
    });
});


router.get('/productos/nuevo', verificarAdmin, (req, res) => {

    db.query("SELECT * FROM categorias", (err, categorias) => {
        if (err) return res.send('Error');

        res.render('admin/nuevoProducto', {
            categorias: categorias
        });
    });
});

// GUARDAR PRODUCTO: Usa 'upload.single' para procesar la imagen enviada
router.post('/productos/guardar', verificarAdmin, upload.single('imagen'), (req, res) => {

    const { nombre, descripcion, precio, categoria_id } = req.body;

    const imagen = req.file ? req.file.filename : null;

    db.query(
        "INSERT INTO productos (nombre, descripcion, precio, categoria_id, imagen) VALUES (?, ?, ?, ?, ?)",
        [nombre, descripcion, precio, categoria_id, imagen],
        (err) => {
            if (err) {
                console.log("ERROR INSERT:", err);
                return res.send('Error al guardar producto');
            }

            res.redirect('/admin/productos');
        }
    );
});

router.post('/productos/eliminar', verificarAdmin, (req, res) => {

    const id = req.body.id;

    db.query("DELETE FROM productos WHERE id = ?", [id], () => {
        res.redirect('/admin/productos');
    });
});

router.get('/productos/editar/:id', verificarAdmin, (req, res) => {

    const id = req.params.id;

    db.query("SELECT * FROM productos WHERE id = ?", [id], (err, results) => {
        if (err) return res.send('Error');

        db.query("SELECT * FROM categorias", (err2, categorias) => {
            if (err2) return res.send('Error');

            res.render('admin/editarProducto', {
                producto: results[0],
                categorias: categorias
            });
        });
    });
});

router.post('/productos/editar', verificarAdmin, (req, res) => {

    const { id, nombre, descripcion, precio, categoria_id } = req.body;

    db.query(
        "UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, categoria_id = ? WHERE id = ?",
        [nombre, descripcion, precio, categoria_id, id],
        (err) => {
            if (err) return res.send('Error');
            res.redirect('/admin/productos');
        }
    );
});

// CATEGORÍAS
router.get('/categorias', verificarAdmin, (req, res) => {

    const mensaje = req.session.mensaje;
    req.session.mensaje = null;

    db.query("SELECT * FROM categorias", (err, results) => {
        if (err) return res.send('Error');

        res.render('admin/categorias', {
            categorias: results,
            mensaje: mensaje
        });
    });
});

router.post('/categorias/agregar', verificarAdmin, (req, res) => {

    const { nombre, descripcion } = req.body;

    db.query(
        "INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)",
        [nombre, descripcion],
        () => {
            req.session.mensaje = "Categoría agregada";
            res.redirect('/admin/categorias');
        }
    );
});

router.post('/categorias/eliminar', verificarAdmin, (req, res) => {

    const id = req.body.id;

    db.query("DELETE FROM categorias WHERE id = ?", [id], (err) => {

        if (err) {
            req.session.mensaje = "No se puede eliminar";
            return res.redirect('/admin/categorias');
        }

        req.session.mensaje = "Categoría eliminada";
        res.redirect('/admin/categorias');
    });
});

router.get('/categorias/editar/:id', verificarAdmin, (req, res) => {

    const id = req.params.id;

    db.query("SELECT * FROM categorias WHERE id = ?", [id], (err, results) => {
        if (err) return res.send('Error');

        res.render('admin/editarCategoria', {
            categoria: results[0]
        });
    });
});

router.post('/categorias/editar', verificarAdmin, (req, res) => {

    const { id, nombre, descripcion } = req.body;

    db.query(
        "UPDATE categorias SET nombre = ?, descripcion = ? WHERE id = ?",
        [nombre, descripcion, id],
        () => {
            req.session.mensaje = "Categoría actualizada";
            res.redirect('/admin/categorias');
        }
    );
});

// GESTIÓN DE PEDIDOS (LÓGICA DE AGRUPACIÓN)
router.get('/pedidos', verificarAdmin, (req, res) => {

    const buscar = req.query.buscar || "";

    let sql = `
        SELECT 
            p.id AS pedido_id,
            p.codigo,
            p.fecha,
            p.nombre_cliente AS cliente,
            p.correo_cliente AS correo,
            p.telefono,
            p.direccion,
            p.estado,
            pr.nombre,
            pr.precio
        FROM detalle_pedido dp
        JOIN pedidos p ON dp.pedido_id = p.id
        JOIN productos pr ON dp.producto_id = pr.id
    `;

    let params = [];

    if (buscar) {
        sql += " WHERE p.codigo LIKE ?";
        params.push(`%${buscar}%`);
    }

    sql += " ORDER BY p.id DESC";

    db.query(sql, params, (err, results) => {

        if (err) {
            console.log(err);
            return res.send('Error');
        }

        // PROCESAMIENTO DE DATOS: Agrupa múltiples productos bajo un mismo ID de pedido
        const pedidos = {};

        results.forEach(r => {

            if (!pedidos[r.pedido_id]) {
                pedidos[r.pedido_id] = {
                    codigo: r.codigo,
                    fecha: r.fecha,
                    cliente: r.cliente,
                    correo: r.correo,
                    telefono: r.telefono,
                    direccion: r.direccion,
                    estado: r.estado,
                    productos: [],
                    total: 0
                };
            }

            pedidos[r.pedido_id].productos.push(r);
            pedidos[r.pedido_id].total += parseFloat(r.precio);
        });

        res.render('admin/pedidos', {
            pedidos: pedidos
        });
    });
});

// CAMBIAR ESTADO
router.post('/pedidos/estado', verificarAdmin, (req, res) => {

    const { id, estado } = req.body;

    db.query(
        "UPDATE pedidos SET estado = ? WHERE id = ?",
        [estado, id],
        () => {
            res.redirect('/admin/pedidos');
        }
    );
});

// ELIMINAR PEDIDO
router.post('/pedidos/eliminar', verificarAdmin, (req, res) => {

    const id = req.body.id;

    db.query("DELETE FROM detalle_pedido WHERE pedido_id = ?", [id], () => {
        db.query("DELETE FROM pedidos WHERE id = ?", [id], () => {
            res.redirect('/admin/pedidos');
        });
    });
});

// EXPORTACIÓN DEL ENRUTADOR
module.exports = router;