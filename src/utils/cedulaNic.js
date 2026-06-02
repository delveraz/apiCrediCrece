const CEDULA_RE = /^\d{13}[A-Z]$/;

function normalizarCedula(input) {
  if (input == null) return '';
  return String(input).trim().toUpperCase().replace(/[-\s]/g, '');
}

function validarCedula(input) {
  const cedula = normalizarCedula(input);
  if (!cedula) return { ok: false, error: 'Cédula requerida.' };
  if (cedula.length !== 14) {
    return { ok: false, error: 'La cédula debe tener 14 caracteres: 13 números y 1 letra final.' };
  }
  if (!CEDULA_RE.test(cedula)) {
    return {
      ok: false,
      error: 'Formato inválido: 13 dígitos y la última letra en mayúscula, sin guiones.',
    };
  }
  return { ok: true, cedula };
}

module.exports = { normalizarCedula, validarCedula, CEDULA_RE };
