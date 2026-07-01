// アプリ本体: ルーター定義とリクエストディスパッチ。テストから import できるよう分離。
import { createRouter, sendJson, sendError, HttpError } from './http.js';
import { serveStatic } from './static.js';
import * as companies from './routes/companies.js';
import * as employees from './routes/employees.js';
import * as deliveries from './routes/deliveries.js';
import * as employeePortal from './routes/employeePortal.js';
import * as plan from './routes/plan.js';

export function buildRouter() {
  const r = createRouter();

  // ヘルスチェック
  r.get('/api/health', async (req, res) => sendJson(res, 200, { ok: true, service: 'ogori' }));

  // 公開
  r.get('/api/plan', plan.get);

  // 企業（管理者）
  r.post('/api/companies/register', companies.register);
  r.post('/api/companies/login', companies.login);
  r.post('/api/companies/logout', companies.logout);
  r.get('/api/companies/me', companies.me);

  // 社員管理（管理者）
  r.get('/api/employees', employees.list);
  r.post('/api/employees', employees.create);
  r.patch('/api/employees/:id', employees.update);
  r.post('/api/employees/:id/reset-pin', employees.resetPin);
  r.delete('/api/employees/:id', employees.remove);

  // 配送（管理者）
  r.get('/api/deliveries', deliveries.list);
  r.patch('/api/deliveries/:id', deliveries.updateStatus);

  // 社員ポータル
  r.post('/api/employee/login', employeePortal.login);
  r.post('/api/employee/logout', employeePortal.logout);
  r.get('/api/employee/me', employeePortal.me);
  r.put('/api/employee/address', employeePortal.updateAddress);
  r.put('/api/employee/pin', employeePortal.changePin);

  return r;
}

const router = buildRouter();

/** Node の (req,res) ハンドラ。 */
export async function handleRequest(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendError(res, 400, '不正なURLです。');
  }

  // API ルート
  if (pathname.startsWith('/api/')) {
    const route = router.match(req.method, pathname);
    if (!route) return sendError(res, 404, 'エンドポイントが見つかりません。');
    try {
      await route.handler(req, res, { params: route.params });
    } catch (err) {
      handleError(res, err);
    }
    return;
  }

  // 静的ファイル / ページ
  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const served = await serveStatic(req, res, pathname);
      if (served) return;
    } catch (err) {
      return sendError(res, 500, 'サーバーエラーが発生しました。');
    }
    // SPA的なフォールバックはしない。未知パスは404ページ。
    return serveStatic(req, res, '/404.html').then((ok) => {
      if (!ok) sendError(res, 404, 'ページが見つかりません。');
    });
  }

  sendError(res, 405, '許可されていないメソッドです。');
}

function handleError(res, err) {
  if (err instanceof HttpError) {
    return sendError(res, err.status, err.message, err.extra);
  }
  // 想定外エラーはログに出しつつ500。
  console.error('[ogori] 未処理エラー:', err);
  if (!res.headersSent) sendError(res, 500, 'サーバーエラーが発生しました。');
}
