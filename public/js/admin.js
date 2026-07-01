import {
  api, $, $$, el, toast, yen, renderNav, escapeHtml, productBadge, statusBadge, STATIC_MODE, staticBackend,
} from './common.js';

$('#nav').innerHTML = renderNav('admin');

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

function renderStats(s) {
  const cards = [
    { label: '稼働中の社員', value: s.activeEmployees, sub: `登録総数 ${s.totalEmployees}名`, emoji: '👥' },
    {
      label: '今月の月額費用（税込）', value: yen(s.cost.monthlyInclTax),
      sub: `税別 ${yen(s.cost.monthlyExclTax)}／ 年間 ${yen(s.cost.annualInclTax)}`, accent: true,
    },
    {
      label: `今月（${s.thisMonth.month}月）のお届け`, value: s.thisMonth.product.emoji,
      sub: s.thisMonth.product.name, emojiValue: true,
    },
    {
      label: `来月（${s.nextMonth.month}月）のお届け`, value: s.nextMonth.product.emoji,
      sub: s.nextMonth.product.name, emojiValue: true,
    },
  ];
  $('#statCards').innerHTML = cards
    .map(
      (c) => `
    <div class="stat ${c.accent ? 'stat--accent' : ''}">
      <div class="stat__label">${escapeHtml(c.label)}</div>
      <div class="stat__value ${c.emojiValue ? 'stat__emoji' : ''}">${c.emojiValue ? c.value : escapeHtml(String(c.value))}</div>
      <div class="stat__sub">${escapeHtml(c.sub)}</div>
    </div>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// 社員一覧
// ---------------------------------------------------------------------------
async function loadEmployees() {
  const { employees } = await api.get('/api/employees');
  const area = $('#employeesArea');
  if (!employees.length) {
    area.innerHTML = `
      <div class="empty">
        <img src="assets/gori-think.png" alt="ゴリ" />
        <p>まだ社員が登録されていません。<br>「＋ 社員を登録」から追加しましょう。</p>
      </div>`;
    return;
  }
  area.innerHTML = `
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
              <td><strong>${escapeHtml(e.name)}</strong>${e.email ? `<br><span class="muted" style="font-size:12px">${escapeHtml(e.email)}</span>` : ''}</td>
              <td class="mono">${escapeHtml(e.employeeCode)}</td>
              <td>${escapeHtml(e.department || '—')}</td>
              <td>${e.addressRegistered
                ? '<span class="badge badge--delivered">登録済</span>'
                : '<span class="badge badge--paused">未登録</span>'}</td>
              <td>${e.status === 'active'
                ? '<span class="badge badge--active">稼働中</span>'
                : '<span class="badge badge--paused">停止中</span>'}</td>
              <td class="nowrap">
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
}

$('#addEmpBtn').addEventListener('click', () => openEmployeeModal(null));

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
async function loadDeliveries() {
  const { deliveries, months } = await api.get('/api/deliveries');
  const strip = $('#deliveryMonths');
  strip.innerHTML = months.length
    ? months
        .slice(0, 6)
        .map((m) => {
          const isRice = m.productType === 'rice';
          return `<div class="mcard ${isRice ? 'mcard--rice' : 'mcard--veg'}">
            <div class="mcard__m">${m.year}/${m.month}</div>
            <div class="mcard__e">${isRice ? '🍚' : '🥬'}</div>
            <div class="mcard__c">${isRice ? 'お米5kg' : '旬の野菜'} ×${m.count}</div>
          </div>`;
        })
        .join('')
    : '<p class="muted">社員を登録すると配送スケジュールが表示されます。</p>';

  const area = $('#deliveriesArea');
  if (!deliveries.length) {
    area.innerHTML = '';
    return;
  }
  area.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>お届け月</th><th>社員</th><th>商品</th><th>状態</th><th>更新</th></tr></thead>
        <tbody>
          ${deliveries
            .slice(0, 120)
            .map(
              (d) => `
            <tr>
              <td class="nowrap"><strong>${d.year}/${d.month}</strong><br><span class="muted" style="font-size:12px">${escapeHtml(d.scheduledDate)}</span></td>
              <td>${escapeHtml(d.employeeName)}<br><span class="muted mono" style="font-size:12px">${escapeHtml(d.employeeCode)}</span></td>
              <td>${productBadge(d.productType, d.productName)}</td>
              <td>${statusBadge(d.status)}</td>
              <td>
                <select data-delivery="${d.id}" class="status-select">
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
    </div>
    ${deliveries.length > 120 ? `<p class="hint" style="margin-top:10px">最新120件を表示しています（全${deliveries.length}件）。</p>` : ''}`;

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
}

async function refreshStats() {
  try {
    const data = await api.get('/api/companies/me');
    renderStats(data.stats);
  } catch { /* noop */ }
}
