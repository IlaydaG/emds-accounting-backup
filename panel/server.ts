import express from 'express';
import fs from 'fs';
import path from 'path';
import * as zip from '@zip.js/zip.js';

const OUTPUT_ROOT = path.join(__dirname, '..', 'output');
const PORT = 4000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function resolveSafePath(relativePath: string): string {
  const target = path.resolve(OUTPUT_ROOT, relativePath || '.');
  if (!target.startsWith(OUTPUT_ROOT)) {
    throw new Error('Geçersiz yol');
  }
  return target;
}

app.get('/api/browse', (req, res) => {
  try {
    const relativePath = String(req.query.path || '');
    const dirPath = resolveSafePath(relativePath);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const folders = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const fullPath = path.join(dirPath, e.name);
        const itemCount = fs.readdirSync(fullPath).length;
        const stat = fs.statSync(fullPath);
        return { name: e.name, itemCount, lastUpdated: stat.mtime };
      });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const fullPath = path.join(dirPath, e.name);
        const stat = fs.statSync(fullPath);
        return { name: e.name, size: stat.size, lastUpdated: stat.mtime };
      });

    res.json({ path: relativePath, folders, files });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/decrypt', async (req, res) => {
  try {
    const { path: relativePath, password } = req.body as { path: string; password: string };
    const filePath = resolveSafePath(relativePath);

    const content = fs.readFileSync(filePath);
    const reader = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(content)), { password });
    const entries = await reader.getEntries();
    const fileEntry = entries[0] as zip.FileEntry;
    const text = await fileEntry.getData(new zip.TextWriter(), { password });
    await reader.close();

    const downloadName = path.basename(relativePath).replace(/\.zip$/, '.csv');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(text);
  } catch (err) {
    res.status(401).json({ error: 'Parola yanlış ya da dosya açılamadı' });
  }
});

app.listen(PORT, () => {
  console.log(`Panel calisiyor: http://localhost:${PORT}`);
});
