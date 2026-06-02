/** Distancia Haversine en km */
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Orden de visita: vecino más cercano (desde punto de partida) */
function optimizarOrdenVisita(clientes, startLat, startLng) {
  const conCoords = clientes.filter(
    (c) => Number.isFinite(Number(c.latitud)) && Number.isFinite(Number(c.longitud))
  );
  const sinCoords = clientes.filter(
    (c) => !Number.isFinite(Number(c.latitud)) || !Number.isFinite(Number(c.longitud))
  );

  const restantes = [...conCoords];
  const ordenados = [];
  let curLat = startLat;
  let curLng = startLng;

  while (restantes.length) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaKm(curLat, curLng, Number(restantes[i].latitud), Number(restantes[i].longitud));
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = i;
      }
    }
    const next = restantes.splice(mejorIdx, 1)[0];
    ordenados.push(next);
    curLat = Number(next.latitud);
    curLng = Number(next.longitud);
  }

  return [...ordenados, ...sinCoords];
}

module.exports = { distanciaKm, optimizarOrdenVisita };
