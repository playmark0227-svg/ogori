// SQLite（Node.js 組み込み node:sqlite）の初期化とスキーマ定義。
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

let db;

/**
 * データベースを開いて初期化する。
 * @param {string} [dbPath] - 省略時は data/ogori.db。テスト用に ':memory:' を渡せる。
 */
export function initDb(dbPath) {
  if (dbPath !== ':memory:') {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  const path = dbPath ?? join(DATA_DIR, 'ogori.db');
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  createSchema(db);
  return db;
}

export function getDb() {
  if (!db) throw new Error('DB が初期化されていません。initDb() を先に呼び出してください。');
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id    TEXT NOT NULL UNIQUE,     -- 例: OGORI-7X4K2A（社外に共有するID）
      name          TEXT NOT NULL,
      admin_name    TEXT NOT NULL,
      admin_email   TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      plan          TEXT NOT NULL DEFAULT 'standard',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      company_pk    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      employee_code TEXT NOT NULL,             -- 会社内で一意。会社ID＋社員コード＋PINでログイン
      name          TEXT NOT NULL,
      email         TEXT,
      department    TEXT,
      postal_code   TEXT,
      address       TEXT,
      pin_hash      TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active', -- active | paused
      created_at    TEXT NOT NULL,
      UNIQUE(company_pk, employee_code)
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      company_pk     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      employee_pk    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      year           INTEGER NOT NULL,
      month          INTEGER NOT NULL,          -- 1-12
      product_type   TEXT NOT NULL,             -- rice | vegetable
      product_name   TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | shipped | delivered
      scheduled_date TEXT NOT NULL,             -- YYYY-MM-DD
      created_at     TEXT NOT NULL,
      UNIQUE(employee_pk, year, month)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      role       TEXT NOT NULL,                 -- admin | employee
      subject_pk INTEGER NOT NULL,              -- admin:companies.id / employee:employees.id
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_pk);
    CREATE INDEX IF NOT EXISTS idx_deliveries_company ON deliveries(company_pk);
    CREATE INDEX IF NOT EXISTS idx_deliveries_employee ON deliveries(employee_pk);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}
