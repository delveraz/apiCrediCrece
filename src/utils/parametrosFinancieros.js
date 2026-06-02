const DEFAULT_TASA_MES = '0.10';
const DEFAULT_SUGERENCIAS = [8, 10, 12, 15];

async function leerParametrosFinancieros(query) {
  const rows = await query(
    `SELECT clave, valor FROM Parametros_Globales
     WHERE clave IN ('TASA_INTERES_POR_MES', 'TASAS_MENSUALES_SUGERIDAS')`
  );
  const map = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  let sugerencias = DEFAULT_SUGERENCIAS;
  if (map.TASAS_MENSUALES_SUGERIDAS) {
    try {
      const parsed = JSON.parse(map.TASAS_MENSUALES_SUGERIDAS);
      if (Array.isArray(parsed) && parsed.length) sugerencias = parsed.map(Number).filter((n) => n > 0);
    } catch {
      /* ignore */
    }
  }
  return {
    tasa_interes_por_mes: map.TASA_INTERES_POR_MES || DEFAULT_TASA_MES,
    tasas_mensuales_sugeridas: sugerencias,
  };
}

function normalizarTasaMensualInput(val) {
  const n = parseFloat(val);
  if (Number.isNaN(n) || n < 0) return null;
  return n > 1 ? (n / 100).toFixed(4) : n.toFixed(4);
}

function normalizarSugerenciasInput(val) {
  let arr = val;
  if (typeof val === 'string') {
    try {
      arr = JSON.parse(val);
    } catch {
      arr = val.split(',').map((s) => parseFloat(s.trim()));
    }
  }
  if (!Array.isArray(arr)) return null;
  const nums = arr.map(Number).filter((n) => !Number.isNaN(n) && n > 0 && n <= 100);
  return nums.length ? nums : null;
}

module.exports = {
  DEFAULT_TASA_MES,
  DEFAULT_SUGERENCIAS,
  leerParametrosFinancieros,
  normalizarTasaMensualInput,
  normalizarSugerenciasInput,
};
