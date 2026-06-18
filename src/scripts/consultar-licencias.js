/**
 * Consulta solicitudes de activación en Licencias_Codigos.
 * Uso: node src/scripts/consultar-licencias.js
 */
require('dotenv').config();
const { query } = require('../config/db');

async function main() {
  const [nowRow] = await query('SELECT NOW() AS server_now, UTC_TIMESTAMP() AS utc_now');
  console.log('Servidor DB:', nowRow);

  const recientes = await query(
    `SELECT id, device_id, etiqueta, solicitud_ip, device_marca, device_modelo, device_os, app_version,
            geo_ciudad, geo_region, geo_pais, geo_isp, created_at, expires_at, used_at
     FROM Licencias_Codigos
     ORDER BY created_at DESC
     LIMIT 30`
  );
  console.log('\n--- Últimas 30 solicitudes ---');
  console.table(recientes);

  const manana = await query(
    `SELECT id, device_id, etiqueta, created_at, used_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS hora_utc,
            DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '-06:00'), '%Y-%m-%d %H:%i:%s') AS hora_nicaragua
     FROM Licencias_Codigos
     WHERE HOUR(CONVERT_TZ(created_at, '+00:00', '-06:00')) = 6
       AND MINUTE(CONVERT_TZ(created_at, '+00:00', '-06:00')) BETWEEN 15 AND 25
       AND DATE(CONVERT_TZ(created_at, '+00:00', '-06:00')) >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
     ORDER BY created_at DESC`
  );
  console.log('\n--- Solicitudes ~6:15-6:25 AM (Nicaragua), últimos 3 días ---');
  console.table(manana);

  const hoy = await query(
    `SELECT id, device_id, etiqueta, created_at,
            DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '-06:00'), '%H:%i:%s') AS hora_nic
     FROM Licencias_Codigos
     WHERE DATE(CONVERT_TZ(created_at, '+00:00', '-06:00')) = CURDATE()
     ORDER BY created_at ASC`
  );
  console.log('\n--- Solicitudes de hoy (fecha servidor DB) ---');
  console.table(hoy);

  const activados = await query(
    `SELECT device_id, activado_at,
            DATE_FORMAT(CONVERT_TZ(activado_at, '+00:00', '-06:00'), '%Y-%m-%d %H:%i:%s') AS hora_nic
     FROM Licencias_Activados
     ORDER BY activado_at DESC
     LIMIT 10`
  );
  console.log('\n--- Dispositivos activados (recientes) ---');
  console.table(activados);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
