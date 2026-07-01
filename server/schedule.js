// 配送スケジュールのロジック。
// PDF: 「偶数月はお米／奇数月は野菜」、料金は月額1万円（税別）。
import { PRODUCTS, PRICING, SCHEDULE_MONTHS } from './config.js';

/** その月に届く商品を返す。偶数月＝お米、奇数月＝野菜。 */
export function productForMonth(month) {
  return month % 2 === 0 ? PRODUCTS.rice : PRODUCTS.vegetable;
}

/** YYYY-MM-DD 文字列を生成（配送は毎月10日想定）。 */
function scheduledDate(year, month, day = 10) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 指定した開始年月から SCHEDULE_MONTHS ヶ月分のスケジュールを生成。
 * @returns {{year:number, month:number, product_type:string, product_name:string, scheduled_date:string}[]}
 */
export function buildSchedule(startYear, startMonth, months = SCHEDULE_MONTHS) {
  const rows = [];
  let year = startYear;
  let month = startMonth;
  for (let i = 0; i < months; i++) {
    const product = productForMonth(month);
    rows.push({
      year,
      month,
      product_type: product.type,
      product_name: product.name,
      scheduled_date: scheduledDate(year, month),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return rows;
}

/** 税込月額（1人あたり）。 */
export function monthlyPerEmployeeInclTax() {
  return Math.round(PRICING.monthlyPerEmployee * (1 + PRICING.taxRate));
}

/**
 * 会社の料金サマリを計算する。
 * @param {number} activeCount - 稼働中の社員数
 */
export function costSummary(activeCount) {
  const perEmployee = PRICING.monthlyPerEmployee;
  const monthlyExcl = perEmployee * activeCount;
  const monthlyIncl = Math.round(monthlyExcl * (1 + PRICING.taxRate));
  return {
    employees: activeCount,
    perEmployeeExclTax: perEmployee,
    perEmployeeInclTax: monthlyPerEmployeeInclTax(),
    monthlyExclTax: monthlyExcl,
    monthlyInclTax: monthlyIncl,
    annualExclTax: monthlyExcl * 12,
    annualInclTax: monthlyIncl * 12,
    taxRate: PRICING.taxRate,
  };
}
