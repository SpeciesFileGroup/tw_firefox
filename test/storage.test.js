const test = require('node:test');
const assert = require('node:assert');
const { loadExtension } = require('./helpers.js');

// Settings live in storage.local by default; opt-in moves them to
// storage.sync. These tests exercise the helpers directly via the
// sandbox's browser stub.

test('activeStorage() returns local when syncEnabled is unset', async () => {
  const ext = loadExtension({ storage: { hosts: ['from-local'] } });
  const area = await ext.activeStorage();
  // The stub exposes both areas; identity check via a get round-trip.
  const r = await area.get('hosts');
  assert.deepEqual(r.hosts, ['from-local']);
});

test('activeStorage() returns sync when syncEnabled is true', async () => {
  const ext = loadExtension({
    storage:     { syncEnabled: true, hosts: ['stale-local'] },
    syncStorage: { hosts: ['fresh-sync'] }
  });
  const area = await ext.activeStorage();
  const r = await area.get('hosts');
  assert.deepEqual(r.hosts, ['fresh-sync']);
});

test('migrateSettings copies SYNCED_KEYS and clears the source', async () => {
  const ext = loadExtension({
    storage: {
      syncEnabled: false,
      bangOverrides: { foo: { url: 'x', label: 'F' } },
      hosts: [{ name: 'sfg', url: 'https://sfg', isDefault: true }],
      defaultDisposition: 'newForegroundTab',
      // not a synced key — should NOT migrate
      otherStuff: 'stays'
    }
  });
  await ext.migrateSettings(ext.browser.storage.local, ext.browser.storage.sync);
  const { browser } = ext;

  const after = await browser.storage.local.get(null);
  // syncEnabled and otherStuff stay; SYNCED_KEYS removed
  assert.deepEqual(Object.keys(after).sort(), ['otherStuff', 'syncEnabled']);

  const sync = await browser.storage.sync.get(null);
  assert.ok(sync.bangOverrides, 'bangOverrides moved');
  assert.ok(Array.isArray(sync.hosts), 'hosts moved');
  assert.equal(sync.defaultDisposition, 'newForegroundTab');
});

test('SYNCED_KEYS / SETTINGS_EXPORT_SCHEMA are exposed for the options-page export flow', async () => {
  const ext = loadExtension();
  assert.ok(Array.isArray(ext.SYNCED_KEYS) && ext.SYNCED_KEYS.length > 0);
  assert.ok(typeof ext.SETTINGS_EXPORT_SCHEMA === 'string' && ext.SETTINGS_EXPORT_SCHEMA.length > 0);
});

test('refreshBangs reads through activeStorage (sync wins when enabled)', async () => {
  // Preseed sync with a bangOverride that adds a new alias `xyz`.
  const ext = loadExtension({
    storage: { syncEnabled: true },
    syncStorage: { bangOverrides: { xyz: { url: 'https://example.com/?q={}', label: 'XYZ' } } }
  });
  await ext.refreshBangs();
  // The custom alias resolves through the synced override.
  const r = await ext.resolveAndBuild('~xyz hello');
  assert.equal(r.actions.length, 1);
  assert.match(r.actions[0].url, /example\.com.*hello/);
});
