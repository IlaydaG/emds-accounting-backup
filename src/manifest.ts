import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface ManifestEntry {
  file: string;
  rowCount: number;
  byteSize: number;
  sha256: string;
}

export function buildManifestEntry(filePath: string, rowCount: number): ManifestEntry {
  const buffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    file: path.relative(process.cwd(), filePath),
    rowCount,
    byteSize: buffer.length,
    sha256,
  };
}

export function writeManifest(manifestPath: string, entries: ManifestEntry[]): void {
  const manifest = {
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    totalRowCount: entries.reduce((sum, e) => sum + e.rowCount, 0),
    files: entries,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}
