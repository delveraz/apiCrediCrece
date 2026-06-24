const { hoyISO, rangoDiaNicaragua } = require('./zonaHoraria');

/** Rango [inicio, fin) del día calendario Nicaragua para fecha_pago en UTC. */
function rangoDiaLocal(fechaISO) {
  return rangoDiaNicaragua(fechaISO);
}

function hoyRango() {
  return rangoDiaLocal(hoyISO());
}

module.exports = { rangoDiaLocal, hoyRango, hoyISO };
