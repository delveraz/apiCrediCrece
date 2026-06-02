const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const DDL_PATH = path.join(__dirname, '../../../app-financiera/src/database/ddl_tidb_cloud.sql');

async function migrate() {
  const sql = fs.readFileSync(DDL_PATH, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  const conn = await pool.getConnection();
  try {
    for (const statement of statements) {
      await conn.query(statement);
      console.log('✔', statement.slice(0, 60).replace(/\n/g, ' '), '...');
    }
    console.log('\n🚀 Migración TiDB Cloud completada.');
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('❌ Error en migración:', err.message);
  process.exit(1);
});
