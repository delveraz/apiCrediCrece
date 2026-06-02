require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, query } = require('../config/db');

const TABLAS_NEGOCIO = [
  'Solicitudes_Correccion_Cobro',
  'Pagos',
  'Gestiones_No_Pago',
  'Cuotas_Calendario',
  'Prestamo_Garantias',
  'Renovaciones_Log',
  'Historial_Prorrogas',
  'Prestamos',
  'Ruta_Clientes',
  'Rutas',
  'Garantias',
  'Fiadores',
  'Clientes',
  'Cierre_Caja',
];

const ROLES_BASE = [
  ['ROL-ADMIN-UUID', 'ADMIN'],
  ['ROL-COB-UUID', 'COBRADOR'],
  ['ROL-CONT-UUID', 'CONTADOR'],
];

/** --con-admin: además crea admin@nica.com y parámetros iniciales */
const conAdmin = process.argv.includes('--con-admin');

async function resetCloud() {
  const conn = await pool.getConnection();
  try {
    console.log('Limpiando TiDB Cloud...\n');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const tabla of TABLAS_NEGOCIO) {
      try {
        await conn.query(`DELETE FROM ${tabla}`);
        console.log(`  OK ${tabla}`);
      } catch (e) {
        console.log(`  WARN ${tabla}: ${e.message}`);
      }
    }

    await conn.query('DELETE FROM Usuarios');
    console.log('  OK Usuarios');

    await conn.query('DELETE FROM Parametros_Globales');
    console.log('  OK Parametros_Globales');

    await conn.query('DELETE FROM Roles');
    console.log('  OK Roles (vaciado)');

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    for (const [id, nombre] of ROLES_BASE) {
      await query(`INSERT INTO Roles (id, nombre) VALUES (?, ?)`, [id, nombre]);
    }
    console.log('\n  Roles conservados: ADMIN, COBRADOR, CONTADOR');

    if (conAdmin) {
      const hash = await bcrypt.hash('admin124', 10);
      await query(
        `INSERT INTO Usuarios (id, rol_id, nombre_completo, email, password_hash, activo, is_synced)
         VALUES ('USER-ADMIN-1', 'ROL-ADMIN-UUID', 'Administrador Principal', 'admin@nica.com', ?, 1, 1)`,
        [hash]
      );
      const permisos = {
        ADMIN: ['*'],
        COBRADOR: [
          'ruta',
          'clientes.ver',
          'clientes.crear',
          'prestamos.crear',
          'prestamos.renovar',
          'cobros',
          'no_pago',
          'cierre_caja',
        ],
        CONTADOR: ['reportes'],
      };
      await query(
        `INSERT INTO Parametros_Globales (id, clave, valor, descripcion, is_synced) VALUES (?, ?, ?, ?, 1)`,
        [uuidv4(), 'PERMISOS_ROLES', JSON.stringify(permisos), 'Permisos por rol (JSON)']
      );
      await query(
        `INSERT INTO Parametros_Globales (id, clave, valor, descripcion, is_synced) VALUES (?, 'TASA_INTERES_POR_MES', '0.10', 'Tasa mensual Auto', 1)`,
        [uuidv4()]
      );
      await query(
        `INSERT INTO Parametros_Globales (id, clave, valor, descripcion, is_synced) VALUES (?, 'SEC_CLIENTE', '0', 'Secuencia clientes CC-N', 1)`,
        [uuidv4()]
      );
      console.log('  Admin: admin@nica.com / admin124');
      console.log('  Parametros globales restaurados');
    }

    console.log('\nBase de datos reiniciada.');
    if (!conAdmin) {
      console.log('Solo quedaron los 3 roles. Cree usuarios admin/cobradores desde la app o ejecute:');
      console.log('  npm run reset-cloud -- --con-admin\n');
    } else {
      console.log('Listo para comenzar con admin y roles.\n');
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

resetCloud().catch((err) => {
  console.error('Error reset:', err.message);
  process.exit(1);
});
