function nombreCompleto(c) {
  const parts = [
    c.primer_nombre,
    c.segundo_nombre,
    c.primer_apellido,
    c.segundo_apellido,
  ].filter(Boolean);
  if (parts.length) return parts.join(' ').replace(/\s+/g, ' ').trim();
  return c.nombre_completo || '';
}

module.exports = { nombreCompleto };
