/**
 * Borra cartera (clientes, préstamos, pagos, rutas…) pero conserva
 * Usuarios, Roles y Parametros_Globales (permisos, tasas).
 *
 * Uso: npm run reset-cartera
 */
require('dotenv').config();
const { pool, query } = require('../config/db');

const TABLAS_CARTERA = [
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

async function resetCartera() {
  const conn = await pool.getConnection();
  try {
    console.log('Limpiando solo cartera en TiDB (usuarios y roles se conservan)...\n');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const tabla of TABLAS_CARTERA) {
      try {
        await conn.query(`DELETE FROM ${tabla}`);
        console.log(`  OK ${tabla}`);
      } catch (e) {
        console.log(`  WARN ${tabla}: ${e.message}`);
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    await query(
      `INSERT INTO Parametros_Globales (id, clave, valor, descripcion, is_synced)
       VALUES (UUID(), 'SEC_CLIENTE', '0', 'Secuencia clientes CC-N', 1)
       ON DUPLICATE KEY UPDATE valor = '0', updated_at = NOW()`
    );
    console.log('\n  Secuencia clientes (SEC_CLIENTE) reiniciada a 0');

    const usuarios = await query(
      `SELECT COUNT(*) AS n FROM Usuarios WHERE activo = 1`
    );
    const cobradores = await query(
      `SELECT u.email, u.nombre_completo FROM Usuarios u
       JOIN Roles r ON u.rol_id = r.id WHERE r.nombre = 'COBRADOR' AND u.activo = 1`
    );

    console.log(`\nUsuarios activos conservados: ${usuarios[0]?.n || 0}`);
    console.log('Cobradores para plantilla:');
    cobradores.forEach((c) => console.log(`  - ${c.email} (${c.nombre_completo})`));
    console.log('\nListo. Puede probar carga masiva con la plantilla de 4 ejemplos.\n');
  } finally {
    conn.release();
    await pool.end();
  }
}

resetCartera().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
