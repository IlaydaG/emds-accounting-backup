import sql from 'mssql';
import path from 'path';
import { writeCsvFile, CsvWriteResult } from './csv';

export interface TableConfig {
  table: string;
  partition: 'yearly' | 'monthly';
  periodColumn?: string;
}

async function getColumns(pool: sql.ConnectionPool, tableName: string): Promise<string[]> {
  const result = await pool
    .request()
    .input('table', tableName)
    .query<{ COLUMN_NAME: string }>(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `);
  return result.recordset.map((r) => r.COLUMN_NAME);
}

async function queryRows(
  pool: sql.ConnectionPool,
  tableName: string,
  periodColumn: string | undefined,
  start: Date | undefined,
  end: Date | undefined
): Promise<Record<string, unknown>[]> {
  const request = pool.request();
  let where = '';
  if (periodColumn && start && end) {
    request.input('start', start);
    request.input('end', end);
    where = ` WHERE [${periodColumn}] >= @start AND [${periodColumn}] < @end`;
  }
  const result = await request.query<Record<string, unknown>>(`SELECT * FROM [${tableName}]${where}`);
  return result.recordset;
}

function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function yearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export async function exportTable(
  pool: sql.ConnectionPool,
  cfg: TableConfig,
  year: number,
  outputRoot: string
): Promise<CsvWriteResult[]> {
  const columns = await getColumns(pool, cfg.table);
  const tableDir = path.join(outputRoot, String(year), cfg.table);

  if (cfg.partition === 'monthly') {
    const results: CsvWriteResult[] = [];
    for (let month = 1; month <= 12; month++) {
      const { start, end } = monthRange(year, month);
      const rows = await queryRows(pool, cfg.table, cfg.periodColumn, start, end);
      const fileName = `${cfg.table}_${year}_${String(month).padStart(2, '0')}.csv`;
      results.push(writeCsvFile(path.join(tableDir, fileName), columns, rows));
    }
    return results;
  }

  const { start, end } = cfg.periodColumn ? yearRange(year) : { start: undefined, end: undefined };
  const rows = await queryRows(pool, cfg.table, cfg.periodColumn, start, end);
  const fileName = `${cfg.table}_${year}.csv`;
  return [writeCsvFile(path.join(tableDir, fileName), columns, rows)];
}
