import fs from 'fs';
import path from 'path';

const BOM = String.fromCharCode(0xfeff); //türkçe karakterler için

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function formatIsoDateTime(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatIsoDateTime(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

function escapeField(raw: string): string {
  if (/[";\r\n]/.test(raw)) {
    return '"' + raw.replace(/"/g, '""') + '"';
  }
  return raw;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(';')];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeField(formatValue(row[col]))).join(';'));
  }
  return lines.join('\r\n') + '\r\n';
}

export interface CsvWriteResult {
  filePath: string;
  rowCount: number;
}

export function writeCsvFile(
  filePath: string,
  columns: string[],
  rows: Record<string, unknown>[]
): CsvWriteResult {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, BOM + toCsv(columns, rows), 'utf8');
  return { filePath, rowCount: rows.length };
}
