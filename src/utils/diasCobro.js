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

const diaCobroHoy = () => MAPA[new Date().getDay()];

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

const montoVisitaHoy = (cuotaSemanal, diasRaw) => {
  try {
    const dias = typeof diasRaw === 'string' ? JSON.parse(diasRaw) : diasRaw;
    const n = Array.isArray(dias) && dias.length ? dias.length : 1;
    return Number((Number(cuotaSemanal || 0) / n).toFixed(2));
  } catch {
    return Number(cuotaSemanal || 0);
  }
};

module.exports = { diaCobroHoy, incluyeDiaHoy, montoVisitaHoy, normalizarDia };
