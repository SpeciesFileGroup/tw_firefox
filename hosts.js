// Seeded on first run (or when the user clicks "Reset to defaults") in the options page.
// `name` doubles as the @-token used in queries (e.g. "@workshop").
// Exactly one entry should have isDefault: true.
const DEFAULT_HOSTS = [
  { name: 'dev',         url: 'http://localhost:3000',              isDefault: false },
  { name: 'sfg',         url: 'https://sfg.taxonworks.org',         isDefault: true  },
  { name: 'sandblaster', url: 'https://sandblaster.taxonworks.org', isDefault: false },
  { name: 'sandbox',     url: 'https://sandbox.taxonworks.org',     isDefault: false },
  { name: 'sandcastle',  url: 'https://sandcastle.taxonworks.org',  isDefault: false },
  { name: 'sanddollar',  url: 'https://sanddollar.taxonworks.org',  isDefault: false },
  { name: 'sandfly',     url: 'https://sandfly.taxonworks.org',     isDefault: false },
  { name: 'sandpaper',   url: 'https://sandpaper.taxonworks.org',   isDefault: false },
  { name: 'sandstorm',   url: 'https://sandstorm.taxonworks.org',   isDefault: false },
  { name: 'sandworm',    url: 'https://sandworm.taxonworks.org',    isDefault: false },
  { name: 'workshop',    url: 'https://workshop.taxonworks.org',    isDefault: false }
];

async function loadHosts() {
  const { hosts } = await browser.storage.local.get('hosts');
  return (Array.isArray(hosts) && hosts.length) ? hosts : DEFAULT_HOSTS.map(h => ({ ...h }));
}

// Returns the configured host whose origin matches the given `origin` string
// (e.g. "https://sandblaster.taxonworks.org"), or null. Used for auto-detect
// when the user is already in a TaxonWorks tab.
function matchHostByOrigin(hosts, origin) {
  if (!origin) return null;
  for (const h of hosts) {
    try {
      const hu = new URL(h.url);
      if (`${hu.protocol}//${hu.host}` === origin) return h;
    } catch { /* skip malformed entries */ }
  }
  return null;
}

// Precedence:
//   1. Explicit @name in the query wins.
//   2. Else, if the active tab is on a configured host, use that.
//   3. Else, the user-configured default.
function resolveHost(hosts, requestedName, autoDetectedHost) {
  if (requestedName) {
    const match = hosts.find(h => h.name.toLowerCase() === requestedName.toLowerCase());
    if (match) return { host: match, note: null, source: 'explicit' };
    const fallback = hosts.find(h => h.isDefault) || hosts[0];
    return { host: fallback, note: `Unknown instance "@${requestedName}" — falling back to @${fallback.name}.`, source: 'fallback' };
  }
  if (autoDetectedHost) {
    return { host: autoDetectedHost, note: null, source: 'auto' };
  }
  const def = hosts.find(h => h.isDefault) || hosts[0];
  return { host: def, note: null, source: 'default' };
}
