// 企業（管理者）向けルート: 登録・ログイン・会社情報・統計。
import { getDb } from '../db.js';
import { HttpError, sendJson, readJsonBody, setCookie, clearCookie, clientIp } from '../http.js';
import { hashSecret, verifySecret, createSession, destroySession } from '../auth.js';
import { checkLogin, recordFailure, recordSuccess } from '../ratelimit.js';
import { requireAdmin, ADMIN_COOKIE } from '../middleware.js';
import { generateCompanyId } from '../ids.js';
import { companyIdExists, activeEmployeeCount, totalEmployeeCount } from '../repo.js';
import { publicCompany } from '../serialize.js';
import { costSummary, productForMonth } from '../schedule.js';
import { EXPECTED_EFFECTS, PRICING, SESSION_TTL_DAYS } from '../config.js';
import * as v from '../validate.js';

const cookieOpts = { maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 };

/** POST /api/companies/register — 会社を登録して会社IDを発行、管理者としてログイン。 */
export async function register(req, res) {
  const body = await readJsonBody(req);
  const name = v.str(body.companyName, '会社名', { max: 120 });
  const adminName = v.str(body.adminName, '担当者名', { max: 80 });
  const adminEmail = v.email(body.adminEmail);
  const pw = v.password(body.password);

  const db = getDb();
  const dup = db.prepare('SELECT 1 FROM companies WHERE admin_email = ?').get(adminEmail);
  if (dup) throw new HttpError(409, 'このメールアドレスは既に登録されています。');

  const companyId = generateCompanyId(companyIdExists);
  const info = db
    .prepare(
      `INSERT INTO companies(company_id, name, admin_name, admin_email, password_hash, plan, created_at)
       VALUES(?,?,?,?,?,?,?)`
    )
    .run(companyId, name, adminName, adminEmail, hashSecret(pw), 'standard', new Date().toISOString());

  const token = createSession('admin', Number(info.lastInsertRowid));
  setCookie(res, ADMIN_COOKIE, token, cookieOpts);

  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(info.lastInsertRowid);
  sendJson(res, 201, { company: publicCompany(company), companyId });
}

/** POST /api/companies/login — 管理者ログイン。 */
export async function login(req, res) {
  const body = await readJsonBody(req);
  const adminEmail = v.email(body.adminEmail);
  const pw = v.str(body.password, 'パスワード', { trim: false });

  // 総当たり対策: アカウント単位・IP単位でロックアウト。
  const keys = [`admin:${adminEmail}`, `ip:${clientIp(req)}`];
  const lock = checkLogin(keys);
  if (lock.locked) {
    throw new HttpError(429, `試行回数が上限に達しました。約${Math.ceil(lock.retryAfterSec / 60)}分後に再度お試しください。`, { retryAfter: lock.retryAfterSec });
  }

  const db = getDb();
  const company = db.prepare('SELECT * FROM companies WHERE admin_email = ?').get(adminEmail);
  // タイミング差を避けるためダミー検証も行う。
  const ok = company
    ? verifySecret(pw, company.password_hash)
    : verifySecret(pw, 'aa:bb');
  if (!company || !ok) {
    recordFailure(keys);
    throw new HttpError(401, 'メールアドレスまたはパスワードが正しくありません。');
  }
  recordSuccess(keys);

  const token = createSession('admin', company.id);
  setCookie(res, ADMIN_COOKIE, token, cookieOpts);
  sendJson(res, 200, { company: publicCompany(company), companyId: company.company_id });
}

/** POST /api/companies/logout */
export async function logout(req, res) {
  const cookies = req.headers.cookie || '';
  const match = /ogori_admin=([^;]+)/.exec(cookies);
  if (match) destroySession(decodeURIComponent(match[1]));
  clearCookie(res, ADMIN_COOKIE);
  sendJson(res, 200, { ok: true });
}

/** GET /api/companies/me — ログイン中の会社情報＋料金＋統計。 */
export async function me(req, res) {
  const { company } = requireAdmin(req);
  sendJson(res, 200, buildDashboard(company));
}

function buildDashboard(company) {
  const active = activeEmployeeCount(company.id);
  const total = totalEmployeeCount(company.id);
  const now = new Date();
  const thisMonthProduct = productForMonth(now.getMonth() + 1);
  const nextMonthNum = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
  const nextMonthProduct = productForMonth(nextMonthNum);

  return {
    company: publicCompany(company),
    stats: {
      activeEmployees: active,
      totalEmployees: total,
      cost: costSummary(active),
      thisMonth: {
        month: now.getMonth() + 1,
        product: thisMonthProduct,
      },
      nextMonth: {
        month: nextMonthNum,
        product: nextMonthProduct,
      },
    },
    pricing: PRICING,
    expectedEffects: EXPECTED_EFFECTS,
  };
}
