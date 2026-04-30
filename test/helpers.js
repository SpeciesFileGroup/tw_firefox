// Loads the extension's source files into a `vm` sandbox with a stubbed
// `browser.*` API, then exposes the internal functions and data to tests
// via the context's `__testExports` object.
//
// No network. No real tabs. No real storage. Storage and active-tab URL
// can be preseeded via options to `loadExtension({...})`.

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// storage.js must load first — bangs/hosts/background all call into it.
const SOURCE_FILES = ['storage.js', 'bangs.js', 'hosts.js', 'background.js'];

// The symbols we want the tests to reach. Function declarations at top-level
// of a vm script become globals on the context automatically; top-level
// `const` / `let` do NOT, so we explicitly capture everything in a post-load
// script that assigns to `globalThis.__testExports`.
const EXPORTS = [
  // bangs.js data
  'BANGS', 'BANG_TARGETS', 'INTERNAL_QUERY_KEYS', 'INTERNAL_ARRAY_PARAMS',
  'INTERNAL_BARE_TERM_KEYS',
  // hosts.js data + helpers
  'DEFAULT_HOSTS', 'loadHosts', 'matchHostByOrigin', 'resolveHost',
  // background.js parser + URL builders
  'tokenize', 'stripQuotes', 'matchBang', 'matchInstance',
  'parseStage', 'parse', 'queryKeyFor', 'paramsFor',
  'buildInternalUrl', 'buildExternalUrl',
  'encodeParamPair', 'chainPrefixForStage', 'buildChainQueryString',
  'getActiveTabOrigin', 'resolveAndBuild', 'refreshBangs',
  'cheatsheetUrl', 'CHEATSHEET_SENTINEL', 'OPTIONS_SENTINEL',
  // storage.js helpers
  'activeStorage', 'isSyncEnabled', 'migrateSettings',
  'SYNCED_KEYS', 'SETTINGS_EXPORT_SCHEMA',
  // background.js runtime state (useful for direct inspection)
  // ACTIVE_BANGS is a `let` — expose via a getter closure captured inside
  'ACTIVE_BANGS'
];

function createBrowserStub({ storage = {}, syncStorage = {}, activeTabUrl = null } = {}) {
  const localStore = { ...storage };
  const syncStore  = { ...syncStorage };

  function makeArea(store) {
    return {
      get: async (keys) => {
        if (keys === null || keys === undefined) return { ...store };
        if (typeof keys === 'string') {
          return store[keys] !== undefined ? { [keys]: store[keys] } : {};
        }
        if (Array.isArray(keys)) {
          const out = {};
          for (const k of keys) if (store[k] !== undefined) out[k] = store[k];
          return out;
        }
        const out = {};
        for (const k of Object.keys(keys)) {
          out[k] = store[k] !== undefined ? store[k] : keys[k];
        }
        return out;
      },
      set: async (obj) => { Object.assign(store, obj); },
      remove: async (k) => {
        if (Array.isArray(k)) k.forEach(key => delete store[key]);
        else delete store[k];
      }
    };
  }

  return {
    storage: {
      local: makeArea(localStore),
      sync:  makeArea(syncStore),
      onChanged: { addListener: () => {} }
    },
    tabs: {
      query: async () => activeTabUrl ? [{ url: activeTabUrl, active: true }] : [],
      create: async () => ({ id: 1 }),
      update: async () => ({ id: 1 })
    },
    omnibox: {
      setDefaultSuggestion: () => {},
      onInputChanged: { addListener: () => {} },
      onInputEntered: { addListener: () => {} }
    },
    runtime: {
      openOptionsPage: () => {}
    },
    // Tests can poke either store directly (e.g. to preseed sync data
    // before exercising activeStorage()-based reads).
    __store: localStore,
    __syncStore: syncStore
  };
}

function loadExtension(opts = {}) {
  const browser = createBrowserStub(opts);
  // Share the outer Realm's built-ins so:
  //   (a) `new URL(...)` works (not a default in vm contexts)
  //   (b) Arrays/objects built inside the vm pass deepStrictEqual against
  //       test-context literals (same prototype identity).
  const context = vm.createContext({
    browser, console,
    URL, URLSearchParams,
    Promise, Array, Object, Set, Map, Error, TypeError, RangeError,
    JSON, Date, RegExp, String, Number, Boolean, Symbol,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    setTimeout, clearTimeout, setInterval, clearInterval
  });
  for (const file of SOURCE_FILES) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    vm.runInContext(code, context, { filename: file });
  }
  // Capture consts + functions into the context-visible object.
  const capture = `globalThis.__testExports = { ${EXPORTS.join(', ')} };`;
  vm.runInContext(capture, context);
  return { ...context.__testExports, browser };
}

module.exports = { loadExtension, createBrowserStub };
