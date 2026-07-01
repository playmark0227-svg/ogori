// オゴリ API 統合テスト（node:test）。DBはメモリ上で完結、外部依存なし。
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { initDb } from '../server/db.js';
import { handleRequest } from '../server/app.js';

let server;
let base;

before(async () => {
  initDb(':memory:');
  server = createServer((req, res) => handleRequest(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

// Cookie を保持する簡易 fetch ラッパ。
function client() {
  let cookie = '';
  return async function call(method, path, body) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setC = res.headers.get('set-cookie');
    if (setC) cookie = setC.split(';')[0];
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    return { status: res.status, data };
  };
}

describe('公開エンドポイント', () => {
  test('health が 200', async () => {
    const c = client();
    const r = await c('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
  });

  test('plan が料金と配送ルールを返す', async () => {
    const c = client();
    const r = await c('GET', '/api/plan');
    assert.equal(r.status, 200);
    assert.equal(r.data.pricing.monthlyPerEmployee, 10000);
    assert.equal(r.data.pricing.monthlyPerEmployeeInclTax, 11000);
    assert.ok(Array.isArray(r.data.upcomingMonths));
  });
});

describe('企業登録とID発行', () => {
  test('登録すると OGORI- 形式の会社IDが発行される', async () => {
    const c = client();
    const r = await c('POST', '/api/companies/register', {
      companyName: 'テスト会社', adminName: '管理者', adminEmail: 'a@test.jp', password: 'password123',
    });
    assert.equal(r.status, 201);
    assert.match(r.data.companyId, /^OGORI-[0-9A-Z]{6}$/);
  });

  test('同じメールでの二重登録は 409', async () => {
    const c = client();
    await c('POST', '/api/companies/register', {
      companyName: 'X', adminName: 'Y', adminEmail: 'dup@test.jp', password: 'password123',
    });
    const c2 = client();
    const r = await c2('POST', '/api/companies/register', {
      companyName: 'X2', adminName: 'Y2', adminEmail: 'dup@test.jp', password: 'password123',
    });
    assert.equal(r.status, 409);
  });

  test('短いパスワードは 400', async () => {
    const c = client();
    const r = await c('POST', '/api/companies/register', {
      companyName: 'X', adminName: 'Y', adminEmail: 'short@test.jp', password: 'short',
    });
    assert.equal(r.status, 400);
  });

  test('未認証で me を叩くと 401', async () => {
    const c = client();
    const r = await c('GET', '/api/companies/me');
    assert.equal(r.status, 401);
  });

  test('ログイン/ログアウトが機能する', async () => {
    const email = 'login@test.jp';
    const c = client();
    await c('POST', '/api/companies/register', {
      companyName: 'L', adminName: 'M', adminEmail: email, password: 'password123',
    });
    await c('POST', '/api/companies/logout');
    const after = await c('GET', '/api/companies/me');
    assert.equal(after.status, 401);
    const login = await c('POST', '/api/companies/login', { adminEmail: email, password: 'password123' });
    assert.equal(login.status, 200);
    const me = await c('GET', '/api/companies/me');
    assert.equal(me.status, 200);
  });

  test('誤ったパスワードのログインは 401', async () => {
    const email = 'wrongpw@test.jp';
    const c = client();
    await c('POST', '/api/companies/register', {
      companyName: 'W', adminName: 'W', adminEmail: email, password: 'password123',
    });
    const c2 = client();
    const r = await c2('POST', '/api/companies/login', { adminEmail: email, password: 'wrongpass!!' });
    assert.equal(r.status, 401);
  });
});

describe('社員管理と配送', () => {
  async function registerCompany(email) {
    const c = client();
    const reg = await c('POST', '/api/companies/register', {
      companyName: '社員テスト社', adminName: '管理', adminEmail: email, password: 'password123',
    });
    return { c, companyId: reg.data.companyId };
  }

  test('社員登録で認証情報が発行され、配送が自動生成される', async () => {
    const { c } = await registerCompany('emp1@test.jp');
    const r = await c('POST', '/api/employees', { name: '山田太郎', department: '営業' });
    assert.equal(r.status, 201);
    assert.match(r.data.credentials.employeeCode, /^EMP-[0-9A-Z]{4}$/);
    assert.match(r.data.credentials.pin, /^\d{6}$/);

    const del = await c('GET', '/api/deliveries');
    assert.equal(del.status, 200);
    assert.equal(del.data.deliveries.length, 12); // 12ヶ月分
  });

  test('配送は偶数月=お米・奇数月=野菜', async () => {
    const { c } = await registerCompany('emp2@test.jp');
    await c('POST', '/api/employees', { name: 'テスト' });
    const del = await c('GET', '/api/deliveries');
    for (const d of del.data.deliveries) {
      const expected = d.month % 2 === 0 ? 'rice' : 'vegetable';
      assert.equal(d.productType, expected, `${d.month}月の商品が不正`);
    }
  });

  test('統計の月額費用が 社員数×10000 になる', async () => {
    const { c } = await registerCompany('emp3@test.jp');
    await c('POST', '/api/employees', { name: 'A' });
    await c('POST', '/api/employees', { name: 'B' });
    await c('POST', '/api/employees', { name: 'C' });
    const me = await c('GET', '/api/companies/me');
    assert.equal(me.data.stats.activeEmployees, 3);
    assert.equal(me.data.stats.cost.monthlyExclTax, 30000);
    assert.equal(me.data.stats.cost.monthlyInclTax, 33000);
  });

  test('停止中の社員は費用計算から除外される', async () => {
    const { c } = await registerCompany('emp4@test.jp');
    const a = await c('POST', '/api/employees', { name: 'A' });
    await c('POST', '/api/employees', { name: 'B' });
    await c('PATCH', `/api/employees/${a.data.employee.id}`, { status: 'paused' });
    const me = await c('GET', '/api/companies/me');
    assert.equal(me.data.stats.activeEmployees, 1);
    assert.equal(me.data.stats.cost.monthlyExclTax, 10000);
  });

  test('社員削除で配送も消える', async () => {
    const { c } = await registerCompany('emp5@test.jp');
    const a = await c('POST', '/api/employees', { name: '消える人' });
    await c('DELETE', `/api/employees/${a.data.employee.id}`);
    const del = await c('GET', '/api/deliveries');
    assert.equal(del.data.deliveries.length, 0);
  });

  test('別会社の社員は操作できない（テナント分離）', async () => {
    const { c: c1 } = await registerCompany('tenantA@test.jp');
    const emp = await c1('POST', '/api/employees', { name: 'A社の人' });
    const { c: c2 } = await registerCompany('tenantB@test.jp');
    const r = await c2('PATCH', `/api/employees/${emp.data.employee.id}`, { name: 'のっとり' });
    assert.equal(r.status, 404);
    const d = await c2('DELETE', `/api/employees/${emp.data.employee.id}`);
    assert.equal(d.status, 404);
  });
});

describe('社員ポータル', () => {
  async function setup(email) {
    const admin = client();
    const reg = await admin('POST', '/api/companies/register', {
      companyName: 'ポータル社', adminName: '管理', adminEmail: email, password: 'password123',
    });
    const emp = await admin('POST', '/api/employees', { name: '社員さん' });
    return { companyId: reg.data.companyId, creds: emp.data.credentials, employeeId: emp.data.employee.id };
  }

  test('会社ID＋社員コード＋PINでログインできる', async () => {
    const { creds } = await setup('portal1@test.jp');
    const emp = client();
    const r = await emp('POST', '/api/employee/login', {
      companyId: creds.companyId, employeeCode: creds.employeeCode, pin: creds.pin,
    });
    assert.equal(r.status, 200);
    const me = await emp('GET', '/api/employee/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.deliveries.length, 12);
  });

  test('誤ったPINでは 401', async () => {
    const { creds } = await setup('portal2@test.jp');
    const emp = client();
    const r = await emp('POST', '/api/employee/login', {
      companyId: creds.companyId, employeeCode: creds.employeeCode, pin: '000000',
    });
    assert.equal(r.status, 401);
  });

  test('社員が住所を更新できる', async () => {
    const { creds } = await setup('portal3@test.jp');
    const emp = client();
    await emp('POST', '/api/employee/login', {
      companyId: creds.companyId, employeeCode: creds.employeeCode, pin: creds.pin,
    });
    const r = await emp('PUT', '/api/employee/address', { postalCode: '150-0001', address: '東京都渋谷区1-1' });
    assert.equal(r.status, 200);
    assert.equal(r.data.employee.addressRegistered, true);
  });

  test('PIN変更後は新しいPINでログインできる', async () => {
    const { creds } = await setup('portal4@test.jp');
    const emp = client();
    await emp('POST', '/api/employee/login', {
      companyId: creds.companyId, employeeCode: creds.employeeCode, pin: creds.pin,
    });
    const ch = await emp('PUT', '/api/employee/pin', { currentPin: creds.pin, newPin: '999888' });
    assert.equal(ch.status, 200);
    const emp2 = client();
    const relog = await emp2('POST', '/api/employee/login', {
      companyId: creds.companyId, employeeCode: creds.employeeCode, pin: '999888',
    });
    assert.equal(relog.status, 200);
  });

  test('停止中の社員はログインできない', async () => {
    const admin = client();
    const reg = await admin('POST', '/api/companies/register', {
      companyName: '停止テスト社', adminName: '管理', adminEmail: 'paused@test.jp', password: 'password123',
    });
    const emp = await admin('POST', '/api/employees', { name: '停止される人' });
    await admin('PATCH', `/api/employees/${emp.data.employee.id}`, { status: 'paused' });
    const c = client();
    const r = await c('POST', '/api/employee/login', {
      companyId: reg.data.companyId,
      employeeCode: emp.data.credentials.employeeCode,
      pin: emp.data.credentials.pin,
    });
    assert.equal(r.status, 403);
  });
});
