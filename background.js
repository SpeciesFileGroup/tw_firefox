// Omnibox input shapes:
//   Internal bang:  !s title:"A new species" year_start:2020 author_id:1,2 @sandbox
//   External bang:  !col Aedes aegypti
// The bang may appear at the start or end of the input, prefixed (!s) or suffixed (s!).
// Instance token @<name> may appear anywhere and picks which configured host to use
// (ignored for external bangs).

// User overrides merge over BANGS. Values of `null` disable a built-in alias.
let ACTIVE_BANGS = { ...BANGS };
async function refreshBangs() {
  const { bangOverrides } = await browser.storage.local.get('bangOverrides');
  const merged = { ...BANGS };
  for (const [k, v] of Object.entries(bangOverrides || {})) {
    // Skip prototype-pollution-adjacent keys defensively. The options UI's
    // alias regex already blocks these, but storage.local is writable from
    // devtools, so belt-and-suspenders.
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v === null) delete merged[k];
    else if (v && (v.path || v.fullPath || v.rawPath || v.url)) merged[k] = v;
  }
  ACTIVE_BANGS = merged;
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.bangOverrides) refreshBangs();
});
refreshBangs();

function tokenize(input) {
  // A token is a run of non-whitespace/non-quote chars interleaved with
  // "quoted segments", so `title:"A new species"` stays as one token.
  const tokens = [];
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  let m;
  while ((m = re.exec(input)) !== null) tokens.push(m[0]);
  return tokens;
}

function stripQuotes(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// Sigil-aware bang matching:
//   !key / key!  → internal TaxonWorks targets (path / fullPath / rawPath)
//   ~key / key~  → external service targets (url template)
// The split prevents confusion when an alias has both an internal and an
// external meaning (rare, but the namespace is shared) and signals intent.
function matchBang(token) {
  let key = null;
  let kind = null;
  if      (token.startsWith('!')) { key = token.slice(1);    kind = 'internal'; }
  else if (token.endsWith('!'))   { key = token.slice(0, -1); kind = 'internal'; }
  else if (token.startsWith('~')) { key = token.slice(1);    kind = 'external'; }
  else if (token.endsWith('~'))   { key = token.slice(0, -1); kind = 'external'; }
  if (!key) return null;

  const target = ACTIVE_BANGS[key.toLowerCase()];
  if (!target) return null;
  if (kind === 'internal' && target.url) return null;  // ! used on external alias
  if (kind === 'external' && !target.url) return null; // ~ used on internal alias
  return target;
}

function matchInstance(token) {
  const m = /^@([\w-]+)$/.exec(token);
  return m ? m[1] : null;
}

// Parses a single chain stage: extracts the bang and the leftover tokens
// (params and bare terms). Host and disposition are pulled out earlier at
// the chain level — they're not per-stage.
function parseStage(tokens) {
  let target = null;
  let bangToken = null;
  const rest = [];
  for (const tok of tokens) {
    const bang = matchBang(tok);
    if (bang && !target) { target = bang; bangToken = tok; continue; }
    rest.push(tok);
  }
  return { target, bangToken, rest };
}

// Trailing-marker family. The marker (if present) must be the last
// whitespace-separated token. Each entry is the list of (destination,
// disposition) tab actions to take. A list of length 2 means "open both
// tabs"; the first entry gets focus.
//   \   → frontend, new foreground tab
//   \\  → frontend, new background tab
//   |   → API, new foreground tab
//   ||  → API, new background tab
//   \|  → frontend (FG) + API (BG)
//   |\  → API (FG) + frontend (BG)
const TAB_MARKERS = {
  '\\':   [{ destination: 'frontend', disposition: 'newForegroundTab' }],
  '\\\\': [{ destination: 'frontend', disposition: 'newBackgroundTab' }],
  '|':    [{ destination: 'api',      disposition: 'newForegroundTab' }],
  '||':   [{ destination: 'api',      disposition: 'newBackgroundTab' }],
  '\\|':  [
    { destination: 'frontend', disposition: 'newForegroundTab' },
    { destination: 'api',      disposition: 'newBackgroundTab' }
  ],
  '|\\':  [
    { destination: 'api',      disposition: 'newForegroundTab' },
    { destination: 'frontend', disposition: 'newBackgroundTab' }
  ]
};

// Splits the omnibox input into chain stages. The "throw" operator is `>`
// (Unix-style output redirection — read left-to-right as "send result of A
// to B"). Host (@name) and trailing tab markers are stripped at the
// whole-query level.
//
// Returns: { stages: [{target,bangToken,rest},...], hostName, actions,
//            destBangToken }  where `actions` is null (use defaults) or a
// list of (destination, disposition) pairs from TAB_MARKERS.
function parse(input) {
  const tokens = tokenize(input.trim());
  let actions = null;

  const last = tokens[tokens.length - 1];
  if (TAB_MARKERS[last]) { actions = TAB_MARKERS[last]; tokens.pop(); }

  // Pull out @host (first occurrence wins) before splitting so it can sit
  // anywhere in the chain.
  let hostName = null;
  const tokensSansHost = [];
  for (const tok of tokens) {
    const inst = matchInstance(tok);
    if (inst && !hostName) { hostName = inst; continue; }
    tokensSansHost.push(tok);
  }

  // Split on standalone `>` tokens.
  const stageTokens = [[]];
  for (const tok of tokensSansHost) {
    if (tok === '>') stageTokens.push([]);
    else stageTokens[stageTokens.length - 1].push(tok);
  }

  const stages = stageTokens.map(parseStage).filter(s => s.target);
  const destBangToken = stages.length ? stages[stages.length - 1].bangToken : null;
  return { stages, hostName, actions, destBangToken };
}

function queryKeyFor(target) {
  if (target.queryKey) return target.queryKey;
  if (target.path && INTERNAL_QUERY_KEYS[target.path]) return INTERNAL_QUERY_KEYS[target.path];
  return null;
}

// Converts leftover tokens into URL params for an internal (TW filter) target.
//   key:value         → key=value     (or key[]=value if TW declares it array)
//   key:a,b,c         → key[]=a & key[]=b & key[]=c       (comma → array)
//   key[]:value       → key[]=value                       (explicit array, single value)
//   key[]:a,b,c       → key[]=a & key[]=b & key[]=c       (explicit array + comma; no double bracketing)
//   bare term         → joined into query_term=<...>
//
// `target` is optional; when provided and its `path` is in
// INTERNAL_ARRAY_PARAMS, params declared as arrays by TW are auto-bracketed
// so the user doesn't have to remember `[]` for params like bibtex_type.
function paramsFor(rest, target) {
  const params = [];
  const bareTerms = [];
  const arraySet = (target && target.path && INTERNAL_ARRAY_PARAMS[target.path]) || null;

  for (const tok of rest) {
    const colon = tok.indexOf(':');
    if (colon > 0 && !tok.startsWith('"')) {
      const rawKey = tok.slice(0, colon);
      const rawTail = tok.slice(colon + 1);
      const rawValue = stripQuotes(rawTail);
      const explicitArray = rawKey.endsWith('[]');
      const baseKey = explicitArray ? rawKey.slice(0, -2) : rawKey;
      const isCommaArray = !rawTail.startsWith('"') && rawValue.includes(',');
      const knownArray = arraySet && arraySet.has(baseKey);

      if (explicitArray || isCommaArray || knownArray) {
        const values = isCommaArray ? rawValue.split(',') : [rawValue];
        for (const v of values) {
          if (v.length) params.push([`${baseKey}[]`, v]);
        }
      } else {
        params.push([baseKey, rawValue]);
      }
    } else {
      bareTerms.push(stripQuotes(tok));
    }
  }
  if (bareTerms.length) params.push(['query_term', bareTerms.join(' ')]);
  return params;
}

function buildInternalUrl(hostUrl, target, params) {
  // Match the TW radial UI's URL format: keep `[]` literal rather than
  // URL-encoded. Rails decodes either form, but literal brackets make
  // programmatic URLs eyeball-comparable to what the UI produces.
  const qs = params.map(([k, v]) => encodeParamPair('', k, v)).join('&');
  const base = hostUrl.replace(/\/+$/, '');

  // rawPath: absolute path used verbatim (e.g. "/hub" or "/hub?list=favorite").
  // fullPath: used verbatim under /tasks/ (non-filter tasks like browse/new).
  // path:    filter resource; /filter is auto-appended.
  if (target.rawPath) {
    let path = target.rawPath;
    let appendable = params;

    if (path.includes('{}')) {
      // Prefer bare terms (joined into `query_term`); fall back to `id:` so
      // both `!sel 50` and `!sel id:50` work. The consumed param is removed
      // from the append list so it doesn't also end up in the query string.
      let consumedIdx = params.findIndex(([k]) => k === 'query_term');
      if (consumedIdx < 0) consumedIdx = params.findIndex(([k]) => k === 'id');
      const value = consumedIdx >= 0 ? params[consumedIdx][1] : '';
      if (consumedIdx >= 0) appendable = params.filter((_, i) => i !== consumedIdx);
      path = path.replace('{}', encodeURIComponent(value));
    }

    const appendQs = appendable.map(([k, v]) => encodeParamPair('', k, v)).join('&');
    if (!appendQs) return `${base}${path}`;
    const sep = path.includes('?') ? '&' : '?';
    return `${base}${path}${sep}${appendQs}`;
  }
  const subPath = target.fullPath || `${target.path}/filter`;
  const fullUrlPath = `/tasks/${subPath}`;
  return qs ? `${base}${fullUrlPath}?${qs}` : `${base}${fullUrlPath}`;
}

function buildExternalUrl(target, rest) {
  // Bare tokens form the query string substituted for `{}` in the template.
  // `key:value` tokens are appended as extra URL params, so things like
  // `!col dataset_id:1141 Trifolium` work against services that take filters.
  const bareTerms = [];
  const extraParams = [];
  for (const tok of rest) {
    const colon = tok.indexOf(':');
    if (colon > 0 && !tok.startsWith('"')) {
      extraParams.push([tok.slice(0, colon), stripQuotes(tok.slice(colon + 1))]);
    } else {
      bareTerms.push(stripQuotes(tok));
    }
  }
  const query = bareTerms.join(' ').trim();
  let url = target.url.replace('{}', encodeURIComponent(query));
  if (extraParams.length) {
    const extras = extraParams
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    url += (url.includes('?') ? '&' : '?') + extras;
  }
  return url;
}

// Returns the origin of the active tab if available (requires activeTab
// permission to have been granted — which happens when the user submits an
// omnibox query). Returns null if we can't see it.
async function getActiveTabOrigin() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tabs && tabs[0] && tabs[0].url;
    if (!url) return null;
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

// Encodes a single [key, value] pair under an optional namespace prefix.
// Handles the `key[]` array suffix produced by paramsFor for comma-values.
function encodeParamPair(prefix, key, value) {
  let baseKey = key, arrSuffix = '';
  if (key.endsWith('[]')) { baseKey = key.slice(0, -2); arrSuffix = '[]'; }
  const fullKey = (prefix ? `${prefix}[${baseKey}]` : baseKey) + arrSuffix;
  return `${fullKey}=${encodeURIComponent(value)}`;
}

// Builds the chain prefix for the stage at `stageIdx` of `stages` (0-based;
// the destination is the last stage). Walks from the stage immediately
// before destination down to this stage, concatenating queryKeys with
// bracket nesting in the Rack/Rails parse_nested_query format.
//   3-stage chain S1 > S2 > S3 (dest):
//     prefix(S3) = ''
//     prefix(S2) = 'S2.queryKey'
//     prefix(S1) = 'S2.queryKey[S1.queryKey]'
function chainPrefixForStage(stages, stageIdx) {
  const lastIdx = stages.length - 1;
  if (stageIdx === lastIdx) return '';
  let prefix = queryKeyFor(stages[lastIdx - 1].target);
  for (let j = lastIdx - 2; j >= stageIdx; j--) {
    prefix += `[${queryKeyFor(stages[j].target)}]`;
  }
  return prefix;
}

function buildChainQueryString(stages) {
  const parts = [];
  for (let i = 0; i < stages.length; i++) {
    const prefix = chainPrefixForStage(stages, i);
    const params = paramsFor(stages[i].rest, stages[i].target);
    for (const [k, v] of params) parts.push(encodeParamPair(prefix, k, v));
  }
  return parts.join('&');
}

// Build the URL for a single (stages, destination) pair. `destination` is
// either 'frontend' (default) or 'api'. Returns a string URL, or null if
// the destination doesn't apply (e.g. API requested for a non-filter
// target).
function buildForDestination(hostUrl, stages, destination) {
  const dest = stages[stages.length - 1].target;

  // External bangs are frontend-only by nature — there is no API equivalent.
  if (dest.url) {
    if (destination === 'api') return null;
    return buildExternalUrl(dest, stages[0].rest);
  }

  const base = hostUrl.replace(/\/+$/, '');

  if (destination === 'api') {
    // API path only meaningful for `path`-shaped filter targets.
    if (!dest.path) return null;
    const apiBase = `${base}/api/v1/${dest.path}`;
    if (stages.length === 1) {
      const qs = paramsFor(stages[0].rest, dest)
        .map(([k, v]) => encodeParamPair('', k, v)).join('&');
      return qs ? `${apiBase}?${qs}` : apiBase;
    }
    const qs = buildChainQueryString(stages);
    return qs ? `${apiBase}?${qs}` : apiBase;
  }

  // Frontend (default). Same as the previous resolveAndBuild behavior.
  if (stages.length === 1) {
    const params = paramsFor(stages[0].rest, dest);
    return buildInternalUrl(hostUrl, dest, params);
  }
  const subPath = dest.fullPath || `${dest.path}/filter`;
  const path = dest.rawPath ? dest.rawPath : `/tasks/${subPath}`;
  const qs = buildChainQueryString(stages);
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

async function resolveAndBuild(input) {
  const { stages, hostName, actions, destBangToken } = parse(input);
  if (!stages.length) {
    return { actions: [], target: null, host: null, note: null, source: null, error: null };
  }

  const dest = stages[stages.length - 1].target;

  // Chain validation (unchanged).
  if (stages.length > 1) {
    if (dest.url) {
      return { actions: [], target: dest, host: null, note: null, source: null,
               error: 'External services can\'t receive a chain' };
    }
    for (let i = 0; i < stages.length - 1; i++) {
      if (!queryKeyFor(stages[i].target)) {
        return { actions: [], target: dest, host: null, note: null, source: null,
                 error: `Bang "${stages[i].bangToken}" can't be a chain source` };
      }
    }
  }

  // Resolve host (only used for non-external destinations).
  let host = null, note = null, source = null;
  if (!dest.url) {
    const hosts = await loadHosts();
    const origin = await getActiveTabOrigin();
    const autoDetected = matchHostByOrigin(hosts, origin);
    ({ host, note, source } = resolveHost(hosts, hostName, autoDetected));
  }

  // Default actions: frontend at unspecified disposition (filled in by the
  // entered handler from key gesture / configured default / current tab).
  const requested = actions || [{ destination: 'frontend', disposition: null }];

  const built = [];
  for (const req of requested) {
    const url = buildForDestination(host ? host.url : '', stages, req.destination);
    if (url) built.push({ url, destination: req.destination, disposition: req.disposition });
  }
  return { actions: built, target: dest, host, note, source, error: null };
}

browser.omnibox.setDefaultSuggestion({
  description: 'TaxonWorks: !t name:Apis (TW filter), !co year:2020 @sandbox, ~col Aedes aegypti (external service)'
});

browser.omnibox.onInputChanged.addListener(async (input, suggest) => {
  const { stages, hostName, actions, destBangToken } = parse(input);
  const suggestions = [];

  // Compact tag describing the trailing-marker actions, if any.
  function dispTagFor(acts) {
    if (!acts) return '';
    const parts = acts.map(a => {
      const dest = a.destination === 'api' ? 'API' : 'frontend';
      const d = a.disposition === 'newForegroundTab' ? '↗ new tab'
              : a.disposition === 'newBackgroundTab' ? '↘ new bg tab'
              : '';
      return `${d} ${dest}`.trim();
    });
    return '  ' + parts.join(' + ');
  }
  const dispTag = dispTagFor(actions);

  // Friendly nudge: if the user typed `<` between bangs (probably meant `>`),
  // offer the corrected version as a separate dropdown row. No auto-correct.
  const rawTokens = tokenize(input.trim());
  if (rawTokens.includes('<') && rawTokens.some(matchBang)) {
    const corrected = input.replace(/(^|\s)<(\s|$)/g, '$1>$2');
    if (corrected !== input) {
      suggestions.push({
        content: corrected,
        description: `↪ Use > for chaining (output redirection, reads left-to-right). Did you mean: ${corrected}`
      });
    }
  }

  if (stages.length === 1) {
    const { target, bangToken, rest } = stages[0];
    if (target.url) {
      const bare = [];
      const extras = [];
      for (const tok of rest) {
        const colon = tok.indexOf(':');
        if (colon > 0 && !tok.startsWith('"')) extras.push(`${tok.slice(0, colon)}=${stripQuotes(tok.slice(colon + 1))}`);
        else bare.push(stripQuotes(tok));
      }
      const q = bare.join(' ').trim();
      const tail = [q && `"${q}"`, extras.join(' ')].filter(Boolean).join('  ');
      suggestions.push({
        content: input,
        description: `${target.label}${tail ? '  —  ' + tail : ''}${dispTag}`
      });
    } else {
      const hosts = await loadHosts();
      const origin = await getActiveTabOrigin();
      const autoDetected = matchHostByOrigin(hosts, origin);
      const { host, note, source } = resolveHost(hosts, hostName, autoDetected);
      const params = paramsFor(rest, target);
      const paramSummary = params.length
        ? '  ' + params.map(([k, v]) => `${k}=${v}`).join(' ')
        : '';
      const sourceTag = source === 'auto' ? ' (auto)' : '';
      suggestions.push({
        content: input,
        description: `${target.label} on @${host.name}${sourceTag}${paramSummary}${dispTag}${note ? '  ⚠ ' + note : ''}`
      });
    }

    // When the user has typed just the bang with no further input, offer the
    // service's canned examples as additional dropdown rows.
    if (rest.length === 0 && !hostName && Array.isArray(target.examples)) {
      for (const ex of target.examples.slice(0, 5)) {
        suggestions.push({
          content: `${bangToken} ${ex.query}`,
          description: `${ex.query}${ex.hint ? '   —  ' + ex.hint : ''}`
        });
      }
    }
  } else if (stages.length > 1) {
    // Chain preview: show "Dest ← Stage2 ← Stage1" plus an error if the
    // chain is invalid (external destination, unsupported source).
    const dest = stages[stages.length - 1].target;
    let error = null;
    if (dest.url) error = 'external destinations can\'t receive a chain';
    else for (let i = 0; i < stages.length - 1; i++) {
      if (!queryKeyFor(stages[i].target)) { error = `${stages[i].bangToken} can't be a chain source`; break; }
    }
    const upstreamLabels = stages.slice(0, -1).reverse().map(s => s.target.label).join(' ← ');
    const chainTail = `  ←  ${upstreamLabels}`;
    suggestions.push({
      content: input,
      description: error
        ? `⚠ ${error}`
        : `${dest.label}${chainTail}${dispTag}`
    });
  } else {
    // Offer top bang hints based on what's typed.
    const seen = new Set();
    const lower = input.trim().toLowerCase();
    for (const [key, info] of Object.entries(ACTIVE_BANGS)) {
      const dedupKey = info.path
        ? `p:${info.path}`
        : info.fullPath ? `f:${info.fullPath}`
        : info.rawPath ? `r:${info.rawPath}`
        : `u:${info.url}`;
      if (seen.has(dedupKey)) continue;
      if (!lower || key.startsWith(lower) || info.label.toLowerCase().includes(lower)) {
        const sigil = info.url ? '~' : '!';
        suggestions.push({
          content: `${sigil}${key}`,
          description: `${sigil}${key}  →  ${info.label}`
        });
        seen.add(dedupKey);
      }
      if (suggestions.length >= 6) break;
    }
  }
  suggest(suggestions);
});

browser.omnibox.onInputEntered.addListener(async (input, keyDisposition) => {
  const { actions } = await resolveAndBuild(input);
  if (!actions.length) return;

  // For each action, resolve its disposition. Explicit per-action
  // disposition (set by trailing markers) wins. For default-actions where
  // disposition is null, fall back to: modifier-key gesture > configured
  // default > current tab.
  const { defaultDisposition } = await browser.storage.local.get('defaultDisposition');
  const fallback = (keyDisposition && keyDisposition !== 'currentTab')
    ? keyDisposition
    : (defaultDisposition || 'currentTab');

  for (const { url, disposition: explicit } of actions) {
    const disposition = explicit || fallback;
    switch (disposition) {
      case 'newForegroundTab': await browser.tabs.create({ url }); break;
      case 'newBackgroundTab': await browser.tabs.create({ url, active: false }); break;
      case 'currentTab':
      default:                 await browser.tabs.update({ url }); break;
    }
  }
});
