const { query } = require('../config/db');
const { hoyISO } = require('./zonaHoraria');
const { fechaVencimientoCredito } = require('./finanzasNube');

function parseDias(v) {
  if (!v) return ['LUNES'];
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return ['LUNES'];
  }
}

function diasEntre(desdeISO, hastaISO) {
  const a = new Date(`${desdeISO}T12:00:00`);
  const b = new Date(`${hastaISO}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.floor((b - a) / (86400000)));
}

async function armarReporteVencidos() {
  const hoy = hoyISO();
  const rows = await query(
    `SELECT p.id AS prestamo_id, p.fecha_desembolso, p.plazo_semanas, p.dias_de_cobro,
            p.monto_desembolsado, p.monto_total_pagar, p.saldo_pendiente, p.cuota_semanal_base,
            p.estado,
            c.id AS codigo_cliente, c.nombre_completo, c.cedula, c.telefono,
            u.nombre_completo AS cobrador,
            (SELECT COALESCE(SUM(monto_pagado), 0) FROM Pagos pg
             WHERE pg.prestamo_id = p.id AND pg.deleted_at IS NULL) AS total_pagos
     FROM Prestamos p
     JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
     LEFT JOIN Usuarios u ON c.cobrador_id = u.id
     WHERE p.estado = 'Activo' AND p.deleted_at IS NULL`
  );

  const filas = [];
  for (const p of rows) {
    const venc = fechaVencimientoCredito(p.fecha_desembolso, p.plazo_semanas, parseDias(p.dias_de_cobro));
    if (!venc || hoy < venc) continue;
    const pagado = Number(p.total_pagos || 0);
    filas.push({
      codigo_cliente: p.codigo_cliente,
      nombre_completo: p.nombre_completo,
      cedula: p.cedula,
      telefono: p.telefono,
      cobrador: p.cobrador || 'Sin asignar',
      prestamo_id: p.prestamo_id,
      fecha_desembolso: String(p.fecha_desembolso).slice(0, 10),
      fecha_vencimiento: venc,
      dias_vencido: diasEntre(venc, hoy),
      plazo_semanas: Number(p.plazo_semanas),
      monto_desembolsado: Number(p.monto_desembolsado),
      monto_total_pagar: Number(p.monto_total_pagar),
      total_pagos: pagado,
      saldo_pendiente: Number(p.saldo_pendiente),
      cuota_semanal_base: Number(p.cuota_semanal_base),
      estado: p.estado,
    });
  }

  filas.sort((a, b) => b.dias_vencido - a.dias_vencido || b.saldo_pendiente - a.saldo_pendiente);

  const resumen = {
    cantidad: filas.length,
    saldo_total: Number(filas.reduce((s, f) => s + f.saldo_pendiente, 0).toFixed(2)),
    capital_total: Number(filas.reduce((s, f) => s + f.monto_desembolsado, 0).toFixed(2)),
    pagado_total: Number(filas.reduce((s, f) => s + f.total_pagos, 0).toFixed(2)),
  };

  return {
    tipo: 'PRÉSTAMOS VENCIDOS',
    corte: hoy,
    resumen,
    filas,
    cantidad: filas.length,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { armarReporteVencidos };
