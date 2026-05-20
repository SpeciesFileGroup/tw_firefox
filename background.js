// Omnibox input shapes:
//   Internal bang:  !s title:"A new species" year_start:2020 author_id:1,2 @sandbox
//   External bang:  ~col Trifolium repens
// The bang may appear at the start or end of the input, prefixed (!s) or suffixed (s!).
// Instance token @<name> may appear anywhere and picks which configured host to use
// (ignored for external bangs).

// User overrides merge over BANGS. Values of `null` disable a built-in alias.
let ACTIVE_BANGS = { ...BANGS };
async function refreshBangs() {
  const { bangOverrides } = await (await activeStorage()).get('bangOverrides');
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
// Listen for changes in either storage area — we honor whichever one is
// currently active. Fires both during normal user edits in the options
// page and when sync pulls in changes from another device.
browser.storage.onChanged.addListener(async (changes, area) => {
  if (!changes.bangOverrides) return;
  const expected = (await isSyncEnabled()) ? 'sync' : 'local';
  if (area === expected) refreshBangs();
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
//
// Exception: targets with `dualSigil: true` accept either sigil. Reserved
// for cases where an external URL functions as project-internal infra
// (e.g. the TaxonWorks issue tracker on GitHub) so users don't have to
// remember which sigil applies.
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
  if (target.dualSigil) return target;
  if (kind === 'internal' && target.url) return null;  // ! used on external alias
  if (kind === 'external' && !target.url) return null; // ~ used on internal alias
  return target;
}

function matchInstance(token) {
  const m = /^@([\w-]+)$/.exec(token);
  return m ? m[1] : null;
}

// True for tokens shaped like a bang — sigil at start or end, alphanumeric
// rest. Used to spot bang-shaped tokens that `matchBang` rejected (typo,
// wrong sigil, missing alias) so we can surface a useful error rather
// than silently dropping the offending token into the bare-query bucket.
function looksLikeBang(token) {
  return /^[!~][\w-]+$/.test(token) || /^[\w-]+[!~]$/.test(token);
}

// Parses a single chain stage: extracts the bang and the leftover tokens
// (params and bare terms). Host and disposition are pulled out earlier at
// the chain level — they're not per-stage.
//
// `unresolvedBangs` collects any bang-shaped tokens (e.g. `!nonsense`,
// `!gbif` when the alias is external-only) that couldn't be resolved.
// resolveAndBuild aggregates them across all stages and returns an error
// when any are present, so users see "Bang not found" instead of an
// unintended navigation.
function parseStage(tokens) {
  let target = null;
  let bangToken = null;
  const rest = [];
  const unresolvedBangs = [];
  for (const tok of tokens) {
    const bang = matchBang(tok);
    if (bang) {
      if (!target) { target = bang; bangToken = tok; continue; }
      // Stage already has a bang — extra ones become bare terms (existing
      // behavior). The user probably meant to use `>` or `;` between them,
      // but that's a separate failure mode and the rest of the chain will
      // still navigate somewhere reasonable.
    } else if (looksLikeBang(tok)) {
      unresolvedBangs.push(tok);
    }
    rest.push(tok);
  }
  return { target, bangToken, rest, unresolvedBangs };
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
//
// `/` is accepted as a forward-slash alias for `\` everywhere — easier to
// type on most layouts (no Shift), and people genuinely confuse the two
// when writing chains by hand. So `/`, `//`, `/|`, `|/` are equivalent to
// the backslash forms above.
const TAB_FRONTEND_FG = [{ destination: 'frontend', disposition: 'newForegroundTab' }];
const TAB_FRONTEND_BG = [{ destination: 'frontend', disposition: 'newBackgroundTab' }];
const TAB_API_FG      = [{ destination: 'api',      disposition: 'newForegroundTab' }];
const TAB_API_BG      = [{ destination: 'api',      disposition: 'newBackgroundTab' }];
const TAB_FE_FG_API_BG = [
  { destination: 'frontend', disposition: 'newForegroundTab' },
  { destination: 'api',      disposition: 'newBackgroundTab' }
];
const TAB_API_FG_FE_BG = [
  { destination: 'api',      disposition: 'newForegroundTab' },
  { destination: 'frontend', disposition: 'newBackgroundTab' }
];
const TAB_MARKERS = {
  '\\':   TAB_FRONTEND_FG,
  '/':    TAB_FRONTEND_FG,
  '\\\\': TAB_FRONTEND_BG,
  '//':   TAB_FRONTEND_BG,
  '|':    TAB_API_FG,
  '||':   TAB_API_BG,
  '\\|':  TAB_FE_FG_API_BG,
  '/|':   TAB_FE_FG_API_BG,
  '|\\':  TAB_API_FG_FE_BG,
  '|/':   TAB_API_FG_FE_BG
};

// Splits the omnibox input into navigation "groups". Two operators:
//   `>`  — within a group: chain composition (the upstream stage's params
//          become a sub-scope under the downstream filter's queryKey, so
//          the whole chain resolves to ONE URL). Host (@name) and trailing
//          tab markers are stripped at the whole-query level.
//   `;`  — between groups: independent sequential navigations. The runtime
//          opens the first group's URL, waits for the tab to finish loading,
//          then updates the same tab to the next group's URL. Used for
//          workflows like `!sel 13 ; !dtn 5` (select project, then deep-
//          link inside that project — TaxonWorks doesn't have native
//          project-scoped deep-links).
//
// Returns: { groups: [{ stages: [{target,bangToken,rest},...], destBangToken
//            }, ...], hostName, actions, stages, destBangToken }
// where `actions` is null (use defaults) or a list of (destination,
// disposition) pairs from TAB_MARKERS. The top-level `stages` and
// `destBangToken` mirror the FIRST group, for back-compat with callers
// that predate `;` (every input without a `;` has exactly one group).
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

  // Top-level: split on standalone `;` into independent navigation groups.
  const groupTokens = [[]];
  for (const tok of tokensSansHost) {
    if (tok === ';') groupTokens.push([]);
    else groupTokens[groupTokens.length - 1].push(tok);
  }

  // Forgiveness: strip a leading literal `tw` from each group. Lets users
  // paste shareable chains like `tw !sel 13 ; tw !tn 5` (where the second
  // `tw` mirrors how the first one starts the omnibox) without it being
  // treated as a bare query term.
  for (const g of groupTokens) {
    if (g.length && g[0].toLowerCase() === 'tw') g.shift();
  }

  // Within each group: split on standalone `>` for chain composition.
  // `<` is *not* aliased — its Unix semantics are right-to-left ("send
  // input from B to A"), the opposite of `>`. Rather than auto-correcting
  // (which would silently land users on the wrong destination), we surface
  // it via `hasInvalidArrow` below so resolveAndBuild can error out with
  // a clear "use `>`" message.
  // Track unresolved bang-shaped tokens at the top level so resolveAndBuild
  // can refuse to navigate when the user typed something like `!aoeu`.
  const unresolvedBangs = [];
  const groups = groupTokens.map(toks => {
    const stageTokens = [[]];
    for (const tok of toks) {
      if (tok === '>') stageTokens.push([]);
      else stageTokens[stageTokens.length - 1].push(tok);
    }
    const parsed = stageTokens.map(parseStage);
    for (const s of parsed) unresolvedBangs.push(...s.unresolvedBangs);
    const stages = parsed.filter(s => s.target);
    const destBangToken = stages.length ? stages[stages.length - 1].bangToken : null;
    return { stages, destBangToken };
  }).filter(g => g.stages.length);

  const first = groups[0] || { stages: [], destBangToken: null };
  // A standalone `<` token combined with any bang is almost certainly a
  // typo for `>`. Flag for resolveAndBuild to error on instead of silently
  // dropping `<` into the bare-query bucket.
  const hasInvalidArrow = tokensSansHost.includes('<') &&
                          tokensSansHost.some(t => matchBang(t));
  return {
    groups,
    stages: first.stages,
    destBangToken: first.destBangToken,
    hostName,
    actions,
    unresolvedBangs,
    hasInvalidArrow
  };
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
  if (bareTerms.length) {
    const bareKey = (target && target.path && INTERNAL_BARE_TERM_KEYS[target.path]) || 'query_term';
    const value = bareTerms.join(' ');
    if (arraySet && arraySet.has(bareKey)) {
      params.push([`${bareKey}[]`, value]);
    } else {
      params.push([bareKey, value]);
    }
  }
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
      // Prefer bare terms (joined into the per-filter bare-term key — see
      // INTERNAL_BARE_TERM_KEYS — but for raw paths nothing else is in play
      // so it's still labelled `query_term` here unless overridden); fall
      // back to `id:` so both `!sel 50` and `!sel id:50` work. The consumed
      // param is removed from the append list so it doesn't also end up in
      // the query string.
      let consumedIdx = params.findIndex(([k]) => k === 'query_term');
      if (consumedIdx < 0) consumedIdx = params.findIndex(([k]) => k === 'id');
      const value = consumedIdx >= 0 ? params[consumedIdx][1] : '';
      if (consumedIdx >= 0) appendable = params.filter((_, i) => i !== consumedIdx);
      // Empty bare/id substitution: prefer the target's `defaultArg` if set
      // (e.g. `!proj` → `/projects/list`), else strip the preceding `/` so
      // `/projects/{}` collapses to `/projects` rather than `/projects/`.
      const effective = value !== '' ? value : (target.defaultArg || '');
      if (effective === '') {
        path = path.replace(/\/?\{\}/, '');
      } else {
        path = path.replace('{}', encodeURIComponent(effective));
      }
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
  // `~col dataset_id:1141 Trifolium` work against services that take filters.
  //
  // Exception: targets with `keyValueInQuery: true` treat `key:value` as
  // part of the search-string syntax (e.g. GitHub: `is:closed`,
  // `author:foo`) rather than as a separate URL param. For those the whole
  // token is folded into the bare-query substitution instead of split out.
  const bareTerms = [];
  const extraParams = [];
  for (const tok of rest) {
    const colon = tok.indexOf(':');
    const isKeyValue = colon > 0 && !tok.startsWith('"');
    if (isKeyValue && !target.keyValueInQuery) {
      extraParams.push([tok.slice(0, colon), stripQuotes(tok.slice(colon + 1))]);
    } else {
      bareTerms.push(stripQuotes(tok));
    }
  }
  const query = bareTerms.join(' ').trim();
  // If the target opted in via `numericUrl`, route digit-only input to
  // the numeric direct-nav template instead of the search template:
  //   - bare digits  (`!issue 1234`)        → /issues/1234
  //   - `id:<digits>` (`~mdd id:1006285`)    → /taxon/1006285/
  // Consume the `id:` extra so it doesn't re-appear as `?id=…`.
  let template = target.url;
  let value = query;
  let extrasToAppend = extraParams;
  if (target.numericUrl) {
    if (/^\d+$/.test(query)) {
      template = target.numericUrl;
    } else {
      const idIdx = extraParams.findIndex(([k, v]) => k === 'id' && /^\d+$/.test(v));
      if (idIdx >= 0) {
        template = target.numericUrl;
        value = extraParams[idIdx][1];
        extrasToAppend = extraParams.filter((_, i) => i !== idIdx);
      }
    }
  }
  let url = template.replace('{}', encodeURIComponent(value));
  if (extrasToAppend.length) {
    const extras = extrasToAppend
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
  const { groups, hostName, actions, unresolvedBangs, hasInvalidArrow } = parse(input);

  if (hasInvalidArrow) {
    return { actions: [], target: null, host: null, note: null, source: null,
             error: '`<` isn\'t a chain operator — use `>` instead. Chains read left-to-right ("send the result of A to B"). Example: `!s with_doi:true > !tn`.' };
  }

  // Reject inputs that contain bang-shaped tokens we couldn't resolve.
  // Common causes: typo (`!aeorgihaoegf`), wrong sigil (`!gbif` for an
  // external-only target), or a custom bang the user forgot to add.
  // Surfacing as an error → cheatsheet redirect beats the old behaviour
  // where the offending token silently became a bare query term.
  if (unresolvedBangs && unresolvedBangs.length) {
    const list = unresolvedBangs.map(t => '`' + t + '`').join(', ');
    const noun = unresolvedBangs.length > 1 ? 'Bangs' : 'Bang';
    return { actions: [], target: null, host: null, note: null, source: null,
             error: `${noun} not found: ${list}. Search the list below — common causes are typos, the wrong sigil (\`!\` for TaxonWorks, \`~\` for external services), or a missing custom alias.` };
  }

  if (!groups.length) {
    return { actions: [], target: null, host: null, note: null, source: null, error: null };
  }

  const lastGroup = groups[groups.length - 1];
  const dest = lastGroup.stages[lastGroup.stages.length - 1].target;

  // Validate every group's chain (within-group `>` composition still
  // requires upstream stages to have a queryKey).
  for (const g of groups) {
    if (g.stages.length > 1) {
      const gDest = g.stages[g.stages.length - 1].target;
      if (gDest.url) {
        return { actions: [], target: dest, host: null, note: null, source: null,
                 error: 'External services can\'t receive a chain' };
      }
      for (let i = 0; i < g.stages.length - 1; i++) {
        if (!queryKeyFor(g.stages[i].target)) {
          return { actions: [], target: dest, host: null, note: null, source: null,
                   error: `Bang "${g.stages[i].bangToken}" can't be a chain source` };
        }
      }
    }
  }

  // Resolve host (only if any group has a TW-internal destination).
  let host = null, note = null, source = null;
  const anyInternal = groups.some(g => !g.stages[g.stages.length - 1].target.url);
  if (anyInternal) {
    const hosts = await loadHosts();
    const origin = await getActiveTabOrigin();
    const autoDetected = matchHostByOrigin(hosts, origin);
    ({ host, note, source } = resolveHost(hosts, hostName, autoDetected));
  }

  // Multi-group (sequential) mode: each group resolves to its own URL, and
  // the runtime drives them through the same tab one after another. Only
  // the FIRST nav honours the requested disposition (key-gesture / trailing
  // marker / configured default); subsequent ones update the same tab.
  // Trailing-marker dual-open (e.g. `\|`) doesn't compose meaningfully here,
  // so only the first `actions` entry's disposition is used.
  //
  // `;` is only meaningful when the first nav has a session-side-effect
  // the next nav relies on — currently just project selection. Reject
  // anything else so users don't accidentally chain unrelated navigations
  // (which would just throw away the first nav).
  if (groups.length > 1) {
    const firstDest = groups[0].stages[groups[0].stages.length - 1].target;
    if (!firstDest.sequential) {
      return { actions: [], target: dest, host, note, source,
               error: `Bang "${groups[0].destBangToken}" can't lead a \`;\` chain — only context-setting bangs (e.g. !sel / !project) carry side-effects forward` };
    }
    // Dual-open markers (`\|`, `|\`) don't fit the sequential model — the
    // user would expect both a frontend tab AND an API tab pointed at the
    // last nav, but expressing that cleanly is a triple combination
    // (sequential + dual-open + project context) that's easy to misread.
    // Reject explicitly; users who want the API view can chain again
    // with `;` and `|`.
    if (actions && actions.length > 1) {
      return { actions: [], target: dest, host, note, source,
               error: 'Dual-open markers (`\\|`, `|\\`) don\'t apply in sequential chains — use a single-action marker (`\\`, `\\\\`, `|`, `||`) or chain again with `;` for the API view' };
    }
    // Trailing-marker destination (frontend / api) applies to the LAST
    // group — that's where the user actually lands. Intermediate groups
    // are always frontend (they're context-setting; most are rawPath
    // which has no API endpoint anyway). Disposition applies to the
    // first nav (where the tab opens; the chain rides in it).
    const lastDest = (actions && actions[0]) ? actions[0].destination : 'frontend';
    const built = [];
    for (let i = 0; i < groups.length; i++) {
      const isLast = i === groups.length - 1;
      const useDest = isLast ? lastDest : 'frontend';
      const url = buildForDestination(host ? host.url : '', groups[i].stages, useDest);
      if (url) built.push({ url, destination: useDest, disposition: null, sequential: true });
    }
    if (built.length !== groups.length) {
      const failed = groups[built.length];
      const markerSym = lastDest === 'api' ? '|' : '\\';
      const article = lastDest === 'api' ? 'an' : 'a';
      return { actions: [], target: dest, host, note, source,
               error: `"${failed.destBangToken}" doesn't have ${article} ${lastDest} URL — drop the \`${markerSym}\` marker or end the chain on a filter bang` };
    }
    if (actions && actions[0]) built[0].disposition = actions[0].disposition;
    return { actions: built, target: dest, host, note, source, error: null };
  }

  // Single-group flow (existing behaviour, unchanged).
  const requested = actions || [{ destination: 'frontend', disposition: null }];
  const built = [];
  for (const req of requested) {
    const url = buildForDestination(host ? host.url : '', lastGroup.stages, req.destination);
    if (url) built.push({ url, destination: req.destination, disposition: req.disposition });
  }
  return { actions: built, target: dest, host, note, source, error: null };
}

const DEFAULT_OMNIBOX_DESCRIPTION =
  'TaxonWorks: !t name:Apis (TW filter), !co year:2020 @sandbox, ~col Trifolium repens (external service)';

browser.omnibox.setDefaultSuggestion({ description: DEFAULT_OMNIBOX_DESCRIPTION });

// Escape characters Firefox's omnibox description renderer treats as XML
// (`<match>` / `<dim>` / `<url>` are the allowed tags). Without escaping,
// stray `<` or `&` in error messages can break rendering.
function omniboxEscape(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Lightweight, sync structural validation that doesn't need host
// resolution. Returns an error string when the chain shape is rejected,
// else null. Mirrors the build-time rejections in resolveAndBuild so users
// can see them in the dropdown before pressing Enter.
function validateChainShape(groups, actions) {
  if (!groups.length) return null;

  if (groups.length > 1) {
    const firstStages = groups[0].stages;
    const firstDest = firstStages[firstStages.length - 1].target;
    if (!firstDest.sequential) {
      return `"${groups[0].destBangToken}" can't lead a \`;\` chain — only context-setting bangs (e.g. !sel / !project) carry side-effects forward`;
    }
    if (actions && actions.length > 1) {
      return 'Dual-open markers (`\\|`, `|\\`) don\'t apply in sequential chains — use a single-action marker, or chain again with `;` for the API view';
    }
    if (actions && actions[0] && actions[0].destination === 'api') {
      const lastStages = groups[groups.length - 1].stages;
      const lastTarget = lastStages[lastStages.length - 1].target;
      if (!lastTarget.path) {
        const sym = actions[0].disposition === 'newBackgroundTab' ? '||' : '|';
        return `"${groups[groups.length - 1].destBangToken}" doesn't have an api URL — drop the \`${sym}\` marker or end the chain on a filter bang`;
      }
    }
  }

  for (const g of groups) {
    if (g.stages.length > 1) {
      const gDest = g.stages[g.stages.length - 1].target;
      if (gDest.url) return 'External services can\'t receive a chain';
      for (let i = 0; i < g.stages.length - 1; i++) {
        if (!queryKeyFor(g.stages[i].target)) {
          return `"${g.stages[i].bangToken}" can't be a chain source`;
        }
      }
    }
  }
  return null;
}

browser.omnibox.onInputChanged.addListener(async (input, suggest) => {
  const { stages, hostName, actions, destBangToken, groups } = parse(input);
  const suggestions = [];

  // Surface chain-shape errors as the default suggestion's description
  // (the topmost row, the one Enter hits without further selection) AND
  // as a prepended high-visibility suggestion. Reset to the static
  // default when the input is valid, otherwise the warning persists
  // across invocations.
  const shapeError = validateChainShape(groups, actions);
  if (shapeError) {
    browser.omnibox.setDefaultSuggestion({ description: `⚠  ${omniboxEscape(shapeError)}` });
    suggestions.push({
      content: input,
      description: `⚠  ${omniboxEscape(shapeError)}`
    });
  } else {
    browser.omnibox.setDefaultSuggestion({ description: DEFAULT_OMNIBOX_DESCRIPTION });
  }

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

// Wait for `tabId` to reach `status: 'complete'` (or the tab to close, or
// the timeout to elapse). Used by sequential `;` chains to defer the next
// navigation until the previous one has finished loading. activeTab covers
// status events for tabs we've already touched in this user gesture, so
// no extra `tabs` permission is needed.
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let cleanup;
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') { cleanup(); resolve(); }
    };
    const onRemoved = (id) => {
      if (id === tabId) { cleanup(); reject(new Error('tab closed')); }
    };
    cleanup = () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
  });
}

async function runSequentialChain(actions, fallback) {
  const firstDispo = actions[0].disposition || fallback;
  let tabId;
  if (firstDispo === 'newForegroundTab') {
    const tab = await browser.tabs.create({ url: actions[0].url });
    tabId = tab.id;
  } else if (firstDispo === 'newBackgroundTab') {
    const tab = await browser.tabs.create({ url: actions[0].url, active: false });
    tabId = tab.id;
  } else {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    await browser.tabs.update(active.id, { url: actions[0].url });
    tabId = active.id;
  }

  for (let i = 1; i < actions.length; i++) {
    try {
      await waitForTabComplete(tabId, 15000);
    } catch {
      // Tab closed or timed out. The first nav already happened, so the
      // user can recover manually; bailing silently is less disruptive
      // than surfacing an error after they've already navigated.
      return;
    }
    await browser.tabs.update(tabId, { url: actions[i].url });
  }
}

// Sentinel URL used by the help bangs (!help / !cheat / ~help / ~cheat).
// resolveAndBuild emits this from buildExternalUrl; onInputEntered
// swaps it for the extension page URL (see cheatsheetUrl). The actual
// cheatsheet HTML is built client-side by cheatsheet.js when the page
// loads — Firefox blocks top-level navigation to `data:text/html` URLs,
// so we have to ship a real extension page.
const CHEATSHEET_SENTINEL = '__tw_cheatsheet__';
const OPTIONS_SENTINEL    = '__tw_options__';

// Build the URL to navigate to for the help / error pages. Optional
// `error` and `input` are passed via query string to be rendered as the
// banner at the top of the page.
function cheatsheetUrl({ error = null, input = null } = {}) {
  // `browser` may be unavailable in unit-test sandboxes; fall back to a
  // recognizable relative URL the test can match against.
  const base = (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL)
    ? browser.runtime.getURL('cheatsheet.html')
    : 'cheatsheet.html';
  const params = new URLSearchParams();
  if (error) params.set('error', error);
  if (input) params.set('input', input);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

browser.omnibox.onInputEntered.addListener(async (input, keyDisposition) => {
  const result = await resolveAndBuild(input);
  const { actions, error } = result;

  // Empty actions + an error string means we rejected the input. Show the
  // cheatsheet with an error banner rather than silently doing nothing.
  // (Empty actions with no error means the input wasn't an actionable
  // query yet — e.g. just `tw` with no bang — and we stay quiet there.)
  if (!actions.length) {
    if (error) await browser.tabs.update({ url: cheatsheetUrl({ error, input }) });
    return;
  }

  // Special-purpose bangs route through sentinel URLs that we substitute
  // here at navigation time, so the destination URL always reflects the
  // current extension/storage state:
  //   !help / !cheat → cheatsheet page (built from BANGS + bangOverrides)
  //   !config / !settings / !cfg / !options → the options page
  for (const a of actions) {
    if (a.url === CHEATSHEET_SENTINEL) a.url = cheatsheetUrl();
    else if (a.url === OPTIONS_SENTINEL) a.url = browser.runtime.getURL('options.html');
  }

  // For each action, resolve its disposition. Explicit per-action
  // disposition (set by trailing markers) wins. For default-actions where
  // disposition is null, fall back to: modifier-key gesture > configured
  // default > current tab.
  const { defaultDisposition } = await (await activeStorage()).get('defaultDisposition');
  const fallback = (keyDisposition && keyDisposition !== 'currentTab')
    ? keyDisposition
    : (defaultDisposition || 'currentTab');

  // Sequential `;` chain: open the first URL, then drive the same tab
  // through subsequent URLs as each finishes loading.
  if (actions.length > 1 && actions.every(a => a.sequential)) {
    await runSequentialChain(actions, fallback);
    return;
  }

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
