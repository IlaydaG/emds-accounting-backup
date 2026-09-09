import 'dotenv/config';
import sql from 'mssql';

export type Source = 'EMDS' | 'EMDS_ARCHIVE' | 'ETS_V5';

const pools: Partial<Record<Source, sql.ConnectionPool>> = {};

function baseConfig(database: string): sql.config {
  return {
    server: process.env.DB_SERVER as string,
    port: Number(process.env.DB_PORT) || 1433,
    database,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: true,
    },
  };
}

export const DATABASE_NAMES: Record<Source, string | undefined> = {
  EMDS: process.env.DB_EMDS_DATABASE,
  EMDS_ARCHIVE: process.env.DB_EMDS_ARCHIVE_DATABASE,
  ETS_V5: process.env.DB_ETS_V5_DATABASE,
};

export async function getPool(source: Source): Promise<sql.ConnectionPool> {
  const existing = pools[source];
  if (existing) return existing;

  const database = DATABASE_NAMES[source];
  if (!database) {
    throw new Error(`Bilinmeyen kaynak: ${source}`);
  }

  const pool = await new sql.ConnectionPool(baseConfig(database)).connect();
  pools[source] = pool;
  return pool;
}

export async function closeAll(): Promise<void> {
  await Promise.all(Object.values(pools).map((pool) => pool!.close()));
}
