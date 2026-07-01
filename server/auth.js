// 認証: パスワード／PINハッシュ化、セッショントークン、認可ヘルパ。
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from './db.js';
import { SESSION_TTL_DAYS } from './config.js';

const SCRYPT_KEYLEN = 64;

/** パスワード/PIN をハッシュ化して "salt:hash"（hex）で返す。 */
export function hashSecret(secret) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(secret), salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/** ハッシュと平文を定数時間で照合する。 */
export function verifySecret(secret, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  let salt, expected;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const derived = scryptSync(String(secret), salt, SCRYPT_KEYLEN);
  return timingSafeEqual(derived, expected);
}

/** 新しいセッションを作成しトークンを返す。 */
export function createSession(role, subjectPk) {
  const db = getDb();
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    'INSERT INTO sessions(token, role, subject_pk, created_at, expires_at) VALUES(?,?,?,?,?)'
  ).run(token, role, subjectPk, now.toISOString(), expires.toISOString());
  return token;
}

/** トークンからセッションを取得。期限切れは破棄して null。 */
export function getSession(token) {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}

export function destroySession(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** 期限切れセッションの掃除（起動時などに呼ぶ）。 */
export function purgeExpiredSessions() {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}
