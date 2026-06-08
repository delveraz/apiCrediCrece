/** Misma lógica que app-financiera/src/utils/finanzas.js (motor nube / carga masiva) */

const SEMANAS_POR_MES = 4;
const TASA_MENSUAL_DEFAULT = 0.1;

const DIAS_SEMANA = {
  DOMINGO: 0,
  LUNES: 1,
  MARTES: 2,
  MIERCOLES: 3,
  JUEVES: 4,
  VIERNES: 5,
  SABADO: 6,
};

const calcularMesesFinancieros = (plazoSemanas) => Number(plazoSemanas) / SEMANAS_POR_MES;

const parseTasaMensualInput = (valor) => {
  const n = parseFloat(String(valor).replace('%', '').trim());
  if (Number.isNaN(n) || n < 0) return TASA_MENSUAL_DEFAULT;
  return n > 1 ? n / 100 : n;
};

const calcularTasaInteresVariableLineal = (plazoSemanas, tasaMensual = TASA_MENSUAL_DEFAULT) => {
  const meses = calcularMesesFinancieros(plazoSemanas);
  return Number((tasaMensual * meses).toFixed(4));
};

const calcularCuotaYDistribucion = (
  montoDesembolso,
  plazoSemanas,
  diasDeCobro = ['LUNES'],
  tasaMensual = TASA_MENSUAL_DEFAULT
) => {
  const tasaInteresAplicada = calcularTasaInteresVariableLineal(plazoSemanas, tasaMensual);
  const interesTotal = Number((montoDesembolso * tasaInteresAplicada).toFixed(2));
  const montoTotalPagar = Number((montoDesembolso + interesTotal).toFixed(2));
  const cuotaSemanalBase = Number((montoTotalPagar / plazoSemanas).toFixed(2));
  const frecuenciaSemanal = diasDeCobro.length || 1;
  const cuotaPorDiaDeCobro = Number((cuotaSemanalBase / frecuenciaSemanal).toFixed(2));
  return {
    montoDesembolso,
    plazoSemanas,
    tasaMensual,
    tasaInteresAplicada,
    interesTotal,
    montoTotalPagar,
    cuotaSemanalBase,
    cuotaPorDiaDeCobro,
    frecuenciaSemanal,
    diasDeCobro,
  };
};

const diaSemanaIndice = (nombreDia) => {
  const key = String(nombreDia).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return DIAS_SEMANA[key] ?? DIAS_SEMANA.LUNES;
};

const generarAgendaDeCobro = (fechaInicioISO, plazoSemanas, diasDeCobro = ['LUNES'], cuotaPorDia = 0) => {
  const agenda = [];
  const inicioStr = String(fechaInicioISO || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!inicioStr) return agenda;

  const inicio = new Date(`${inicioStr}T12:00:00`);
  if (Number.isNaN(inicio.getTime())) return agenda;

  const plazo = Math.min(Math.max(1, Number(plazoSemanas) || 1), 520);
  const dias = (Array.isArray(diasDeCobro) ? diasDeCobro : ['LUNES']).filter(Boolean);
  if (!dias.length) dias.push('LUNES');

  for (let semana = 0; semana < plazo; semana += 1) {
    for (const nombreDia of dias) {
      const targetDay = diaSemanaIndice(nombreDia);
      const fecha = new Date(inicio.getTime());
      fecha.setDate(inicio.getDate() + semana * 7);
      const delta = (targetDay - fecha.getDay() + 7) % 7;
      fecha.setDate(fecha.getDate() + delta);
      if (Number.isNaN(fecha.getTime())) continue;
      const y = fecha.getFullYear();
      const m = String(fecha.getMonth() + 1).padStart(2, '0');
      const day = String(fecha.getDate()).padStart(2, '0');
      const fechaISO = `${y}-${m}-${day}`;
      if (fechaISO === inicioStr) continue;
      agenda.push({
        fecha_programada: fechaISO,
        monto_programado: cuotaPorDia,
        estado: 'Programada',
        dia: String(nombreDia).toUpperCase(),
      });
    }
  }

  return agenda.sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada));
};

const semanasTranscurridas = (fechaDesembolsoISO, plazoSemanas, refDate = new Date()) => {
  const inicio = new Date(`${String(fechaDesembolsoISO).slice(0, 10)}T12:00:00`);
  const diffMs = refDate - inicio;
  const dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const sem = Math.max(1, Math.ceil(dias / 7));
  return Math.min(plazoSemanas, sem);
};

const calcularLiquidacionAnticipada = (prestamo, refDate = new Date()) => {
  const capital = Number(prestamo.monto_desembolsado);
  const plazo = Number(prestamo.plazo_semanas);
  const tasaGlobal = Number(prestamo.tasa_interes_aplicada);
  const saldo = Number(prestamo.saldo_pendiente);
  const totalOriginal = Number(prestamo.monto_total_pagar);
  const pagadoAcumulado = Number((totalOriginal - saldo).toFixed(2));
  const semUsadas = semanasTranscurridas(prestamo.fecha_desembolso, plazo, refDate);
  const tasaMensual = plazo > 0 ? tasaGlobal / (plazo / SEMANAS_POR_MES) : tasaGlobal;
  const tasaAjustada = Number((tasaMensual * (semUsadas / SEMANAS_POR_MES)).toFixed(4));
  const interesAjustado = Number((capital * tasaAjustada).toFixed(2));
  const totalAjustado = Number((capital + interesAjustado).toFixed(2));
  const montoLiquidacion = Math.max(0, Number((totalAjustado - pagadoAcumulado).toFixed(2)));
  const descuentoInteres = Math.max(0, Number((saldo - montoLiquidacion).toFixed(2)));
  return {
    capital,
    plazoSemanas: plazo,
    semanasUsadas: semUsadas,
    montoLiquidacion,
    descuentoInteres,
    saldoActual: saldo,
    mensaje: `Interés recalculado por ${semUsadas} semana(s). Ahorro: C$ ${descuentoInteres.toFixed(2)}`,
  };
};

module.exports = {
  TASA_MENSUAL_DEFAULT,
  SEMANAS_POR_MES,
  parseTasaMensualInput,
  calcularCuotaYDistribucion,
  generarAgendaDeCobro,
  calcularLiquidacionAnticipada,
};
