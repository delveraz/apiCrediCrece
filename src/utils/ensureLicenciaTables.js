const { query } = require('../config/db');

let listo = false;

async function ensureLicenciaTables() {
  if (listo) return;
  const sqls = [
    `CREATE TABLE IF NOT EXISTS Licencias_Codigos (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      device_id VARCHAR(64) NOT NULL,
      codigo_hash VARCHAR(120) NOT NULL,
      etiqueta VARCHAR(120) DEFAULT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_lic_cod_device (device_id),
      KEY idx_lic_cod_exp (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
    `CREATE TABLE IF NOT EXISTS Licencias_Activados (
      device_id VARCHAR(64) NOT NULL PRIMARY KEY,
      activado_at DATETIME NOT NULL,
      KEY idx_lic_act_fecha (activado_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  ];
  for (const sql of sqls) {
    await query(sql);
  }
  listo = true;
}

module.exports = { ensureLicenciaTables };
