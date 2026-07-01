// ID・コード生成ユーティリティ。
import { randomInt } from 'node:crypto';

// 紛らわしい文字（0/O, 1/I/L）を除いた英数字。
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * 会社ID（社外に共有する識別子）。例: OGORI-7X4K2A
 * @param {(id:string)=>boolean} exists - 既存判定。衝突したら再生成する。
 */
export function generateCompanyId(exists) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `OGORI-${randomCode(6)}`;
    if (!exists || !exists(id)) return id;
  }
  throw new Error('会社IDの生成に失敗しました。');
}

/**
 * 社員コード（会社内で一意）。例: EMP-4KD9
 * @param {(code:string)=>boolean} exists
 */
export function generateEmployeeCode(exists) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = `EMP-${randomCode(4)}`;
    if (!exists || !exists(code)) return code;
  }
  throw new Error('社員コードの生成に失敗しました。');
}

/** 初期ログインPIN（6桁）。 */
export function generatePin() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
