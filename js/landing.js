import { api, $, $$, yen, renderSiteNav } from './common.js';

$('#nav').innerHTML = renderSiteNav();

// スクロールでヘッダーに境界線・影を付ける。
const siteNav = $('#siteNav');
if (siteNav) {
  const onScroll = () => siteNav.classList.toggle('is-stuck', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

// モバイルメニュー（ハンバーガー）。
const burger = $('#navBurger');
const menu = $('#navMenu');
if (burger && menu) {
  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  // リンクを押したら閉じる
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      menu.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });
}

// ページトップへ戻るボタン。
const toTop = $('#toTop');
if (toTop) {
  const onTopScroll = () => toTop.classList.toggle('is-visible', window.scrollY > 600);
  onTopScroll();
  window.addEventListener('scroll', onTopScroll, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 数値カウントアップ（[data-countup] を持つ要素が表示されたら 0→値 へ）。
function runCountUps(root) {
  root.querySelectorAll('[data-countup]:not(.is-counted)').forEach((el) => {
    el.classList.add('is-counted');
    const to = parseFloat(el.dataset.countup);
    const decimals = Number(el.dataset.decimals || 0);
    const comma = el.dataset.format === 'comma';
    const fmt = (v) => (comma ? Math.round(v).toLocaleString('ja-JP') : v.toFixed(decimals));
    if (REDUCED || !Number.isFinite(to)) {
      el.textContent = fmt(to);
      return;
    }
    const dur = 900;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// スクロール表示アニメーション（要素の種類ごとに方向を変える）。
const revealTargets = $$(
  '.section__head, .problem, .problem-gori, .solution__copy, .solution__art, .step, .effect, .voice, .plan__price, .plan__schedule, .sim, .faq details, .cta-final__inner'
);
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          runCountUps(e.target);
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  revealTargets.forEach((t, i) => {
    t.classList.add('reveal');
    if (t.matches('.solution__art, .plan__price')) t.classList.add('reveal--left');
    else if (t.matches('.solution__copy, .plan__schedule')) t.classList.add('reveal--right');
    else if (t.matches('.effect, .voice, .sim')) t.classList.add('reveal--zoom');
    t.style.transitionDelay = `${Math.min(i % 4, 3) * 60}ms`;
    io.observe(t);
  });
} else {
  runCountUps(document);
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
let simShown = 0; // 現在表示中の月額（ヒーロー数値をなめらかに変化させる）
let simTweenId = 0;

// ヒーロー数値をカウントアップ/ダウンで目標値へ。
function tweenMonthly(to) {
  const el = $('#simMonthly');
  if (REDUCED) {
    simShown = to;
    el.textContent = yen(to);
    return;
  }
  const from = simShown;
  const id = ++simTweenId;
  const dur = 260;
  const start = performance.now();
  const step = (t) => {
    if (id !== simTweenId) return; // 新しい操作が来たら中断
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 2);
    simShown = from + (to - from) * eased;
    el.textContent = yen(Math.round(simShown));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateSim() {
  if (!simRange) return;
  const n = Number(simRange.value);
  const monthlyEx = pricing.monthlyPerEmployee * n;
  const monthlyIn = Math.round(monthlyEx * (1 + pricing.taxRate));
  $('#simCount').textContent = n;
  tweenMonthly(monthlyIn);
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
