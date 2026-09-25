import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getContainerClient, uploadFile } from '../src/azureUpload';
import { initLogger, log } from '../src/logger';
import { retry } from '../src/retry';
import { ManifestEntry } from '../src/manifest';

function findLatestManifest(manifestDir: string): string {
  const files = fs
    .readdirSync(manifestDir)
    .filter((f) => f.startsWith('run_') && f.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error('Manifest bulunamadi, önce export çalıştırın');
  return path.join(manifestDir, files[files.length - 1]);
}

function toBlobPath(localFile: string): string {
  const outputBase = path.join(__dirname, '..', 'output');
  const relative = path.relative(outputBase, localFile);
  return relative.split(path.sep).join('/');
}

export interface UploadRunResult {
  successCount: number;
  failCount: number;
}

export async function runUpload(source: string, year: string | number): Promise<UploadRunResult> {
  const manifestDir = path.join(__dirname, '..', 'output', source, String(year), '_manifest');
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'accounting-backup';

  const manifestPath = findLatestManifest(manifestDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files: ManifestEntry[] };

  log.info('yukleme baslatildi', { source, year, containerName, fileCount: manifest.files.length });
  const container = await getContainerClient(containerName);

  let successCount = 0;
  let failCount = 0;

  for (const entry of manifest.files) {
    const localPath = path.resolve(entry.file);
    const blobPath = toBlobPath(localPath);
    try {
      const result = await retry(() => uploadFile(container, localPath, blobPath, entry.sha256));
      if (result.verified) {
        console.log(`✓ ${blobPath}`);
        successCount++;
      } else {
        console.log(`✗ ${blobPath} — checksum uyusmadi`);
        failCount++;
      }
      log.info('dosya yükle', { blobPath, verified: result.verified });
    } catch (err) {
      failCount++;
      console.log(`✗ ${blobPath} — hata (3 deneme sonrasi): ${(err as Error).message}`);
      log.error('yükleme hatası', { blobPath, error: (err as Error).message });
    }
  }

  const manifestBlobPath = toBlobPath(manifestPath);
  const manifestBuffer = fs.readFileSync(manifestPath);
  const manifestSha256 = crypto.createHash('sha256').update(manifestBuffer).digest('hex');
  await retry(() => uploadFile(container, manifestPath, manifestBlobPath, manifestSha256));
  console.log(`✓ ${manifestBlobPath} (manifest)`);

  log.info('yükleme tamamlandı', { successCount, failCount });
  console.log(`\nTamamlandi: ${successCount} başarılı, ${failCount} başarısız.`);

  return { successCount, failCount };
}

if (require.main === module) {
  const source = process.argv[2] || 'EMDS';
  const year = process.argv[3] || '2025';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  initLogger(path.join(__dirname, '..', 'logs', `upload_${source}_${year}_${timestamp}.log`));

  runUpload(source, year).then(({ failCount }) => {
    if (failCount > 0) process.exitCode = 1;
  });
}
