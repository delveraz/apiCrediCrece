require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { getConnection } = require('../config/db');

const APPLY = process.argv.includes('--apply');

(async () => {
  const conn = await getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT p.id, p.saldo_pendiente, p.monto_total_pagar, p.estado, c.nombre_completo,
              (SELECT COALESCE(SUM(monto_pagado), 0) FROM Pagos WHERE prestamo_id = p.id AND deleted_at IS NULL) AS pagado
       FROM Prestamos p
       JOIN Clientes c ON p.cliente_id = c.id
       WHERE c.nombre_completo LIKE '%Vika%' AND p.deleted_at IS NULL
       LIMIT 1`
    );
    if (!rows.length) {
      console.log('Préstamo Vika no encontrado');
      process.exit(1);
    }
    const p = rows[0];
    console.log('Cliente:', p.nombre_completo);
    console.log('Estado actual:', p.estado, '| Saldo:', p.saldo_pendiente, '| Pagado:', p.pagado);
    console.log('Total contrato:', p.monto_total_pagar);

    const montoTotalAjustado = Number(Number(p.pagado).toFixed(2));
    console.log('\nReparación propuesta:');
    console.log('  estado → Pagado');
    console.log('  saldo_pendiente → 0');
    console.log('  monto_total_pagar →', montoTotalAjustado);

    if (!APPLY) {
      console.log('\nEjecute con --apply para aplicar.');
      process.exit(0);
    }

    await conn.beginTransaction();
    await conn.execute(
      `UPDATE Cuotas_Calendario SET monto_pagado = monto_programado, estado = 'Pagada', updated_at = NOW(), is_synced = 1
       WHERE prestamo_id = ? AND deleted_at IS NULL`,
      [p.id]
    );
    await conn.execute(
      `UPDATE Prestamos SET saldo_pendiente = 0, monto_total_pagar = ?, estado = 'Pagado', updated_at = NOW(), is_synced = 1
       WHERE id = ?`,
      [montoTotalAjustado, p.id]
    );
    await conn.commit();
    console.log('\nReparación aplicada.');
    process.exit(0);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
