/**
 * Prepara escenarios de prueba para liquidación (anticipada vs vencida).
 * Ajusta fecha de desembolso, regenera cuotas y reaplica pagos reales.
 *
 *   node src/scripts/preparar-pruebas-liquidacion.js
 *   node src/scripts/preparar-pruebas-liquidacion.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { v4: uuidv4 } = require('uuid');
const { query, getConnection } = require('../config/db');
const { generarAgendaDeCobro } = require('../utils/finanzasNube');
const { calcularLiquidacionAnticipada, fechaVencimientoCredito } = require('../utils/finanzasNube');
const { aplicarMontoACuotas } = require('../utils/registrarPagoNube');

const APPLY = process.argv.includes('--apply');

const ESCENARIOS = [
  {
    cedula: '0019900070007G',
    etiqueta: 'ANTICIPADO — Carmen (crédito reciente, con descuento)',
    fecha_desembolso: '2026-06-10',
  },
  {
    cedula: '0019900010001A',
    etiqueta: 'ANTICIPADO — Maria (medio plazo, descuento visible)',
    fecha_desembolso: '2026-06-01',
  },
  {
    cedula: '0019900080008H',
    etiqueta: 'VENCIDO — Felix (plazo cumplido, interés completo)',
    fecha_desembolso: '2026-03-04',
  },
];

function parseDias(v) {
  if (!v) return ['LUNES'];
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return ['LUNES'];
  }
}

function n(v) {
  return Number(v || 0);
}

async function regenerarCuotasDesdePagos(conn, prestamo) {
  const dias = parseDias(prestamo.dias_de_cobro);
  const fecha = String(prestamo.fecha_desembolso).slice(0, 10);
  const cuotaDia = n(prestamo.cuota_semanal_base) / (dias.length || 1);
  const agenda = generarAgendaDeCobro(fecha, prestamo.plazo_semanas, dias, cuotaDia);

  await conn.execute(
    `UPDATE Cuotas_Calendario SET deleted_at = NOW() WHERE prestamo_id = ? AND deleted_at IS NULL`,
    [prestamo.id]
  );

  for (const c of agenda) {
    await conn.execute(
      `INSERT INTO Cuotas_Calendario (id, prestamo_id, fecha_programada, monto_programado, monto_pagado, estado, is_synced)
       VALUES (?, ?, ?, ?, 0, 'Programada', 1)`,
      [uuidv4(), prestamo.id, c.fecha_programada, c.monto_programado]
    );
  }

  const [pagosRows] = await conn.execute(
    `SELECT monto_pagado FROM Pagos WHERE prestamo_id = ? AND deleted_at IS NULL ORDER BY fecha_pago ASC`,
    [prestamo.id]
  );
  for (const pg of pagosRows) {
    await aplicarMontoACuotas(conn, prestamo.id, n(pg.monto_pagado));
  }

  const totalPagos = pagosRows.reduce((s, pg) => s + n(pg.monto_pagado), 0);
  const saldo = Math.max(0, Number((n(prestamo.monto_total_pagar) - totalPagos).toFixed(2)));
  const estado = saldo <= 0.01 ? 'Pagado' : 'Activo';

  await conn.execute(
    `UPDATE Prestamos SET saldo_pendiente = ?, estado = ?, updated_at = NOW(), is_synced = 1 WHERE id = ?`,
    [saldo, estado, prestamo.id]
  );

  return { totalPagos, saldo, estado };
}

async function procesarEscenario(conn, esc) {
  const [rows] = await conn.execute(
    `SELECT p.*, c.nombre_completo FROM Prestamos p
     JOIN Clientes c ON c.id = p.cliente_id
     WHERE c.cedula = ? AND p.deleted_at IS NULL
     ORDER BY p.estado = 'Activo' DESC, p.updated_at DESC LIMIT 1`,
    [esc.cedula]
  );
  if (!rows.length) throw new Error(`Préstamo no encontrado: ${esc.cedula}`);
  const prestamo = rows[0];

  if (APPLY) {
    await conn.execute(
      `UPDATE Prestamos SET fecha_desembolso = ?, updated_at = NOW(), is_synced = 1 WHERE id = ?`,
      [esc.fecha_desembolso, prestamo.id]
    );
    prestamo.fecha_desembolso = esc.fecha_desembolso;
    await regenerarCuotasDesdePagos(conn, prestamo);
  }

  const [pagos] = await conn.execute(
    `SELECT COALESCE(SUM(monto_pagado), 0) AS t FROM Pagos WHERE prestamo_id = ? AND deleted_at IS NULL`,
    [prestamo.id]
  );
  const pagado = n(pagos[0].t);
  const pSim = { ...prestamo, fecha_desembolso: esc.fecha_desembolso, saldo_pendiente: APPLY ? undefined : prestamo.saldo_pendiente };
  const saldoCalc = Math.max(0, n(prestamo.monto_total_pagar) - pagado);
  const liq = calcularLiquidacionAnticipada(
    { ...pSim, saldo_pendiente: saldoCalc },
    new Date(),
    { pagadoAcumulado: pagado }
  );
  const vence = fechaVencimientoCredito(
    esc.fecha_desembolso,
    prestamo.plazo_semanas,
    parseDias(prestamo.dias_de_cobro)
  );

  return {
    etiqueta: esc.etiqueta,
    cliente: prestamo.nombre_completo,
    cedula: esc.cedula,
    fecha_desembolso: esc.fecha_desembolso,
    vencimiento: vence,
    saldo: APPLY ? saldoCalc : n(prestamo.saldo_pendiente),
    pagos: pagado,
    tipo: liq.vencido ? 'VENCIDO' : 'ANTICIPADO',
    monto_liquidacion: liq.montoLiquidacion,
    ahorro: liq.descuentoInteres,
    mensaje: liq.mensaje,
  };
}

async function main() {
  console.log(`\n${APPLY ? '🔧 APLICANDO' : '👀 VISTA PREVIA'} — escenarios de liquidación\n`);

  const conn = await getConnection();
  const resultados = [];
  try {
    if (APPLY) await conn.beginTransaction();
    for (const esc of ESCENARIOS) {
      resultados.push(await procesarEscenario(conn, esc));
    }
    if (APPLY) await conn.commit();
  } catch (e) {
    if (APPLY) await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  for (const r of resultados) {
    console.log(`── ${r.etiqueta}`);
    console.log(`   ${r.cliente} (${r.cedula})`);
    console.log(`   Desembolso: ${r.fecha_desembolso} → Vence: ${r.vencimiento}`);
    console.log(`   Saldo: C$${r.saldo.toFixed(2)} | Pagos: C$${r.pagos.toFixed(2)}`);
    console.log(`   Liquidar hoy (${r.tipo}): C$${r.monto_liquidacion.toFixed(2)}`);
    if (r.ahorro > 0) console.log(`   Ahorro anticipado: C$${r.ahorro.toFixed(2)}`);
    console.log(`   ${r.mensaje}\n`);
  }

  if (!APPLY) {
    console.log('Para aplicar: node src/scripts/preparar-pruebas-liquidacion.js --apply\n');
  } else {
    console.log('✅ Escenarios listos. Sincronice la app del cobrador y pruebe Liquidar deuda.\n');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
