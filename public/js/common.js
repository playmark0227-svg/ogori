// 共通ユーティリティ: APIクライアント、トースト、DOMヘルパ、フォーマッタ。
import * as staticBackend from './static-backend.js';

// 静的モード判定: バックエンド無し（GitHub Pages 等）ではブラウザ内データで動作する。
// - github.io ホスト、file:// で開いた場合、または window.OGORI_STATIC=true の明示指定で有効。
export const STATIC_MODE =
  typeof window !== 'undefined' &&
  (window.OGORI_STATIC === true ||
    location.protocol === 'file:' ||
    /(^|\.)github\.io$/i.test(location.hostname));

export { staticBackend };

export const api = {
  async request(method, path, body) {
    // 静的モード: ネットワークを使わずローカルのモックバックエンドで応答。
    if (STATIC_MODE) {
      const { status, data } = staticBackend.handle(method, path, body);
      if (status >= 400) {
        const err = new Error((data && data.error) || `エラー (${status})`);
        err.status = status;
        err.data = data;
        throw err;
      }
      return data;
    }
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `エラー (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get: (p) => api.request('GET', p),
  post: (p, b) => api.request('POST', p, b),
  put: (p, b) => api.request('PUT', p, b),
  patch: (p, b) => api.request('PATCH', p, b),
  del: (p) => api.request('DELETE', p),
};

// ---- DOM ヘルパ ----
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ---- トースト ----
let toastHost;
export function toast(message, kind = '') {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const t = el('div', { class: `toast ${kind ? 'toast--' + kind : ''}`, text: message });
  toastHost.append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

// ---- フォーマッタ ----
export const yen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');
export function monthLabel(month) { return `${month}月`; }
export function productBadge(type, name) {
  const cls = type === 'rice' ? 'badge--rice' : 'badge--veg';
  const emoji = type === 'rice' ? '🍚' : '🥬';
  return `<span class="badge ${cls}">${emoji} ${escapeHtml(name)}</span>`;
}
export function statusBadge(status) {
  const map = {
    scheduled: ['badge--scheduled', '予定'],
    shipped: ['badge--shipped', '発送済'],
    delivered: ['badge--delivered', 'お届け済'],
  };
  const [cls, label] = map[status] || ['badge--scheduled', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ---- 共通ナビ描画 ----
export function renderNav(active) {
  const links = [
    { href: 'index.html', label: 'ホーム', key: 'home' },
    { href: 'admin.html', label: '企業管理', key: 'admin' },
    { href: 'employee.html', label: '社員ポータル', key: 'employee' },
  ];
  return `
  <header class="nav">
    <div class="wrap nav__inner">
      <a class="brand" href="index.html">
        <span class="brand__logo">🦍</span>
        <span>オゴリ <span class="brand__en">OGORI</span></span>
      </a>
      <div class="nav__spacer"></div>
      <nav class="nav__links">
        ${links.map((l) => `<a class="btn btn--sm ${l.key === active ? 'btn--primary' : 'btn--ghost'}" href="${l.href}">${l.label}</a>`).join('')}
      </nav>
    </div>
  </header>`;
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
