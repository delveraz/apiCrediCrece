require('dotenv').config();
const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || process.env.TIDB_HOST;
const port = Number(process.env.DB_PORT || process.env.TIDB_PORT || 4000);
const user = process.env.DB_USER || process.env.TIDB_USER;
const password = process.env.DB_PASSWORD || process.env.TIDB_PASSWORD;
const database = process.env.DB_NAME || process.env.TIDB_DATABASE;
const useSsl =
  process.env.DB_SSL === 'true' ||
  process.env.TIDB_SSL === 'true' ||
  (host && host.includes('tidbcloud.com'));

const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 25),
  queueLimit: 0,
  maxIdle: 10,
  idleTimeout: 60_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: useSsl ? { rejectUnauthorized: true } : undefined,
  timezone: '+00:00',
});

const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

const getConnection = () => pool.getConnection();

module.exports = { pool, query, getConnection };
