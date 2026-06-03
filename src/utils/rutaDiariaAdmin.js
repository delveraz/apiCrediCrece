const { query } = require('../config/db');
const { leerParametrosFinancieros } = require('../utils/parametrosFinancieros');
const { initSecuenciaCliente } = require('../utils/clienteId');
const { diaCobroHoy, incluyeDiaHoy, montoVisitaHoy } = require('../utils/diasCobro');
const { rangoDiaLocal } = require('../utils/fechasSql');

/**
 * Ruta del día para administrador: todos los clientes con crédito activo (día de cobro de hoy).
 */
async function loadAgendaAdminHoy() {
    const hoy = new Date().toISOString().split('T')[0];
    const { inicio: diaIni, fin: diaFin } = rangoDiaLocal(hoy);
    await initSecuenciaCliente(query);
    const secRows = await query(`SELECT valor FROM Parametros_Globales WHERE clave = 'SEC_CLIENTE'`);
    const secuencia = secRows[0]?.valor || '0';

    const clientes = await query(
      `SELECT DISTINCT c.*,
              COALESCE(rc.orden_visita, 999) AS orden_visita,
              rc.ruta_id,
              u.nombre_completo AS cobrador_asignado,
              c.cobrador_id AS cobrador_asignado_id
       FROM Clientes c
       INNER JOIN Prestamos p ON p.cliente_id = c.id AND p.estado = 'Activo' AND p.deleted_at IS NULL
       LEFT JOIN Ruta_Clientes rc ON c.id = rc.cliente_id
       LEFT JOIN Rutas r ON rc.ruta_id = r.id AND r.activa = 1 AND r.deleted_at IS NULL
       LEFT JOIN Usuarios u ON c.cobrador_id = u.id AND u.deleted_at IS NULL
       WHERE c.deleted_at IS NULL
       ORDER BY c.cobrador_id, orden_visita ASC, c.nombre_completo ASC`
    );

    const rutas = await query(
      `SELECT * FROM Rutas WHERE activa = 1 AND deleted_at IS NULL ORDER BY cobrador_id`
    );

    const rutaIds = rutas.map((r) => r.id);
    let ruta_clientes = [];
    if (rutaIds.length) {
      const ph = rutaIds.map(() => '?').join(',');
      ruta_clientes = await query(
        `SELECT rc.ruta_id, rc.cliente_id, rc.orden_visita FROM Ruta_Clientes rc WHERE rc.ruta_id IN (${ph})`,
        rutaIds
      );
    }

    const clienteIds = clientes.map((c) => c.id);
    let prestamos = [];
    let cuotas = [];
    let fiadores = [];

    if (clienteIds.length) {
      const ph2 = clienteIds.map(() => '?').join(',');
      const activosRows = await query(
        `SELECT * FROM Prestamos WHERE cliente_id IN (${ph2}) AND estado = 'Activo' AND deleted_at IS NULL
         ORDER BY fecha_desembolso DESC`,
        clienteIds
      );
      const activoPorCliente = new Map();
      for (const p of activosRows) {
        if (!activoPorCliente.has(p.cliente_id)) activoPorCliente.set(p.cliente_id, p);
      }
      prestamos = [...activoPorCliente.values()];
      const prestamoIds = prestamos.map((p) => p.id);
      if (prestamoIds.length) {
        const ph3 = prestamoIds.map(() => '?').join(',');
        cuotas = await query(
          `SELECT * FROM Cuotas_Calendario
           WHERE prestamo_id IN (${ph3}) AND estado IN ('Programada','Parcial')
             AND fecha_programada <= ? AND deleted_at IS NULL
           ORDER BY fecha_programada`,
          [...prestamoIds, hoy]
        );
        const fiadorIds = [...new Set(prestamos.map((p) => p.fiador_id).filter(Boolean))];
        if (fiadorIds.length) {
          const phF = fiadorIds.map(() => '?').join(',');
          fiadores = await query(`SELECT * FROM Fiadores WHERE id IN (${phF}) AND deleted_at IS NULL`, fiadorIds);
        } else {
          fiadores = await query(
            `SELECT * FROM Fiadores WHERE cliente_id IN (${ph2}) AND deleted_at IS NULL`,
            clienteIds
          );
        }
      }
    }

    const hoyDia = diaCobroHoy();
    const agenda = [];
    let pagos_hoy = [];
    let gestiones_hoy = [];

    if (clienteIds.length) {
      const ph2 = clienteIds.map(() => '?').join(',');
      pagos_hoy = await query(
        `SELECT pg.*, p.cliente_id
         FROM Pagos pg
         INNER JOIN Prestamos p ON pg.prestamo_id = p.id
         WHERE pg.fecha_pago >= ? AND pg.fecha_pago < ?
           AND pg.deleted_at IS NULL
           AND p.cliente_id IN (${ph2})`,
        [diaIni, diaFin, ...clienteIds]
      );
      gestiones_hoy = await query(
        `SELECT g.*, p.cliente_id
         FROM Gestiones_No_Pago g
         INNER JOIN Prestamos p ON g.prestamo_id = p.id
         WHERE g.fecha_gestion >= ? AND g.fecha_gestion < ?
           AND g.deleted_at IS NULL
           AND p.cliente_id IN (${ph2})`,
        [diaIni, diaFin, ...clienteIds]
      );
    }

    const pagoPorPrestamo = new Map(pagos_hoy.map((pg) => [pg.prestamo_id, pg]));
    const gestionPorPrestamo = new Map(gestiones_hoy.map((g) => [g.prestamo_id, g]));
    const prestamosEnAgenda = new Set();
    const prestamoPorId = new Map(prestamos.map((p) => [p.id, p]));

    const estadoVisitaDesdePago = (prestamoId) => {
      const pg = pagoPorPrestamo.get(prestamoId);
      if (!pg) return null;
      if (Number(pg.registrado_por_admin) === 1) return 'cobrado_admin';
      return 'cobrado';
    };

    const pushAgendaItem = (c, p, cuotaPend, extra = {}) => {
      if (!p?.id || prestamosEnAgenda.has(p.id)) return;
      prestamosEnAgenda.add(p.id);
      const montoDia = cuotaPend
        ? Number(cuotaPend.monto_programado) - Number(cuotaPend.monto_pagado || 0)
        : montoVisitaHoy(p.cuota_semanal_base, p.dias_de_cobro);
      const ev =
        extra.estado_visita ??
        (pagoPorPrestamo.has(p.id)
          ? estadoVisitaDesdePago(p.id)
          : gestionPorPrestamo.has(p.id)
            ? 'no_pago'
            : 'pendiente');
      agenda.push({
        cuota_id: cuotaPend?.id || `visita-${p.id}`,
        prestamo_id: p.id,
        monto_programado: extra.monto_programado ?? montoDia,
        monto_pagado: cuotaPend?.monto_pagado || extra.monto_pagado || 0,
        fecha_programada: cuotaPend?.fecha_programada || hoy,
        estado_cuota: cuotaPend?.estado || extra.estado_cuota || 'Programada',
        cliente_id: c.id,
        nombre_completo: c.nombre_completo,
        telefono: c.telefono,
        direccion: c.direccion,
        cedula: c.cedula,
        latitud: c.latitud,
        longitud: c.longitud,
        orden_visita: c.orden_visita,
        saldo_pendiente: p.saldo_pendiente,
        cuota_semanal_base: p.cuota_semanal_base,
        dias_de_cobro: p.dias_de_cobro,
        monto_total_pagar: p.monto_total_pagar,
        estado_prestamo: p.estado,
        dia_cobro: hoyDia,
        cobrador_asignado: c.cobrador_asignado || null,
        cobrador_asignado_id: c.cobrador_asignado_id || c.cobrador_id || null,
        tipo_visita: extra.tipo_visita || 'activo',
        etiqueta_visita:
          extra.etiqueta_visita ||
          (ev === 'cobrado_admin' ? 'Cobrado por administrador' : null),
        estado_visita: ev,
        pago_hoy_id: extra.pago_hoy_id ?? pagoPorPrestamo.get(p.id)?.id ?? null,
      });
    };

    for (const c of clientes) {
      const p = prestamos.find((x) => x.cliente_id === c.id);
      if (p && incluyeDiaHoy(p.dias_de_cobro)) {
        const cuotaPend = cuotas.find((cc) => cc.prestamo_id === p.id);
        pushAgendaItem(c, p, cuotaPend);
      }
      for (const pg of pagos_hoy.filter((x) => x.cliente_id === c.id)) {
        if (prestamosEnAgenda.has(pg.prestamo_id)) continue;
        const pExtra = prestamoPorId.get(pg.prestamo_id);
        if (!pExtra) continue;
        const esLiquidacion = pExtra.estado === 'Pagado' || Number(pExtra.saldo_pendiente || 0) <= 0;
        const ev = Number(pg.registrado_por_admin) === 1 ? 'cobrado_admin' : 'cobrado';
        pushAgendaItem(c, pExtra, null, {
          monto_programado: Number(pg.monto_pagado),
          monto_pagado: Number(pg.monto_pagado),
          estado_cuota: 'Pagada',
          tipo_visita: esLiquidacion ? 'liquidado' : 'cobrado',
          etiqueta_visita: esLiquidacion ? 'Liquidación' : ev === 'cobrado_admin' ? 'Cobrado por administrador' : 'Cobro registrado',
          estado_visita: ev,
          pago_hoy_id: pg.id,
        });
      }
    }

    agenda.sort((a, b) => {
      const o = (a.orden_visita ?? 999) - (b.orden_visita ?? 999);
      if (o !== 0) return o;
      return String(a.nombre_completo || '').localeCompare(String(b.nombre_completo || ''));
    });

    return {
      serverTime: new Date().toISOString(),
      secuencia,
      dia_cobro: hoyDia,
      vista_admin: true,
      parametros_financieros: await leerParametrosFinancieros(query),
      data: { rutas, ruta_clientes, clientes, prestamos, cuotas, fiadores, agenda, pagos_hoy, gestiones_hoy },
    };
}

async function buildRutaDiariaAdmin(req, res) {
  try {
    const payload = await loadAgendaAdminHoy();
    return res.json({ success: true, ...payload });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { buildRutaDiariaAdmin, loadAgendaAdminHoy };
