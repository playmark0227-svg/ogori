// デモデータ投入。`npm run seed` で実行、または OGORI_SEED=1 で起動時に自動投入。
import { fileURLToPath } from 'node:url';
import { getDb, initDb } from './db.js';
import { hashSecret } from './auth.js';
import { generateCompanyId, generateEmployeeCode } from './ids.js';
import { companyIdExists, employeeCodeExists, generateDeliveriesForEmployee } from './repo.js';

const DEMO_ADMIN_EMAIL = 'admin@demo-ogori.jp';
const DEMO_ADMIN_PASSWORD = 'gorigori2026';

const DEMO_EMPLOYEES = [
  { name: '田中 太郎', department: '営業部', pin: '123456', postal: '150-0001', address: '東京都渋谷区神宮前1-1-1' },
  { name: '佐藤 花子', department: '開発部', pin: '234567', postal: '060-0001', address: '北海道札幌市中央区北一条西2-3' },
  { name: '鈴木 一郎', department: '人事部', pin: '345678', postal: '', address: '' },
  { name: '高橋 みどり', department: '開発部', pin: '456789', postal: '530-0001', address: '大阪府大阪市北区梅田3-1-1' },
  { name: '伊藤 健', department: '営業部', pin: '567890', postal: '', address: '' },
];

/** デモ会社を1社作成し、認証情報を返す。 */
export function seedDemo() {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM companies WHERE admin_email = ?').get(DEMO_ADMIN_EMAIL);
  if (existing) {
    return { companyId: existing.company_id, alreadyExists: true };
  }

  const companyId = generateCompanyId(companyIdExists);
  const info = db
    .prepare(
      `INSERT INTO companies(company_id, name, admin_name, admin_email, password_hash, plan, created_at)
       VALUES(?,?,?,?,?,?,?)`
    )
    .run(
      companyId,
      'デモ株式会社',
      '福利厚生 担当',
      DEMO_ADMIN_EMAIL,
      hashSecret(DEMO_ADMIN_PASSWORD),
      'standard',
      new Date().toISOString()
    );
  const companyPk = Number(info.lastInsertRowid);

  const empCreds = [];
  for (const e of DEMO_EMPLOYEES) {
    const code = generateEmployeeCode((c) => employeeCodeExists(companyPk, c));
    const empInfo = db
      .prepare(
        `INSERT INTO employees(company_pk, employee_code, name, email, department, postal_code, address, pin_hash, status, created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`
      )
      .run(companyPk, code, e.name, null, e.department, e.postal || null, e.address || null, hashSecret(e.pin), 'active', new Date().toISOString());
    generateDeliveriesForEmployee(companyPk, Number(empInfo.lastInsertRowid));
    empCreds.push({ name: e.name, employeeCode: code, pin: e.pin });
  }

  return {
    companyId,
    adminEmail: DEMO_ADMIN_EMAIL,
    adminPassword: DEMO_ADMIN_PASSWORD,
    employees: empCreds,
    alreadyExists: false,
  };
}

/** 起動時フック: OGORI_SEED=1 のときのみ投入。 */
export function maybeSeed() {
  if (process.env.OGORI_SEED !== '1') return;
  const result = seedDemo();
  if (result.alreadyExists) {
    console.log(`[seed] デモデータは既に存在します（会社ID: ${result.companyId}）。`);
  } else {
    printCreds(result);
  }
}

function printCreds(result) {
  console.log('\n[seed] デモデータを投入しました 🦍');
  console.log('  ── 企業管理者 ──────────────────────────');
  console.log(`  会社ID   : ${result.companyId}`);
  console.log(`  メール   : ${result.adminEmail}`);
  console.log(`  パスワード: ${result.adminPassword}`);
  console.log('  ── 社員（会社ID＋社員コード＋PINでログイン）──');
  for (const e of result.employees) {
    console.log(`  ${e.name.padEnd(12, '　')} コード: ${e.employeeCode}  PIN: ${e.pin}`);
  }
  console.log('');
}

// 直接実行された場合はDBを初期化して投入。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  initDb(process.env.OGORI_DB);
  const result = seedDemo();
  if (result.alreadyExists) {
    console.log(`デモデータは既に存在します（会社ID: ${result.companyId}）。`);
  } else {
    printCreds(result);
  }
}
