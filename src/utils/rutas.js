const { query } = require('../config/db');
const { optimizarOrdenVisita } = require('./rutaOptima');

/** Centro de Estelí, Nicaragua — punto de partida cobrador */
const ESTELI_CENTRO = { lat: 13.0914, lng: -86.3534 };

async function obtenerRutaIdOperador(operadorId) {
  const rows = await query(
    `SELECT id FROM Rutas WHERE cobrador_id = ? AND activa = 1 AND deleted_at IS NULL LIMIT 1`,
    [operadorId]
  );
  return rows[0]?.id || null;
}

async function ensureRutaForOperador(operadorId, nombreOperador, descripcion = 'Ruta diaria automatica — Esteli') {
  const existente = await obtenerRutaIdOperador(operadorId);
  if (existente) return existente;

  const rutaId = `RUTA-${operadorId}`;
  await query(
    `INSERT INTO Rutas (id, nombre, descripcion, cobrador_id, activa, is_synced)
     VALUES (?, ?, ?, ?, 1, 1)
     ON DUPLICATE KEY UPDATE cobrador_id = VALUES(cobrador_id), activa = 1, updated_at = NOW()`,
    [rutaId, `Ruta ${nombreOperador || operadorId}`, descripcion, operadorId]
  );
  return rutaId;
}

async function ensureRutaForCobrador(cobradorId, nombreCobrador) {
  return ensureRutaForOperador(cobradorId, nombreCobrador);
}

async function quitarClienteDeRutaOperador(operadorId, clienteId) {
  const rutaId = await obtenerRutaIdOperador(operadorId);
  if (!rutaId) return false;
  await query(`DELETE FROM Ruta_Clientes WHERE ruta_id = ? AND cliente_id = ?`, [rutaId, clienteId]);
  return true;
}

async function listarIdsClientesEnRuta(operadorId) {
  const rutaId = await obtenerRutaIdOperador(operadorId);
  if (!rutaId) return [];
  const rows = await query(
    `SELECT cliente_id FROM Ruta_Clientes WHERE ruta_id = ? ORDER BY orden_visita`,
    [rutaId]
  );
  return rows.map((r) => r.cliente_id);
}

async function agregarClienteARuta(rutaId, clienteId) {
  const [maxOrden] = await query(
    `SELECT COALESCE(MAX(orden_visita), 0) AS m FROM Ruta_Clientes WHERE ruta_id = ?`,
    [rutaId]
  );
  const orden = (maxOrden?.m || 0) + 1;
  await query(
    `INSERT INTO Ruta_Clientes (ruta_id, cliente_id, orden_visita)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE ruta_id = VALUES(ruta_id)`,
    [rutaId, clienteId, orden]
  );
}

async function optimizarOrdenRuta(rutaId, startLat = ESTELI_CENTRO.lat, startLng = ESTELI_CENTRO.lng) {
  const clientes = await query(
    `SELECT c.id, c.latitud, c.longitud
     FROM Clientes c
     JOIN Ruta_Clientes rc ON c.id = rc.cliente_id
     WHERE rc.ruta_id = ? AND c.deleted_at IS NULL`,
    [rutaId]
  );
  if (!clientes.length) return;

  const ordenados = optimizarOrdenVisita(clientes, startLat, startLng);
  if (!ordenados.length) return;

  const cases = ordenados.map((c, i) => `WHEN '${c.id.replace(/'/g, "''")}' THEN ${i + 1}`).join(' ');
  const ids = ordenados.map((c) => `'${c.id.replace(/'/g, "''")}'`).join(',');
  await query(
    `UPDATE Ruta_Clientes SET orden_visita = CASE cliente_id ${cases} END
     WHERE ruta_id = ? AND cliente_id IN (${ids})`,
    [rutaId]
  );
}

async function sincronizarRutasCobradores() {
  const operadores = await query(
    `SELECT u.id, u.nombre_completo, r.nombre AS rol FROM Usuarios u
     JOIN Roles r ON u.rol_id = r.id
     WHERE r.nombre IN ('COBRADOR', 'ADMIN') AND u.activo = 1 AND u.deleted_at IS NULL`
  );
  let creadas = 0;
  for (const c of operadores) {
    const antes = await query(
      `SELECT id FROM Rutas WHERE cobrador_id = ? AND activa = 1 LIMIT 1`,
      [c.id]
    );
    if (!antes.length) {
      const desc =
        c.rol === 'ADMIN' ? 'Ruta campo administrador — Esteli' : 'Ruta diaria automatica — Esteli';
      await ensureRutaForOperador(c.id, c.nombre_completo, desc);
      creadas++;
    }
  }
  return { total: operadores.length, creadas };
}

async function vincularClientesCobradorARuta(cobradorId) {
  const rutaId = await ensureRutaForCobrador(cobradorId);
  const clientes = await query(
    `SELECT id FROM Clientes WHERE cobrador_id = ? AND deleted_at IS NULL`,
    [cobradorId]
  );
  for (const cl of clientes) {
    await agregarClienteARuta(rutaId, cl.id);
  }
  await optimizarOrdenRuta(rutaId);
  return rutaId;
}

module.exports = {
  ESTELI_CENTRO,
  ensureRutaForOperador,
  ensureRutaForCobrador,
  obtenerRutaIdOperador,
  quitarClienteDeRutaOperador,
  listarIdsClientesEnRuta,
  agregarClienteARuta,
  optimizarOrdenRuta,
  sincronizarRutasCobradores,
  vincularClientesCobradorARuta,
};
