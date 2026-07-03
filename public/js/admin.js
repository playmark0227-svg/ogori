import {
  api, $, $$, el, toast, yen, renderAppNav, escapeHtml, productBadge, statusBadge, STATIC_MODE, staticBackend, downloadCsv,
} from './common.js';

$('#nav').innerHTML = renderAppNav('admin');

const authView = $('#authView');
const dashView = $('#dashView');

// ---------------------------------------------------------------------------
// 起動: ログイン状態を確認
// ---------------------------------------------------------------------------
init();

async function init() {
  try {
    const data = await api.get('/api/companies/me');
    showDashboard(data);
  } catch {
    showAuth();
  }
}

function showAuth() {
  dashView.classList.add('hidden');
  authView.classList.remove('hidden');
  const params = new URLSearchParams(location.search);
  selectTab(params.get('mode') === 'login' ? 'login' : 'register');
  maybeShowDemoHint();
}

// 静的（プレビュー）モードでは、デモ会社のワンクリックログインを案内する。
function maybeShowDemoHint() {
  if (!STATIC_MODE) return;
  const demo = staticBackend.getDemoInfo();
  if (!demo || $('#demoHint')) return;
  const host = $('.auth__form');
  const box = el('div', { id: 'demoHint', class: 'demo-hint' });
  box.innerHTML = `
    <strong>🦍 プレビューモード</strong>
    <p>サーバー無しのデモです。データはこのブラウザに保存されます。デモ会社ですぐお試しいただけます。</p>
    <div class="demo-hint__cred mono">${escapeHtml(demo.adminEmail)} / ${escapeHtml(demo.adminPassword)}</div>
    <button class="btn btn--gold btn--sm" id="demoLoginBtn" type="button">デモ会社でログイン</button>`;
  host.prepend(box);
  $('#demoLoginBtn').addEventListener('click', async () => {
    try {
      await api.post('/api/companies/login', { adminEmail: demo.adminEmail, password: demo.adminPassword });
      showDashboard(await api.get('/api/companies/me'));
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------------------
// 認証（タブ・登録・ログイン）
// ---------------------------------------------------------------------------
function selectTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  $('#registerForm').classList.toggle('hidden', name !== 'register');
  $('#loginForm').classList.toggle('hidden', name !== 'login');
}
$$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

function showAlert(hostId, message, kind = 'error') {
  $('#' + hostId).innerHTML = message
    ? `<div class="alert alert--${kind}">${escapeHtml(message)}</div>`
    : '';
}

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showAlert('registerAlert', '');
  const f = e.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    const data = await api.post('/api/companies/register', {
      companyName: f.companyName.value,
      adminName: f.adminName.value,
      adminEmail: f.adminEmail.value,
      password: f.password.value,
    });
    toast(`会社ID ${data.companyId} を発行しました！`, 'ok');
    const full = await api.get('/api/companies/me');
    showDashboard(full);
  } catch (err) {
    showAlert('registerAlert', err.message);
  } finally {
    btn.disabled = false;
  }
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showAlert('loginAlert', '');
  const f = e.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    await api.post('/api/companies/login', {
      adminEmail: f.adminEmail.value,
      password: f.password.value,
    });
    const full = await api.get('/api/companies/me');
    showDashboard(full);
  } catch (err) {
    showAlert('loginAlert', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// ダッシュボード
// ---------------------------------------------------------------------------
let state = { company: null };

async function showDashboard(data) {
  authView.classList.add('hidden');
  dashView.classList.remove('hidden');
  state.company = data.company;

  $('#companyName').textContent = data.company.name;
  $('#companyIdValue').textContent = data.company.companyId;
  renderStats(data.stats);

  await Promise.all([loadEmployees(), loadDeliveries()]);
}

$('#copyIdBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.company.companyId);
    toast('会社IDをコピーしました', 'ok');
  } catch {
    toast('コピーできませんでした', 'error');
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api.post('/api/companies/logout').catch(() => {});
  location.reload();
});

function productIcon(product) {
  return product.type === 'rice' ? '../assets/rice.png' : '../assets/vegetable.svg';
}

function renderStats(s) {
  // 統計タイル: ラベル（小・淡色）／値（セミボールド・インク色）／補足。色はアイコンチップのみに載せる。
  const cards = [
    {
      label: '稼働中の社員', tint: 'blue', icon: '👥',
      value: `<span data-count="${s.activeEmployees}">${s.activeEmployees}</span><span class="stat__unit">名</span>`,
      sub: `登録総数 ${s.totalEmployees}名`,
    },
    {
      label: '今月の月額費用（税込）', tint: 'gold', icon: '💴', hero: true,
      value: `<span data-count="${s.cost.monthlyInclTax}" data-yen="1">${escapeHtml(yen(s.cost.monthlyInclTax))}</span>`,
      sub: `税別 ${yen(s.cost.monthlyExclTax)}／年間 ${yen(s.cost.annualInclTax)}`,
    },
    {
      label: `今月（${s.thisMonth.month}月）のお届け`, tint: s.thisMonth.product.type === 'rice' ? 'gold' : 'green',
      img: productIcon(s.thisMonth.product),
      value: escapeHtml(s.thisMonth.product.name), small: true,
      sub: '毎月10日ごろにお届け',
    },
    {
      label: `来月（${s.nextMonth.month}月）のお届け`, tint: s.nextMonth.product.type === 'rice' ? 'gold' : 'green',
      img: productIcon(s.nextMonth.product),
      value: escapeHtml(s.nextMonth.product.name), small: true,
      sub: '毎月10日ごろにお届け',
    },
  ];
  $('#statCards').innerHTML = cards
    .map(
      (c) => `
    <div class="stat">
      <div class="stat__icon stat__icon--${c.tint}">${c.img ? `<img src="${c.img}" alt="" />` : c.icon}</div>
      <div class="stat__body">
        <div class="stat__label">${escapeHtml(c.label)}</div>
        <div class="stat__value ${c.hero ? 'stat__value--hero' : ''} ${c.small ? 'stat__value--sm' : ''}">${c.value}</div>
        <div class="stat__sub">${escapeHtml(c.sub)}</div>
      </div>
    </div>`
    )
    .join('');
  animateStatNumbers();
}

// 統計タイルの数値をカウントアップ表示する。
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateStatNumbers() {
  if (REDUCED_MOTION) return;
  $$('#statCards [data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    if (!Number.isFinite(to) || to <= 0) return;
    const isYen = el.dataset.yen === '1';
    const dur = 750;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(to * eased);
      el.textContent = isYen ? yen(v) : String(v);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------------------------
// 社員一覧
// ---------------------------------------------------------------------------
let employeesCache = [];

async function loadEmployees() {
  const { employees } = await api.get('/api/employees');
  employeesCache = employees;
  renderEmployees();
}

function renderEmployees() {
  const area = $('#employeesArea');
  const q = ($('#empSearch')?.value || '').trim().toLowerCase();
  const employees = q
    ? employeesCache.filter((e) =>
        [e.name, e.employeeCode, e.department, e.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : employeesCache;

  if (!employeesCache.length) {
    area.innerHTML = `
      <div class="empty">
        <img src="../assets/gori-think.png" alt="ゴリ" />
        <p>まだ社員が登録されていません。<br>「＋ 社員を登録」から追加しましょう。</p>
      </div>`;
    return;
  }
  if (!employees.length) {
    area.innerHTML = `<div class="empty"><p>「${escapeHtml(q)}」に一致する社員は見つかりませんでした。</p></div>`;
    return;
  }

  // お届け先未登録の社員がいれば注意を表示（配送に必須のため）。
  const missing = employeesCache.filter((e) => e.status === 'active' && !e.addressRegistered);
  const warnHtml = missing.length
    ? `<div class="alert alert--warn">📮 お届け先が未登録の稼働中社員が <strong>${missing.length}名</strong> います（${missing.slice(0, 3).map((e) => escapeHtml(e.name)).join('、')}${missing.length > 3 ? ` 他${missing.length - 3}名` : ''}）。「編集」から登録するか、社員ポータルでの登録をご案内ください。</div>`
    : '';

  area.innerHTML = warnHtml + `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>氏名</th><th>社員コード</th><th>部署</th><th>お届け先</th><th>状態</th><th>操作</th>
        </tr></thead>
        <tbody>
          ${employees
            .map(
              (e) => `
            <tr>
              <td data-label="氏名"><strong>${escapeHtml(e.name)}</strong>${e.email ? `<br><span class="muted" style="font-size:12px">${escapeHtml(e.email)}</span>` : ''}</td>
              <td data-label="社員コード" class="mono">${escapeHtml(e.employeeCode)}</td>
              <td data-label="部署">${escapeHtml(e.department || '—')}</td>
              <td data-label="お届け先">${e.addressRegistered
                ? '<span class="badge badge--delivered">登録済</span>'
                : '<span class="badge badge--paused">未登録</span>'}</td>
              <td data-label="状態">${e.status === 'active'
                ? '<span class="badge badge--active">稼働中</span>'
                : '<span class="badge badge--paused">停止中</span>'}</td>
              <td data-label="操作" class="nowrap">
                <button class="btn btn--ghost btn--sm" data-act="edit" data-id="${e.id}">編集</button>
                <button class="btn btn--ghost btn--sm" data-act="pin" data-id="${e.id}">PIN再発行</button>
                <button class="btn btn--danger btn--sm" data-act="del" data-id="${e.id}" data-name="${escapeHtml(e.name)}">削除</button>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;

  area.querySelectorAll('button[data-act]').forEach((b) => {
    const id = Number(b.dataset.id);
    const emp = employees.find((x) => x.id === id);
    if (b.dataset.act === 'edit') b.onclick = () => openEmployeeModal(emp);
    if (b.dataset.act === 'pin') b.onclick = () => resetPin(emp);
    if (b.dataset.act === 'del') b.onclick = () => deleteEmployee(emp);
  });
  updateSetupGuide();
}

// ---------------------------------------------------------------------------
// はじめかたガイド（セットアップの進捗。全部済んだら消える）
// ---------------------------------------------------------------------------
function updateSetupGuide() {
  const host = $('#setupGuide');
  if (!host) return;
  const total = employeesCache.length;
  const withAddr = employeesCache.filter((e) => e.addressRegistered).length;
  const managed = deliveriesCache.some((d) => d.status !== 'scheduled');

  const steps = [
    {
      done: total > 0,
      title: '社員を登録する',
      desc: total > 0 ? `${total}名 登録済み` : '「＋ 社員を登録」から追加しましょう',
    },
    {
      done: total > 0 && withAddr === total,
      title: 'お届け先住所をそろえる',
      desc: total > 0 ? `${withAddr}/${total}名 登録済み` : '社員を登録すると設定できます',
    },
    {
      done: managed,
      title: '配送状況を更新する',
      desc: managed ? '運用が始まっています' : '発送したら「発送済」に更新しましょう',
    },
  ];
  if (steps.every((s) => s.done)) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `
    <div class="card guide">
      <div class="guide__head">
        <h2>🦍 はじめかたガイド</h2>
        <span class="muted">${steps.filter((s) => s.done).length} / ${steps.length} 完了</span>
      </div>
      <ol class="guide__steps">
        ${steps
          .map(
            (s, i) => `
          <li class="${s.done ? 'is-done' : ''}">
            <span class="guide__check">${s.done ? '✓' : i + 1}</span>
            <div><strong>${s.title}</strong><span>${s.desc}</span></div>
          </li>`
          )
          .join('')}
      </ol>
    </div>`;
}

$('#addEmpBtn').addEventListener('click', () => openEmployeeModal(null));
$('#empSearch')?.addEventListener('input', renderEmployees);

// 社員一覧をCSVでダウンロード（Excelで開ける）。
$('#csvBtn')?.addEventListener('click', () => {
  if (!employeesCache.length) return toast('出力する社員がいません', 'error');
  const rows = [
    ['社員コード', '氏名', '部署', 'メール', '郵便番号', '住所', '状態', '登録日'],
    ...employeesCache.map((e) => [
      e.employeeCode, e.name, e.department || '', e.email || '',
      e.postalCode || '', e.address || '',
      e.status === 'active' ? '稼働中' : '停止中',
      (e.createdAt || '').slice(0, 10),
    ]),
  ];
  downloadCsv(`ogori-社員一覧-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  toast('社員一覧CSVをダウンロードしました', 'ok');
});

// ---------------------------------------------------------------------------
// モーダル
// ---------------------------------------------------------------------------
function openModal(contentNode) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: 'modal' });
  modal.append(contentNode);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  function close() { backdrop.remove(); document.removeEventListener('keydown', onKey); }
  $('#modalHost').append(backdrop);
  return { close };
}

function openEmployeeModal(emp) {
  const isEdit = !!emp;
  const form = el('form', { class: 'stack' });
  form.innerHTML = `
    <h3>${isEdit ? '社員情報を編集' : '社員を登録'}</h3>
    <div id="empAlert"></div>
    <div class="field"><label>氏名 *</label><input name="name" required maxlength="80" value="${isEdit ? escapeHtml(emp.name) : ''}" /></div>
    <div class="row">
      <div class="field"><label>部署</label><input name="department" maxlength="80" value="${isEdit ? escapeHtml(emp.department || '') : ''}" /></div>
      <div class="field"><label>メール</label><input name="email" type="email" value="${isEdit ? escapeHtml(emp.email || '') : ''}" /></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:160px"><label>郵便番号</label><input name="postalCode" maxlength="16" value="${isEdit ? escapeHtml(emp.postalCode || '') : ''}" /></div>
      <div class="field"><label>住所（お届け先）</label><input name="address" maxlength="300" value="${isEdit ? escapeHtml(emp.address || '') : ''}" /></div>
    </div>
    ${isEdit ? `<div class="field"><label>状態</label><select name="status">
        <option value="active" ${emp.status === 'active' ? 'selected' : ''}>稼働中</option>
        <option value="paused" ${emp.status === 'paused' ? 'selected' : ''}>停止中</option>
      </select></div>` : '<div class="hint">登録すると、社員コードと初期PINが発行されます。</div>'}
    <div class="row" style="justify-content:flex-end;margin-top:8px">
      <button type="button" class="btn btn--ghost" data-close>キャンセル</button>
      <button type="submit" class="btn btn--primary">${isEdit ? '保存する' : '登録する'}</button>
    </div>`;
  const { close } = openModal(form);
  form.querySelector('[data-close]').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.value,
      department: form.department.value,
      email: form.email.value,
      postalCode: form.postalCode.value,
      address: form.address.value,
    };
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (isEdit) {
        payload.status = form.status.value;
        await api.patch(`/api/employees/${emp.id}`, payload);
        toast('社員情報を更新しました', 'ok');
        close();
        await Promise.all([loadEmployees(), refreshStats()]);
      } else {
        const res = await api.post('/api/employees', payload);
        close();
        showCredentials(res.credentials, `${payload.name} さんを登録しました`);
        await Promise.all([loadEmployees(), loadDeliveries(), refreshStats()]);
      }
    } catch (err) {
      $('#empAlert').innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
      btn.disabled = false;
    }
  };
}

function showCredentials(creds, title) {
  const node = el('div', { class: 'stack' });
  node.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <p class="muted">社員は下記情報で <a href="employee.html" target="_blank">社員ポータル</a> にログインできます。</p>
    <div class="creds">
      <div class="creds__row"><span>会社ID</span><b class="mono">${escapeHtml(creds.companyId)}</b></div>
      <div class="creds__row"><span>社員コード</span><b class="mono">${escapeHtml(creds.employeeCode)}</b></div>
      <div class="creds__row"><span>初期PIN</span><b class="mono">${escapeHtml(creds.pin)}</b></div>
    </div>
    <div class="alert alert--ok">${escapeHtml(creds.note || 'この情報はこの画面でのみ表示されます。')}</div>
    <div class="row" style="justify-content:flex-end">
      <button class="btn btn--ghost" data-copy>まとめてコピー</button>
      <button class="btn btn--primary" data-close>閉じる</button>
    </div>`;
  const { close } = openModal(node);
  node.querySelector('[data-close]').onclick = close;
  node.querySelector('[data-copy]').onclick = async () => {
    const text = `会社ID: ${creds.companyId}\n社員コード: ${creds.employeeCode}\n初期PIN: ${creds.pin}`;
    try { await navigator.clipboard.writeText(text); toast('コピーしました', 'ok'); }
    catch { toast('コピーできませんでした', 'error'); }
  };
}

async function resetPin(emp) {
  if (!confirm(`${emp.name} さんのPINを再発行しますか？\n現在のPINは無効になります。`)) return;
  try {
    const res = await api.post(`/api/employees/${emp.id}/reset-pin`);
    showCredentials(res.credentials, `${emp.name} さんのPINを再発行しました`);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteEmployee(emp) {
  if (!confirm(`${emp.name} さんを削除しますか？\n配送スケジュールも削除されます。この操作は取り消せません。`)) return;
  try {
    await api.del(`/api/employees/${emp.id}`);
    toast(`${emp.name} さんを削除しました`, 'ok');
    await Promise.all([loadEmployees(), loadDeliveries(), refreshStats()]);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// 配送スケジュール
// ---------------------------------------------------------------------------
let deliveriesCache = [];
let deliveryMonths = [];
let selectedMonthKey = null;

const monthKey = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;

async function loadDeliveries() {
  const { deliveries, months } = await api.get('/api/deliveries');
  deliveriesCache = deliveries;
  deliveryMonths = months;

  // 初期選択は「今月」。無ければ先頭の月。
  if (!selectedMonthKey || !months.some((m) => monthKey(m) === selectedMonthKey)) {
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    selectedMonthKey = months.some((m) => monthKey(m) === nowKey)
      ? nowKey
      : months.length ? monthKey(months[0]) : null;
  }
  renderDeliveries();
}

function renderDeliveries() {
  const chips = $('#deliveryMonths');
  const area = $('#deliveriesArea');

  if (!deliveryMonths.length) {
    chips.innerHTML = '<p class="muted">社員を登録すると配送スケジュールが表示されます。</p>';
    area.innerHTML = '';
    return;
  }

  chips.innerHTML = deliveryMonths
    .map((m) => {
      const isRice = m.productType === 'rice';
      const key = monthKey(m);
      return `<button type="button" class="mchip ${key === selectedMonthKey ? 'is-active' : ''}" data-month="${key}">
        <span class="mchip__label">${m.year}/${m.month}</span>
        <span class="mchip__emoji">${isRice ? '🍚' : '🥬'}</span>
        <span class="mchip__count">×${m.count}</span>
      </button>`;
    })
    .join('');
  chips.querySelectorAll('.mchip').forEach((b) => {
    b.onclick = () => {
      selectedMonthKey = b.dataset.month;
      renderDeliveries();
    };
  });

  const rows = deliveriesCache.filter(
    (d) => `${d.year}-${String(d.month).padStart(2, '0')}` === selectedMonthKey
  );
  const done = rows.filter((d) => d.status === 'delivered').length;
  const shipped = rows.filter((d) => d.status === 'shipped').length;

  area.innerHTML = `
    <p class="delivery-summary">
      <strong>${Number(selectedMonthKey?.split('-')[0])}年${Number(selectedMonthKey?.split('-')[1])}月</strong>のお届け: 全${rows.length}件
      <span class="muted">（お届け済 ${done}件・発送済 ${shipped}件・予定 ${rows.length - done - shipped}件）</span>
    </p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>お届け予定日</th><th>社員</th><th>商品</th><th>状態</th><th>更新</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (d) => `
            <tr>
              <td data-label="お届け予定日" class="nowrap"><strong>${escapeHtml(d.scheduledDate)}</strong></td>
              <td data-label="社員">${escapeHtml(d.employeeName)}<br><span class="muted mono" style="font-size:12px">${escapeHtml(d.employeeCode)}</span></td>
              <td data-label="商品">${productBadge(d.productType, d.productName)}</td>
              <td data-label="状態">${statusBadge(d.status)}</td>
              <td data-label="更新">
                <select data-delivery="${d.id}" class="status-select" aria-label="${escapeHtml(d.employeeName)}の配送状態">
                  <option value="scheduled" ${d.status === 'scheduled' ? 'selected' : ''}>予定</option>
                  <option value="shipped" ${d.status === 'shipped' ? 'selected' : ''}>発送済</option>
                  <option value="delivered" ${d.status === 'delivered' ? 'selected' : ''}>お届け済</option>
                </select>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;

  area.querySelectorAll('select[data-delivery]').forEach((sel) => {
    sel.onchange = async () => {
      try {
        await api.patch(`/api/deliveries/${sel.dataset.delivery}`, { status: sel.value });
        toast('配送状態を更新しました', 'ok');
        await loadDeliveries();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  });
  updateSetupGuide();
}

// 選択中の月の配送を一括でステータス更新。
$('#bulkStatus')?.addEventListener('change', async (e) => {
  const status = e.target.value;
  e.target.value = '';
  if (!status) return;
  const targets = deliveriesCache.filter(
    (d) => `${d.year}-${String(d.month).padStart(2, '0')}` === selectedMonthKey && d.status !== status
  );
  if (!targets.length) return toast('更新対象がありません', 'error');
  const label = status === 'shipped' ? '発送済' : 'お届け済';
  const [y, m] = (selectedMonthKey || '-').split('-').map(Number);
  if (!confirm(`${y}年${m}月の${targets.length}件をすべて「${label}」に更新しますか？`)) return;
  try {
    for (const d of targets) {
      await api.patch(`/api/deliveries/${d.id}`, { status });
    }
    toast(`${targets.length}件を「${label}」に更新しました`, 'ok');
  } catch (err) {
    toast(err.message, 'error');
  }
  await loadDeliveries();
});

// 選択中の月の配送リストをCSVでダウンロード。
$('#delivCsvBtn')?.addEventListener('click', () => {
  const rows = deliveriesCache.filter(
    (d) => `${d.year}-${String(d.month).padStart(2, '0')}` === selectedMonthKey
  );
  if (!rows.length) return toast('出力する配送がありません', 'error');
  const statusJa = { scheduled: '予定', shipped: '発送済', delivered: 'お届け済' };
  const csv = [
    ['お届け予定日', '社員コード', '氏名', '商品', '状態'],
    ...rows.map((d) => [d.scheduledDate, d.employeeCode, d.employeeName, d.productName, statusJa[d.status] || d.status]),
  ];
  downloadCsv(`ogori-配送-${selectedMonthKey}.csv`, csv);
  toast('配送CSVをダウンロードしました', 'ok');
});

async function refreshStats() {
  try {
    const data = await api.get('/api/companies/me');
    renderStats(data.stats);
  } catch { /* noop */ }
}
