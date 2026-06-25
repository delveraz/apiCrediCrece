require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { armarReporteVencidos } = require('../utils/reporteVencidos');

function fmt(v) {
  return `C$ ${Number(v || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

(async () => {
  const data = await armarReporteVencidos();
  console.log('\n' + '═'.repeat(70));
  console.log('  PRÉSTAMOS VENCIDOS — Corte:', data.corte);
  console.log('═'.repeat(70));
  console.log(`  Cantidad: ${data.resumen.cantidad}`);
  console.log(`  Saldo total: ${fmt(data.resumen.saldo_total)}`);
  console.log(`  Capital: ${fmt(data.resumen.capital_total)}`);
  console.log(`  Pagado: ${fmt(data.resumen.pagado_total)}\n`);

  for (const f of data.filas) {
    console.log(`  ${f.nombre_completo} (${f.cedula})`);
    console.log(`    Cobrador: ${f.cobrador} | Venció: ${f.fecha_vencimiento} (${f.dias_vencido} días)`);
    console.log(`    Capital: ${fmt(f.monto_desembolsado)} | Pagado: ${fmt(f.total_pagos)} | Saldo: ${fmt(f.saldo_pendiente)}`);
    console.log('');
  }
  console.log('═'.repeat(70) + '\n');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
