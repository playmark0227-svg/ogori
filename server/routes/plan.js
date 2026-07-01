// 公開情報: プラン・料金・配送ルール・キャラクター等（ランディングページ用）。
import { sendJson } from '../http.js';
import {
  BRAND,
  PRICING,
  PRODUCTS,
  UPCOMING_PRODUCTS,
  EXPECTED_EFFECTS,
} from '../config.js';
import { productForMonth, monthlyPerEmployeeInclTax } from '../schedule.js';

/** GET /api/plan — 公開プラン情報。 */
export async function get(req, res) {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 6; i++) {
    let m = now.getMonth() + 1 + i;
    let y = now.getFullYear();
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    const p = productForMonth(m);
    months.push({ year: y, month: m, productType: p.type, productName: p.name, emoji: p.emoji });
  }

  sendJson(res, 200, {
    brand: BRAND,
    pricing: { ...PRICING, monthlyPerEmployeeInclTax: monthlyPerEmployeeInclTax() },
    products: PRODUCTS,
    upcoming: UPCOMING_PRODUCTS,
    expectedEffects: EXPECTED_EFFECTS,
    scheduleRule: '偶数月はお米、奇数月は旬の野菜をお届けします。',
    upcomingMonths: months,
  });
}
