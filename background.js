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

function matchBang(token) {
  let key = null;
  if (token.startsWith('!')) key = token.slice(1);
  else if (token.endsWith('!')) key = token.slice(0, -1);
  if (!key) return null;
  return ACTIVE_BANGS[key.toLowerCase()] || null;
}

function matchInstance(token) {
  const m = /^@([\w-]+)$/.exec(token);
  return m ? m[1] : null;
}

// Peels off the bang and any @host tokens; returns the remaining raw tokens.
// `bangToken` is the literal token the user typed (e.g. "!col" or "col!"), so
// we can reconstruct working content for example suggestions.
function parse(input) {
  const tokens = tokenize(input.trim());
  let target = null;
  let bangToken = null;
  let hostName = null;
  const rest = [];

  for (const tok of tokens) {
    const bang = matchBang(tok);
    if (bang && !target) { target = bang; bangToken = tok; continue; }

    const inst = matchInstance(tok);
    if (inst && !hostName) { hostName = inst; continue; }

    rest.push(tok);
  }
  return { target, bangToken, hostName, rest };
}

// Converts leftover tokens into URL params for an internal (TW filter) target.
function paramsFor(rest) {
  const params = [];
  const bareTerms = [];
  for (const tok of rest) {
    const colon = tok.indexOf(':');
    if (colon > 0 && !tok.startsWith('"')) {
      const key = tok.slice(0, colon);
      const rawTail = tok.slice(colon + 1);
      const rawValue = stripQuotes(rawTail);
      if (!rawTail.startsWith('"') && rawValue.includes(',')) {
        for (const v of rawValue.split(',')) {
          if (v.length) params.push([`${key}[]`, v]);
        }
      } else {
        params.push([key, rawValue]);
      }
    } else {
      bareTerms.push(stripQuotes(tok));
    }
  }
  if (bareTerms.length) params.push(['query_term', bareTerms.join(' ')]);
  return params;
}

function buildInternalUrl(hostUrl, target, params) {
  const qs = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const base = hostUrl.replace(/\/+$/, '');

  // rawPath: absolute path used verbatim (e.g. "/hub" or "/hub?list=favorite").
  // fullPath: used verbatim under /tasks/ (non-filter tasks like browse/new).
  // path:    filter resource; /filter is auto-appended.
  if (target.rawPath) {
    if (!qs) return `${base}${target.rawPath}`;
    const sep = target.rawPath.includes('?') ? '&' : '?';
    return `${base}${target.rawPath}${sep}${qs}`;
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

async function resolveAndBuild(input) {
  const { target, hostName, rest } = parse(input);
  if (!target) return { url: null, target: null, host: null, note: null, source: null };

  if (target.url) {
    return { url: buildExternalUrl(target, rest), target, host: null, note: null, source: null };
  }

  const hosts = await loadHosts();
  const origin = await getActiveTabOrigin();
  const autoDetected = matchHostByOrigin(hosts, origin);
  const { host, note, source } = resolveHost(hosts, hostName, autoDetected);
  const params = paramsFor(rest);
  return { url: buildInternalUrl(host.url, target, params), target, host, note, source };
}

browser.omnibox.setDefaultSuggestion({
  description: 'TaxonWorks filter — e.g. !t name:Apis, !co year:2020 @sandbox, or !col Aedes aegypti'
});

browser.omnibox.onInputChanged.addListener(async (input, suggest) => {
  const { target, bangToken, hostName, rest } = parse(input);
  const suggestions = [];

  if (target) {
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
        description: `${target.label}${tail ? '  —  ' + tail : ''}`
      });
    } else {
      const hosts = await loadHosts();
      const origin = await getActiveTabOrigin();
      const autoDetected = matchHostByOrigin(hosts, origin);
      const { host, note, source } = resolveHost(hosts, hostName, autoDetected);
      const params = paramsFor(rest);
      const paramSummary = params.length
        ? '  ' + params.map(([k, v]) => `${k}=${v}`).join(' ')
        : '';
      const sourceTag = source === 'auto' ? ' (auto)' : '';
      suggestions.push({
        content: input,
        description: `${target.label} on @${host.name}${sourceTag}${paramSummary}${note ? '  ⚠ ' + note : ''}`
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
  } else {
    // Offer top bang hints based on what's typed.
    const seen = new Set();
    const lower = input.trim().toLowerCase();
    for (const [key, info] of Object.entries(ACTIVE_BANGS)) {
      const dedupKey = info.path ? `p:${info.path}` : `u:${info.url}`;
      if (seen.has(dedupKey)) continue;
      if (!lower || key.startsWith(lower) || info.label.toLowerCase().includes(lower)) {
        suggestions.push({
          content: `!${key}`,
          description: `!${key}  →  ${info.label}`
        });
        seen.add(dedupKey);
      }
      if (suggestions.length >= 6) break;
    }
  }
  suggest(suggestions);
});

browser.omnibox.onInputEntered.addListener(async (input, disposition) => {
  const { url } = await resolveAndBuild(input);
  if (!url) return;

  switch (disposition) {
    case 'newForegroundTab': await browser.tabs.create({ url }); break;
    case 'newBackgroundTab': await browser.tabs.create({ url, active: false }); break;
    case 'currentTab':
    default:                 await browser.tabs.update({ url }); break;
  }
});
