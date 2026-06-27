const { v4: uuidv4 } = require('uuid');
const { hoyISO } = require('./zonaHoraria');
const { prestamoEstaVencido, fechaVencimientoCredito } = require('./finanzasNube');

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
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/**
 * Castiga a pérdida un crédito vencido (solo admin). Quita saldo de cartera activa.
 */
async function aplicarCastigoPerdidaEnNube(conn, opts) {
  const prestamoId = opts.prestamo_id;
  const operadorId = opts.operador_id || null;
  const motivo = String(opts.motivo || '').trim();
  if (!motivo || motivo.length < 3) {
    throw new Error('Indique un motivo para el castigo (mínimo 3 caracteres).');
  }

  const [rows] = await conn.execute(
    `SELECT p.*, c.nombre_completo, c.cedula
     FROM Prestamos p
     JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
     WHERE p.id = ? AND p.deleted_at IS NULL
     LIMIT 1`,
    [prestamoId]
  );
  if (!rows.length) throw new Error('Préstamo no encontrado.');
  const prestamo = rows[0];

  if (prestamo.estado !== 'Activo') {
    throw new Error(`Solo se puede castigar un préstamo activo (estado: ${prestamo.estado}).`);
  }

  if (!prestamoEstaVencido(prestamo)) {
    const venc = fechaVencimientoCredito(
      prestamo.fecha_desembolso,
      prestamo.plazo_semanas,
      parseDias(prestamo.dias_de_cobro)
    );
    throw new Error(`El crédito aún no está vencido (última visita: ${venc || '—'}).`);
  }

  const montoPerdida = Number(prestamo.saldo_pendiente);
  if (!Number.isFinite(montoPerdida) || montoPerdida <= 0.01) {
    throw new Error('El préstamo no tiene saldo pendiente.');
  }

  const [pagadoRows] = await conn.execute(
    `SELECT COALESCE(SUM(monto_pagado), 0) AS total FROM Pagos
     WHERE prestamo_id = ? AND deleted_at IS NULL`,
    [prestamoId]
  );
  const pagadoAcumulado = Number(pagadoRows[0]?.total || 0);
  const vencimiento = fechaVencimientoCredito(
    prestamo.fecha_desembolso,
    prestamo.plazo_semanas,
    parseDias(prestamo.dias_de_cobro)
  );
  const hoy = hoyISO();
  const diasVencido = diasEntre(vencimiento, hoy);

  const id = uuidv4();
  const fecha = new Date().toISOString();

  await conn.execute(
    `INSERT INTO Castigos_Perdida (
      id, prestamo_id, cliente_id, admin_id, motivo, monto_perdida,
      monto_desembolsado, monto_pagado_acumulado, saldo_anterior, dias_vencido,
      fecha_vencimiento, fecha_castigo, is_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      prestamoId,
      prestamo.cliente_id,
      operadorId,
      motivo,
      montoPerdida,
      Number(prestamo.monto_desembolsado),
      pagadoAcumulado,
      montoPerdida,
      diasVencido,
      vencimiento,
      fecha,
    ]
  );

  await conn.execute(
    `UPDATE Cuotas_Calendario SET estado = 'Condonada', monto_pagado = monto_programado,
      updated_at = NOW(), is_synced = 1
     WHERE prestamo_id = ? AND estado IN ('Programada', 'Parcial') AND deleted_at IS NULL`,
    [prestamoId]
  );

  await conn.execute(
    `UPDATE Prestamos SET saldo_pendiente = 0, estado = 'Perdida', updated_at = NOW(), is_synced = 1
     WHERE id = ?`,
    [prestamoId]
  );

  return {
    id,
    prestamo_id: prestamoId,
    cliente: prestamo.nombre_completo,
    cedula: prestamo.cedula,
    monto_perdida: montoPerdida,
    monto_pagado_acumulado: pagadoAcumulado,
    dias_vencido: diasVencido,
    fecha_castigo: fecha,
  };
}

module.exports = { aplicarCastigoPerdidaEnNube };
