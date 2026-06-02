require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { pool, query, getConnection } = require('../config/db');
const { nextClienteId, initSecuenciaCliente } = require('../utils/clienteId');
const { ensureRutaForCobrador, agregarClienteARuta, optimizarOrdenRuta, sincronizarRutasCobradores } = require('../utils/rutas');

const DEMO = [
  {
    primer_nombre: 'Norma', segundo_nombre: null, primer_apellido: 'Rostran', segundo_apellido: null,
    cedula: '001-120876-0015A', telefono: '8788-1234',
    direccion: 'Barrio San Juan, 2c al sur del parque, Esteli',
    actividad_economica: 'Ventas ambulantes',
    latitud: 13.0882, longitud: -86.3578,
    monto: 8000, plazo: 12,
  },
  {
    primer_nombre: 'Carlos', segundo_nombre: 'Alberto', primer_apellido: 'Meza', segundo_apellido: 'Lopez',
    cedula: '001-150990-0020B', telefono: '8654-5678',
    direccion: 'Barrio El Rosario, frente al colegio, Esteli',
    actividad_economica: 'Taller mecanico',
    latitud: 13.0948, longitud: -86.3485,
    monto: 6000, plazo: 12,
  },
  {
    primer_nombre: 'Maria', segundo_nombre: 'Elena', primer_apellido: 'Garcia', segundo_apellido: 'Ruiz',
    cedula: '001-080885-0035C', telefono: '8123-9012',
    direccion: 'Barrio La Trinidad, de la iglesia 1c este, Esteli',
    actividad_economica: 'Pulperia',
    latitud: 13.0855, longitud: -86.3448,
    monto: 5000, plazo: 12,
  },
];

function nombreCompleto(c) {
  return [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ');
}

function calcPrestamo(monto, plazo) {
  const tasa = plazo <= 8 ? 0.2 : plazo <= 12 ? 0.3 : 0.4;
  const interes = monto * tasa;
  const total = monto + interes;
  const cuota = total / plazo;
  return { tasa, total, cuota };
}

async function seedDemo() {
  const conn = await getConnection();
  try {
    await initSecuenciaCliente(query);
    await sincronizarRutasCobradores();

    const hoy = new Date().toISOString().split('T')[0];
    const creados = [];

    for (const d of DEMO) {
      const [existe] = await query('SELECT id FROM Clientes WHERE cedula = ?', [d.cedula]);
      if (existe?.id) {
        console.log(`  ⏭ Cliente ya existe: ${d.cedula}`);
        creados.push(existe.id);
        continue;
      }

      const id = await nextClienteId(conn);
      const nc = nombreCompleto(d);
      await conn.execute(
        `INSERT INTO Clientes (
          id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          nombre_completo, cedula, telefono, direccion, actividad_economica,
          latitud, longitud, is_synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, d.primer_nombre, d.segundo_nombre, d.primer_apellido, d.segundo_apellido,
          nc, d.cedula, d.telefono, d.direccion, d.actividad_economica, d.latitud, d.longitud]
      );

      const calc = calcPrestamo(d.monto, d.plazo);
      const prestamoId = uuidv4();
      await conn.execute(
        `INSERT INTO Prestamos (
          id, cliente_id, monto_desembolsado, plazo_semanas, tasa_interes_aplicada,
          cuota_semanal_base, monto_total_pagar, saldo_pendiente, frecuencia_semana,
          dias_de_cobro, periodicidad, estado, fecha_desembolso, is_synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 3, ?, 'SEMANAL', 'Activo', ?, 1)`,
        [prestamoId, id, d.monto, d.plazo, calc.tasa, calc.cuota, calc.total, calc.total,
          JSON.stringify(['LUNES', 'MIERCOLES', 'VIERNES']), hoy]
      );

      for (let s = 0; s < d.plazo; s++) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - (d.plazo - s - 1) * 7);
        const fStr = fecha.toISOString().split('T')[0];
        await conn.execute(
          `INSERT INTO Cuotas_Calendario (id, prestamo_id, fecha_programada, monto_programado, estado, is_synced)
           VALUES (?, ?, ?, ?, 'Programada', 1)`,
          [uuidv4(), prestamoId, fStr, calc.cuota]
        );
      }

      console.log(`  ✔ ${nc} (${id}) — C$${d.monto}`);
      creados.push(id);
    }

    console.log(`\n✅ ${creados.length} clientes demo listos en Esteli.`);
    console.log('   Asignelos a un cobrador desde Admin → Clientes.\n');
  } finally {
    conn.release();
    await pool.end();
  }
}

seedDemo().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
