require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/db');
const { calcularLiquidacionAnticipada } = require('../utils/finanzasNube');

(async () => {
  const rows = await query(
    `SELECT c.nombre_completo, c.cedula, p.*
     FROM Prestamos p
     JOIN Clientes c ON p.cliente_id = c.id
     WHERE c.nombre_completo LIKE '%Vika%' OR c.nombre_completo LIKE '%Salgado%'`
  );
  if (!rows.length) {
    console.log('Cliente no encontrado');
    process.exit(1);
  }
  const p = rows[0];
  const pagos = await query(
    `SELECT id, monto_pagado, fecha_pago, cobrador_id, registrado_por_admin
     FROM Pagos WHERE prestamo_id = ? AND deleted_at IS NULL ORDER BY fecha_pago`,
    [p.id]
  );
  const pagado = pagos.reduce((s, x) => s + Number(x.monto_pagado), 0);
  const liq = calcularLiquidacionAnticipada(p, new Date(), { pagadoAcumulado: pagado });

  console.log('CLIENTE:', p.nombre_completo, p.cedula);
  console.log('Estado:', p.estado, '| Saldo:', p.saldo_pendiente);
  console.log('Capital:', p.monto_desembolsado, '| Total contrato:', p.monto_total_pagar);
  console.log('Desembolso:', p.fecha_desembolso, '| Plazo:', p.plazo_semanas);
  console.log('Pagado acumulado:', pagado);
  console.log('Liquidacion ahora:', JSON.stringify(liq, null, 2));
  console.log('\nPAGOS:');
  for (const pg of pagos) {
    console.log(' ', String(pg.fecha_pago).slice(0, 19), 'C$', Number(pg.monto_pagado).toFixed(2));
  }

  const cuotas = await query(
    `SELECT fecha_programada, monto_programado, monto_pagado, estado
     FROM Cuotas_Calendario WHERE prestamo_id = ? AND deleted_at IS NULL ORDER BY fecha_programada`,
    [p.id]
  );
  console.log('\nCUOTAS (ultimas 5):');
  cuotas.slice(-5).forEach((c) => console.log(' ', c));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
