import { api, $, $$, yen, renderSiteNav } from './common.js';

$('#nav').innerHTML = renderSiteNav();

// スクロールでヘッダーに境界線・影を付ける。
const siteNav = $('#siteNav');
if (siteNav) {
  const onScroll = () => siteNav.classList.toggle('is-stuck', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

// スクロール表示アニメーション（主要ブロックへ自動付与）。
const revealTargets = $$(
  '.section__head, .problem, .problem-gori, .solution__copy, .solution__art, .step, .effect, .plan__price, .plan__schedule, .sim, .faq details, .cta-final__inner'
);
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  revealTargets.forEach((t, i) => {
    t.classList.add('reveal');
    t.style.transitionDelay = `${Math.min(i % 4, 3) * 60}ms`;
    io.observe(t);
  });
}

// 料金情報（配送スケジュール＋シミュレーター共通のデータソース）。
let pricing = { monthlyPerEmployee: 10000, taxRate: 0.1 };

(async () => {
  const strip = $('#scheduleStrip');
  try {
    const plan = await api.get('/api/plan');
    if (plan.pricing) pricing = plan.pricing;
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
  updateSim(); // 料金取得後に再計算
})();

// ---- 費用シミュレーター ----
const simRange = $('#simRange');

function updateSim() {
  if (!simRange) return;
  const n = Number(simRange.value);
  const monthlyEx = pricing.monthlyPerEmployee * n;
  const monthlyIn = Math.round(monthlyEx * (1 + pricing.taxRate));
  $('#simCount').textContent = n;
  $('#simMonthly').textContent = yen(monthlyIn);
  $('#simMonthlyEx').textContent = yen(monthlyEx);
  $('#simAnnual').textContent = yen(monthlyIn * 12);
  // スライダーの進捗をトラック色に反映
  const pct = ((n - Number(simRange.min)) / (Number(simRange.max) - Number(simRange.min))) * 100;
  simRange.style.setProperty('--pct', `${pct}%`);
}

if (simRange) {
  simRange.addEventListener('input', updateSim);
  updateSim();
}
