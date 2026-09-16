import fs from 'fs';
import path from 'path';
import { getPool, closeAll, Source } from '../src/db';
import { exportTable, TableConfig } from '../src/extract';
import tables from '../config/tables.json';

const source: Source = (process.argv[2] as Source) || 'EMDS';
const year = Number(process.argv[3]) || 2025;
const outputRoot = path.join(__dirname, '..', 'output', source);
const passwordsDir = path.join(__dirname, '..', 'passwords');

(async () => {
  const pool = await getPool(source);
  const passwordEntries: { file: string; password: string }[] = [];

  for (const cfg of tables as TableConfig[]) {
    const results = await exportTable(pool, cfg, year, outputRoot);
    for (const r of results) {
      const relativePath = path.relative(process.cwd(), r.filePath);
      console.log(`${relativePath} — ${r.rowCount} satır`);
      passwordEntries.push({ file: relativePath, password: r.password });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runFile = path.join(passwordsDir, `${source}_${year}_${timestamp}.json`);
  fs.mkdirSync(passwordsDir, { recursive: true });
  fs.writeFileSync(runFile, JSON.stringify(passwordEntries, null, 2), 'utf8');
  console.log(`\nParolalar kaydedildi: ${path.relative(process.cwd(), runFile)}`);

  await closeAll();
})();
