/** Rango [inicio, fin) del día local del servidor para filtros indexables (sin DATE(col)). */
function rangoDiaLocal(fechaISO) {
  const d = fechaISO ? String(fechaISO).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const inicio = `${d} 00:00:00`;
  const finDate = new Date(`${d}T12:00:00`);
  finDate.setDate(finDate.getDate() + 1);
  const fin = finDate.toISOString().slice(0, 10) + ' 00:00:00';
  return { inicio, fin };
}

function hoyRango() {
  return rangoDiaLocal(new Date().toISOString().slice(0, 10));
}

module.exports = { rangoDiaLocal, hoyRango };
