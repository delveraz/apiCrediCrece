const { hoyISO, rangoDiaNicaragua } = require('./zonaHoraria');

/** Rango [inicio, fin) del día calendario Nicaragua para fecha_pago en UTC. */
function rangoDiaLocal(fechaISO) {
  return rangoDiaNicaragua(fechaISO);
}

function hoyRango() {
  return rangoDiaLocal(hoyISO());
}

/** Cierres guardan fecha calendario YYYY-MM-DD; usar DATE(), no rango horario. */
function whereCierreCalendarioDia(columna = 'fecha_cierre') {
  return `DATE(${columna}) = DATE(?)`;
}

module.exports = { rangoDiaLocal, hoyRango, hoyISO, whereCierreCalendarioDia };
