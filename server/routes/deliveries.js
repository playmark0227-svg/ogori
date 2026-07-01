// 企業管理者向け: 配送スケジュールの参照とステータス更新。
import { getDb } from '../db.js';
import { HttpError, sendJson, readJsonBody } from '../http.js';
import { requireAdmin } from '../middleware.js';
import { listCompanyDeliveries } from '../repo.js';
import { publicDelivery } from '../serialize.js';

const VALID_STATUS = ['scheduled', 'shipped', 'delivered'];

/** GET /api/deliveries — 会社全体の配送一覧（社員名つき）。 */
export async function list(req, res) {
  const { company } = requireAdmin(req);
  const rows = listCompanyDeliveries(company.id).map((d) => ({
    ...publicDelivery(d),
    employeeName: d.employee_name,
    employeeCode: d.employee_code,
  }));

  // 月ごとにグルーピングしたサマリも返す。
  const byMonth = {};
  for (const d of rows) {
    const key = `${d.year}-${String(d.month).padStart(2, '0')}`;
    if (!byMonth[key]) {
      byMonth[key] = { year: d.year, month: d.month, productType: d.productType, productName: d.productName, count: 0 };
    }
    byMonth[key].count += 1;
  }
  sendJson(res, 200, { deliveries: rows, months: Object.values(byMonth) });
}

/** PATCH /api/deliveries/:id — 配送ステータスを更新。 */
export async function updateStatus(req, res, { params }) {
  const { company } = requireAdmin(req);
  const db = getDb();
  const delivery = db
    .prepare('SELECT * FROM deliveries WHERE id = ? AND company_pk = ?')
    .get(Number(params.id), company.id);
  if (!delivery) throw new HttpError(404, '配送が見つかりません。');

  const body = await readJsonBody(req);
  if (!VALID_STATUS.includes(body.status)) throw new HttpError(400, 'ステータスが不正です。');

  db.prepare('UPDATE deliveries SET status = ? WHERE id = ?').run(body.status, delivery.id);
  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  sendJson(res, 200, { delivery: publicDelivery(updated) });
}
