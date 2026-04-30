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
  await (await activeStorage()).set({ hosts: normalized });
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

const internalTbody = document.querySelector('#internal-bangs-table tbody');
const externalTbody = document.querySelector('#external-bangs-table tbody');
const bangStatus = document.getElementById('bang-status');

// Internal-row kinds:  'disabled' | 'builtin' | 'filter' | 'task' | 'raw'
// External-row kinds:  'disabled' | 'builtin' | 'custom'
// Each row also carries the relevant config fields for its current kind.
let internalRows = [];
let externalRows = [];

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
function builtinLabel(t) {
  if (t.path)     return `${t.label}  (TW: ${t.path})`;
  if (t.fullPath) return `${t.label}  (TW: ${t.fullPath})`;
  if (t.rawPath)  return `${t.label}  (TW: ${t.rawPath})`;
  return `${t.label}  (external)`;
}

const internalTargets = BANG_TARGETS.filter(t => !t.url);
const externalTargets = BANG_TARGETS.filter(t =>  t.url);

// ---- shared widgets ----

function makeAliasInput(row) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = row.alias || '';
  input.placeholder = 'x';
  input.addEventListener('input', () => { row.alias = input.value.trim().toLowerCase(); });
  return input;
}
function makeLabelInput(row, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = row.label || '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => { row.label = input.value; });
  return input;
}
function makeRemoveCell(onRemove) {
  const td = document.createElement('td');
  td.className = 'remove-col';
  const btn = document.createElement('button');
  btn.className = 'remove';
  btn.textContent = '×';
  btn.title = 'Remove';
  btn.addEventListener('click', onRemove);
  td.appendChild(btn);
  return td;
}
function makeKindSelect(options, value, onChange) {
  const select = document.createElement('select');
  for (const [val, label] of options) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    select.appendChild(opt);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

// ---- internal section ----

const INTERNAL_KINDS = [
  ['custom',   'TaxonWorks URL or path (!)'],
  ['builtin',  'Use built-in target'],
  ['disabled', '— disable built-in —'],
];

// Strip any scheme://host[:port] prefix and return the host-relative path.
// Accepts a fully-qualified URL or an already-relative path.
function pathFromTwUrl(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.pathname + u.search + u.hash;
    } catch { return ''; }
  }
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed;
}

// Map a host-relative path to one of the three internal target shapes.
// Filter URLs (no extra query) keep the smart path: shape so chaining
// and API destination still work; everything else falls back to rawPath.
function inferTwTarget(fullPath) {
  const qIdx = fullPath.search(/[?#]/);
  const pure = qIdx < 0 ? fullPath : fullPath.slice(0, qIdx);
  const extras = qIdx < 0 ? '' : fullPath.slice(qIdx);
  if (!extras) {
    let m = pure.match(/^\/tasks\/([^/]+)\/filter\/?$/);
    if (m) return { path: m[1] };
    m = pure.match(/^\/tasks\/(.+?)\/?$/);
    if (m) return { fullPath: m[1] };
  }
  return { rawPath: fullPath };
}

// Reverse of inferTwTarget: rebuild a host-relative URL string for display.
function displayPathFromTarget(t) {
  if (t.path)     return `/tasks/${t.path}/filter`;
  if (t.fullPath) return `/tasks/${t.fullPath}`;
  return t.rawPath || '';
}

function renderInternal() {
  internalTbody.innerHTML = '';
  internalRows.forEach((row, idx) => {
    const tr = document.createElement('tr');

    const aliasTd = document.createElement('td');
    aliasTd.className = 'alias-col';
    aliasTd.appendChild(makeAliasInput(row));

    const kindTd = document.createElement('td');
    kindTd.className = 'kind-col';
    kindTd.appendChild(makeKindSelect(INTERNAL_KINDS, row.kind, (v) => { row.kind = v; renderInternal(); }));

    const configTd = document.createElement('td');
    const configWrap = document.createElement('div');
    configWrap.className = 'config-cell';
    if (row.kind === 'custom') {
      const i = document.createElement('input');
      i.type = 'text';
      i.placeholder = 'https://sfg.taxonworks.org/tasks/asserted_distributions/filter';
      i.value = row.url || '';
      i.addEventListener('input', () => { row.url = i.value; });
      configWrap.appendChild(i);
    } else if (row.kind === 'builtin') {
      const sel = document.createElement('select');
      for (const t of internalTargets) {
        const opt = document.createElement('option');
        opt.value = targetKey(t);
        opt.textContent = builtinLabel(t);
        sel.appendChild(opt);
      }
      sel.value = row.builtinKey || (internalTargets[0] && targetKey(internalTargets[0])) || '';
      row.builtinKey = sel.value;
      sel.addEventListener('change', () => { row.builtinKey = sel.value; });
      configWrap.appendChild(sel);
    }
    configTd.appendChild(configWrap);

    const labelTd = document.createElement('td');
    labelTd.className = 'label-col';
    if (row.kind !== 'disabled') {
      labelTd.appendChild(makeLabelInput(row, 'optional'));
    }

    tr.append(
      aliasTd, kindTd, configTd, labelTd,
      makeRemoveCell(() => { internalRows.splice(idx, 1); renderInternal(); }),
    );
    internalTbody.appendChild(tr);
  });
}

// ---- external section ----

const EXTERNAL_KINDS = [
  ['custom',   'Custom URL template (~)'],
  ['builtin',  'Use built-in target'],
  ['disabled', '— disable built-in —'],
];

function renderExternal() {
  externalTbody.innerHTML = '';
  externalRows.forEach((row, idx) => {
    const tr = document.createElement('tr');

    const aliasTd = document.createElement('td');
    aliasTd.className = 'alias-col';
    aliasTd.appendChild(makeAliasInput(row));

    const kindTd = document.createElement('td');
    kindTd.className = 'kind-col';
    kindTd.appendChild(makeKindSelect(EXTERNAL_KINDS, row.kind, (v) => { row.kind = v; renderExternal(); }));

    const configTd = document.createElement('td');
    const configWrap = document.createElement('div');
    configWrap.className = 'config-cell';
    if (row.kind === 'custom') {
      const i = document.createElement('input');
      i.type = 'text';
      i.placeholder = 'https://example.com/search?q={}';
      i.value = row.url || '';
      i.addEventListener('input', () => { row.url = i.value.trim(); });
      configWrap.appendChild(i);
    } else if (row.kind === 'builtin') {
      const sel = document.createElement('select');
      for (const t of externalTargets) {
        const opt = document.createElement('option');
        opt.value = targetKey(t);
        opt.textContent = builtinLabel(t);
        sel.appendChild(opt);
      }
      sel.value = row.builtinKey || (externalTargets[0] && targetKey(externalTargets[0])) || '';
      row.builtinKey = sel.value;
      sel.addEventListener('change', () => { row.builtinKey = sel.value; });
      configWrap.appendChild(sel);
    }
    configTd.appendChild(configWrap);

    const labelTd = document.createElement('td');
    labelTd.className = 'label-col';
    if (row.kind !== 'disabled') {
      labelTd.appendChild(makeLabelInput(row, 'optional'));
    }

    tr.append(
      aliasTd, kindTd, configTd, labelTd,
      makeRemoveCell(() => { externalRows.splice(idx, 1); renderExternal(); }),
    );
    externalTbody.appendChild(tr);
  });
}

// ---- builtins reference ----

function renderBuiltins() {
  const internalDl = document.getElementById('builtins-internal');
  const externalDl = document.getElementById('builtins-external');
  for (const [alias, info] of Object.entries(BANGS)) {
    const sigil = info.url ? '~' : '!';
    const dt = document.createElement('dt');
    dt.textContent = `${sigil}${alias}`;
    const dd = document.createElement('dd');
    const labelSpan = document.createElement('span');
    labelSpan.textContent = info.label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'disable-builtin';
    btn.textContent = 'disable';
    btn.title = `Add an override that disables ${sigil}${alias}`;
    btn.addEventListener('click', () => disableBuiltin(alias));
    dd.append(labelSpan, btn);
    (info.url ? externalDl : internalDl).append(dt, dd);
  }
}

function disableBuiltin(alias) {
  const isExternal = !!BANGS[alias]?.url;
  const rows = isExternal ? externalRows : internalRows;
  const render = isExternal ? renderExternal : renderInternal;
  const tableId = isExternal ? 'external-bangs-table' : 'internal-bangs-table';
  const label = `${isExternal ? '~' : '!'}${alias}`;
  const existing = rows.findIndex(r => r.alias === alias);
  if (existing >= 0) {
    if (rows[existing].kind === 'disabled') {
      setBangStatus(`${label} is already marked disabled below.`);
      return;
    }
    rows[existing].kind = 'disabled';
    setBangStatus(`Existing override for ${label} switched to disabled — click "Save custom bangs".`);
  } else {
    rows.push({ alias, kind: 'disabled' });
    setBangStatus(`Added row to disable ${label} — click "Save custom bangs" to persist.`);
  }
  render();
  document.getElementById(tableId).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- load / save ----

async function loadBangs() {
  const { bangOverrides } = await (await activeStorage()).get('bangOverrides');
  internalRows = [];
  externalRows = [];
  for (const [alias, v] of Object.entries(bangOverrides || {})) {
    if (v === null) {
      // Disabled — route by built-in sigil; default to internal if unknown.
      if (BANGS[alias]?.url) externalRows.push({ alias, kind: 'disabled' });
      else                   internalRows.push({ alias, kind: 'disabled' });
      continue;
    }
    const key = targetKey(v);
    const builtin = targetFromKey(key);
    if (v.url) {
      if (builtin) externalRows.push({ alias, kind: 'builtin', builtinKey: key, label: v.label || '' });
      else         externalRows.push({ alias, kind: 'custom',  url: v.url, label: v.label || '' });
    } else if (builtin) {
      internalRows.push({ alias, kind: 'builtin', builtinKey: key, label: v.label || '' });
    } else if (v.path || v.fullPath || v.rawPath) {
      internalRows.push({ alias, kind: 'custom', url: displayPathFromTarget(v), label: v.label || '' });
    }
  }
  renderInternal();
  renderExternal();
}

function validateAlias(alias) {
  if (!alias) return 'Every row needs an alias.';
  if (!/^[a-z0-9_-]+$/.test(alias)) return `Alias "${alias}" must be lowercase letters, digits, - or _.`;
  return null;
}
function validateUrlTemplate(tmpl, alias) {
  if (!tmpl) return `Alias "${alias}" needs a URL template.`;
  if (!tmpl.includes('{}')) return `URL template for "${alias}" must contain {} as the query placeholder.`;
  try {
    const u = new URL(tmpl.replace('{}', 'x'));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return `URL template for "${alias}" must use http:// or https://.`;
    }
  } catch { return `Invalid URL template for "${alias}".`; }
  return null;
}

async function saveBangs() {
  const overrides = {};
  const seen = new Set();

  function claim(alias) {
    if (seen.has(alias)) return `Duplicate alias "${alias}" — internal and external sections share the namespace.`;
    seen.add(alias);
    return null;
  }

  for (const row of internalRows) {
    const aliasErr = validateAlias(row.alias); if (aliasErr) { setBangStatus(aliasErr, true); return; }
    const dupErr = claim(row.alias); if (dupErr) { setBangStatus(dupErr, true); return; }

    if (row.kind === 'disabled') {
      overrides[row.alias] = null;
    } else if (row.kind === 'builtin') {
      const t = targetFromKey(row.builtinKey);
      if (!t || t.url) { setBangStatus(`Pick a TaxonWorks target for "${row.alias}".`, true); return; }
      const label = (row.label && row.label.trim()) || t.label;
      overrides[row.alias] = t.path     ? { path: t.path, label }
                           : t.fullPath ? { fullPath: t.fullPath, label }
                                        : { rawPath: t.rawPath, label };
    } else if (row.kind === 'custom') {
      const raw = (row.url || '').trim();
      if (!raw) { setBangStatus(`!${row.alias} needs a TaxonWorks URL or path.`, true); return; }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) {
        setBangStatus(`URL for !${row.alias} must use http:// or https:// (or just be a path starting with "/").`, true); return;
      }
      const fullPath = pathFromTwUrl(raw);
      if (!fullPath || fullPath === '/') { setBangStatus(`!${row.alias}: couldn't extract a path from "${raw}".`, true); return; }
      const target = inferTwTarget(fullPath);
      const label = (row.label && row.label.trim()) || row.alias;
      overrides[row.alias] = { ...target, label };
    }
  }

  for (const row of externalRows) {
    const aliasErr = validateAlias(row.alias); if (aliasErr) { setBangStatus(aliasErr, true); return; }
    const dupErr = claim(row.alias); if (dupErr) { setBangStatus(dupErr, true); return; }

    if (row.kind === 'disabled') {
      overrides[row.alias] = null;
    } else if (row.kind === 'builtin') {
      const t = targetFromKey(row.builtinKey);
      if (!t || !t.url) { setBangStatus(`Pick an external target for "${row.alias}".`, true); return; }
      overrides[row.alias] = { url: t.url, label: (row.label && row.label.trim()) || t.label };
    } else if (row.kind === 'custom') {
      const tmpl = (row.url || '').trim();
      const tmplErr = validateUrlTemplate(tmpl, row.alias);
      if (tmplErr) { setBangStatus(tmplErr, true); return; }
      overrides[row.alias] = { url: tmpl, label: (row.label && row.label.trim()) || row.alias };
    }
  }

  await (await activeStorage()).set({ bangOverrides: overrides });
  setBangStatus('Saved.');
}

document.getElementById('add-internal-bang').addEventListener('click', () => {
  internalRows.push({ alias: '', kind: 'custom' });
  renderInternal();
});
document.getElementById('add-external-bang').addEventListener('click', () => {
  externalRows.push({ alias: '', kind: 'custom' });
  renderExternal();
});
document.getElementById('save-bangs').addEventListener('click', saveBangs);

renderBuiltins();
loadBangs();
load();

// ---- Default disposition ----

const prefStatus = document.getElementById('pref-status');

async function loadPref() {
  const { defaultDisposition } = await (await activeStorage()).get('defaultDisposition');
  const value = defaultDisposition || 'currentTab';
  const radio = document.querySelector(`input[name="default-disposition"][value="${value}"]`);
  if (radio) radio.checked = true;
}

async function savePref() {
  const chosen = document.querySelector('input[name="default-disposition"]:checked');
  if (!chosen) return;
  await (await activeStorage()).set({ defaultDisposition: chosen.value });
  prefStatus.textContent = 'Saved.';
  prefStatus.classList.remove('error');
}

document.getElementById('save-pref').addEventListener('click', savePref);
loadPref();

// ---- Backup & sync ----

const backupStatus = document.getElementById('backup-status');
const syncCheckbox = document.getElementById('sync-enabled');

function setBackupStatus(msg, isError = false) {
  backupStatus.textContent = msg;
  backupStatus.classList.toggle('error', isError);
}

async function exportSettings() {
  const storage = await activeStorage();
  const data = await storage.get(SYNCED_KEYS);
  const payload = {
    schema: SETTINGS_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString()
  };
  for (const k of SYNCED_KEYS) if (data[k] !== undefined) payload[k] = data[k];

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tw-omnibox-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const exported = SYNCED_KEYS.filter(k => data[k] !== undefined);
  setBackupStatus(exported.length
    ? `Exported: ${exported.join(', ')}.`
    : 'Exported (no customizations yet — only defaults).');
}

async function importSettings(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    setBackupStatus('That file isn\'t valid JSON.', true);
    return;
  }
  if (data.schema !== SETTINGS_EXPORT_SCHEMA) {
    setBackupStatus(`Unrecognized schema "${data.schema || '(missing)'}". Expected "${SETTINGS_EXPORT_SCHEMA}".`, true);
    return;
  }
  const writeable = {};
  for (const k of SYNCED_KEYS) if (data[k] !== undefined) writeable[k] = data[k];
  if (!Object.keys(writeable).length) {
    setBackupStatus('No settings keys found in that file.', true);
    return;
  }
  const storage = await activeStorage();
  await storage.set(writeable);
  setBackupStatus(`Imported: ${Object.keys(writeable).join(', ')}. Reloading…`);
  // Reload to pick up the new state in all the table renders. Cheap; no
  // need to reconcile rows in place.
  setTimeout(() => location.reload(), 700);
}

async function loadSyncToggle() {
  syncCheckbox.checked = await isSyncEnabled();
}

async function onSyncToggle() {
  const enabling = syncCheckbox.checked;
  syncCheckbox.disabled = true;
  try {
    if (enabling) {
      await migrateSettings(browser.storage.local, browser.storage.sync);
      await browser.storage.local.set({ syncEnabled: true });
      setBackupStatus('Sync enabled — settings now stored in your Firefox-Sync area.');
    } else {
      await migrateSettings(browser.storage.sync, browser.storage.local);
      await browser.storage.local.set({ syncEnabled: false });
      setBackupStatus('Sync disabled — settings now stored locally on this device.');
    }
  } catch (e) {
    syncCheckbox.checked = !enabling;
    setBackupStatus(`Couldn't ${enabling ? 'enable' : 'disable'} sync: ${e.message || e}`, true);
  } finally {
    syncCheckbox.disabled = false;
  }
}

document.getElementById('export-settings').addEventListener('click', exportSettings);
document.getElementById('import-settings').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) importSettings(file);
  e.target.value = '';  // allow re-importing the same file
});
syncCheckbox.addEventListener('change', onSyncToggle);

loadSyncToggle();
