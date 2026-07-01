// ログイン試行のレート制限＆ロックアウト（インメモリ・依存無し）。
// アカウント単位とIP単位の二段構えで総当たりを抑止する。

const WINDOW_MS = 15 * 60 * 1000; // 15分の観測ウィンドウ
const ACCOUNT_MAX = 8;            // 同一アカウントへの失敗許容回数
const IP_MAX = 40;               // 同一IPからの失敗許容回数（複数アカウント列挙対策）
const LOCK_MS = 15 * 60 * 1000;  // ロックアウト時間
const MAX_ENTRIES = 50_000;      // メモリ保護（異常時の上限）

const store = new Map(); // key -> { count, firstAt, lockUntil }

function entryFor(key, now) {
  let e = store.get(key);
  if (!e || now - e.firstAt > WINDOW_MS) {
    // ウィンドウ経過はリセット（ただしロック中は維持）。
    if (e && e.lockUntil && e.lockUntil > now) return e;
    e = { count: 0, firstAt: now, lockUntil: 0 };
    store.set(key, e);
  }
  return e;
}

/** ロック状態を確認。ロック中なら {locked:true, retryAfterSec}。 */
function isLocked(key, now) {
  const e = store.get(key);
  if (e && e.lockUntil && e.lockUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((e.lockUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

/**
 * ログイン試行前のチェック。ロック中のキーがあれば {locked, retryAfterSec}。
 * @param {string[]} keys - アカウントキー・IPキーなど
 */
export function checkLogin(keys, now = Date.now()) {
  for (const key of keys) {
    const r = isLocked(key, now);
    if (r.locked) return r;
  }
  return { locked: false, retryAfterSec: 0 };
}

/** ログイン失敗を記録。閾値超過でロックする。 */
export function recordFailure(keys, now = Date.now()) {
  if (store.size > MAX_ENTRIES) store.clear(); // フェイルセーフ
  for (const key of keys) {
    const e = entryFor(key, now);
    e.count += 1;
    const max = key.startsWith('ip:') ? IP_MAX : ACCOUNT_MAX;
    if (e.count >= max) {
      e.lockUntil = now + LOCK_MS;
    }
  }
}

/** ログイン成功時に該当キーの記録をクリアする。 */
export function recordSuccess(keys) {
  for (const key of keys) store.delete(key);
}

/** テスト用。 */
export function _reset() {
  store.clear();
}
