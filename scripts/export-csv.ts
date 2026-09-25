import fs from 'fs';
import path from 'path';
import { getPool, closeAll, Source } from '../src/db';
import { exportTable, TableConfig } from '../src/extract';
import { buildManifestEntry, writeManifest, ManifestEntry } from '../src/manifest';
import { initLogger, log } from '../src/logger';
import { retry } from '../src/retry';
import tables from '../config/tables.json';

export interface ExportRunResult {
  manifestFile: string;
  failedTables: number;
}

export async function runExport(source: Source, year: number): Promise<ExportRunResult> {
  const outputRoot = path.join(__dirname, '..', 'output', source);
  const passwordsDir = path.join(__dirname, '..', 'passwords');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  log.info('export başlatıldı', { source, year });
  const pool = await getPool(source);
  const passwordEntries: { file: string; password: string }[] = [];
  const manifestEntries: ManifestEntry[] = [];
  let failedTables = 0;

  for (const cfg of tables as TableConfig[]) {
    try {
      const results = await retry(() => exportTable(pool, cfg, year, outputRoot));
      for (const r of results) {
        const relativePath = path.relative(process.cwd(), r.filePath);
        console.log(`${relativePath} — ${r.rowCount} satır`);
        passwordEntries.push({ file: relativePath, password: r.password });
        manifestEntries.push(buildManifestEntry(r.filePath, r.rowCount));
      }
      log.info('tablo tamamlandı', { table: cfg.table, fileCount: results.length });
    } catch (err) {
      failedTables++;
      log.error('tablo başarısız (3 deneme sonrasi)', { table: cfg.table, error: (err as Error).message });
    }
  }

  const runFile = path.join(passwordsDir, `${source}_${year}_${timestamp}.json`);
  fs.mkdirSync(passwordsDir, { recursive: true });
  fs.writeFileSync(runFile, JSON.stringify(passwordEntries, null, 2), 'utf8');
  console.log(`\nParolalar kaydedildi: ${path.relative(process.cwd(), runFile)}`);

  const manifestFile = path.join(outputRoot, String(year), '_manifest', `run_${timestamp}.json`);
  writeManifest(manifestFile, manifestEntries);
  console.log(`Manifest kaydedildi: ${path.relative(process.cwd(), manifestFile)}`);

  log.info('export tamamlandı', {
    fileCount: manifestEntries.length,
    totalRowCount: manifestEntries.reduce((sum, e) => sum + e.rowCount, 0),
    failedTables,
  });

  await closeAll();

  return { manifestFile, failedTables };
}

if (require.main === module) {
  const source: Source = (process.argv[2] as Source) || 'EMDS';
  const year = Number(process.argv[3]) || 2025;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  initLogger(path.join(__dirname, '..', 'logs', `export_${source}_${year}_${timestamp}.log`));

  runExport(source, year).then(({ failedTables }) => {
    if (failedTables > 0) process.exitCode = 1;
  });
}
