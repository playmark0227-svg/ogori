// =============================================================================
// 静的バックエンド（GitHub Pages 等、サーバー無しで動かすための localStorage 実装）
// server/ 配下のAPIと同じレスポンス形状を、ブラウザ内のデータで再現する。
// ※ これはデモ用。データはブラウザのローカルに保存され、共有・永続保証はありません。
// =============================================================================

const STORE_KEY = 'ogori_static_v1';

// ---- 事業定数（server/config.js と対応） ----
const PRICING = { monthlyPerEmployee: 10000, taxRate: 0.1, currency: 'JPY',
  includes: ['導入費用', '従業員様への利用促進サポート', 'お米／野菜の商品費用', '配送料'] };
const PRODUCTS = {
  rice: { type: 'rice', name: 'お米 5kg', emoji: '🍚', icon: 'assets/rice.png' },
  vegetable: { type: 'vegetable', name: '旬の野菜セット', emoji: '🥬', icon: 'assets/vegetable.svg' },
};
const EXPECTED_EFFECTS = [
  { key: 'seatRate', label: '採用イベントでの着座率', value: '1.7倍', note: '「お米がもらえる」というキャッチーさで着座率が向上' },
  { key: 'recruitCost', label: '採用費用', value: '大幅削減', note: '採用単価・広告費の圧縮に貢献' },
  { key: 'retention', label: '離職率', value: '低下', note: 'ご家族にも届く安心感で定着率アップ' },
];
const BRAND = { name: 'オゴリ', nameEn: 'OGORI', tagline: '社長のお米が、社員のご自宅へ。',
  description: '会社ごとのIDを発行して、社内の福利厚生をまるごとサポートするプラットフォーム。' };

// ---- スケジュール／料金（server/schedule.js と対応） ----
function productForMonth(month) { return month % 2 === 0 ? PRODUCTS.rice : PRODUCTS.vegetable; }
function pad2(n) { return String(n).padStart(2, '0'); }
function buildSchedule(startYear, startMonth, months = 12) {
  const rows = []; let y = startYear, m = startMonth;
  for (let i = 0; i < months; i++) {
    const p = productForMonth(m);
    rows.push({ year: y, month: m, product_type: p.type, product_name: p.name, scheduled_date: `${y}-${pad2(m)}-10` });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return rows;
}
function costSummary(active) {
  const per = PRICING.monthlyPerEmployee;
  const monthlyExcl = per * active;
  const monthlyIncl = Math.round(monthlyExcl * (1 + PRICING.taxRate));
  return { employees: active, perEmployeeExclTax: per, perEmployeeInclTax: Math.round(per * 1.1),
    monthlyExclTax: monthlyExcl, monthlyInclTax: monthlyIncl,
    annualExclTax: monthlyExcl * 12, annualInclTax: monthlyIncl * 12, taxRate: PRICING.taxRate };
}

// ---- ID生成（server/ids.js と対応） ----
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function randCode(len) { let s = ''; for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; return s; }
function genCompanyId(state) { let id; do { id = `OGORI-${randCode(6)}`; } while (state.companies.some((c) => c.company_id === id)); return id; }
function genEmployeeCode(state, companyPk) { let c; do { c = `EMP-${randCode(4)}`; } while (state.employees.some((e) => e.company_pk === companyPk && e.employee_code === c)); return c; }
function genPin() { return String(Math.floor(Math.random() * 100000000)).padStart(8, '0'); }

// ---- 永続化 ----
function blankState() {
  return { seq: { company: 0, employee: 0, delivery: 0 }, companies: [], employees: [], deliveries: [],
    session: { adminCompanyPk: null, employeePk: null }, demo: null };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const s = blankState();
  seed(s);
  save(s);
  return s;
}
function save(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota等は無視 */ }
}
let state = null;
function db() { if (!state) state = load(); return state; }
function commit() { save(db()); }

// ---- レスポンスヘルパ ----
const ok = (data, status = 200) => ({ status, data });
const err = (status, message) => ({ status, data: { error: message } });
const nowIso = () => new Date().toISOString();

// ---- シリアライズ（server/serialize.js と対応） ----
function publicCompany(c) {
  return { companyId: c.company_id, name: c.name, adminName: c.admin_name, adminEmail: c.admin_email, plan: c.plan, createdAt: c.created_at };
}
function publicEmployee(e) {
  return { id: e.id, employeeCode: e.employee_code, name: e.name, email: e.email ?? null,
    department: e.department ?? null, postalCode: e.postal_code ?? null, address: e.address ?? null,
    status: e.status, addressRegistered: Boolean(e.address && String(e.address).trim()), createdAt: e.created_at };
}
function publicDelivery(d) {
  return { id: d.id, year: d.year, month: d.month, productType: d.product_type, productName: d.product_name, status: d.status, scheduledDate: d.scheduled_date };
}

// ---- 内部操作 ----
// state を明示的に受け取る（seed 中は db() が未初期化のため再入不可）。
function createEmployee(s, companyPk, fields) {
  const code = genEmployeeCode(s, companyPk);
  const pin = genPin();
  const id = ++s.seq.employee;
  const emp = { id, company_pk: companyPk, employee_code: code, name: fields.name,
    email: fields.email || null, department: fields.department || null,
    postal_code: fields.postalCode || null, address: fields.address || null,
    pin, status: 'active', created_at: nowIso() };
  s.employees.push(emp);
  // 12ヶ月分の配送を生成
  const start = new Date();
  for (const r of buildSchedule(start.getFullYear(), start.getMonth() + 1)) {
    s.deliveries.push({ id: ++s.seq.delivery, company_pk: companyPk, employee_pk: id,
      year: r.year, month: r.month, product_type: r.product_type, product_name: r.product_name,
      status: 'scheduled', scheduled_date: r.scheduled_date, created_at: nowIso() });
  }
  return { emp, code, pin };
}
function activeCount(companyPk) { return db().employees.filter((e) => e.company_pk === companyPk && e.status === 'active').length; }
function totalCount(companyPk) { return db().employees.filter((e) => e.company_pk === companyPk).length; }
function currentCompany() { const s = db(); return s.session.adminCompanyPk ? s.companies.find((c) => c.id === s.session.adminCompanyPk) : null; }
function currentEmployee() { const s = db(); return s.session.employeePk ? s.employees.find((e) => e.id === s.session.employeePk) : null; }

// ---- シード（server/seed.js と対応：デモ会社1社＋社員5名） ----
function seed(s) {
  const companyId = genCompanyId(s);
  const id = ++s.seq.company;
  s.companies.push({ id, company_id: companyId, name: 'デモ株式会社', admin_name: '福利厚生 担当',
    admin_email: 'admin@demo-ogori.jp', password: 'gorigori2026', plan: 'standard', created_at: nowIso() });
  const people = [
    { name: '田中 太郎', department: '営業部', postalCode: '150-0001', address: '東京都渋谷区神宮前1-1-1' },
    { name: '佐藤 花子', department: '開発部', postalCode: '060-0001', address: '北海道札幌市中央区北一条西2-3' },
    { name: '鈴木 一郎', department: '人事部' },
    { name: '高橋 みどり', department: '開発部', postalCode: '530-0001', address: '大阪府大阪市北区梅田3-1-1' },
    { name: '伊藤 健', department: '営業部' },
  ];
  const demoEmps = [];
  for (const p of people) {
    const { code, pin } = createEmployee(s, id, p);
    demoEmps.push({ name: p.name, companyId, employeeCode: code, pin });
  }
  s.demo = { adminEmail: 'admin@demo-ogori.jp', adminPassword: 'gorigori2026', companyId, employees: demoEmps };
}

// ---- バリデーション（軽量版） ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function reqStr(v, label, max = 500) {
  const s = (v == null ? '' : String(v)).trim();
  if (!s) throw err(400, `${label}を入力してください。`);
  if (s.length > max) throw err(400, `${label}は${max}文字以内で入力してください。`);
  return s;
}

// =============================================================================
// ルーティング
// =============================================================================
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
  routes.push({ method, regex, keys, handler });
}

// --- 公開 ---
route('GET', '/api/health', () => ok({ ok: true, service: 'ogori', mode: 'static' }));
route('GET', '/api/plan', () => {
  const now = new Date(); const months = [];
  for (let i = 0; i < 6; i++) {
    let m = now.getMonth() + 1 + i, y = now.getFullYear();
    while (m > 12) { m -= 12; y += 1; }
    const p = productForMonth(m);
    months.push({ year: y, month: m, productType: p.type, productName: p.name, emoji: p.emoji });
  }
  return ok({ brand: BRAND, pricing: { ...PRICING, monthlyPerEmployeeInclTax: Math.round(PRICING.monthlyPerEmployee * 1.1) },
    products: PRODUCTS, upcoming: ['オムツ・子育て世代向け商品（提供予定）'], expectedEffects: EXPECTED_EFFECTS,
    scheduleRule: '偶数月はお米、奇数月は旬の野菜をお届けします。', upcomingMonths: months });
});

// --- 企業（管理者） ---
route('POST', '/api/companies/register', (b) => {
  const s = db();
  const name = reqStr(b.companyName, '会社名', 120);
  const adminName = reqStr(b.adminName, '担当者名', 80);
  const adminEmail = reqStr(b.adminEmail, 'メールアドレス', 254).toLowerCase();
  if (!EMAIL_RE.test(adminEmail)) throw err(400, 'メールアドレスの形式が正しくありません。');
  const pw = String(b.password || '');
  if (pw.length < 8) throw err(400, 'パスワードは8文字以上で入力してください。');
  if (s.companies.some((c) => c.admin_email === adminEmail)) throw err(409, 'このメールアドレスは既に登録されています。');
  const companyId = genCompanyId(s);
  const id = ++s.seq.company;
  const company = { id, company_id: companyId, name, admin_name: adminName, admin_email: adminEmail, password: pw, plan: 'standard', created_at: nowIso() };
  s.companies.push(company);
  s.session.adminCompanyPk = id;
  commit();
  return ok({ company: publicCompany(company), companyId }, 201);
});
route('POST', '/api/companies/login', (b) => {
  const s = db();
  const adminEmail = String(b.adminEmail || '').trim().toLowerCase();
  const pw = String(b.password || '');
  const company = s.companies.find((c) => c.admin_email === adminEmail);
  if (!company || company.password !== pw) throw err(401, 'メールアドレスまたはパスワードが正しくありません。');
  s.session.adminCompanyPk = company.id; commit();
  return ok({ company: publicCompany(company), companyId: company.company_id });
});
route('POST', '/api/companies/logout', () => { db().session.adminCompanyPk = null; commit(); return ok({ ok: true }); });
route('GET', '/api/companies/me', () => {
  const company = currentCompany();
  if (!company) throw err(401, 'ログインが必要です。');
  const active = activeCount(company.id);
  const now = new Date();
  const thisM = now.getMonth() + 1;
  const nextM = thisM + 1 > 12 ? 1 : thisM + 1;
  return ok({ company: publicCompany(company),
    stats: { activeEmployees: active, totalEmployees: totalCount(company.id), cost: costSummary(active),
      thisMonth: { month: thisM, product: productForMonth(thisM) },
      nextMonth: { month: nextM, product: productForMonth(nextM) } },
    pricing: PRICING, expectedEffects: EXPECTED_EFFECTS });
});

// --- 社員管理（管理者） ---
function requireAdmin() { const c = currentCompany(); if (!c) throw err(401, 'ログインが必要です。'); return c; }
route('GET', '/api/employees', () => {
  const c = requireAdmin();
  const rows = db().employees.filter((e) => e.company_pk === c.id)
    .sort((a, b) => a.id - b.id).map(publicEmployee);
  return ok({ employees: rows });
});
route('POST', '/api/employees', (b) => {
  const c = requireAdmin();
  const name = reqStr(b.name, '氏名', 80);
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) throw err(400, 'メールアドレスの形式が正しくありません。');
  const { emp, code, pin } = createEmployee(db(), c.id, { name, email,
    department: b.department, postalCode: b.postalCode, address: b.address });
  commit();
  return ok({ employee: publicEmployee(emp),
    credentials: { companyId: c.company_id, employeeCode: code, pin,
      note: '初期PINはこの画面でのみ表示されます。社員へ安全にお伝えください。' } }, 201);
});
function findEmp(companyPk, id) { return db().employees.find((e) => e.company_pk === companyPk && e.id === Number(id)); }
route('PATCH', '/api/employees/:id', (b, p) => {
  const c = requireAdmin();
  const emp = findEmp(c.id, p.id);
  if (!emp) throw err(404, '社員が見つかりません。');
  if (b.name !== undefined) emp.name = reqStr(b.name, '氏名', 80);
  if (b.email !== undefined) emp.email = b.email ? String(b.email).trim().toLowerCase() : null;
  if (b.department !== undefined) emp.department = b.department ? String(b.department).trim() : null;
  if (b.postalCode !== undefined) emp.postal_code = b.postalCode ? String(b.postalCode).trim() : null;
  if (b.address !== undefined) emp.address = b.address ? String(b.address).trim() : null;
  if (b.status !== undefined) {
    if (!['active', 'paused'].includes(b.status)) throw err(400, 'ステータスが不正です。');
    emp.status = b.status;
  }
  commit();
  return ok({ employee: publicEmployee(emp) });
});
route('POST', '/api/employees/:id/reset-pin', (b, p) => {
  const c = requireAdmin();
  const emp = findEmp(c.id, p.id);
  if (!emp) throw err(404, '社員が見つかりません。');
  const pin = genPin(); emp.pin = pin; commit();
  return ok({ credentials: { companyId: c.company_id, employeeCode: emp.employee_code, pin, note: '新しいPINはこの画面でのみ表示されます。' } });
});
route('DELETE', '/api/employees/:id', (b, p) => {
  const c = requireAdmin();
  const s = db();
  const emp = findEmp(c.id, p.id);
  if (!emp) throw err(404, '社員が見つかりません。');
  s.employees = s.employees.filter((e) => e.id !== emp.id);
  s.deliveries = s.deliveries.filter((d) => d.employee_pk !== emp.id);
  commit();
  return ok({ ok: true });
});

// --- 配送（管理者） ---
route('GET', '/api/deliveries', () => {
  const c = requireAdmin();
  const s = db();
  const empById = new Map(s.employees.map((e) => [e.id, e]));
  const rows = s.deliveries.filter((d) => d.company_pk === c.id)
    .sort((a, b) => a.year - b.year || a.month - b.month || (empById.get(a.employee_pk)?.name || '').localeCompare(empById.get(b.employee_pk)?.name || ''))
    .map((d) => { const e = empById.get(d.employee_pk);
      return { ...publicDelivery(d), employeeName: e ? e.name : '—', employeeCode: e ? e.employee_code : '' }; });
  const byMonth = {};
  for (const d of rows) {
    const k = `${d.year}-${pad2(d.month)}`;
    if (!byMonth[k]) byMonth[k] = { year: d.year, month: d.month, productType: d.productType, productName: d.productName, count: 0 };
    byMonth[k].count += 1;
  }
  return ok({ deliveries: rows, months: Object.values(byMonth) });
});
route('PATCH', '/api/deliveries/:id', (b, p) => {
  const c = requireAdmin();
  const d = db().deliveries.find((x) => x.id === Number(p.id) && x.company_pk === c.id);
  if (!d) throw err(404, '配送が見つかりません。');
  if (!['scheduled', 'shipped', 'delivered'].includes(b.status)) throw err(400, 'ステータスが不正です。');
  d.status = b.status; commit();
  return ok({ delivery: publicDelivery(d) });
});

// --- 社員ポータル ---
route('POST', '/api/employee/login', (b) => {
  const s = db();
  const companyId = reqStr(b.companyId, '会社ID', 40).toUpperCase();
  const employeeCode = reqStr(b.employeeCode, '社員コード', 40).toUpperCase();
  const pin = reqStr(b.pin, 'PIN', 12);
  const company = s.companies.find((c) => c.company_id === companyId);
  const emp = company ? s.employees.find((e) => e.company_pk === company.id && e.employee_code === employeeCode) : null;
  if (!company || !emp || emp.pin !== pin) throw err(401, '会社ID・社員コード・PINのいずれかが正しくありません。');
  if (emp.status !== 'active') throw err(403, 'このアカウントは現在利用できません。管理者にお問い合わせください。');
  s.session.employeePk = emp.id; commit();
  return ok({ employee: publicEmployee(emp) });
});
route('POST', '/api/employee/logout', () => { db().session.employeePk = null; commit(); return ok({ ok: true }); });
route('GET', '/api/employee/me', () => {
  const emp = currentEmployee();
  if (!emp) throw err(401, 'ログインが必要です。');
  const s = db();
  const company = s.companies.find((c) => c.id === emp.company_pk);
  const deliveries = s.deliveries.filter((d) => d.employee_pk === emp.id)
    .sort((a, b) => a.year - b.year || a.month - b.month).map(publicDelivery);
  const now = new Date();
  return ok({ employee: publicEmployee(emp), company: { companyId: company.company_id, name: company.name },
    thisMonth: { month: now.getMonth() + 1, product: productForMonth(now.getMonth() + 1) }, deliveries });
});
route('PUT', '/api/employee/address', (b) => {
  const emp = currentEmployee();
  if (!emp) throw err(401, 'ログインが必要です。');
  emp.postal_code = reqStr(b.postalCode, '郵便番号', 16);
  emp.address = reqStr(b.address, '住所', 300);
  commit();
  return ok({ employee: publicEmployee(emp) });
});
route('PUT', '/api/employee/pin', (b) => {
  const emp = currentEmployee();
  if (!emp) throw err(401, 'ログインが必要です。');
  const current = reqStr(b.currentPin, '現在のPIN', 12);
  const next = reqStr(b.newPin, '新しいPIN', 12);
  if (!/^\d{4,}$/.test(next)) throw err(400, '新しいPINは4桁以上の数字で入力してください。');
  if (emp.pin !== current) throw err(401, '現在のPINが正しくありません。');
  emp.pin = next; commit();
  return ok({ ok: true });
});

// =============================================================================
// 公開API
// =============================================================================
/** サーバーと同じ (method, path, body) を受け、{status, data} を返す。 */
export function handle(method, path, body = {}) {
  const clean = path.split('?')[0];
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(clean);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    try {
      return r.handler(body || {}, params);
    } catch (e) {
      if (e && typeof e.status === 'number') return e; // err() で throw されたレスポンス
      console.error('[static-backend] エラー:', e);
      return err(500, 'サーバーエラーが発生しました。');
    }
  }
  return err(404, 'エンドポイントが見つかりません。');
}

/** デモ用の認証情報（初回シード時に生成）。 */
export function getDemoInfo() {
  return db().demo;
}

/** デモデータを初期化して作り直す（「デモをリセット」用）。 */
export function resetDemo() {
  state = blankState();
  seed(state);
  save(state);
  return getDemoInfo();
}
