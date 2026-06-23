const { v4: uuidv4 } = require('uuid');
const { calcularLiquidacionAnticipada } = require('./finanzasNube');
const { exigirUsuarioActivo } = require('./assertUsuarioActivo');
const { rangoDiaLocal } = require('./fechasSql');

async function resolverCobradorAsignado(conn, prestamoId) {
  const [rows] = await conn.execute(
    `SELECT c.cobrador_id
     FROM Prestamos p
     JOIN Clientes c ON p.cliente_id = c.id
     WHERE p.id = ? AND p.deleted_at IS NULL
     LIMIT 1`,
    [prestamoId]
  );
  return rows[0]?.cobrador_id || null;
}

async function aplicarMontoACuotas(conn, prestamoId, monto, fechaISO) {
  const [cuotas] = await conn.execute(
    `SELECT id, monto_programado, monto_pagado FROM Cuotas_Calendario
     WHERE prestamo_id = ? AND estado IN ('Programada', 'Parcial') AND deleted_at IS NULL
     ORDER BY fecha_programada ASC`,
    [prestamoId]
  );
  let restante = Number(monto);
  for (const cuota of cuotas) {
    if (restante <= 0) break;
    const pendiente = Math.max(
      0,
      Number((Number(cuota.monto_programado) - Number(cuota.monto_pagado || 0)).toFixed(2))
    );
    if (pendiente <= 0) continue;
    const abono = Math.min(restante, pendiente);
    const nuevoPagado = Number((Number(cuota.monto_pagado || 0) + abono).toFixed(2));
    const estado = nuevoPagado >= Number(cuota.monto_programado) - 0.01 ? 'Pagada' : 'Parcial';
    await conn.execute(
      `UPDATE Cuotas_Calendario SET monto_pagado = ?, estado = ?, updated_at = NOW(), is_synced = 1
       WHERE id = ?`,
      [nuevoPagado, estado, cuota.id]
    );
    restante = Number((restante - abono).toFixed(2));
  }
}

/**
 * Registra cobro en TiDB (admin modo campo — siempre en línea).
 */
async function registrarPagoEnNube(conn, opts) {
  const {
    prestamo_id: prestamoId,
    operador_id: operadorId,
    monto_pagado: montoInput,
    latitud = 0,
    longitud = 0,
    tipo = 'personalizado',
    num_cuotas: numCuotas,
  } = opts;

  if (operadorId) await exigirUsuarioActivo(operadorId, conn);

  const [prestRows] = await conn.execute(
    `SELECT * FROM Prestamos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [prestamoId]
  );
  if (!prestRows.length) throw new Error('Prestamo no encontrado');
  const prestamo = prestRows[0];

  const cobradorRegistro = (await resolverCobradorAsignado(conn, prestamoId)) || operadorId;
  const esLiquidacion = tipo === 'liquidacion';
  let montoEfectivo = Number(montoInput);

  if (esLiquidacion) {
    const liq = calcularLiquidacionAnticipada(prestamo);
    montoEfectivo = liq.montoLiquidacion;
    if (montoEfectivo <= 0) throw new Error('Este prestamo ya esta liquidado o sin saldo.');
  }

  if (montoEfectivo <= 0) throw new Error('Monto invalido');
  if (!esLiquidacion && montoEfectivo > Number(prestamo.saldo_pendiente) + 0.01) {
    throw new Error(`Monto supera saldo pendiente (C$ ${Number(prestamo.saldo_pendiente).toFixed(2)})`);
  }

  const { inicio, fin } = rangoDiaLocal(new Date());
  const [cobroHoy] = await conn.execute(
    `SELECT id, registrado_por_admin FROM Pagos
     WHERE prestamo_id = ? AND deleted_at IS NULL AND fecha_pago >= ? AND fecha_pago < ?
     LIMIT 1`,
    [prestamoId, inicio, fin]
  );
  if (cobroHoy.length) {
    throw new Error(
      Number(cobroHoy[0].registrado_por_admin) === 1
        ? 'Este credito ya fue cobrado hoy.'
        : 'Este credito ya tiene un cobro registrado hoy por el cobrador.'
    );
  }

  const pagoId = uuidv4();
  const fecha = new Date().toISOString();
  const nuevoSaldo = Math.max(0, Number((Number(prestamo.saldo_pendiente) - montoEfectivo).toFixed(2)));
  const estadoPrestamo = nuevoSaldo <= 0 ? 'Pagado' : 'Activo';

  await conn.execute(
    `INSERT INTO Pagos (id, prestamo_id, cobrador_id, monto_pagado, fecha_pago, latitud, longitud,
      registrado_por_admin, operador_id, is_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
    [pagoId, prestamoId, cobradorRegistro, montoEfectivo, fecha, latitud, longitud, operadorId]
  );

  if (esLiquidacion && nuevoSaldo <= 0) {
    await conn.execute(
      `UPDATE Cuotas_Calendario SET monto_pagado = monto_programado, estado = 'Pagada', updated_at = NOW(), is_synced = 1
       WHERE prestamo_id = ? AND estado IN ('Programada', 'Parcial') AND deleted_at IS NULL`,
      [prestamoId]
    );
    await conn.execute(
      `UPDATE Prestamos SET saldo_pendiente = 0,
        monto_total_pagar = ?,
        estado = 'Pagado', updated_at = NOW(), is_synced = 1
       WHERE id = ?`,
      [
        Number(
          (
            Number(prestamo.monto_total_pagar) -
            Number(prestamo.saldo_pendiente) +
            montoEfectivo
          ).toFixed(2)
        ),
        prestamoId,
      ]
    );
  } else {
    await aplicarMontoACuotas(conn, prestamoId, montoEfectivo, fecha);
    await conn.execute(
      `UPDATE Prestamos SET saldo_pendiente = ?, estado = ?, updated_at = NOW(), is_synced = 1 WHERE id = ?`,
      [nuevoSaldo, estadoPrestamo, prestamoId]
    );
  }

  return {
    pagoId,
    saldoRestante: nuevoSaldo,
    montoAplicado: montoEfectivo,
    liquidacion: esLiquidacion,
    cobrador_id: cobradorRegistro,
    estado_visita: 'cobrado_admin',
  };
}

async function registrarGestionNoPagoEnNube(conn, opts) {
  const { prestamo_id: prestamoId, operador_id: operadorId, motivo, latitud = 0, longitud = 0 } = opts;
  if (operadorId) await exigirUsuarioActivo(operadorId, conn);
  const cobradorRegistro = (await resolverCobradorAsignado(conn, prestamoId)) || operadorId;
  const id = uuidv4();
  const fecha = new Date().toISOString();
  await conn.execute(
    `INSERT INTO Gestiones_No_Pago (id, prestamo_id, cobrador_id, motivo, fecha_gestion, latitud, longitud,
      registrado_por_admin, operador_id, is_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
    [id, prestamoId, cobradorRegistro, motivo, fecha, latitud, longitud, operadorId]
  );
  return { id, cobrador_id: cobradorRegistro };
}

module.exports = {
  registrarPagoEnNube,
  registrarGestionNoPagoEnNube,
  aplicarMontoACuotas,
};
