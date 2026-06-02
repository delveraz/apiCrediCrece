const { createHash, randomUUID } = require('crypto');
const { query, getConnection } = require('../config/db');
const { normalizarCedula, validarCedula, CEDULA_RE } = require('./cedulaNic');

const CEDULA_MAX = 40;

const txt = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
};

/** Normaliza cédula para UNIQUE en Fiadores (máx 40 chars). */
const cedulaParaDb = (cedula) => {
  const c = normalizarCedula(txt(cedula));
  if (!c) return null;
  if (CEDULA_RE.test(c)) return c;
  return c.slice(0, CEDULA_MAX);
};

/** Cédula real o identificador estable cuando el cobrador no la capturó aún. */
const cedulaEfectiva = (f, prestamoId = null) => {
  const explicita = cedulaParaDb(f.cedula || f.fiador_cedula);
  if (explicita) return explicita;

  const ref = prestamoId || f.prestamo_id || txt(f.id || f.fiador_id) || null;
  if (!ref) return null;

  const compact = String(ref).replace(/-/g, '');
  const corto = `FI${compact.slice(0, CEDULA_MAX - 2)}`;
  if (corto.length <= CEDULA_MAX) return corto;

  const hash = createHash('sha1').update(String(ref)).digest('hex').slice(0, CEDULA_MAX - 2);
  return `FI${hash}`;
};

const nombreFiador = (f) => txt(f?.nombre_completo || f?.fiador_nombre || f?.nombre);

/** Crea o actualiza fiador en TiDB; devuelve fiador_id o null. */
async function upsertFiadorEnNube(conn, clienteId, f, prestamoId = null) {
  const nombre = nombreFiador(f);
  if (!nombre) return null;
  if (!clienteId) return null;

  let cedula = cedulaEfectiva(f, prestamoId || f.prestamo_id || f.id);
  if (!cedula) return null;
  if (CEDULA_RE.test(cedula)) {
    const v = validarCedula(cedula);
    if (!v.ok) return null;
    cedula = v.cedula;
  }

  const telefono = txt(f.telefono || f.fiador_telefono);
  const direccion = txt(f.direccion || f.fiador_direccion);
  const idLocal = txt(f.id || f.fiador_id);

  const [clienteOk] = await conn.execute('SELECT id FROM Clientes WHERE id = ? LIMIT 1', [clienteId]);
  if (!clienteOk.length) {
    throw new Error(`Cliente ${clienteId} no existe para vincular fiador.`);
  }

  const [byCedula] = await conn.execute('SELECT id FROM Fiadores WHERE cedula = ? LIMIT 1', [cedula]);
  if (byCedula.length) {
    const fid = byCedula[0].id;
    await conn.execute(
      `UPDATE Fiadores SET cliente_id = ?, nombre_completo = ?, telefono = ?, direccion = ?, is_synced = 1, updated_at = NOW()
       WHERE id = ?`,
      [clienteId, nombre, telefono, direccion, fid]
    );
    return fid;
  }

  let fid = idLocal;
  if (fid) {
    const [byId] = await conn.execute('SELECT id FROM Fiadores WHERE id = ? LIMIT 1', [fid]);
    if (byId.length) {
      await conn.execute(
        `UPDATE Fiadores SET cliente_id = ?, cedula = ?, nombre_completo = ?, telefono = ?, direccion = ?, is_synced = 1, updated_at = NOW()
         WHERE id = ?`,
        [clienteId, cedula, nombre, telefono, direccion, fid]
      );
      return fid;
    }
  }

  fid = fid || randomUUID();
  try {
    await conn.execute(
      `INSERT INTO Fiadores (id, cliente_id, cedula, nombre_completo, telefono, direccion, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [fid, clienteId, cedula, nombre, telefono, direccion]
    );
  } catch (err) {
    if (String(err.message || '').includes('is_synced')) {
      await conn.execute(
        `INSERT INTO Fiadores (id, cliente_id, cedula, nombre_completo, telefono, direccion)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fid, clienteId, cedula, nombre, telefono, direccion]
      );
    } else {
      throw err;
    }
  }
  return fid;
}

async function verificarFiadorEnNube(conn, fid) {
  if (!fid) return false;
  try {
    const [rows] = await conn.execute('SELECT id FROM Fiadores WHERE id = ? LIMIT 1', [fid]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Crea/actualiza fiador y asigna solo Prestamos.fiador_id (sin columnas inline). */
async function vincularFiadorAPrestamo(conn, prestamoId, clienteId, datos) {
  if (!nombreFiador(datos)) return null;

  const fid = await upsertFiadorEnNube(conn, clienteId, datos, prestamoId);
  if (!fid || !(await verificarFiadorEnNube(conn, fid))) return null;

  await conn.execute(
    `UPDATE Prestamos SET fiador_id = ?, updated_at = NOW() WHERE id = ?`,
    [fid, prestamoId]
  );
  return fid;
}

/** Migra datos inline legacy en Prestamos → Fiadores y limpia columnas inline. */
async function migrarInlineFiadoresPrestamos(connExterno = null) {
  let filas = [];
  try {
    filas = await query(
      `SELECT p.id, p.cliente_id, p.fiador_id, p.fiador_nombre, p.fiador_cedula, p.fiador_telefono, p.fiador_direccion
       FROM Prestamos p
       WHERE p.deleted_at IS NULL
         AND p.fiador_nombre IS NOT NULL AND TRIM(p.fiador_nombre) != ''`
    );
  } catch {
    return 0;
  }

  if (!filas.length) return 0;

  const conn = connExterno || (await getConnection());
  const release = !connExterno;
  let migrados = 0;

  try {
    if (!connExterno) await conn.beginTransaction();
    for (const p of filas) {
      const datos = {
        id: p.fiador_id || undefined,
        fiador_id: p.fiador_id || undefined,
        nombre_completo: p.fiador_nombre,
        cedula: p.fiador_cedula,
        telefono: p.fiador_telefono,
        direccion: p.fiador_direccion,
      };
      const fid = await vincularFiadorAPrestamo(conn, p.id, p.cliente_id, datos);
      if (fid) migrados++;
    }

    for (const col of ['fiador_nombre', 'fiador_cedula', 'fiador_telefono', 'fiador_direccion']) {
      try {
        await conn.execute(`UPDATE Prestamos SET ${col} = NULL WHERE ${col} IS NOT NULL`);
      } catch {
        /* columna ya eliminada */
      }
    }

    if (!connExterno) await conn.commit();
  } catch (e) {
    if (!connExterno) await conn.rollback();
    console.error('Error migrando inline fiadores:', e.message);
    return migrados;
  } finally {
    if (release) conn.release();
  }
  return migrados;
}

/** Repara préstamos con fiador_id inválido o sin fila en Fiadores. */
async function repararFiadoresHistoricos(connExterno = null) {
  await migrarInlineFiadoresPrestamos(connExterno);

  let filas = [];
  try {
    filas = await query(
      `SELECT p.id, p.cliente_id, p.fiador_id
       FROM Prestamos p
       WHERE p.deleted_at IS NULL
         AND p.fiador_id IS NOT NULL AND TRIM(p.fiador_id) != ''
         AND NOT EXISTS (SELECT 1 FROM Fiadores f WHERE f.id = p.fiador_id)`
    );
  } catch (e) {
    console.warn('Reparacion fiadores omitida:', e.message);
    return 0;
  }

  if (!filas.length) return 0;

  const conn = connExterno || (await getConnection());
  const release = !connExterno;
  let reparados = 0;

  try {
    if (!connExterno) await conn.beginTransaction();
    for (const p of filas) {
      try {
        await conn.execute('UPDATE Prestamos SET fiador_id = NULL WHERE id = ?', [p.id]);
        reparados++;
      } catch (e) {
        console.warn(`No se pudo limpiar fiador_id huérfano ${p.id}:`, e.message);
      }
    }
    if (!connExterno) await conn.commit();
  } catch (e) {
    if (!connExterno) await conn.rollback();
    console.error('Error reparando fiadores:', e.message);
  } finally {
    if (release) conn.release();
  }
  return reparados;
}

module.exports = {
  upsertFiadorEnNube,
  verificarFiadorEnNube,
  vincularFiadorAPrestamo,
  migrarInlineFiadoresPrestamos,
  repararFiadoresHistoricos,
  cedulaEfectiva,
  cedulaParaDb,
  nombreFiador,
};
