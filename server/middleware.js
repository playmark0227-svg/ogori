// 認可ミドルウェア: リクエストからセッションを解決する。
import { getDb } from './db.js';
import { getSession } from './auth.js';
import { parseCookies, HttpError } from './http.js';

export const ADMIN_COOKIE = 'ogori_admin';
export const EMP_COOKIE = 'ogori_emp';

function tokenFrom(req, cookieName) {
  const cookies = parseCookies(req);
  if (cookies[cookieName]) return cookies[cookieName];
  // Authorization: Bearer <token> も許可（APIクライアント用）。
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** 認証済み企業管理者を返す。未認証は 401。 */
export function requireAdmin(req) {
  const session = getSession(tokenFrom(req, ADMIN_COOKIE));
  if (!session || session.role !== 'admin') {
    throw new HttpError(401, 'ログインが必要です。');
  }
  const company = getDb().prepare('SELECT * FROM companies WHERE id = ?').get(session.subject_pk);
  if (!company) throw new HttpError(401, '会社が見つかりません。');
  return { session, company };
}

/** 認証済み社員を返す。未認証は 401。 */
export function requireEmployee(req) {
  const session = getSession(tokenFrom(req, EMP_COOKIE));
  if (!session || session.role !== 'employee') {
    throw new HttpError(401, 'ログインが必要です。');
  }
  const employee = getDb().prepare('SELECT * FROM employees WHERE id = ?').get(session.subject_pk);
  if (!employee) throw new HttpError(401, '社員が見つかりません。');
  return { session, employee };
}
