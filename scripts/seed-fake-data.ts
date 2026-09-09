import 'dotenv/config';
import sql from 'mssql';

const YEAR = 2025;

async function getSeedPool(): Promise<sql.ConnectionPool> {
  return new sql.ConnectionPool({
    server: process.env.DB_SERVER as string,
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_EMDS_DATABASE,
    user: process.env.SEED_DB_USER,
    password: process.env.SEED_DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: true,
    },
  }).connect();
}

const GROUPS = [
  { kod: 'MRK', ad: 'Merkez' },
  { kod: 'PRK', ad: 'Perakende' },
  { kod: 'TPT', ad: 'Toptan Satış' },
];

const COMPANIES = [
  { kod: 'FRM1', unvan: 'ABC Ticaret A.Ş.', vergiNo: '1234567890' },
  { kod: 'FRM2', unvan: 'Yıldız Gıda Ltd. Şti.', vergiNo: '2345678901' },
  { kod: 'FRM3', unvan: 'Deniz Tekstil San. Tic. A.Ş.', vergiNo: '3456789012' },
];

const BRANCH_NAMES = [
  'Kadıköy Şube',
  'Beşiktaş Şube',
  'Ankara Merkez Şube',
  'İzmir Şube',
  'Bursa Şube',
  'Antalya Şube',
];

const RECEIPT_DESCRIPTIONS = [
  'Kira ödemesi',
  'Mal alımı faturası',
  'Personel maaş ödemesi',
  'Elektrik faturası ödemesi',
  'Su faturası ödemesi',
  'Doğalgaz faturası ödemesi',
  'Nakliye gideri',
  'Ofis malzemesi alımı',
  'Banka komisyon kesintisi',
  'Müşteri tahsilatı',
];

const LINE_DESCRIPTIONS = [
  'Kira gideri',
  'KDV',
  'Kasa hesabından ödeme',
  'Banka hesabından ödeme',
  'Satış geliri',
  'Personel gideri',
  'Genel gider',
  'Tedarikçi borcu',
];

const ACCOUNT_CODES = ['100', '102', '120', '153', '191', '320', '600', '653', '760', '770'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function randomDateInMonth(year: number, month: number): Date {
  const day = randomInt(1, 28);
  const hour = randomInt(8, 18);
  const minute = randomInt(0, 59);
  return new Date(year, month - 1, day, hour, minute);
}

async function clearExisting(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    DELETE FROM ACCOUNTING_RECEIPT_DETAIL;
    DELETE FROM ACCOUNTING_RECEIPT;
    DELETE FROM APPCARD_VIRTUAL;
    DELETE FROM ACCOUNTING_BRANCH;
    DELETE FROM ACCOUNTING_COMPANY;
    DELETE FROM ACCOUNTING_GROUP;
  `);
}

async function seedGroups(pool: sql.ConnectionPool): Promise<number[]> {
  const ids: number[] = [];
  for (const g of GROUPS) {
    const result = await pool
      .request()
      .input('kod', g.kod)
      .input('ad', g.ad)
      .query<{ GRUP_ID: number }>(`
        INSERT INTO ACCOUNTING_GROUP (GRUP_KODU, GRUP_ADI, ACIKLAMA)
        OUTPUT INSERTED.GRUP_ID
        VALUES (@kod, @ad, @ad + ' grubu')
      `);
    ids.push(result.recordset[0].GRUP_ID);
  }
  return ids;
}

async function seedCompanies(pool: sql.ConnectionPool): Promise<number[]> {
  const ids: number[] = [];
  for (const c of COMPANIES) {
    const result = await pool
      .request()
      .input('kod', c.kod)
      .input('unvan', c.unvan)
      .input('vergiNo', c.vergiNo)
      .query<{ FIRMA_ID: number }>(`
        INSERT INTO ACCOUNTING_COMPANY (FIRMA_KODU, UNVAN, VERGI_NO, ACIKLAMA)
        OUTPUT INSERTED.FIRMA_ID
        VALUES (@kod, @unvan, @vergiNo, NULL)
      `);
    ids.push(result.recordset[0].FIRMA_ID);
  }
  return ids;
}

async function seedBranches(
  pool: sql.ConnectionPool,
  groupIds: number[],
  companyIds: number[]
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < BRANCH_NAMES.length; i++) {
    const result = await pool
      .request()
      .input('kod', `SUBE${i + 1}`)
      .input('ad', BRANCH_NAMES[i])
      .input('grupId', pick(groupIds))
      .input('firmaId', pick(companyIds))
      .query<{ SUBE_ID: number }>(`
        INSERT INTO ACCOUNTING_BRANCH (SUBE_KODU, SUBE_ADI, GRUP_ID, FIRMA_ID, ACIKLAMA)
        OUTPUT INSERTED.SUBE_ID
        VALUES (@kod, @ad, @grupId, @firmaId, NULL)
      `);
    ids.push(result.recordset[0].SUBE_ID);
  }
  return ids;
}

async function seedCards(pool: sql.ConnectionPool, branchIds: number[]): Promise<void> {
  for (let i = 0; i < 15; i++) {
    await pool
      .request()
      .input('kartNo', `9792${randomInt(1000000000, 9999999999)}`)
      .input('subeId', pick(branchIds))
      .query(`
        INSERT INTO APPCARD_VIRTUAL (KART_NO, SUBE_ID, AKTIF, ACIKLAMA)
        VALUES (@kartNo, @subeId, 1, 'Sanal kart')
      `);
  }
}

interface ReceiptSeed {
  fisNo: string;
  fisTarihi: Date;
  subeId: number;
  firmaId: number;
  grupId: number;
  aciklama: string;
}

async function seedReceiptsAndDetails(
  pool: sql.ConnectionPool,
  branchIds: number[],
  companyIds: number[],
  groupIds: number[]
): Promise<{ receiptCount: number; detailCount: number }> {
  let receiptCount = 0;
  let detailCount = 0;
  let fisSeq = 1;

  for (let month = 1; month <= 12; month++) {
    const receiptsThisMonth = randomInt(20, 30);

    for (let i = 0; i < receiptsThisMonth; i++) {
      const seed: ReceiptSeed = {
        fisNo: `${YEAR}-${String(month).padStart(2, '0')}-${String(fisSeq).padStart(5, '0')}`,
        fisTarihi: randomDateInMonth(YEAR, month),
        subeId: pick(branchIds),
        firmaId: pick(companyIds),
        grupId: pick(groupIds),
        aciklama: pick(RECEIPT_DESCRIPTIONS),
      };
      fisSeq++;

      const lineCount = randomInt(2, 5);
      const lines = Array.from({ length: lineCount }, () => {
        const isDebit = Math.random() > 0.5;
        const tutar = Number((randomInt(50, 20000) + Math.random()).toFixed(2));
        return {
          hesapKodu: pick(ACCOUNT_CODES),
          borc: isDebit ? tutar : 0,
          alacak: isDebit ? 0 : tutar,
          aciklama: pick(LINE_DESCRIPTIONS),
        };
      });
      const toplamTutar = lines.reduce((sum, l) => sum + l.borc + l.alacak, 0);

      const receiptResult = await pool
        .request()
        .input('fisNo', seed.fisNo)
        .input('fisTarihi', seed.fisTarihi)
        .input('subeId', seed.subeId)
        .input('firmaId', seed.firmaId)
        .input('grupId', seed.grupId)
        .input('aciklama', seed.aciklama)
        .input('toplam', toplamTutar)
        .query<{ FIS_ID: number }>(`
          INSERT INTO ACCOUNTING_RECEIPT
            (FIS_NO, FIS_TARIHI, SUBE_ID, FIRMA_ID, GRUP_ID, FIS_ACIKLAMASI, TOPLAM_TUTAR)
          OUTPUT INSERTED.FIS_ID
          VALUES (@fisNo, @fisTarihi, @subeId, @firmaId, @grupId, @aciklama, @toplam)
        `);
      const fisId = receiptResult.recordset[0].FIS_ID;
      receiptCount++;

      for (let satirNo = 0; satirNo < lines.length; satirNo++) {
        const line = lines[satirNo];
        await pool
          .request()
          .input('fisId', fisId)
          .input('satirNo', satirNo + 1)
          .input('hesapKodu', line.hesapKodu)
          .input('borc', line.borc)
          .input('alacak', line.alacak)
          .input('aciklama', line.aciklama)
          .input('kayitTarihi', seed.fisTarihi)
          .query(`
            INSERT INTO ACCOUNTING_RECEIPT_DETAIL
              (FIS_ID, SATIR_NO, HESAP_KODU, BORC, ALACAK, SATIR_ACIKLAMASI, KAYIT_TARIHI)
            VALUES (@fisId, @satirNo, @hesapKodu, @borc, @alacak, @aciklama, @kayitTarihi)
          `);
        detailCount++;
      }
    }
  }

  return { receiptCount, detailCount };
}

(async () => {
  const pool = await getSeedPool();

  console.log('Mevcut EMDS verisi temizleniyor...');
  await clearExisting(pool);

  console.log('Referans tablolar dolduruluyor (grup, firma, şube, kart)...');
  const groupIds = await seedGroups(pool);
  const companyIds = await seedCompanies(pool);
  const branchIds = await seedBranches(pool, groupIds, companyIds);
  await seedCards(pool, branchIds);

  console.log(`${YEAR} yılı için fiş ve fiş detayları oluşturuluyor...`);
  const { receiptCount, detailCount } = await seedReceiptsAndDetails(
    pool,
    branchIds,
    companyIds,
    groupIds
  );

  console.log(
    `Tamamlandı: ${GROUPS.length} grup, ${COMPANIES.length} firma, ${branchIds.length} şube, 15 kart, ${receiptCount} fiş, ${detailCount} fiş detayı.`
  );

  await pool.close();
})().catch((err) => {
  console.error('Seed hatası:', err);
  process.exit(1);
});
