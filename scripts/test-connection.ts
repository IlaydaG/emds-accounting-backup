import { getPool, closeAll, DATABASE_NAMES, Source } from '../src/db';

async function testSource(source: Source): Promise<void> {
  const database = DATABASE_NAMES[source];
  if (!database) {
    console.log(`[SKIP] ${source}: .env içinde database adı tanımlı değil`);
    return;
  }

  try {
    const pool = await getPool(source);
    const result = await pool.request().query('SELECT 1 AS ok');
    console.log(`[OK]   ${source} (${database}) — bağlantı başarılı, sonuç:`, result.recordset);
  } catch (err) {
    console.log(`[FAIL] ${source} (${database}) —`, (err as Error).message);
  }
}

(async () => {
  for (const source of Object.keys(DATABASE_NAMES) as Source[]) {
    await testSource(source);
  }
  await closeAll();
})();
