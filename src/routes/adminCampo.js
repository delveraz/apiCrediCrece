const { getConnection } = require('../config/db');
const { loadAgendaAdminHoy } = require('../utils/rutaDiariaAdmin');
const { calcularLiquidacionAnticipada } = require('../utils/finanzasNube');
const { registrarPagoEnNube, registrarGestionNoPagoEnNube } = require('../utils/registrarPagoNube');

async function getAgendaCampo(req, res) {
  try {
    const payload = await loadAgendaAdminHoy();
    return res.json({ success: true, ...payload });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
}

async function getResumenCobroCampo(req, res) {
  try {
    const { prestamoId } = req.params;
    const conn = await getConnection();
    try {
      const [prestRows] = await conn.execute(
        `SELECT * FROM Prestamos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [prestamoId]
      );
      if (!prestRows.length) {
        return res.status(404).json({ success: false, message: 'Prestamo no encontrado' });
      }
      const prestamo = prestRows[0];
      const [cuotaPend] = await conn.execute(
        `SELECT id, monto_programado, monto_pagado, fecha_programada, estado
         FROM Cuotas_Calendario
         WHERE prestamo_id = ? AND estado IN ('Programada', 'Parcial') AND deleted_at IS NULL
         ORDER BY fecha_programada ASC LIMIT 1`,
        [prestamoId]
      );
      const cuota = cuotaPend[0];
      const cuotaDia = cuota
        ? Math.max(0, Number((Number(cuota.monto_programado) - Number(cuota.monto_pagado || 0)).toFixed(2)))
        : 0;
      const [pend] = await conn.execute(
        `SELECT COUNT(*) AS n FROM Cuotas_Calendario
         WHERE prestamo_id = ? AND estado IN ('Programada', 'Parcial') AND deleted_at IS NULL`,
        [prestamoId]
      );
      return res.json({
        success: true,
        data: {
          prestamo,
          cuotaDia,
          cuotasPendientes: pend[0]?.n || 0,
          liquidacion: calcularLiquidacionAnticipada(prestamo),
        },
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
}

async function postPagoCampo(req, res) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await registrarPagoEnNube(conn, req.body);
    await conn.commit();
    return res.json({ success: true, ...result });
  } catch (e) {
    await conn.rollback();
    return res.status(400).json({ success: false, message: e.message });
  } finally {
    conn.release();
  }
}

async function postGestionNoPagoCampo(req, res) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await registrarGestionNoPagoEnNube(conn, req.body);
    await conn.commit();
    return res.json({ success: true, ...result });
  } catch (e) {
    await conn.rollback();
    return res.status(400).json({ success: false, message: e.message });
  } finally {
    conn.release();
  }
}

module.exports = {
  getAgendaCampo,
  getResumenCobroCampo,
  postPagoCampo,
  postGestionNoPagoCampo,
};
