/** Nicaragua (UTC−6, sin horario de verano). */
const ZONA_NICARAGUA = 'America/Managua';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_NICARAGUA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function fechaEnZona(date = new Date()) {
  return fmt.format(date);
}

function hoyISO() {
  return fechaEnZona(new Date());
}

/** Rango [inicio, fin) en UTC para filtros sobre fecha_pago almacenada en UTC. */
function rangoDiaNicaragua(fechaISO) {
  const d = (fechaISO || hoyISO()).slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  const inicio = `${d} 06:00:00`;
  const finDate = new Date(Date.UTC(y, m - 1, day + 1, 6, 0, 0, 0));
  const fin = `${finDate.toISOString().slice(0, 10)} 06:00:00`;
  return { inicio, fin };
}

module.exports = { ZONA_NICARAGUA, fechaEnZona, hoyISO, rangoDiaNicaragua };
