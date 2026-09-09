import { getPool, closeAll, DATABASE_NAMES, Source } from '../src/db';
import tables from '../config/tables.json';

const DATE_TYPES = new Set(['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset']);

interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
}

interface PkRow {
  COLUMN_NAME: string;
}

async function describeTable(source: Source, tableName: string): Promise<void> {
  const pool = await getPool(source);

  const columns = await pool
    .request()
    .input('table', tableName)
    .query<ColumnRow>(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `);

  if (columns.recordset.length === 0) {
    console.log(`  [YOK] ${tableName} — bu veritabanında bulunamadı`);
    return;
  }

  const pk = await pool
    .request()
    .input('table', tableName)
    .query<PkRow>(`
      SELECT kcu.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = @table AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    `);
  const pkColumns = new Set(pk.recordset.map((r) => r.COLUMN_NAME));

  const countResult = await pool.request().query<{ rowTotal: number }>(
    `SELECT COUNT(*) AS rowTotal FROM [${tableName.replace(/]/g, ']]')}]`
  );
  const rowCount = countResult.recordset[0]?.rowTotal ?? 0;

  console.log(`  ${tableName} (${rowCount} satır)`);
  for (const col of columns.recordset) {
    const isDateCandidate = DATE_TYPES.has(col.DATA_TYPE.toLowerCase());
    const flags = [
      pkColumns.has(col.COLUMN_NAME) ? 'PK' : null,
      isDateCandidate ? 'DÖNEM ADAYI' : null,
      col.IS_NULLABLE === 'NO' ? 'NOT NULL' : null,
    ]
      .filter(Boolean)
      .join(', ');

    const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`    - ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length}${flags ? '  [' + flags + ']' : ''}`);
  }
}

(async () => {
  for (const source of Object.keys(DATABASE_NAMES) as Source[]) {
    if (!DATABASE_NAMES[source]) {
      console.log(`[SKIP] ${source}: .env içinde database adı tanımlı değil`);
      continue;
    }

    console.log(`\n=== ${source} (${DATABASE_NAMES[source]}) ===`);
    try {
      await getPool(source);
    } catch (err) {
      console.log(`  [FAIL] bağlantı kurulamadı — ${(err as Error).message}`);
      continue;
    }

    for (const { table } of tables) {
      try {
        await describeTable(source, table);
      } catch (err) {
        console.log(`  [HATA] ${table} — ${(err as Error).message}`);
      }
    }
  }
  await closeAll();
})();
