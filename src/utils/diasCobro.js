const MAPA = {
  0: 'DOMINGO',
  1: 'LUNES',
  2: 'MARTES',
  3: 'MIERCOLES',
  4: 'JUEVES',
  5: 'VIERNES',
  6: 'SABADO',
};

const normalizarDia = (d) =>
  String(d || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const fechaCalendarioISO = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const normalizarFechaISO = (valor) => {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const day = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const m = String(valor ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

const diaCobroHoy = () => MAPA[new Date().getDay()];

const diaCobroDeFecha = (fechaISO) => {
  const d = new Date(`${normalizarFechaISO(fechaISO) || fechaISO}T12:00:00`);
  return MAPA[d.getDay()];
};

const incluyeDiaHoy = (diasRaw) => {
  try {
    const dias = typeof diasRaw === 'string' ? JSON.parse(diasRaw) : diasRaw;
    if (!Array.isArray(dias) || !dias.length) return true;
    const hoy = normalizarDia(diaCobroHoy());
    return dias.some((d) => normalizarDia(d) === hoy);
  } catch {
    return true;
  }
};

const incluyeDiaEnFecha = (fechaISO, diasRaw) => {
  try {
    const dias = typeof diasRaw === 'string' ? JSON.parse(diasRaw) : diasRaw;
    if (!Array.isArray(dias) || !dias.length) return true;
    const dia = normalizarDia(diaCobroDeFecha(fechaISO));
    return dias.some((d) => normalizarDia(d) === dia);
  } catch {
    return true;
  }
};

const esDiaDesembolso = (fechaDesembolso, fechaRefISO = fechaCalendarioISO()) => {
  const des = normalizarFechaISO(fechaDesembolso);
  const ref = normalizarFechaISO(fechaRefISO);
  return !!des && !!ref && des === ref;
};

/** ¿Incluir en agenda/ruta del día? No el mismo día del desembolso. */
const debeSugerirCobroEnFecha = (fechaRefISO, prestamo) => {
  if (!prestamo) return false;
  if (!incluyeDiaEnFecha(fechaRefISO, prestamo.dias_de_cobro)) return false;
  if (esDiaDesembolso(prestamo.fecha_desembolso, fechaRefISO)) return false;
  return true;
};

const esCuotaDiaDesembolso = (cuota, prestamo) => {
  const des = normalizarFechaISO(prestamo?.fecha_desembolso);
  if (!des) return false;
  return normalizarFechaISO(cuota?.fecha_programada) === des;
};

const montoVisitaHoy = (cuotaSemanal, diasRaw) => {
  try {
    const dias = typeof diasRaw === 'string' ? JSON.parse(diasRaw) : diasRaw;
    const n = Array.isArray(dias) && dias.length ? dias.length : 1;
    return Number((Number(cuotaSemanal || 0) / n).toFixed(2));
  } catch {
    return Number(cuotaSemanal || 0);
  }
};

module.exports = {
  diaCobroHoy,
  diaCobroDeFecha,
  incluyeDiaHoy,
  incluyeDiaEnFecha,
  montoVisitaHoy,
  normalizarDia,
  normalizarFechaISO,
  fechaCalendarioISO,
  esDiaDesembolso,
  debeSugerirCobroEnFecha,
  esCuotaDiaDesembolso,
};
