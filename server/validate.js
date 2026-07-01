// 入力バリデーションのヘルパ。
import { HttpError } from './http.js';

export function str(value, field, { required = true, min = 0, max = 500, trim = true } = {}) {
  let v = value;
  if (v == null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `${field}は文字列で指定してください。`);
  if (trim) v = v.trim();
  if (required && v.length === 0) throw new HttpError(400, `${field}を入力してください。`);
  if (v.length < min) throw new HttpError(400, `${field}は${min}文字以上で入力してください。`);
  if (v.length > max) throw new HttpError(400, `${field}は${max}文字以内で入力してください。`);
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(value, field = 'メールアドレス', { required = true } = {}) {
  const v = str(value, field, { required, max: 254 });
  if (!v && !required) return v;
  if (!EMAIL_RE.test(v)) throw new HttpError(400, `${field}の形式が正しくありません。`);
  return v.toLowerCase();
}

export function password(value, field = 'パスワード') {
  const v = str(value, field, { min: 8, max: 200, trim: false });
  return v;
}

export function pin(value, field = 'PIN') {
  const v = str(value, field, { min: 4, max: 12, trim: true });
  if (!/^\d+$/.test(v)) throw new HttpError(400, `${field}は数字で入力してください。`);
  return v;
}

export function optionalStr(value, field, opts = {}) {
  return str(value, field, { required: false, ...opts });
}
