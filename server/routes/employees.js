// 企業管理者向け: 社員の登録・一覧・更新・削除。
import { getDb } from '../db.js';
import { HttpError, sendJson, readJsonBody } from '../http.js';
import { hashSecret } from '../auth.js';
import { requireAdmin } from '../middleware.js';
import { generateEmployeeCode, generatePin } from '../ids.js';
import {
  employeeCodeExists,
  generateDeliveriesForEmployee,
  listEmployees,
  getEmployee,
} from '../repo.js';
import { publicEmployee } from '../serialize.js';
import * as v from '../validate.js';

/** GET /api/employees — 社員一覧。 */
export async function list(req, res) {
  const { company } = requireAdmin(req);
  const rows = listEmployees(company.id).map(publicEmployee);
  sendJson(res, 200, { employees: rows });
}

/** POST /api/employees — 社員を登録。社員コードと初期PINを発行して返す。 */
export async function create(req, res) {
  const { company } = requireAdmin(req);
  const body = await readJsonBody(req);
  const name = v.str(body.name, '氏名', { max: 80 });
  const emailAddr = body.email ? v.email(body.email, 'メールアドレス', { required: false }) : null;
  const department = body.department ? v.optionalStr(body.department, '部署', { max: 80 }) : null;
  const postalCode = body.postalCode ? v.optionalStr(body.postalCode, '郵便番号', { max: 16 }) : null;
  const address = body.address ? v.optionalStr(body.address, '住所', { max: 300 }) : null;

  const db = getDb();
  const code = generateEmployeeCode((c) => employeeCodeExists(company.id, c));
  const pin = generatePin();
  const info = db
    .prepare(
      `INSERT INTO employees(company_pk, employee_code, name, email, department, postal_code, address, pin_hash, status, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      company.id,
      code,
      name,
      emailAddr,
      department,
      postalCode,
      address,
      hashSecret(pin),
      'active',
      new Date().toISOString()
    );

  const employeePk = Number(info.lastInsertRowid);
  generateDeliveriesForEmployee(company.id, employeePk);

  const emp = getEmployee(company.id, employeePk);
  // 初期PINはこの登録レスポンスでのみ返す（以後は取得不可）。
  sendJson(res, 201, {
    employee: publicEmployee(emp),
    credentials: {
      companyId: company.company_id,
      employeeCode: code,
      pin,
      note: '初期PINはこの画面でのみ表示されます。社員へ安全にお伝えください。',
    },
  });
}

/** PATCH /api/employees/:id — 社員情報の更新（氏名・部署・住所・ステータス）。 */
export async function update(req, res, { params }) {
  const { company } = requireAdmin(req);
  const emp = getEmployee(company.id, Number(params.id));
  if (!emp) throw new HttpError(404, '社員が見つかりません。');

  const body = await readJsonBody(req);
  const fields = {
    name: emp.name,
    email: emp.email,
    department: emp.department,
    postal_code: emp.postal_code,
    address: emp.address,
    status: emp.status,
  };
  if (body.name !== undefined) fields.name = v.str(body.name, '氏名', { max: 80 });
  if (body.email !== undefined) fields.email = body.email ? v.email(body.email, 'メールアドレス', { required: false }) : null;
  if (body.department !== undefined) fields.department = body.department ? v.optionalStr(body.department, '部署', { max: 80 }) : null;
  if (body.postalCode !== undefined) fields.postal_code = body.postalCode ? v.optionalStr(body.postalCode, '郵便番号', { max: 16 }) : null;
  if (body.address !== undefined) fields.address = body.address ? v.optionalStr(body.address, '住所', { max: 300 }) : null;
  if (body.status !== undefined) {
    if (!['active', 'paused'].includes(body.status)) throw new HttpError(400, 'ステータスが不正です。');
    fields.status = body.status;
  }

  getDb()
    .prepare(
      `UPDATE employees SET name=?, email=?, department=?, postal_code=?, address=?, status=? WHERE id=?`
    )
    .run(fields.name, fields.email, fields.department, fields.postal_code, fields.address, fields.status, emp.id);

  sendJson(res, 200, { employee: publicEmployee(getEmployee(company.id, emp.id)) });
}

/** POST /api/employees/:id/reset-pin — PINを再発行する。 */
export async function resetPin(req, res, { params }) {
  const { company } = requireAdmin(req);
  const emp = getEmployee(company.id, Number(params.id));
  if (!emp) throw new HttpError(404, '社員が見つかりません。');
  const pin = generatePin();
  getDb().prepare('UPDATE employees SET pin_hash = ? WHERE id = ?').run(hashSecret(pin), emp.id);
  sendJson(res, 200, {
    credentials: {
      companyId: company.company_id,
      employeeCode: emp.employee_code,
      pin,
      note: '新しいPINはこの画面でのみ表示されます。',
    },
  });
}

/** DELETE /api/employees/:id — 社員を削除（配送も連動削除）。 */
export async function remove(req, res, { params }) {
  const { company } = requireAdmin(req);
  const emp = getEmployee(company.id, Number(params.id));
  if (!emp) throw new HttpError(404, '社員が見つかりません。');
  getDb().prepare('DELETE FROM employees WHERE id = ?').run(emp.id);
  sendJson(res, 200, { ok: true });
}
