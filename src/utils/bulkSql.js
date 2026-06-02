/** Inserciones multi-fila para reducir round-trips a TiDB. */

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertMany(conn, sqlPrefix, rows, chunkSize = 80) {
  if (!rows.length) return 0;
  let total = 0;
  for (const chunk of chunkArray(rows, chunkSize)) {
    const placeholders = chunk.map(() => sqlPrefix.placeholder).join(',');
    const values = chunk.flatMap((r) => sqlPrefix.values(r));
    await conn.execute(`${sqlPrefix.insert} VALUES ${placeholders}`, values);
    total += chunk.length;
  }
  return total;
}

module.exports = { chunkArray, insertMany };
