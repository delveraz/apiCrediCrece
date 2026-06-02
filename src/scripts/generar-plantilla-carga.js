/**
 * Genera plantilla Excel vacía para carga masiva.
 * Salida: app-financiera/assets/plantilla_carga_masiva.xlsx
 *
 * Uso: npm run plantilla-carga
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { query, pool } = require('../config/db');

const COLUMNAS = [
  'cedula',
  'primer_nombre',
  'primer_apellido',
  'segundo_nombre',
  'segundo_apellido',
  'nombre_completo',
  'telefono',
  'direccion',
  'actividad_economica',
  'cobrador_email',
  'monto_desembolsado',
  'plazo_semanas',
  'tasa_mensual',
  'dias_cobro',
  'fecha_desembolso',
  'saldo_pendiente',
  'semanas_pagadas',
  'latitud',
  'longitud',
  'orden_visita',
];

const INSTRUCCIONES = [
  {
    campo: 'cedula',
    nota: 'Obligatorio. 14 caracteres: 13 números + 1 letra mayúscula, sin guiones (ej. 0011208760015A).',
  },
  { campo: 'cobrador_email', nota: 'Email del cobrador activo (hoja Cobradores).' },
  { campo: 'monto_desembolsado', nota: 'Capital del crédito.' },
  { campo: 'plazo_semanas', nota: 'Semanas del plan.' },
  { campo: 'tasa_mensual', nota: '10 = 10% por mes.' },
  { campo: 'dias_cobro', nota: 'LUNES,MIERCOLES,VIERNES' },
  { campo: 'fecha_desembolso', nota: 'YYYY-MM-DD' },
  { campo: 'saldo_pendiente', nota: 'Saldo actual del crédito en curso.' },
  { campo: 'semanas_pagadas', nota: 'Semanas ya cobradas.' },
];

async function main() {
  const cobradores = await query(
    `SELECT u.id, u.email, u.nombre_completo FROM Usuarios u
     JOIN Roles r ON u.rol_id = r.id WHERE r.nombre = 'COBRADOR' AND u.activo = 1
     ORDER BY u.nombre_completo`
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([], { header: COLUMNAS }), 'Cartera');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(INSTRUCCIONES), 'Instrucciones');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      cobradores.map((c) => ({
        cobrador_email: c.email,
        cobrador_id: c.id,
        nombre: c.nombre_completo,
      }))
    ),
    'Cobradores'
  );

  const outDir = path.join(__dirname, '../../../app-financiera/assets');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'plantilla_carga_masiva.xlsx');
  XLSX.writeFile(wb, outPath);

  const csvPath = path.join(outDir, 'plantilla_carga_masiva.csv');
  const ws = wb.Sheets.Cartera;
  fs.writeFileSync(csvPath, XLSX.utils.sheet_to_csv(ws), 'utf8');

  console.log('Plantilla generada:');
  console.log(' ', outPath);
  console.log(' ', csvPath);

  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
