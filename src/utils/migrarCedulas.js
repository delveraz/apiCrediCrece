const { query, getConnection } = require('../config/db');
const { normalizarCedula } = require('./cedulaNic');

const necesitaNormalizar = (cedula) => {
  const raw = String(cedula || '');
  const norm = normalizarCedula(raw);
  return norm && norm !== raw;
};

async function normalizarTablaCedulas(conn, tabla) {
  const [rows] = await conn.execute(
    `SELECT id, cedula FROM ${tabla} WHERE deleted_at IS NULL AND cedula IS NOT NULL AND cedula <> ''`
  );
  let actualizados = 0;
  let fusionados = 0;
  const conflictos = [];

  for (const row of rows) {
    const nueva = normalizarCedula(row.cedula);
    if (!nueva || nueva === row.cedula) continue;

    const [dup] = await conn.execute(
      `SELECT id FROM ${tabla} WHERE cedula = ? AND id <> ? AND deleted_at IS NULL LIMIT 1`,
      [nueva, row.id]
    );

    if (dup.length) {
      const keeperId = dup[0].id;
      if (tabla === 'Clientes') {
        await conn.execute(`UPDATE Prestamos SET cliente_id = ? WHERE cliente_id = ?`, [keeperId, row.id]);
        await conn.execute(`UPDATE Fiadores SET cliente_id = ? WHERE cliente_id = ?`, [keeperId, row.id]);
        await conn.execute(`UPDATE Ruta_Clientes SET cliente_id = ? WHERE cliente_id = ?`, [keeperId, row.id]);
      }
      await conn.execute(`UPDATE ${tabla} SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [row.id]);
      fusionados += 1;
      conflictos.push({ tabla, duplicado: row.id, conservado: keeperId, cedula: nueva });
      continue;
    }

    await conn.execute(`UPDATE ${tabla} SET cedula = ?, updated_at = NOW() WHERE id = ?`, [nueva, row.id]);
    actualizados += 1;
  }

  return { actualizados, fusionados, conflictos };
}

/** Normaliza cédulas existentes (sin guiones) en Clientes y Fiadores. */
async function migrarCedulasSinGuion() {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const clientes = await normalizarTablaCedulas(conn, 'Clientes');
    const fiadores = await normalizarTablaCedulas(conn, 'Fiadores');
    await conn.commit();
    const total = clientes.actualizados + fiadores.actualizados;
    const fusion = clientes.fusionados + fiadores.fusionados;
    return {
      success: true,
      actualizados: total,
      fusionados: fusion,
      detalle: { clientes, fiadores },
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { migrarCedulasSinGuion, necesitaNormalizar, normalizarCedula };
