const { query } = require('../config/db');
const { optimizarOrdenVisita } = require('./rutaOptima');

/** Centro de Estelí, Nicaragua — punto de partida cobrador */
const ESTELI_CENTRO = { lat: 13.0914, lng: -86.3534 };

async function ensureRutaForCobrador(cobradorId, nombreCobrador) {
  const rows = await query(
    `SELECT id FROM Rutas WHERE cobrador_id = ? AND activa = 1 AND deleted_at IS NULL LIMIT 1`,
    [cobradorId]
  );
  if (rows[0]?.id) return rows[0].id;

  const rutaId = `RUTA-${cobradorId}`;
  await query(
    `INSERT INTO Rutas (id, nombre, descripcion, cobrador_id, activa, is_synced)
     VALUES (?, ?, ?, ?, 1, 1)
     ON DUPLICATE KEY UPDATE cobrador_id = VALUES(cobrador_id), activa = 1, updated_at = NOW()`,
    [rutaId, `Ruta ${nombreCobrador || cobradorId}`, 'Ruta diaria automatica — Esteli', cobradorId]
  );
  return rutaId;
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
  const cobradores = await query(
    `SELECT u.id, u.nombre_completo FROM Usuarios u
     JOIN Roles r ON u.rol_id = r.id
     WHERE r.nombre = 'COBRADOR' AND u.activo = 1`
  );
  let creadas = 0;
  for (const c of cobradores) {
    const antes = await query(
      `SELECT id FROM Rutas WHERE cobrador_id = ? AND activa = 1 LIMIT 1`,
      [c.id]
    );
    if (!antes.length) {
      await ensureRutaForCobrador(c.id, c.nombre_completo);
      creadas++;
    }
  }
  return { total: cobradores.length, creadas };
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
  ensureRutaForCobrador,
  agregarClienteARuta,
  optimizarOrdenRuta,
  sincronizarRutasCobradores,
  vincularClientesCobradorARuta,
};
