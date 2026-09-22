import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getContainerClient, uploadFile } from '../src/azureUpload';
import { initLogger, log } from '../src/logger';
import { ManifestEntry } from '../src/manifest';

const source = process.argv[2] || 'EMDS';
const year = process.argv[3] || '2025';
const outputRoot = path.join(__dirname, '..', 'output', source, year);
const manifestDir = path.join(outputRoot, '_manifest');
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'accounting-backup';

function findLatestManifest(): string {
  const files = fs
    .readdirSync(manifestDir)
    .filter((f) => f.startsWith('run_') && f.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error('Manifest bulunamadi, önce npm run export-csv çalıştır');
  return path.join(manifestDir, files[files.length - 1]);
}

function toBlobPath(localFile: string): string {
  const outputBase = path.join(__dirname, '..', 'output');
  const relative = path.relative(outputBase, localFile);
  return relative.split(path.sep).join('/');
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
initLogger(path.join(__dirname, '..', 'logs', `upload_${source}_${year}_${timestamp}.log`));

(async () => {
  const manifestPath = findLatestManifest();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files: ManifestEntry[] };

  log.info('yükleme başlatıldı', { source, year, containerName, fileCount: manifest.files.length });
  const container = await getContainerClient(containerName);

  let successCount = 0;
  let failCount = 0;

  for (const entry of manifest.files) {
    const localPath = path.resolve(entry.file);
    const blobPath = toBlobPath(localPath);
    try {
      const result = await uploadFile(container, localPath, blobPath, entry.sha256);
      if (result.verified) {
        console.log(`✓ ${blobPath}`);
        successCount++;
      } else {
        console.log(`✗ ${blobPath} — checksum uyuşmadı`);
        failCount++;
      }
      log.info('dosya yüklendi', { blobPath, verified: result.verified });
    } catch (err) {
      failCount++;
      console.log(`✗ ${blobPath} — hata: ${(err as Error).message}`);
      log.error('yükleme hatası', { blobPath, error: (err as Error).message });
    }
  }

  const manifestBlobPath = toBlobPath(manifestPath);
  const manifestBuffer = fs.readFileSync(manifestPath);
  const manifestSha256 = crypto.createHash('sha256').update(manifestBuffer).digest('hex');
  await uploadFile(container, manifestPath, manifestBlobPath, manifestSha256);
  console.log(`✓ ${manifestBlobPath} (manifest)`);

  log.info('yükleme tamamlandi', { successCount, failCount });
  console.log(`\nTamamlandı: ${successCount} başarılı, ${failCount} başarısız.`);
})();
