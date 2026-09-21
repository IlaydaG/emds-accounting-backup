import fs from 'fs';
import path from 'path';

let logFilePath: string | null = null;

export function initLogger(filePath: string): void {
  logFilePath = filePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function write(level: 'INFO' | 'ERROR', message: string, extra?: Record<string, unknown>): void {
  const event = { timestamp: new Date().toISOString(), level, message, ...extra };
  const line = JSON.stringify(event);
  console.log(line);
  if (logFilePath) fs.appendFileSync(logFilePath, line + '\n', 'utf8');
}

export const log = {
  info: (message: string, extra?: Record<string, unknown>) => write('INFO', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => write('ERROR', message, extra),
};
