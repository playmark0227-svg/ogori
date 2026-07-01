// 依存無しの小さなHTTPユーティリティ（レスポンス整形・ボディ解析・Cookie・ルーター）。

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendError(res, status, message, extra = {}) {
  sendJson(res, status, { error: message, ...extra });
}

/** APIハンドラ内で throw して任意のステータスを返すための例外。 */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const MAX_BODY_BYTES = 1_000_000; // 1MB 上限

/** リクエストボディをJSONとして読む。空なら {}。 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'リクエストが大きすぎます。'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, '不正なJSONです。'));
      }
    });
    req.on('error', reject);
  });
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) cookie += '; HttpOnly';
  if (typeof maxAge === 'number') cookie += `; Max-Age=${maxAge}`;
  appendHeader(res, 'Set-Cookie', cookie);
}

export function clearCookie(res, name, { path = '/' } = {}) {
  appendHeader(res, 'Set-Cookie', `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function appendHeader(res, name, value) {
  const existing = res.getHeader(name);
  if (!existing) res.setHeader(name, value);
  else if (Array.isArray(existing)) res.setHeader(name, [...existing, value]);
  else res.setHeader(name, [existing, value]);
}

/**
 * 超軽量ルーター。パターンは '/api/employees/:id' 形式。
 * ハンドラは (req, res, ctx) を受け取る。ctx.params にパスパラメータ。
 */
export function createRouter() {
  const routes = [];
  function add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return '([^/]+)';
        }) +
        '/?$'
    );
    routes.push({ method, regex, keys, handler });
  }
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    patch: (p, h) => add('PATCH', p, h),
    delete: (p, h) => add('DELETE', p, h),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.regex.exec(pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { handler: r.handler, params };
      }
      return null;
    },
  };
}
