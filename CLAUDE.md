# CLAUDE.md

Contributor-facing notes for this repo. User-facing docs live in `README.md`.

## What it is

A Firefox MV3 WebExtension that registers `tw` as an omnibox keyword. The
parser reads everything the user types after `tw `, pulls out a bang
(internal → TaxonWorks filter URL, external → arbitrary URL template) and an
optional `@host` token, then builds a destination URL.

File roles: `manifest.json`, `bangs.js` (BANGS map + deduped `BANG_TARGETS`),
`hosts.js` (TaxonWorks instance list + resolver), `background.js` (parser,
URL builders, omnibox handlers, live overrides merge), `options.html` +
`options.js` (options UI). No build step — edit JS and reload.

## Non-obvious conventions

- **Use `ACTIVE_BANGS`, not `BANGS`, inside runtime handlers.** `BANGS` is
  the baked-in defaults; `ACTIVE_BANGS` is `{...BANGS, ...userOverrides}`,
  refreshed via `storage.onChanged`. Referencing `BANGS` in a handler
  silently ignores user customisations.

- **Multi-alias targets with shared `examples` use a shared const.** See
  `SOURCES_TARGET`, `TAXON_NAMES_TARGET`, `COLLECTION_OBJECTS_TARGET`,
  `GN_PARSER_TARGET` at the top of `bangs.js`. Aliases are assigned to the
  same object reference so one edit updates every alias. If you add a new
  alias to an existing target, point it at the const — don't clone.

- **URL templates must contain exactly one `{}` placeholder.** The
  substitution is literal `string.replace('{}', encodeURIComponent(query))`.
  Works in either the path or query string (`scalenet.info/catalogue/{}`
  and `example.com/search?q={}` are both fine).

- **External bangs ignore `@host` by design.** Host resolution only applies
  to internal (TW filter) targets. Don't change this without a reason.

- **Internal bang `key:value` → `key=value`; comma-values → `key[]=...`.**
  Rails array convention. External bangs pass `key:value` through as-is and
  do not expand commas (most non-Rails services don't use the `[]` suffix).

- **Typos silently drop.** Rails strong params on TW filter controllers
  ignore unknown keys, and most external services do the same. There's no
  validation of param names in the extension — intentional, so new TW
  filter params work without a code change here.

## Testing

- **Unit tests:** `npm test` (Node 20+, no dependencies — uses the built-in
  `node:test` runner). Source files are loaded inside a `vm` sandbox with a
  stubbed `browser.*` API by `test/helpers.js`, and the tests assert
  against `resolveAndBuild` / `parse` / `paramsFor` / etc.
  - Cross-realm gotcha: arrays/objects built inside the vm have a
    different `Array.prototype` than outer-test literals, so the tests
    use `require('node:assert')` (non-strict `deepEqual`, prototype-
    insensitive). Don't switch to `node:assert/strict` without accounting
    for this.
  - `vm.createContext` is passed `URL`, `URLSearchParams`, `Set`, etc.
    explicitly because they're **not** default built-ins in vm contexts.
    Adding a source file that uses a new intrinsic → update `helpers.js`.

- **Full extension:** `about:debugging#/runtime/this-firefox` → Load
  Temporary Add-on → pick `manifest.json`. Re-pick after every edit
  (Firefox caches aggressively; the "Reload" button in about:debugging
  is unreliable for MV3 event-page scripts).

## Gotchas

- Firefox's omnibox requires the literal keyword prefix `tw ` (with a
  trailing space). Typing `tw` + Enter hits the default search engine.
- The temporary add-on is removed on Firefox restart. For a persistent
  install without Mozilla signing, use Firefox Developer Edition /
  Nightly / ESR-unbranded and set `xpinstall.signatures.required=false`.
- `storage.local` is used (not `storage.sync`) so settings don't require
  a Firefox account.
