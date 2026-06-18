/**
 * IP del cliente detrás de proxy (Vercel, nginx, etc.).
 */
function obtenerIpCliente(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first.slice(0, 45);
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim().slice(0, 45);
  if (req.socket?.remoteAddress) {
    return String(req.socket.remoteAddress).replace(/^::ffff:/, '').slice(0, 45);
  }
  return null;
}

module.exports = { obtenerIpCliente };
