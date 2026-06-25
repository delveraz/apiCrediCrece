require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/db');
const { calcularLiquidacionAnticipada, fechaVencimientoCredito } = require('../utils/finanzasNube');
const { hoyISO } = require('../utils/zonaHoraria');

function parseDias(v) {
  if (!v) return ['LUNES'];
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return ['LUNES'];
  }
}

(async () => {
  const hoy = hoyISO();
  const rows = await query(
    `SELECT p.*, c.nombre_completo, c.cedula
     FROM Prestamos p
     JOIN Clientes c ON c.id = p.cliente_id
     WHERE p.estado = 'Activo' AND p.deleted_at IS NULL
     ORDER BY p.saldo_pendiente ASC`
  );

  console.log(`\nLiquidaciones posibles (hoy ${hoy})\n`);
  for (const p of rows) {
    const [pag] = await query(
      `SELECT COALESCE(SUM(monto_pagado), 0) AS t FROM Pagos WHERE prestamo_id = ? AND deleted_at IS NULL`,
      [p.id]
    );
    const pagado = Number(pag[0].t);
    const vence = fechaVencimientoCredito(p.fecha_desembolso, p.plazo_semanas, parseDias(p.dias_de_cobro));
    const liq = calcularLiquidacionAnticipada(p, new Date(), { pagadoAcumulado: pagado });
    console.log(
      `${p.nombre_completo} (${p.cedula})`,
      `\n  Saldo: C$${Number(p.saldo_pendiente).toFixed(2)} | Pagos: C$${pagado.toFixed(2)} | Vence: ${vence}`,
      `\n  Tipo: ${liq.vencido ? 'VENCIDO (interés completo)' : 'ANTICIPADO (con ajuste)'}`,
      `\n  Monto liquidación: C$${liq.montoLiquidacion.toFixed(2)}`,
      liq.descuentoInteres > 0 ? `| Ahorro cliente: C$${liq.descuentoInteres.toFixed(2)}` : '',
      '\n'
    );
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
