const { getConnection } = require('../config/db');
const { exigirUsuarioActivo, responderErrorUsuario } = require('../utils/assertUsuarioActivo');

/**
 * Recibe lote de pagos offline desde SQLite y los persiste en TiDB Cloud.
 * Actualiza saldo_pendiente del préstamo y marca cuotas como pagadas proporcionalmente.
 */
async function syncMasivo(req, res) {
  const { pagos } = req.body;
  if (!Array.isArray(pagos) || pagos.length === 0) {
    return res.status(400).json({ success: false, message: 'Lista de pagos vacía.' });
  }

  try {
    const cobId = req.operadorId || pagos[0]?.cobrador_id;
    await exigirUsuarioActivo(cobId);
  } catch (e) {
    return responderErrorUsuario(res, e);
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    let procesados = 0;

    for (const pago of pagos) {
      const [existente] = await conn.execute(
        'SELECT id FROM Pagos WHERE id = ? AND deleted_at IS NULL',
        [pago.id]
      );
      if (existente.length > 0) continue;

      await conn.execute(
        `INSERT INTO Pagos (id, prestamo_id, cobrador_id, monto_pagado, fecha_pago, latitud, longitud, is_synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          pago.id,
          pago.prestamo_id,
          pago.cobrador_id,
          pago.monto_pagado,
          pago.fecha_pago,
          pago.latitud,
          pago.longitud,
        ]
      );

      await conn.execute(
        `UPDATE Prestamos
         SET saldo_pendiente = GREATEST(0, saldo_pendiente - ?),
             updated_at = NOW(),
             is_synced = 1
         WHERE id = ?`,
        [pago.monto_pagado, pago.prestamo_id]
      );

      await conn.execute(
        `UPDATE Cuotas_Calendario
         SET monto_pagado = monto_pagado + ?,
             estado = CASE WHEN monto_pagado + ? >= monto_programado THEN 'Pagada' ELSE 'Parcial' END,
             updated_at = NOW(),
             is_synced = 1
         WHERE prestamo_id = ? AND estado IN ('Programada', 'Parcial')
         ORDER BY fecha_programada ASC
         LIMIT 1`,
        [pago.monto_pagado, pago.monto_pagado, pago.prestamo_id]
      );

      procesados += 1;
    }

    await conn.commit();
    return res.json({ success: true, procesados });
  } catch (error) {
    await conn.rollback();
    console.error('Sync pagos error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
}

module.exports = { syncMasivo };
