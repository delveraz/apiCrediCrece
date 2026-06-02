require('dotenv').config();
const { migrarCedulasSinGuion } = require('../utils/migrarCedulas');

(async () => {
  try {
    const r = await migrarCedulasSinGuion();
    console.log('Cédulas normalizadas:', r.actualizados, '| fusionadas (duplicados):', r.fusionados);
    if (r.detalle?.clientes?.conflictos?.length) {
      console.log('Conflictos clientes:', r.detalle.clientes.conflictos.length);
    }
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
