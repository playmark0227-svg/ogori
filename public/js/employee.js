import { api, $, el, toast, renderAppNav, escapeHtml, statusBadge, STATIC_MODE, staticBackend } from './common.js';

$('#nav').innerHTML = renderAppNav('employee');

const authView = $('#authView');
const portalView = $('#portalView');

init();

async function init() {
  try {
    const data = await api.get('/api/employee/me');
    showPortal(data);
  } catch {
    authView.classList.remove('hidden');
    maybeShowDemoHint();
  }
}

// 静的（プレビュー）モードでは、デモ社員の認証情報を自動入力して案内する。
function maybeShowDemoHint() {
  if (!STATIC_MODE) return;
  const demo = staticBackend.getDemoInfo();
  if (!demo || !demo.employees || !demo.employees.length || $('#demoHint')) return;
  const d = demo.employees[0];
  const form = $('#empLoginForm');
  form.companyId.value = d.companyId;
  form.employeeCode.value = d.employeeCode;
  form.pin.value = d.pin;
  const box = el('div', { id: 'demoHint', class: 'demo-hint' });
  box.innerHTML = `
    <strong>🦍 プレビューモード</strong>
    <p>デモ社員「${escapeHtml(d.name)}」の情報を入力済みです。そのままログインしてお試しください。</p>`;
  form.parentElement.insertBefore(box, form);
}

// ---------------------------------------------------------------------------
// ログイン
// ---------------------------------------------------------------------------
$('#empLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#empLoginAlert').innerHTML = '';
  const f = e.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    await api.post('/api/employee/login', {
      companyId: f.companyId.value.trim(),
      employeeCode: f.employeeCode.value.trim(),
      pin: f.pin.value.trim(),
    });
    const data = await api.get('/api/employee/me');
    showPortal(data);
  } catch (err) {
    $('#empLoginAlert').innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
});

$('#empLogoutBtn').addEventListener('click', async () => {
  await api.post('/api/employee/logout').catch(() => {});
  location.reload();
});

// ---------------------------------------------------------------------------
// ポータル描画
// ---------------------------------------------------------------------------
function showPortal(data) {
  authView.classList.add('hidden');
  portalView.classList.remove('hidden');

  $('#empName').textContent = data.employee.name;
  $('#empCompany').textContent = data.company.name;
  $('#empCode').textContent = data.employee.employeeCode;

  // 今月のお届け（＋次回の予告）
  const p = data.thisMonth.product;
  const isRice = p.type === 'rice';
  const icon = (type) => (type === 'rice' ? '../assets/rice.png' : '../assets/vegetable.svg');

  // 配送リストから「今月」と「次回」を特定する。
  const now = new Date();
  const idx = data.deliveries.findIndex(
    (d) => d.year === now.getFullYear() && d.month === now.getMonth() + 1
  );
  const current = idx >= 0 ? data.deliveries[idx] : null;
  const next = idx >= 0 ? data.deliveries[idx + 1] : data.deliveries[0];

  $('#thisMonthCard').innerHTML = `
    <div class="delivery-hero__inner">
      <div class="delivery-hero__main">
        <img class="delivery-hero__img" src="${icon(p.type)}" alt="" />
        <div>
          <div class="delivery-hero__label">今月（${data.thisMonth.month}月）のお届け</div>
          <div class="delivery-hero__name">${escapeHtml(p.name)}</div>
          <div class="muted" style="font-size:13.5px">${current ? `お届け予定日: ${escapeHtml(current.scheduledDate)} ごろ` : (isRice ? '偶数月はお米をお届けします。' : '奇数月は旬の野菜をお届けします。')}</div>
        </div>
      </div>
      ${next ? `
      <div class="delivery-hero__next">
        <span class="delivery-hero__next-label">次回のお届け</span>
        <img src="${icon(next.productType)}" alt="" />
        <span>${next.month}月・${escapeHtml(next.productName)}</span>
      </div>` : ''}
    </div>`;

  // 住所フォーム
  const addr = data.employee;
  $('#addrForm').postalCode.value = addr.postalCode || '';
  $('#addrForm').address.value = addr.address || '';
  updateAddrStatus(addr.addressRegistered);

  // タイムライン
  renderTimeline(data.deliveries);
}

function updateAddrStatus(registered) {
  $('#addrStatus').innerHTML = registered
    ? '<span class="addr-status" style="color:var(--ok)">✓ 登録済み</span>'
    : '<span class="addr-status" style="color:var(--danger)">● 未登録</span>';
}

function renderTimeline(deliveries) {
  const host = $('#empTimeline');
  if (!deliveries.length) {
    host.innerHTML = '<p class="muted">配送予定はまだありません。</p>';
    return;
  }
  host.innerHTML = `<div class="timeline">${deliveries
    .slice(0, 12)
    .map((d) => {
      const isRice = d.productType === 'rice';
      return `
      <div class="tl-item ${isRice ? 'tl-item--rice' : 'tl-item--veg'}">
        <span class="tl-item__month">${d.year}/${d.month}</span>
        <span class="tl-item__emoji">${isRice ? '🍚' : '🥬'}</span>
        <span class="tl-item__name">${escapeHtml(d.productName)}</span>
        ${statusBadge(d.status)}
      </div>`;
    })
    .join('')}</div>`;
}

// ---------------------------------------------------------------------------
// お届け先の保存
// ---------------------------------------------------------------------------
$('#addrForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#addrAlert').innerHTML = '';
  const f = e.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    const res = await api.put('/api/employee/address', {
      postalCode: f.postalCode.value.trim(),
      address: f.address.value.trim(),
    });
    updateAddrStatus(res.employee.addressRegistered);
    toast('お届け先を保存しました', 'ok');
  } catch (err) {
    $('#addrAlert').innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// PIN変更
// ---------------------------------------------------------------------------
$('#pinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    await api.put('/api/employee/pin', {
      currentPin: f.currentPin.value.trim(),
      newPin: f.newPin.value.trim(),
    });
    f.reset();
    toast('PINを変更しました', 'ok');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});
