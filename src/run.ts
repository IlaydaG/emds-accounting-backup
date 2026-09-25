import path from 'path';
import { Source } from './db';
import { initLogger, log } from './logger';
import { runExport } from '../scripts/export-csv';
import { runUpload } from '../scripts/upload-to-azure';

function parseArgs(): { source: Source; year: number } {
  const args = process.argv.slice(2);
  let source: Source = 'EMDS';
  let year = new Date().getFullYear();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source') source = args[++i] as Source;
    if (args[i] === '--year') year = Number(args[++i]);
  }

  return { source, year };
}

(async () => {
  const { source, year } = parseArgs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  initLogger(path.join(__dirname, '..', 'logs', `pipeline_${source}_${year}_${timestamp}.log`));

  console.log(`=== EMDS yedekleme pipeline: ${source} / ${year} ===\n`);

  log.info('pipeline başlatıldı', { source, year });

  console.log('--- 1/2: CSV export + sifreleme ---');
  const exportResult = await runExport(source, year);

  console.log('\n--- 2/2: Azure yukleme ---');
  const uploadResult = await runUpload(source, year);

  const success = exportResult.failedTables === 0 && uploadResult.failCount === 0;
  log.info('pipeline tamamlandı', {
    failedTables: exportResult.failedTables,
    failedUploads: uploadResult.failCount,
    success,
  });

  console.log(`\n=== Pipeline ${success ? 'başarıyla tamamlandı' : 'kısmi hatayla tamamlandı'} ===`);

  if (!success) process.exitCode = 1;
})();
