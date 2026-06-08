-- Vistas de reporte para TiDB Cloud — legibles sin la app, exportables a Excel.
-- Aplicar: npm run vistas-reporte

CREATE OR REPLACE VIEW v_clientes AS
SELECT
  c.id AS cliente_id,
  c.cedula AS cedula,
  c.primer_nombre AS primer_nombre,
  c.segundo_nombre AS segundo_nombre,
  c.primer_apellido AS primer_apellido,
  c.segundo_apellido AS segundo_apellido,
  c.nombre_completo AS nombre_completo,
  c.telefono AS telefono,
  c.direccion AS direccion,
  c.actividad_economica AS actividad_economica,
  c.latitud AS latitud,
  c.longitud AS longitud,
  c.cobrador_id AS cobrador_asignado_id,
  uc.nombre_completo AS cobrador_asignado_nombre,
  c.created_at AS fecha_registro,
  c.updated_at AS ultima_actualizacion
FROM Clientes c
LEFT JOIN Usuarios uc ON c.cobrador_id = uc.id AND uc.deleted_at IS NULL
WHERE c.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_prestamos AS
SELECT
  p.id AS prestamo_id,
  p.cliente_id AS cliente_id,
  c.nombre_completo AS cliente_nombre,
  c.cedula AS cliente_cedula,
  p.fiador_id AS fiador_id,
  f.nombre_completo AS fiador_nombre,
  p.monto_desembolsado AS monto_desembolsado,
  p.plazo_semanas AS plazo_semanas,
  p.tasa_interes_aplicada AS tasa_interes_mensual,
  p.cuota_semanal_base AS cuota_semanal,
  p.monto_total_pagar AS monto_total_pagar,
  p.saldo_pendiente AS saldo_pendiente,
  p.dias_de_cobro AS dias_de_cobro_json,
  p.periodicidad AS periodicidad,
  p.estado AS estado_prestamo,
  p.fecha_desembolso AS fecha_desembolso,
  p.numero_recibo_fisico AS numero_recibo_fisico,
  p.renovacion_previa_id AS renovacion_previa_id,
  ur.nombre_completo AS registrado_por,
  ue.nombre_completo AS entregado_por,
  p.updated_at AS ultima_actualizacion
FROM Prestamos p
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Fiadores f ON p.fiador_id = f.id AND f.deleted_at IS NULL
LEFT JOIN Usuarios ur ON p.cobrador_registro_id = ur.id
LEFT JOIN Usuarios ue ON p.cobrador_entrega_id = ue.id
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_cuotas_calendario AS
SELECT
  cc.id AS cuota_id,
  cc.prestamo_id AS prestamo_id,
  c.nombre_completo AS cliente_nombre,
  c.cedula AS cliente_cedula,
  cc.fecha_programada AS fecha_programada,
  cc.monto_programado AS monto_programado,
  cc.monto_pagado AS monto_pagado,
  (cc.monto_programado - COALESCE(cc.monto_pagado, 0)) AS monto_pendiente,
  cc.estado AS estado_cuota,
  u.nombre_completo AS cobrador_cuota,
  p.saldo_pendiente AS saldo_prestamo,
  p.estado AS estado_prestamo
FROM Cuotas_Calendario cc
JOIN Prestamos p ON cc.prestamo_id = p.id AND p.deleted_at IS NULL
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios u ON cc.cobrador_id = u.id
WHERE cc.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_pagos AS
SELECT
  pg.id AS pago_id,
  pg.prestamo_id AS prestamo_id,
  c.id AS cliente_id,
  c.nombre_completo AS cliente_nombre,
  c.cedula AS cliente_cedula,
  pg.monto_pagado AS monto_cobrado,
  pg.fecha_pago AS fecha_hora_cobro,
  DATE(pg.fecha_pago) AS fecha_cobro,
  pg.cobrador_id AS cobrador_id,
  uc.nombre_completo AS cobrador_nombre,
  pg.operador_id AS operador_id,
  uo.nombre_completo AS operador_nombre,
  CASE WHEN COALESCE(pg.registrado_por_admin, 0) = 1 THEN 'SI' ELSE 'NO' END AS cobrado_por_admin,
  pg.latitud AS latitud,
  pg.longitud AS longitud,
  p.saldo_pendiente AS saldo_prestamo_despues,
  p.estado AS estado_prestamo,
  pg.editado_por_admin_at AS corregido_por_admin_en
FROM Pagos pg
JOIN Prestamos p ON pg.prestamo_id = p.id AND p.deleted_at IS NULL
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios uc ON pg.cobrador_id = uc.id
LEFT JOIN Usuarios uo ON pg.operador_id = uo.id
WHERE pg.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_gestiones_no_pago AS
SELECT
  g.id AS gestion_id,
  g.prestamo_id AS prestamo_id,
  c.id AS cliente_id,
  c.nombre_completo AS cliente_nombre,
  c.cedula AS cliente_cedula,
  g.motivo AS motivo,
  g.fecha_gestion AS fecha_hora_gestion,
  DATE(g.fecha_gestion) AS fecha_gestion,
  g.cobrador_id AS cobrador_id,
  uc.nombre_completo AS cobrador_nombre,
  g.operador_id AS operador_id,
  uo.nombre_completo AS operador_nombre,
  CASE WHEN COALESCE(g.registrado_por_admin, 0) = 1 THEN 'SI' ELSE 'NO' END AS registrado_por_admin,
  g.latitud AS latitud,
  g.longitud AS longitud,
  p.saldo_pendiente AS saldo_prestamo
FROM Gestiones_No_Pago g
JOIN Prestamos p ON g.prestamo_id = p.id AND p.deleted_at IS NULL
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios uc ON g.cobrador_id = uc.id
LEFT JOIN Usuarios uo ON g.operador_id = uo.id
WHERE g.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_renovaciones AS
SELECT
  r.id AS renovacion_id,
  r.prestamo_anterior_id AS prestamo_anterior_id,
  r.prestamo_nuevo_id AS prestamo_nuevo_id,
  ca.nombre_completo AS cliente_nombre,
  ca.cedula AS cliente_cedula,
  r.saldo_pendiente_anterior AS saldo_anterior,
  r.nuevo_desembolso AS nuevo_desembolso,
  r.base_nominal AS base_nominal,
  r.tasa_aplicada AS tasa_aplicada,
  r.monto_total_a_pagar AS monto_total_nuevo,
  r.cuota_semanal AS cuota_semanal_nueva,
  r.plazo_semanas AS plazo_semanas,
  r.efectivo_entregar AS efectivo_entregar,
  r.fecha_renovacion AS fecha_hora_renovacion,
  DATE(r.fecha_renovacion) AS fecha_renovacion,
  uo.nombre_completo AS opero_por,
  ue.nombre_completo AS entregado_por
FROM Renovaciones_Log r
LEFT JOIN Prestamos pa ON r.prestamo_anterior_id = pa.id
LEFT JOIN Clientes ca ON pa.cliente_id = ca.id
LEFT JOIN Usuarios uo ON r.cobrador_opero_id = uo.id
LEFT JOIN Usuarios ue ON r.cobrador_entrega_id = ue.id
WHERE r.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_rutas_clientes AS
SELECT
  rt.id AS ruta_id,
  rt.nombre AS ruta_nombre,
  rt.descripcion AS ruta_descripcion,
  rt.cobrador_id AS operador_id,
  u.nombre_completo AS operador_nombre,
  rol.nombre AS rol_operador,
  rc.cliente_id AS cliente_id,
  c.nombre_completo AS cliente_nombre,
  c.cedula AS cliente_cedula,
  rc.orden_visita AS orden_visita,
  uc.nombre_completo AS cobrador_asignado_cliente
FROM Ruta_Clientes rc
JOIN Rutas rt ON rc.ruta_id = rt.id AND rt.deleted_at IS NULL AND rt.activa = 1
JOIN Clientes c ON rc.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios u ON rt.cobrador_id = u.id
LEFT JOIN Roles rol ON u.rol_id = rol.id
LEFT JOIN Usuarios uc ON c.cobrador_id = uc.id;

CREATE OR REPLACE VIEW v_cierres_caja AS
SELECT
  cc.id AS cierre_id,
  cc.cobrador_id AS cobrador_id,
  u.nombre_completo AS cobrador_nombre,
  cc.fecha_cierre AS fecha_cierre,
  cc.monto_efectivo AS monto_efectivo,
  cc.transacciones AS cantidad_transacciones,
  cc.observaciones AS observaciones,
  cc.latitud AS latitud,
  cc.longitud AS longitud
FROM Cierre_Caja cc
LEFT JOIN Usuarios u ON cc.cobrador_id = u.id
WHERE cc.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_cartera_activa AS
SELECT
  p.id AS prestamo_id,
  c.id AS cliente_id,
  c.cedula AS cedula,
  c.nombre_completo AS cliente_nombre,
  c.telefono AS telefono,
  c.direccion AS direccion,
  uc.nombre_completo AS cobrador_asignado,
  p.monto_desembolsado AS capital,
  p.saldo_pendiente AS saldo_pendiente,
  p.cuota_semanal_base AS cuota_semanal,
  p.plazo_semanas AS plazo_semanas,
  p.dias_de_cobro AS dias_de_cobro_json,
  p.fecha_desembolso AS fecha_desembolso,
  p.estado AS estado,
  (SELECT COUNT(*) FROM Cuotas_Calendario q
   WHERE q.prestamo_id = p.id AND q.estado IN ('Programada','Parcial') AND q.deleted_at IS NULL) AS cuotas_pendientes,
  (SELECT COALESCE(SUM(pg.monto_pagado), 0) FROM Pagos pg
   WHERE pg.prestamo_id = p.id AND pg.deleted_at IS NULL) AS total_cobrado
FROM Prestamos p
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios uc ON c.cobrador_id = uc.id
WHERE p.estado = 'Activo' AND p.deleted_at IS NULL;

-- Vista unificada de giros / movimientos financieros (principal para Excel)
CREATE OR REPLACE VIEW v_giros_financieros AS
SELECT
  CONCAT('DES-', p.id) AS id_movimiento,
  'DESEMBOLSO' AS tipo_movimiento,
  p.fecha_desembolso AS fecha,
  CAST(p.fecha_desembolso AS DATETIME) AS fecha_hora,
  p.monto_desembolsado AS monto,
  p.id AS prestamo_id,
  p.cliente_id AS cliente_id,
  c.nombre_completo AS cliente_nombre,
  c.cedula AS cliente_cedula,
  c.cobrador_id AS cobrador_id,
  uc.nombre_completo AS cobrador_nombre,
  p.cobrador_entrega_id AS operador_id,
  ue.nombre_completo AS operador_nombre,
  p.saldo_pendiente AS saldo_prestamo,
  p.estado AS estado_prestamo,
  CONCAT('Desembolso ', p.id) AS detalle,
  NULL AS latitud,
  NULL AS longitud,
  'NO' AS registrado_por_admin
FROM Prestamos p
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios uc ON c.cobrador_id = uc.id
LEFT JOIN Usuarios ue ON p.cobrador_entrega_id = ue.id
WHERE p.deleted_at IS NULL

UNION ALL

SELECT
  CONCAT('PAG-', pg.id),
  'COBRO',
  DATE(pg.fecha_pago),
  pg.fecha_pago,
  pg.monto_pagado,
  pg.prestamo_id,
  c.id,
  c.nombre_completo,
  c.cedula,
  pg.cobrador_id,
  uc.nombre_completo,
  pg.operador_id,
  uo.nombre_completo,
  p.saldo_pendiente,
  p.estado,
  CONCAT('Cobro ', pg.id),
  pg.latitud,
  pg.longitud,
  CASE WHEN COALESCE(pg.registrado_por_admin, 0) = 1 THEN 'SI' ELSE 'NO' END
FROM Pagos pg
JOIN Prestamos p ON pg.prestamo_id = p.id AND p.deleted_at IS NULL
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios uc ON pg.cobrador_id = uc.id
LEFT JOIN Usuarios uo ON pg.operador_id = uo.id
WHERE pg.deleted_at IS NULL

UNION ALL

SELECT
  CONCAT('REN-', r.id),
  'RENOVACION',
  DATE(r.fecha_renovacion),
  r.fecha_renovacion,
  r.nuevo_desembolso,
  r.prestamo_nuevo_id,
  pa.cliente_id,
  ca.nombre_completo,
  ca.cedula,
  r.cobrador_opero_id,
  uo.nombre_completo,
  r.cobrador_entrega_id,
  ue.nombre_completo,
  r.saldo_pendiente_anterior,
  'Renovado',
  CONCAT('Renovacion ', r.prestamo_anterior_id, ' -> ', r.prestamo_nuevo_id),
  NULL,
  NULL,
  CASE WHEN r.cobrador_opero_id IS NOT NULL THEN 'SI' ELSE 'NO' END
FROM Renovaciones_Log r
LEFT JOIN Prestamos pa ON r.prestamo_anterior_id = pa.id
LEFT JOIN Clientes ca ON pa.cliente_id = ca.id
LEFT JOIN Usuarios uo ON r.cobrador_opero_id = uo.id
LEFT JOIN Usuarios ue ON r.cobrador_entrega_id = ue.id
WHERE r.deleted_at IS NULL

UNION ALL

SELECT
  CONCAT('GES-', g.id),
  'GESTION_NO_PAGO',
  DATE(g.fecha_gestion),
  g.fecha_gestion,
  0,
  g.prestamo_id,
  c.id,
  c.nombre_completo,
  c.cedula,
  g.cobrador_id,
  uc.nombre_completo,
  g.operador_id,
  uo.nombre_completo,
  p.saldo_pendiente,
  p.estado,
  CONCAT('No pago: ', g.motivo),
  g.latitud,
  g.longitud,
  CASE WHEN COALESCE(g.registrado_por_admin, 0) = 1 THEN 'SI' ELSE 'NO' END
FROM Gestiones_No_Pago g
JOIN Prestamos p ON g.prestamo_id = p.id AND p.deleted_at IS NULL
JOIN Clientes c ON p.cliente_id = c.id AND c.deleted_at IS NULL
LEFT JOIN Usuarios uc ON g.cobrador_id = uc.id
LEFT JOIN Usuarios uo ON g.operador_id = uo.id
WHERE g.deleted_at IS NULL;

-- Alias principal: todo lo operativo de la app en una sola tabla plana
CREATE OR REPLACE VIEW v_operaciones_app AS
SELECT * FROM v_giros_financieros;
