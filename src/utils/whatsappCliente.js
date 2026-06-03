/** Utilidades WhatsApp — teléfono Nicaragua (505 + 8 dígitos). */

function normalizarTelefonoWhatsApp(telefono) {
  const digits = String(telefono || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length >= 11 && digits.startsWith('505')) return digits;
  if (digits.length === 8) return `505${digits}`;
  if (digits.length > 8) return `505${digits.slice(-8)}`;
  return null;
}

function datosWhatsAppCliente(cliente) {
  if (!cliente) {
    return { nombre_completo: null, telefono: null, whatsapp_phone: null };
  }
  const telefono = cliente.telefono || null;
  return {
    nombre_completo: cliente.nombre_completo || null,
    telefono,
    whatsapp_phone: normalizarTelefonoWhatsApp(telefono),
  };
}

module.exports = {
  normalizarTelefonoWhatsApp,
  datosWhatsAppCliente,
};
