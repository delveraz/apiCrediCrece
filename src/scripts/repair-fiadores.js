require('dotenv').config();
const { query } = require('../config/db');
const { migrarInlineFiadoresPrestamos, repararFiadoresHistoricos } = require('../utils/fiadoresNube');

const DROPS = [
  'ALTER TABLE Prestamos DROP COLUMN fiador_nombre',
  'ALTER TABLE Prestamos DROP COLUMN fiador_telefono',
  'ALTER TABLE Prestamos DROP COLUMN fiador_cedula',
  'ALTER TABLE Prestamos DROP COLUMN fiador_direccion',
];

(async () => {
  try {
    console.log('1. Migrando fiadores inline → tabla Fiadores...');
    const migrados = await migrarInlineFiadoresPrestamos();
    console.log(`   Registros migrados: ${migrados}`);

    console.log('2. Reparando fiador_id huérfanos...');
    const reparados = await repararFiadoresHistoricos();
    console.log(`   Limpiezas: ${reparados}`);

    console.log('3. Eliminando columnas inline de Prestamos...');
    for (const sql of DROPS) {
      try {
        await query(sql);
        console.log('   OK:', sql);
      } catch (e) {
        console.log('   Skip:', e.message?.slice(0, 80));
      }
    }

    console.log('\nListo. Verifique:');
    console.log('  SELECT * FROM Fiadores;');
    console.log('  SELECT id, fiador_id FROM Prestamos WHERE fiador_id IS NOT NULL;');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
