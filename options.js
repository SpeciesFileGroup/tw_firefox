// ---- Hosts ----

const tbody = document.querySelector('#hosts-table tbody');
const statusEl = document.getElementById('status');

let rows = [];

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

function render() {
  tbody.innerHTML = '';
  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = row.name;
    nameInput.placeholder = 'sfg';
    nameInput.addEventListener('input', () => { rows[idx].name = nameInput.value.trim(); });
    nameTd.appendChild(nameInput);

    const urlTd = document.createElement('td');
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.value = row.url;
    urlInput.placeholder = 'https://sfg.taxonworks.org';
    urlInput.addEventListener('input', () => { rows[idx].url = urlInput.value.trim(); });
    urlTd.appendChild(urlInput);

    const defTd = document.createElement('td');
    defTd.className = 'default-col';
    const defInput = document.createElement('input');
    defInput.type = 'radio';
    defInput.name = 'default-host';
    defInput.checked = !!row.isDefault;
    defInput.addEventListener('change', () => {
      rows = rows.map((r, i) => ({ ...r, isDefault: i === idx }));
    });
    defTd.appendChild(defInput);

    const rmTd = document.createElement('td');
    rmTd.className = 'remove-col';
    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove';
    rmBtn.textContent = '×';
    rmBtn.title = 'Remove';
    rmBtn.addEventListener('click', () => {
      rows.splice(idx, 1);
      if (rows.length && !rows.some(r => r.isDefault)) rows[0].isDefault = true;
      render();
    });
    rmTd.appendChild(rmBtn);

    tr.append(nameTd, urlTd, defTd, rmTd);
    tbody.appendChild(tr);
  });
}

function validate(list) {
  if (!list.length) return 'At least one instance is required.';
  const names = new Set();
  for (const r of list) {
    if (!r.name) return 'Every instance needs a name.';
    if (!/^[\w-]+$/.test(r.name)) return `Instance name "${r.name}" must be word characters only.`;
    if (names.has(r.name.toLowerCase())) return `Duplicate instance name "${r.name}".`;
    names.add(r.name.toLowerCase());
    try {
      const u = new URL(r.url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return `URL for "${r.name}" must use http:// or https://.`;
      }
    } catch { return `Invalid URL for "${r.name}".`; }
  }
  if (!list.some(r => r.isDefault)) return 'Pick a default instance.';
  return null;
}

async function load() {
  rows = await loadHosts();
  render();
}

async function save() {
  const normalized = rows.map(r => {
    try { const u = new URL(r.url); return { ...r, url: `${u.protocol}//${u.host}` }; }
    catch { return r; }
  });
  const err = validate(normalized);
  if (err) { setStatus(err, true); return; }
  await browser.storage.local.set({ hosts: normalized });
  rows = normalized;
  render();
  setStatus('Saved.');
}

document.getElementById('add').addEventListener('click', () => {
  rows.push({ name: '', url: '', isDefault: rows.length === 0 });
  render();
});
document.getElementById('reset').addEventListener('click', () => {
  rows = DEFAULT_HOSTS.map(h => ({ ...h }));
  render();
  setStatus('Reset — click Save to persist.');
});
document.getElementById('save').addEventListener('click', save);

// ---- Custom bangs ----

const bangTbody = document.querySelector('#bangs-table tbody');
const bangStatus = document.getElementById('bang-status');
const DISABLED = '__disabled__';
const CUSTOM   = '__custom__';

// Rows: { alias, target: DISABLED | CUSTOM | 'p:<path>' | 'u:<url>', customUrl?, customLabel? }
let bangRows = [];

function setBangStatus(msg, isError = false) {
  bangStatus.textContent = msg;
  bangStatus.classList.toggle('error', isError);
}

function targetKey(info) {
  if (info.path)     return `p:${info.path}`;
  if (info.fullPath) return `f:${info.fullPath}`;
  if (info.rawPath)  return `r:${info.rawPath}`;
  return `u:${info.url}`;
}
function targetFromKey(key) {
  return BANG_TARGETS.find(t => targetKey(t) === key) || null;
}

function renderBangs() {
  bangTbody.innerHTML = '';
  bangRows.forEach((row, idx) => {
    const tr = document.createElement('tr');

    const aliasTd = document.createElement('td');
    aliasTd.className = 'alias-col';
    const aliasInput = document.createElement('input');
    aliasInput.type = 'text';
    aliasInput.value = row.alias;
    aliasInput.placeholder = 'x';
    aliasInput.addEventListener('input', () => { bangRows[idx].alias = aliasInput.value.trim().toLowerCase(); });
    aliasTd.appendChild(aliasInput);

    const targetTd = document.createElement('td');
    const select = document.createElement('select');
    const disabledOpt = document.createElement('option');
    disabledOpt.value = DISABLED;
    disabledOpt.textContent = '— disable built-in —';
    select.appendChild(disabledOpt);
    for (const t of BANG_TARGETS) {
      const opt = document.createElement('option');
      opt.value = targetKey(t);
      opt.textContent = t.path
        ? `${t.label}  (TW: ${t.path})`
        : t.fullPath
        ? `${t.label}  (TW: ${t.fullPath})`
        : t.rawPath
        ? `${t.label}  (TW: ${t.rawPath})`
        : `${t.label}  (external)`;
      select.appendChild(opt);
    }
    const customOpt = document.createElement('option');
    customOpt.value = CUSTOM;
    customOpt.textContent = '— custom URL template —';
    select.appendChild(customOpt);
    select.value = row.target || DISABLED;

    // Optional custom URL input — only visible when CUSTOM is selected.
    const customWrap = document.createElement('div');
    customWrap.style.marginTop = '0.25em';
    customWrap.style.display = row.target === CUSTOM ? 'block' : 'none';
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'https://example.com/search?q={}  (use {} for the query)';
    customInput.value = row.customUrl || '';
    customInput.addEventListener('input', () => { bangRows[idx].customUrl = customInput.value.trim(); });
    customWrap.appendChild(customInput);

    select.addEventListener('change', () => {
      bangRows[idx].target = select.value;
      customWrap.style.display = select.value === CUSTOM ? 'block' : 'none';
    });

    targetTd.append(select, customWrap);

    const rmTd = document.createElement('td');
    rmTd.className = 'remove-col';
    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove';
    rmBtn.textContent = '×';
    rmBtn.title = 'Remove';
    rmBtn.addEventListener('click', () => { bangRows.splice(idx, 1); renderBangs(); });
    rmTd.appendChild(rmBtn);

    tr.append(aliasTd, targetTd, rmTd);
    bangTbody.appendChild(tr);
  });
}

function renderBuiltins() {
  const dl = document.getElementById('builtins');
  for (const [alias, info] of Object.entries(BANGS)) {
    const dt = document.createElement('dt');
    dt.textContent = `!${alias}`;
    const dd = document.createElement('dd');
    dd.textContent = info.label + (info.url ? '  (external)' : '');
    dl.append(dt, dd);
  }
}

async function loadBangs() {
  const { bangOverrides } = await browser.storage.local.get('bangOverrides');
  bangRows = Object.entries(bangOverrides || {}).map(([alias, v]) => {
    if (v === null) return { alias, target: DISABLED };
    const key = targetKey(v);
    if (targetFromKey(key)) return { alias, target: key };
    // Custom URL that isn't one of our built-in targets.
    return { alias, target: CUSTOM, customUrl: v.url || '', customLabel: v.label };
  });
  renderBangs();
}

async function saveBangs() {
  const overrides = {};
  const seen = new Set();
  for (const row of bangRows) {
    if (!row.alias) { setBangStatus('Every row needs an alias.', true); return; }
    if (!/^[a-z0-9_-]+$/.test(row.alias)) { setBangStatus(`Alias "${row.alias}" must be lowercase letters, digits, - or _.`, true); return; }
    if (seen.has(row.alias)) { setBangStatus(`Duplicate alias "${row.alias}".`, true); return; }
    seen.add(row.alias);

    if (row.target === DISABLED) {
      overrides[row.alias] = null;
    } else if (row.target === CUSTOM) {
      const tmpl = (row.customUrl || '').trim();
      if (!tmpl) { setBangStatus(`Alias "${row.alias}" needs a URL template.`, true); return; }
      if (!tmpl.includes('{}')) { setBangStatus(`URL template for "${row.alias}" must contain {} as the query placeholder.`, true); return; }
      try {
        const u = new URL(tmpl.replace('{}', 'x'));
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          setBangStatus(`URL template for "${row.alias}" must use http:// or https://.`, true);
          return;
        }
      } catch { setBangStatus(`Invalid URL template for "${row.alias}".`, true); return; }
      overrides[row.alias] = { url: tmpl, label: row.customLabel || row.alias };
    } else {
      const target = targetFromKey(row.target);
      if (!target) { setBangStatus(`Unknown target for "${row.alias}".`, true); return; }
      overrides[row.alias] = target.path
        ? { path:     target.path,     label: target.label }
        : target.fullPath
        ? { fullPath: target.fullPath, label: target.label }
        : target.rawPath
        ? { rawPath:  target.rawPath,  label: target.label }
        : { url:      target.url,      label: target.label };
    }
  }
  await browser.storage.local.set({ bangOverrides: overrides });
  setBangStatus('Saved.');
}

document.getElementById('add-bang').addEventListener('click', () => {
  bangRows.push({ alias: '', target: BANG_TARGETS[0] ? targetKey(BANG_TARGETS[0]) : CUSTOM });
  renderBangs();
});
document.getElementById('save-bangs').addEventListener('click', saveBangs);

renderBuiltins();
loadBangs();
load();

// ---- Default disposition ----

const prefStatus = document.getElementById('pref-status');

async function loadPref() {
  const { defaultDisposition } = await browser.storage.local.get('defaultDisposition');
  const value = defaultDisposition || 'currentTab';
  const radio = document.querySelector(`input[name="default-disposition"][value="${value}"]`);
  if (radio) radio.checked = true;
}

async function savePref() {
  const chosen = document.querySelector('input[name="default-disposition"]:checked');
  if (!chosen) return;
  await browser.storage.local.set({ defaultDisposition: chosen.value });
  prefStatus.textContent = 'Saved.';
  prefStatus.style.color = '#0a0';
}

document.getElementById('save-pref').addEventListener('click', savePref);
loadPref();
