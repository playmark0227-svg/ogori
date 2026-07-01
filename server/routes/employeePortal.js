// 社員向けポータル: ログイン・自分の情報・お届け先住所の更新・配送履歴。
import { getDb } from '../db.js';
import { HttpError, sendJson, readJsonBody, setCookie, clearCookie } from '../http.js';
import { verifySecret, hashSecret, createSession, destroySession } from '../auth.js';
import { requireEmployee, EMP_COOKIE } from '../middleware.js';
import { listEmployeeDeliveries } from '../repo.js';
import { publicEmployee, publicDelivery, publicCompany } from '../serialize.js';
import { SESSION_TTL_DAYS } from '../config.js';
import { productForMonth } from '../schedule.js';
import * as v from '../validate.js';

const cookieOpts = { maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 };

/** POST /api/employee/login — 会社ID＋社員コード＋PINでログイン。 */
export async function login(req, res) {
  const body = await readJsonBody(req);
  const companyId = v.str(body.companyId, '会社ID', { max: 40 }).toUpperCase();
  const employeeCode = v.str(body.employeeCode, '社員コード', { max: 40 }).toUpperCase();
  const pinValue = v.str(body.pin, 'PIN', { trim: true, max: 12 });

  const db = getDb();
  const company = db.prepare('SELECT * FROM companies WHERE company_id = ?').get(companyId);
  const emp = company
    ? db
        .prepare('SELECT * FROM employees WHERE company_pk = ? AND employee_code = ?')
        .get(company.id, employeeCode)
    : null;

  const ok = emp ? verifySecret(pinValue, emp.pin_hash) : verifySecret(pinValue, 'aa:bb');
  if (!company || !emp || !ok) {
    throw new HttpError(401, '会社ID・社員コード・PINのいずれかが正しくありません。');
  }
  if (emp.status !== 'active') {
    throw new HttpError(403, 'このアカウントは現在利用できません。管理者にお問い合わせください。');
  }

  const token = createSession('employee', emp.id);
  setCookie(res, EMP_COOKIE, token, cookieOpts);
  sendJson(res, 200, { employee: publicEmployee(emp) });
}

/** POST /api/employee/logout */
export async function logout(req, res) {
  const cookies = req.headers.cookie || '';
  const match = /ogori_emp=([^;]+)/.exec(cookies);
  if (match) destroySession(decodeURIComponent(match[1]));
  clearCookie(res, EMP_COOKIE);
  sendJson(res, 200, { ok: true });
}

/** GET /api/employee/me — 自分の情報＋所属会社＋配送履歴。 */
export async function me(req, res) {
  const { employee } = requireEmployee(req);
  const db = getDb();
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(employee.company_pk);
  const deliveries = listEmployeeDeliveries(employee.id).map(publicDelivery);
  const now = new Date();

  sendJson(res, 200, {
    employee: publicEmployee(employee),
    company: { companyId: company.company_id, name: company.name },
    thisMonth: { month: now.getMonth() + 1, product: productForMonth(now.getMonth() + 1) },
    deliveries,
  });
}

/** PUT /api/employee/address — お届け先住所を更新。 */
export async function updateAddress(req, res) {
  const { employee } = requireEmployee(req);
  const body = await readJsonBody(req);
  const postalCode = v.str(body.postalCode, '郵便番号', { max: 16 });
  const address = v.str(body.address, '住所', { max: 300 });

  getDb()
    .prepare('UPDATE employees SET postal_code = ?, address = ? WHERE id = ?')
    .run(postalCode, address, employee.id);

  const updated = getDb().prepare('SELECT * FROM employees WHERE id = ?').get(employee.id);
  sendJson(res, 200, { employee: publicEmployee(updated) });
}

/** PUT /api/employee/pin — PINを変更する。 */
export async function changePin(req, res) {
  const { employee } = requireEmployee(req);
  const body = await readJsonBody(req);
  const current = v.str(body.currentPin, '現在のPIN', { max: 12 });
  const next = v.pin(body.newPin, '新しいPIN');
  if (!verifySecret(current, employee.pin_hash)) {
    throw new HttpError(401, '現在のPINが正しくありません。');
  }
  getDb().prepare('UPDATE employees SET pin_hash = ? WHERE id = ?').run(hashSecret(next), employee.id);
  sendJson(res, 200, { ok: true });
}
