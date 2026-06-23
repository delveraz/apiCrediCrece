/**
 * Repara saldos y cuotas de préstamos con descuadre (post sync cobrador).
 * Uso: node src/scripts/reparar-descuadres-saldo.js
 */
require('dotenv').config();
const { getConnection } = require('../config/db');
const { aplicarMontoACuotas } = require('../utils/registrarPagoNube');

const REPARACIONES = [
  { cedula: '0019900010001A', nombre: 'Maria Elena Lopez Ruiz' },
  { cedula: '0019900080008H', nombre: 'Felix Armando Rivas Chavez' },
  { cedula: '0019900020002B', nombre: 'Juan Carlos Perez Mora' },
];

async function repararPrestamo(conn, cedula) {
  const [cliente] = await conn.execute(
    'SELECT id, nombre_completo FROM Clientes WHERE cedula = ? AND deleted_at IS NULL LIMIT 1',
    [cedula]
  );
  if (!cliente.length) throw new Error(`Cliente no encontrado: ${cedula}`);

  const [prestamo] = await conn.execute(
    `SELECT * FROM Prestamos WHERE cliente_id = ? AND estado = 'Activo' AND deleted_at IS NULL LIMIT 1`,
    [cliente[0].id]
  );
  if (!prestamo.length) throw new Error(`Préstamo activo no encontrado: ${cedula}`);
  const p = prestamo[0];

  const [pagos] = await conn.execute(
    `SELECT COALESCE(SUM(monto_pagado), 0) AS total FROM Pagos
     WHERE prestamo_id = ? AND deleted_at IS NULL`,
    [p.id]
  );
  const totalPagos = Number(pagos[0].total);

  const [cuotasSum] = await conn.execute(
    `SELECT COALESCE(SUM(monto_pagado), 0) AS pagado FROM Cuotas_Calendario
     WHERE prestamo_id = ? AND deleted_at IS NULL`,
    [p.id]
  );
  const sumCuotas = Number(cuotasSum[0].pagado);
  const saldoPorCalendario = Math.max(
    0,
    Number((Number(p.monto_total_pagar) - sumCuotas).toFixed(2))
  );

  const [pagosRows] = await conn.execute(
    `SELECT id, monto_pagado FROM Pagos WHERE prestamo_id = ? AND deleted_at IS NULL ORDER BY fecha_pago`,
    [p.id]
  );

  for (const pg of pagosRows) {
    await aplicarMontoACuotas(conn, p.id, Number(pg.monto_pagado));
  }

  const [cuotasSum2] = await conn.execute(
    `SELECT COALESCE(SUM(monto_pagado), 0) AS pagado FROM Cuotas_Calendario
     WHERE prestamo_id = ? AND deleted_at IS NULL`,
    [p.id]
  );
  const nuevoSaldo = Math.max(
    0,
    Number((Number(p.monto_total_pagar) - Number(cuotasSum2[0].pagado)).toFixed(2))
  );

  await conn.execute(
    `UPDATE Prestamos SET saldo_pendiente = ?, updated_at = NOW(), is_synced = 1 WHERE id = ?`,
    [nuevoSaldo, p.id]
  );

  return {
    cliente: cliente[0].nombre_completo,
    cedula,
    saldo_antes: Number(p.saldo_pendiente),
    saldo_despues: nuevoSaldo,
    saldo_por_calendario_antes: saldoPorCalendario,
    pagos_reales: totalPagos,
  };
}

async function main() {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const resultados = [];
    for (const r of REPARACIONES) {
      resultados.push(await repararPrestamo(conn, r.cedula));
    }
    await conn.commit();
    console.log('Reparación completada:\n');
    console.table(resultados);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
