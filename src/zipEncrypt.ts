import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as zip from '@zip.js/zip.js';

const PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

export function generatePassword(length = 24): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('');
}

export async function encryptFileToZip(
  sourcePath: string,
  zipPath: string,
  password: string
): Promise<void> {
  const content = fs.readFileSync(sourcePath);
  const entryName = path.basename(sourcePath);

  const zipWriter = new zip.ZipWriter(new zip.Uint8ArrayWriter());
  await zipWriter.add(entryName, new zip.Uint8ArrayReader(new Uint8Array(content)), {
    password,
    encryptionStrength: 3,
  });
  const data = await zipWriter.close();

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.writeFileSync(zipPath, data);
}
