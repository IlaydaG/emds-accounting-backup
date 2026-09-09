import path from 'path';
import { getPool, closeAll, Source } from '../src/db';
import { exportTable, TableConfig } from '../src/extract';
import tables from '../config/tables.json';

const source: Source = (process.argv[2] as Source) || 'EMDS';
const year = Number(process.argv[3]) || 2025;
const outputRoot = path.join(__dirname, '..', 'output', source);

(async () => {
  const pool = await getPool(source);

  for (const cfg of tables as TableConfig[]) {
    const results = await exportTable(pool, cfg, year, outputRoot);
    for (const r of results) {
      console.log(`${path.relative(process.cwd(), r.filePath)} — ${r.rowCount} satır`);
    }
  }

  await closeAll();
})();
