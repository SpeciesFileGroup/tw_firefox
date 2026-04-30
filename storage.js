// Settings storage helper.
//
// By default, settings (custom bangs, host list, default tab behavior)
// live in `browser.storage.local` so they don't require a Firefox
// account. When the user opts in to "Use Firefox Sync" in the options
// page, those same keys migrate to `browser.storage.sync` and propagate
// across the user's signed-in devices.
//
// The `syncEnabled` flag itself ALWAYS lives in `browser.storage.local`
// — it's a per-device choice. Someone might want sync on their work
// laptop but local-only on a shared kiosk.

// The keys the export/import + sync paths treat as "settings". If a new
// settings key is added to the extension, add it here too.
const SYNCED_KEYS = ['bangOverrides', 'hosts', 'defaultDisposition'];

// The schema marker on exported JSON files. Bump if the format changes
// in a non-back-compat way.
const SETTINGS_EXPORT_SCHEMA = 'tw-firefox-omnibox/1';

async function isSyncEnabled() {
  const { syncEnabled } = await browser.storage.local.get('syncEnabled');
  return !!syncEnabled;
}

// Returns whichever of `browser.storage.local` / `.sync` should hold the
// SYNCED_KEYS right now. All read/write of those keys goes through this.
async function activeStorage() {
  return (await isSyncEnabled()) ? browser.storage.sync : browser.storage.local;
}

// Move SYNCED_KEYS from one storage area to another. Used when the user
// toggles sync on (local → sync) or off (sync → local). Best-effort:
// reads everything, writes it to the destination, then clears the
// source. If anything fails mid-way the source still has the data.
async function migrateSettings(fromArea, toArea) {
  const data = await fromArea.get(SYNCED_KEYS);
  const writeable = {};
  for (const k of SYNCED_KEYS) if (data[k] !== undefined) writeable[k] = data[k];
  if (Object.keys(writeable).length) await toArea.set(writeable);
  await fromArea.remove(SYNCED_KEYS);
}
