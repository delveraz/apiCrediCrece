/**
 * Audita préstamos activos: saldo vs pagos vs calendario de cuotas.
 * Uso: node src/scripts/auditar-descuadres.js
 */
require('dotenv').config();
const { query } = require('../config/db');

const TOLERANCIA = 1.5;

function n(v) {
  return Number(v || 0);
}

async function main() {
  const rows = await query(
    `SELECT p.id, c.cedula, c.nombre_completo, p.estado,
            p.monto_total_pagar, p.saldo_pendiente, p.cuota_semanal_base,
            (SELECT COALESCE(SUM(monto_pagado), 0) FROM Pagos pg
             WHERE pg.prestamo_id = p.id AND pg.deleted_at IS NULL) AS total_pagos,
            (SELECT COUNT(*) FROM Pagos pg
             WHERE pg.prestamo_id = p.id AND pg.deleted_at IS NULL) AS n_pagos,
            (SELECT COALESCE(SUM(cc.monto_pagado), 0) FROM Cuotas_Calendario cc
             WHERE cc.prestamo_id = p.id AND cc.deleted_at IS NULL) AS sum_cuotas_pagado,
            (SELECT COUNT(*) FROM Cuotas_Calendario cc
             WHERE cc.prestamo_id = p.id AND cc.deleted_at IS NULL
               AND (cc.estado = 'Pagada' OR cc.monto_pagado >= cc.monto_programado - 0.01)) AS cuotas_pagadas,
            (SELECT COUNT(*) FROM Cuotas_Calendario cc
             WHERE cc.prestamo_id = p.id AND cc.deleted_at IS NULL) AS cuotas_total
     FROM Prestamos p
     JOIN Clientes c ON p.cliente_id = c.id
     WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND p.estado = 'Activo'
     ORDER BY c.nombre_completo`
  );

  const criticos = [];
  const ok = [];

  console.log('\n=== AUDITORÍA REFINADA (préstamos activos) ===\n');

  for (const r of rows) {
    const total = n(r.monto_total_pagar);
    const saldo = n(r.saldo_pendiente);
    const cuota = n(r.cuota_semanal_base) || 1;
    const saldoPorCalendario = Math.max(0, Number((total - n(r.sum_cuotas_pagado)).toFixed(2)));
    const diffSaldoCalendario = Number((saldo - saldoPorCalendario).toFixed(2));
    const cuotasPorSaldo = Math.round((total - saldo) / cuota);
    const cuotasPagadas = Number(r.cuotas_pagadas);
    const cuotasPendientes = Number(r.cuotas_total) - cuotasPagadas;
    const desfaseCuotas = cuotasPorSaldo - cuotasPagadas;

    const issues = [];

    if (Math.abs(diffSaldoCalendario) > TOLERANCIA) {
      if (diffSaldoCalendario < 0) {
        issues.push(
          `Saldo C$ ${saldo.toFixed(2)} está C$ ${Math.abs(diffSaldoCalendario).toFixed(2)} MENOR que indica el calendario (C$ ${saldoPorCalendario.toFixed(2)}) — se descontó de más en saldo`
        );
      } else {
        issues.push(
          `Saldo C$ ${saldo.toFixed(2)} está C$ ${diffSaldoCalendario.toFixed(2)} MAYOR que indica el calendario (C$ ${saldoPorCalendario.toFixed(2)}) — cuotas pagadas no reflejadas en saldo`
        );
      }
    }

    if (Math.abs(desfaseCuotas) >= 2) {
      issues.push(
        `Saldo implica ${cuotasPorSaldo} cuotas pagadas; calendario marca ${cuotasPagadas} (${cuotasPendientes} pendientes) — desfase de ${Math.abs(desfaseCuotas)} cuota(s)`
      );
    }

    if (Number(r.n_pagos) > 0 && diffSaldoCalendario < -TOLERANCIA) {
      issues.push(
        `${r.n_pagos} pago(s) real(es) por C$ ${n(r.total_pagos).toFixed(2)} sin reflejarse completamente en el calendario`
      );
    }

    const item = {
      cedula: r.cedula,
      nombre: r.nombre_completo,
      saldo,
      saldo_por_calendario: saldoPorCalendario,
      diff: diffSaldoCalendario,
      n_pagos: Number(r.n_pagos),
      total_pagos: n(r.total_pagos),
      cuotas_pagadas: cuotasPagadas,
      cuotas_pendientes: cuotasPendientes,
      cuotas_total: Number(r.cuotas_total),
      issues,
    };

    if (issues.length) criticos.push(item);
    else ok.push(item);
  }

  console.log(`Total activos: ${rows.length} | OK: ${ok.length} | Con descuadre: ${criticos.length}\n`);

  if (ok.length) {
    console.log('--- SIN PROBLEMAS ---');
    for (const o of ok) {
      console.log(`  ✓ ${o.nombre} (${o.cedula}) — saldo C$ ${o.saldo.toFixed(2)}`);
    }
    console.log('');
  }

  if (criticos.length) {
    console.log('--- CON DESCUADRES ---');
    for (const c of criticos) {
      console.log(`\n${c.nombre} (${c.cedula})`);
      console.log(`  Saldo: C$ ${c.saldo.toFixed(2)} | Por calendario: C$ ${c.saldo_por_calendario.toFixed(2)} | Diff: C$ ${c.diff.toFixed(2)}`);
      console.log(`  Pagos reales: ${c.n_pagos} (C$ ${c.total_pagos.toFixed(2)}) | Cuotas: ${c.cuotas_pagadas}/${c.cuotas_total} pagadas, ${c.cuotas_pendientes} pendientes`);
      for (const iss of c.issues) console.log(`  ⚠ ${iss}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

