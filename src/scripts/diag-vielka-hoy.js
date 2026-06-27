require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/db');
const { hoyISO, rangoDiaNicaragua } = require('../utils/zonaHoraria');
const { buildAgendaCobrador } = require('../utils/agendaCobrador');
const { calcularLiquidacionAnticipada } = require('../utils/finanzasNube');

const fechaArg = process.argv[2];

(async () => {
  const hoy = fechaArg || hoyISO();
  const { inicio, fin } = rangoDiaNicaragua(hoy);
  console.log('Fecha Nicaragua:', hoy, '| rango UTC:', inicio, '->', fin);

  const vielka = await query(
    `SELECT u.id, u.nombre_completo FROM Usuarios u
     JOIN Roles r ON u.rol_id = r.id
     WHERE u.nombre_completo LIKE '%Vielka%' LIMIT 1`
  );
  if (!vielka.length) {
    console.log('Cobrador Vielka no encontrado');
    process.exit(1);
  }
  const cobId = vielka[0].id;
  console.log('Cobrador:', vielka[0].nombre_completo, cobId);

  const pagos = await query(
    `SELECT c.nombre_completo, c.cedula, p.id AS prestamo_id, p.estado, p.saldo_pendiente,
            p.monto_total_pagar, pg.id AS pago_id, pg.monto_pagado, pg.fecha_pago,
            pg.registrado_por_admin, pg.operador_id
     FROM Pagos pg
     JOIN Prestamos p ON pg.prestamo_id = p.id
     JOIN Clientes c ON p.cliente_id = c.id
     WHERE pg.deleted_at IS NULL AND pg.fecha_pago >= ? AND pg.fecha_pago < ?
       AND (pg.cobrador_id = ? OR c.cobrador_id = ?)
     ORDER BY pg.fecha_pago`,
    [inicio, fin, cobId, cobId]
  );
  console.log('\n=== PAGOS DEL DIA (clientes Vielka) ===');
  for (const p of pagos) {
    const pagadoRows = await query(
      `SELECT COALESCE(SUM(monto_pagado), 0) AS total FROM Pagos
       WHERE prestamo_id = ? AND deleted_at IS NULL`,
      [p.prestamo_id]
    );
    const pagadoAcum = Number(pagadoRows[0]?.total || 0);
    const prest = await query(`SELECT * FROM Prestamos WHERE id = ?`, [p.prestamo_id]);
    const liq = calcularLiquidacionAnticipada(prest[0], new Date(p.fecha_pago), { pagadoAcumulado: pagadoAcum - Number(p.monto_pagado) });
    const liqActual = calcularLiquidacionAnticipada(prest[0], new Date(), { pagadoAcumulado: pagadoAcum });
    console.log('---', p.nombre_completo);
    console.log('  Pago:', Number(p.monto_pagado).toFixed(2), '| fecha:', String(p.fecha_pago).slice(0, 19));
    console.log('  Estado prestamo:', p.estado, '| saldo:', Number(p.saldo_pendiente).toFixed(2));
    console.log('  Liquidacion al cobrar:', liq.montoLiquidacion.toFixed(2), '| vencido:', liq.esVencido);
    console.log('  Liquidacion ahora:', liqActual.montoLiquidacion.toFixed(2), '| diff pago vs liq:', (Number(p.monto_pagado) - liq.montoLiquidacion).toFixed(2));
    if (p.estado === 'Activo' && Number(p.saldo_pendiente) > 0 && Math.abs(Number(p.monto_pagado) - liq.montoLiquidacion) < 50) {
      console.log('  >>> POSIBLE LIQUIDACION PARCIAL (cobro ~ liquidacion pero sigue Activo)');
    }
  }
  if (!pagos.length) console.log('  (ninguno)');

  const gestiones = await query(
    `SELECT c.nombre_completo, g.id, g.prestamo_id, g.motivo, g.fecha_gestion,
            g.cobrador_id, g.is_synced, g.registrado_por_admin, c.cobrador_id AS cliente_cobrador
     FROM Gestiones_No_Pago g
     JOIN Prestamos p ON g.prestamo_id = p.id
     JOIN Clientes c ON p.cliente_id = c.id
     WHERE g.deleted_at IS NULL AND g.fecha_gestion >= ? AND g.fecha_gestion < ?
       AND (g.cobrador_id = ? OR c.cobrador_id = ?)
     ORDER BY g.fecha_gestion`,
    [inicio, fin, cobId, cobId]
  );
  console.log('\n=== GESTIONES NO PAGO DEL DIA ===');
  for (const g of gestiones) {
    console.log('---', g.nombre_completo);
    console.log('  motivo:', g.motivo, '| synced:', g.is_synced);
    console.log('  cobrador_gestion:', g.cobrador_id, '| cliente_cobrador:', g.cliente_cobrador);
    if (g.cobrador_id !== cobId) console.log('  >>> cobrador_id en gestion NO es Vielka');
  }
  if (!gestiones.length) console.log('  (ninguna en nube)');

  const agenda = await buildAgendaCobrador(query, cobId, hoy);
  console.log('\n=== AGENDA VIELKA (estado visita) ===');
  console.log('Resumen:', JSON.stringify(agenda.resumen));
  for (const v of agenda.agenda) {
    if (v.estado_visita === 'pendiente' || v.estado_visita === 'no_pago') {
      console.log(`  [${v.estado_visita}] ${v.nombre_completo} | motivo: ${v.motivo_no_pago || '-'}`);
    }
  }

  const pendientesConGestionLocal = agenda.agenda.filter(
    (v) => v.estado_visita === 'pendiente' && v.motivo_no_pago
  );
  if (pendientesConGestionLocal.length) {
    console.log('\n>>> BUG: pendiente pero tiene motivo_no_pago:', pendientesConGestionLocal.map((v) => v.nombre_completo));
  }

  const pendientes = agenda.agenda.filter((v) => v.estado_visita === 'pendiente');
  console.log('\n=== TODOS PENDIENTES HOY ===');
  for (const v of pendientes) {
    console.log(' ', v.nombre_completo, '| cuota:', v.cuota_semanal, '| saldo:', v.saldo_pendiente);
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
