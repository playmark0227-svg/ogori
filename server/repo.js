// データアクセス層（複数ルートで共有する操作）。
import { getDb } from './db.js';
import { buildSchedule } from './schedule.js';

export function activeEmployeeCount(companyPk) {
  return getDb()
    .prepare("SELECT COUNT(*) AS c FROM employees WHERE company_pk = ? AND status = 'active'")
    .get(companyPk).c;
}

export function totalEmployeeCount(companyPk) {
  return getDb()
    .prepare('SELECT COUNT(*) AS c FROM employees WHERE company_pk = ?')
    .get(companyPk).c;
}

export function employeeCodeExists(companyPk, code) {
  return !!getDb()
    .prepare('SELECT 1 FROM employees WHERE company_pk = ? AND employee_code = ?')
    .get(companyPk, code);
}

export function companyIdExists(companyId) {
  return !!getDb().prepare('SELECT 1 FROM companies WHERE company_id = ?').get(companyId);
}

/**
 * 社員の配送スケジュールを（現在の年月から）生成して保存する。
 * 既に存在する年月（UNIQUE制約）はスキップする。
 * @param {Date} [now]
 */
export function generateDeliveriesForEmployee(companyPk, employeePk, now = new Date()) {
  const db = getDb();
  const rows = buildSchedule(now.getFullYear(), now.getMonth() + 1);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO deliveries
      (company_pk, employee_pk, year, month, product_type, product_name, status, scheduled_date, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  const nowIso = now.toISOString();
  for (const r of rows) {
    insert.run(
      companyPk,
      employeePk,
      r.year,
      r.month,
      r.product_type,
      r.product_name,
      'scheduled',
      r.scheduled_date,
      nowIso
    );
  }
}

export function listEmployees(companyPk) {
  return getDb()
    .prepare('SELECT * FROM employees WHERE company_pk = ? ORDER BY created_at ASC, id ASC')
    .all(companyPk);
}

export function getEmployee(companyPk, employeeId) {
  return getDb()
    .prepare('SELECT * FROM employees WHERE company_pk = ? AND id = ?')
    .get(companyPk, employeeId);
}

export function listCompanyDeliveries(companyPk, { limit = 500 } = {}) {
  return getDb()
    .prepare(
      `SELECT d.*, e.name AS employee_name, e.employee_code
         FROM deliveries d
         JOIN employees e ON e.id = d.employee_pk
        WHERE d.company_pk = ?
        ORDER BY d.year ASC, d.month ASC, e.name ASC
        LIMIT ?`
    )
    .all(companyPk, limit);
}

export function listEmployeeDeliveries(employeePk) {
  return getDb()
    .prepare('SELECT * FROM deliveries WHERE employee_pk = ? ORDER BY year ASC, month ASC')
    .all(employeePk);
}
