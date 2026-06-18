/**
 * Geolocalización aproximada por IP (gratuito, sin API key).
 * Proveedor principal: ipwho.is · respaldo: ip-api.com
 */

const TIMEOUT_MS = 3500;

function esIpPublica(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const s = ip.trim().toLowerCase();
  if (s === '::1' || s === '127.0.0.1' || s === 'localhost') return false;
  if (s.startsWith('10.') || s.startsWith('192.168.') || s.startsWith('172.')) return false;
  if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80')) return false;
  return true;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizar(data) {
  if (!data) return null;
  const ciudad = data.city ? String(data.city).trim().slice(0, 80) : null;
  const region = data.region ? String(data.region).trim().slice(0, 80) : null;
  const pais = data.country ? String(data.country).trim().slice(0, 80) : null;
  const isp = data.isp ? String(data.isp).trim().slice(0, 80) : null;
  if (!ciudad && !region && !pais && !isp) return null;
  return { ciudad, region, pais, isp };
}

async function desdeIpwho(ip) {
  const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (!data?.success) return null;
  return normalizar({
    city: data.city,
    region: data.region,
    country: data.country,
    isp: data.connection?.isp || data.connection?.org,
  });
}

async function desdeIpApi(ip) {
  const data = await fetchJson(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country,isp`
  );
  if (data?.status !== 'success') return null;
  return normalizar({
    city: data.city,
    region: data.regionName,
    country: data.country,
    isp: data.isp,
  });
}

/** Ciudad, región, país e ISP aproximados; null si no hay IP pública o falla el servicio. */
async function geolocalizarIp(ip) {
  if (!esIpPublica(ip)) return null;
  const primary = await desdeIpwho(ip);
  if (primary) return primary;
  return desdeIpApi(ip);
}

module.exports = { geolocalizarIp, esIpPublica };
