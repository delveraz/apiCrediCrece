const { hoyISO, rangoDiaNicaragua, rangoPeriodoNicaragua } = require('./zonaHoraria');

/** Rango [inicio, fin) en UTC para filtros sobre fecha_pago almacenada en UTC. */
function rangoDiaLocal(fechaISO) {
  return rangoDiaNicaragua(fechaISO);
}

function rangoPeriodoLocal(desdeISO, hastaISO) {
  return rangoPeriodoNicaragua(desdeISO, hastaISO);
}

function hoyRango() {
  return rangoDiaLocal(hoyISO());
}

/** Cierres guardan fecha calendario YYYY-MM-DD; usar DATE(), no rango horario. */
function whereCierreCalendarioDia(columna = 'fecha_cierre') {
  return `DATE(${columna}) = DATE(?)`;
}

module.exports = { rangoDiaLocal, rangoPeriodoLocal, hoyRango, hoyISO, whereCierreCalendarioDia };
