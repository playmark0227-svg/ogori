import { api, $, renderNav } from './common.js';

$('#nav').innerHTML = renderNav('home');

// 配送スケジュールのプレビューを描画。
(async () => {
  const strip = $('#scheduleStrip');
  try {
    const plan = await api.get('/api/plan');
    const months = (plan.upcomingMonths || []).slice(0, 6);
    strip.innerHTML = months
      .map((m) => {
        const isRice = m.productType === 'rice';
        return `
        <div class="sched-card ${isRice ? 'sched-card--rice' : 'sched-card--veg'}">
          <div class="sched-card__month">${m.month}月</div>
          <div class="sched-card__emoji">${m.emoji || (isRice ? '🍚' : '🥬')}</div>
          <div class="sched-card__name">${isRice ? 'お米 5kg' : '旬の野菜'}</div>
        </div>`;
      })
      .join('');
  } catch {
    strip.innerHTML = '<p class="muted">スケジュールを読み込めませんでした。</p>';
  }
})();
