# TaxonWorks Quick Filter

A Firefox address-bar extension that jumps you straight to a TaxonWorks
filter task — and, while you're at it, to any of ~35 biodiversity-informatics
services that you might reference during the same session. Type `tw`, a
space, a bang, and any `key:value` params — hit Enter.

```
tw !s title:"A new species" year_start:2020 author_id:1,2
   └┬┘ └──────────────┬───────────────────┘ └─────┬─────┘
    │                 │                           └── array param
    │                 └── namespaced params (any key the filter accepts)
    └── bang picks the filter task (sources, here)
```

Two sigils:

- **`!`** for TaxonWorks targets (filter tasks, browse pages, hubs, new-record
  forms). Example: `!s` (Sources filter), `!bt` (Browse taxonomy).
- **`~`** for external biodiversity-informatics services. Example: `~col`
  (Catalogue of Life), `~gbif` (GBIF), `~doi` (DOI resolver).

The extension builds the right URL and opens
`/tasks/sources/filter?title=A+new+species&year_start=2020&author_id[]=1&author_id[]=2`
on your configured TaxonWorks instance.

## Quick examples

| You type                             | What happens                                      |
| ------------------------------------ | ------------------------------------------------- |
| `tw !t name:Apis`                    | Taxon names filter, `name=Apis`                   |
| `tw !co @sandbox year:2020`          | Collection objects on the sandbox instance        |
| `tw !s new species 2020`             | Sources filter, bare terms → `query_term=...`     |
| `tw co! @dev`                        | Collection objects on localhost — suffix bang OK  |
| `tw !ba subject_taxon_name_id:1234`  | Biological associations                           |
| `tw ~col Aedes aegypti`              | Catalogue of Life search (external — `~` sigil)   |
| `tw ~clb datasetKey:3LR Trifolium`   | ChecklistBank query pinned to a dataset           |
| `tw ~orcid Guralnick`                | ORCID people search                               |
| `tw ~bn "Smith, J."`                 | Bionomia roster search                            |
| `tw ~doi 10.1234/abcd`               | Resolve a DOI via `dx.doi.org`                    |
| `tw ~gnp Aedes aegypti L.`           | GN Parser (with details)                          |
| `tw !t Apis \`                       | Frontend in a new tab                             |
| `tw !t Apis ||`                      | API view in a new background tab                  |
| `tw !t Apis \|`                      | Both: frontend in new tab + API in new bg tab     |
| `tw !sel 50`                         | Switch to project 50 (rawPath `{}` substitution)  |

## Installing (temporary / development)

Until the extension is signed and published on addons.mozilla.org you can load
it directly from this repo. Temporary add-ons are removed when Firefox
restarts — you'll need to re-load after every restart.

1. Clone this repo somewhere Firefox can read it.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**
4. Pick the `manifest.json` file in the repo root.
5. Open the extension's options page once (`about:addons` → TaxonWorks Quick
   Filter → Options) and set your default TaxonWorks instance.

That's it — type `tw ` (with a trailing space) in the address bar to start
using it.

If you want it to survive browser restarts without waiting for Mozilla
signing, use Firefox Developer Edition, Nightly, or the ESR "unbranded" build,
all of which allow unsigned extensions permanently via
`xpinstall.signatures.required = false` in `about:config`. Regular Firefox
release will reject unsigned add-ons on next restart.

## Syntax

Anything after `tw ` is passed to the extension. Tokens are whitespace-separated
except inside double quotes.

- **Bang** — one of the keys below, prefixed or suffixed with `!`: `!s`, `s!`.
  The first bang wins if you type more than one.
- **Namespaced param** — `key:value`. The `key` is forwarded to the destination
  URL as-is.
  - For TaxonWorks filters, any param the filter class accepts will work.
    Unknown keys are silently dropped by Rails strong params.
  - For external services, params are appended to the template URL, so you can
    pin a dataset or filter if the service supports it.
- **Quoted value** — `key:"two words"`. Use for anything with spaces.
- **Array value** (TW filters only) — `key:a,b,c` expands to
  `key[]=a&key[]=b&key[]=c`. For values that legitimately contain commas, quote
  them: `key:"a, b"`. The extension also ships a snapshot of which TW filter
  params are declared as arrays (e.g. `bibtex_type`, `author_id`,
  `taxon_name_id`); for those, `key:value` automatically becomes `key[]=value`,
  so you don't have to remember which params want the bracket form. If TW
  added a new array param after the snapshot was taken, you can still force
  it with `key[]:value` or `key:value,` (trailing comma).
- **Instance selector** — `@name` anywhere in the input picks which configured
  TaxonWorks host to send to. No `@name` means "use the configured default".
  Ignored for external service bangs.
- **Bare terms** — anything not matching the above is joined with spaces:
  - TW filters → sent as `query_term=...`, which most filters use as a loose
    full-text match.
  - External services → substituted into the `{}` placeholder in the service's
    URL template.
- **Bang sigils** — `!` for TaxonWorks targets (filter / browse / new / hub),
  `~` for external services. Either prefix or suffix: `!s`, `s!`, `~col`,
  `col~`. Cross-sigil mismatch (e.g. `!col` for the external Catalogue of
  Life bang, or `~s` for the internal Sources bang) doesn't match — by
  design, so the syntax tells you whether the destination is TW or
  third-party.
- **Trailing tab markers** — a trailing whitespace-separated token at the
  end of the query controls where the result opens. Six markers, all on
  the same physical key (`\`/`|`):

  | Marker | Destination | Disposition |
  | --- | --- | --- |
  | (none) | Frontend | Current tab (or configured default) |
  | `\` | Frontend | New foreground tab |
  | `\\` | Frontend | New background tab |
  | `|` | API | New foreground tab |
  | `||` | API | New background tab |
  | `\|` | Frontend (FG) + API (BG) — opens both | — |
  | `|\` | API (FG) + Frontend (BG) — opens both | — |

  Mnemonic: shift up to switch destination from frontend to API. The
  marker has to be the last whitespace-separated token; values that happen
  to contain `\` or `|` (e.g. `foo|bar` or `Apis\\`) are regular content,
  so there's no collision. Markers override both the key-modifier
  behavior (Alt+Enter, etc.) and the configured default below.

## Filter chains

You can throw the result of one filter into another, the same way TaxonWorks'
"radial filter" UI does it. Use `>` (Unix-style output redirection) between
stages — read left-to-right, "send the result of A into B":

```
tw !s with_doi:true > !tn
   ↳ Sources that have a DOI → throw to Taxon names
```

Becomes:

```
/tasks/taxon_names/filter?source_query[with_doi]=true
```

Each stage's params get wrapped under the upstream target's `<resource>_query`
namespace, exactly like the radial UI does. The destination is the **last**
stage — its bang determines the URL path; preceding stages contribute their
filter conditions as nested sub-scopes that TW evaluates server-side.

### Practical examples

| Question | Chain |
| --- | --- |
| All taxon names described in a source with a DOI | `tw !s with_doi:true > !tn` |
| All taxon names described in a book | `tw !s bibtex_type:book > !tn` |
| All taxon names described in a journal article published since 2020 | `tw !s bibtex_type:article year_start:2020 > !tn` |
| All taxon names described by a specific author | `tw !s author_id:42 > !tn` |
| Collection objects of a specific taxon | `tw !t name:Apis > !otu > !co` |
| Collection objects whose taxon was described in a book | `tw !s bibtex_type:book > !tn > !otu > !co` |
| Asserted distributions for taxa described since 2020 | `tw !s year_start:2020 > !tn > !ad` |
| Biological associations involving a specific subject taxon | `tw !t name:Apis > !ba` |
| Same as above, on sandbox, opened in a frontend background tab | `tw !t name:Apis > !ba @sandbox \\` |

### Multi-stage nesting

Chains are recursive — each additional stage adds another layer of
`<resource>_query[…]` wrapping around the ones before it:

```
tw !s bibtex_type:book > !tn rank:species > !co year:2020
  → /tasks/collection_objects/filter
       ?taxon_name_query[source_query][bibtex_type][]=book
       &taxon_name_query[rank][]=species
       &year=2020
```

### Intermediate stages matter

A chain composes filters — it doesn't walk the TaxonWorks data model for
you. If two filters aren't directly linked in TW's schema, you have to
include the bridging filter(s) explicitly.

The classic case: **TaxonName → CollectionObject**. In TW's data model,
taxon names don't attach to collection objects directly — they attach via
**OTUs** (an OTU represents "a particular way of circumscribing a taxon
name for use"). So a chain from a taxon-name constraint to collection
objects has to route through OTUs:

```
# WRONG (will produce zero results)
tw !s with_doi:true in_project:true > !tn rank:"NomenclaturalRank::Iczn::SpeciesGroup::Species" > !co

# RIGHT (routes through OTU)
tw !s with_doi:true in_project:true > !tn rank:"NomenclaturalRank::Iczn::SpeciesGroup::Species" > !otu > !co
```

The correct form produces:

```
/tasks/collection_objects/filter
  ?otu_query[taxon_name_query][source_query][with_doi]=true
  &otu_query[taxon_name_query][source_query][in_project]=true
  &otu_query[taxon_name_query][rank][]=NomenclaturalRank::Iczn::SpeciesGroup::Species
```

…which is exactly what TW's radial UI produces when you throw a TaxonName
filter result → OTU → CollectionObject. Without the `!otu` stage, the
CollectionObject filter doesn't know how to interpret a `taxon_name_query`
wrap because the relationship isn't direct — hence zero results.

Rule of thumb: if you're chaining between two resources and can't think of
how they'd be linked without an intermediate (OTU, source citation,
collecting event, etc.), include the intermediate as its own stage. When
in doubt, look at what the radial UI produces for the same throw; our
chain URLs match its wrapping byte-for-byte.

### Chain-global modifiers

`@host` and the trailing tab marker (`\`, `\\`, `|`, `||`, `\|`, `|\`) apply
to the whole chain, regardless of where you put them. Examples:

```
tw !s bibtex_type:book > !tn @sandbox \
  → chained taxon-names URL on @sandbox, opened in a new foreground frontend tab

tw !s bibtex_type:book > !tn |
  → same chain, opened to the API endpoint instead of the UI

tw !s bibtex_type:book > !tn \|
  → opens both: frontend (foreground) and API (background)
```

**What can chain into what?** Any filter bang can be a stage source as long as
TW's destination filter accepts the upstream's `<resource>_query` sub-scope —
in practice, almost all filter pairs work because TW's filter classes share a
generalized cross-resource query mechanism. External-service bangs (e.g.
`~col`, `~gbif`) and non-filter bangs (browse, new, hub) cannot be chain
sources or destinations — the omnibox suggestion will surface a warning if
you try.

**Caveat:** if a chain produces an extremely long URL (>2 KB), TW's own UI
falls back to a `_stateId` + `localStorage` mechanism that we cannot
participate in from a separate origin's session. Chains that bloat past that
limit will fail at the server. In practice this only happens with
multi-clause chains stacked across several stages.

## Tab behavior

By default, pressing plain Enter (no marker) opens the result in the
current tab. You can change this in the options page — pick one of
**Current tab**, **New tab**, or **New background tab**. The full
precedence is:

1. **Trailing markers** (see Syntax above) — explicit `\`, `\\`, `|`, `||`,
   `\|`, or `|\` always wins, including which destination (frontend vs API)
   the result opens in. Dual-open markers (`\|` / `|\`) open two tabs;
   their dispositions are explicit (one FG, one BG) and ignore the items
   below.
2. **Modifier-key gesture** — if Firefox hands us an explicit disposition
   (Alt+Enter, Ctrl+Alt+Enter, middle-click), that wins for the
   single-action case.
3. **Configured default** — the options-page setting above.
4. **Fallback** — current tab.

The destination (frontend filter UI vs `/api/v1/...` endpoint) is only
controllable via the trailing markers — there's no "default destination"
preference. Most queries default to the frontend.

## TaxonWorks filter bangs

| Target                    | Bangs                          | URL path                                  |
| ------------------------- | ------------------------------ | ----------------------------------------- |
| Sources                   | `!s` `!src` `!source`          | `/tasks/sources/filter`                   |
| Taxon names               | `!t` `!tn` `!n` `!name`        | `/tasks/taxon_names/filter`               |
| Taxon name relationships  | `!tnr` `!rel`                  | `/tasks/taxon_name_relationships/filter`  |
| OTUs                      | `!o` `!otu`                    | `/tasks/otus/filter`                      |
| Collection objects        | `!co` `!specimen` `!obj`       | `/tasks/collection_objects/filter`        |
| Field occurrences         | `!fo` `!field`                 | `/tasks/field_occurrences/filter`         |
| Collecting events         | `!ce` `!event`                 | `/tasks/collecting_events/filter`         |
| Asserted distributions    | `!ad` `!dist`                  | `/tasks/asserted_distributions/filter`    |
| Biological associations   | `!ba` `!bio` `!assoc`          | `/tasks/biological_associations/filter`   |
| Observations              | `!obs` `!observation`          | `/tasks/observations/filter`              |
| Descriptors               | `!d` `!desc`                   | `/tasks/descriptors/filter`               |
| Images                    | `!i` `!img` `!image`           | `/tasks/images/filter`                    |
| Sounds                    | `!snd` `!sound`                | `/tasks/sounds/filter`                    |
| People                    | `!p` `!person` `!people`       | `/tasks/people/filter`                    |
| Loans                     | `!l` `!loan`                   | `/tasks/loans/filter`                     |
| Extracts                  | `!ext` `!extract`              | `/tasks/extracts/filter`                  |
| Anatomical parts          | `!ap` `!part`                  | `/tasks/anatomical_parts/filter`          |
| Namespaces                | `!ns` `!namespace`             | `/tasks/namespaces/filter`                |
| Contents                  | `!cnt` `!content`              | `/tasks/content/filter`                   |
| DwC occurrences           | `!dwc` `!occ`                  | `/tasks/dwc_occurrences/filter`           |
| Annotations               | `!ann` `!a`                    | `/tasks/annotations/filter`               |

Don't like a bang? See **Custom bangs** below.

## External service bangs

These use the **`~` sigil** instead of `!` — they don't touch a TaxonWorks
instance, they're convenience pass-throughs to biodiversity-informatics
services. The split sigil makes it visually obvious whether a bang
targets your TW project or an outside service. Bare terms form the query
string (substituted into `{}` in the URL template); `key:value` tokens are
appended as extra URL parameters, so you can pin a dataset or filter if
the destination service supports it. `@instance` is ignored for external
bangs.

Example: `tw ~clb datasetKey:3LR Trifolium` →
`https://www.checklistbank.org/nameusage/search?q=Trifolium&datasetKey=3LR`

### Nomenclature & taxonomy

| Bang(s)                                 | Service                        |
| --------------------------------------- | ------------------------------ |
| `~iczn`                                 | ICZN                           |
| `~ictv`                                 | ICTV                           |
| `~zb`                                   | ZooBank                        |
| `~ipni`                                 | IPNI                           |
| `~pow`                                  | Plants of the World (Kew)      |
| `~trop` / `~tropicos`                   | Tropicos                       |
| `~sn` / `~scalenet`                     | ScaleNet                       |
| `~wsc` / `~spider`                      | World Spider Catalog           |
| `~wikispecies`                          | Wikispecies                    |

### Checklists & catalogues

| Bang(s)       | Service            |
| ------------- | ------------------ |
| `~col`        | Catalogue of Life  |
| `~clb`        | ChecklistBank      |
| `~eol`        | Encyclopedia of Life |

### Occurrence data

| Bang(s)   | Service                       |
| --------- | ----------------------------- |
| `~gbif`   | GBIF species                  |
| `~idig`   | iDigBio                       |
| `~vernet` | VertNet                       |
| `~inat`   | iNaturalist                   |
| `~obis`   | OBIS                          |
| `~ala`    | Atlas of Living Australia     |

### Molecular & specimen

| Bang    | Service      |
| ------- | ------------ |
| `~bold` | BOLD Systems |

### People, institutions & attribution

| Bang    | Service   |
| ------- | --------- |
| `~orcid`| ORCID     |
| `~bn`   | Bionomia (roster search) |
| `~ror`  | ROR       |

### Literature & citations

| Bang(s)                                 | Service                             |
| --------------------------------------- | ----------------------------------- |
| `~bhl`                                  | Biodiversity Heritage Library       |
| `~plazi`                                | Plazi TreatmentBank                 |
| `~pubmed`                               | PubMed                              |
| `~gs` / `~scholar`                      | Google Scholar                      |
| `~crossref`                             | Crossref                            |
| `~doi`                                  | DOI resolver (`dx.doi.org`)         |
| `~alex` / `~oa` / `~openalex`           | OpenAlex                            |
| `~wos`                                  | Web of Science                      |

### Data repositories

| Bang(s)               | Service |
| --------------------- | ------- |
| `~dryad`              | Dryad   |
| `~zen` / `~zenodo`    | Zenodo  |

### Scientific-name parsing & verification

| Bang(s)                                 | Service                           |
| --------------------------------------- | --------------------------------- |
| `~gnp` / `~gnparser`                    | Global Names Parser (HTML output) |
| `~gnv` / `~gnverify` / `~gnverifier`    | Global Names Verifier             |

## Example suggestions in the dropdown

If you type a bang with no further query (e.g. `tw ~col`), the omnibox
dropdown shows canned example queries for that service — picking one with
arrow-keys + Enter fills in a working query. Examples are seeded for a
handful of services where the URL structure or query format isn't obvious
(ChecklistBank `datasetKey`, DOI format, Bionomia name casing, GN Parser name shapes,
TaxonWorks Sources / Taxon names / Collection objects). Add more by
attaching an `examples: [{ query, hint }]` array to a bang target in
`bangs.js`.

## Configuring instances

The options page ships with a seeded list: `sfg` (default), several `sand*`
sandboxes (`sandbox`, `sanddollar`, `sandblaster`, `sandpaper`, `sandcastle`),
`workshop`, and `dev` (`http://localhost:3000`). Edit, add, or remove rows;
pick a default with the radio column; click **Save**.

To target a specific instance for a single query, use `@name`:

```
tw !s @sandblaster title:"new genus"
tw !t @dev name:Apis
```

If `@name` doesn't match any configured instance, the extension falls back to
the configured default and surfaces a warning in the omnibox suggestion.

## Custom bangs

The **Custom bangs** section of the options page lets you:

- Add new aliases (e.g. `!x` → OTUs).
- Rebind a built-in (e.g. make `!a` point to Asserted distributions instead of
  Annotations).
- Disable a built-in you don't like by setting its target to *"— disable —"*.
- Define your own external bangs for services we don't ship. Pick
  *"— custom URL template —"* in the target dropdown and enter a URL that
  contains `{}` as the placeholder for the URL-encoded query, e.g.
  `https://www.wikipedia.org/w/index.php?search={}`.

Overrides apply immediately — no reload required.

## How it's put together

```
manifest.json     MV3 manifest; omnibox keyword "tw"
bangs.js          BANGS map (internal + external) + deduped BANG_TARGETS
                  for the options dropdown
hosts.js          DEFAULT_HOSTS, loadHosts(), resolveHost()
background.js     Tokenizer, parser, URL builder, omnibox handlers,
                  live overrides merge via storage.onChanged
options.html      Two-section options page (instances + custom bangs)
options.js        Render / validate / save for both sections
```

The extension uses only `storage` and `activeTab` permissions. It never
contacts any external service itself — the URL it builds goes straight to
the tab you choose.

## Privacy

The extension itself sends no data anywhere — no telemetry, no analytics,
no auto-updates pinging home. But the whole point of the bangs is to open
URLs, so:

- **External-service bangs** (e.g. `~col`, `~gbif`, `~doi`) send your query
  to that service over TLS. Same as if you'd typed the query into the
  service's own search box.
- **TaxonWorks bangs** send your filter params to whichever TaxonWorks
  instance you target. Your TW admin controls that instance's logging.
- **Host auto-detect** reads the URL of your active tab when you submit an
  omnibox query, via the `activeTab` permission, in order to infer which
  TaxonWorks instance to use. That URL is used only to pick a configured
  host in-memory for that single navigation — it is never recorded,
  written to storage, or transmitted anywhere. The permission is granted
  only at the moment of the user gesture (omnibox submit), not
  continuously or in the background.

No query text or URL is stored in extension storage. The only things in
`browser.storage.local` are your configured hosts list and your custom-bang
overrides.

## Limitations

- Firefox's omnibox API requires the `tw ` keyword prefix; the extension
  cannot intercept bare bang queries in the address bar.
- There is no autocomplete for filter param names yet. Both TaxonWorks (via
  Rails strong params) and most external services silently drop unknown
  keys, so typos like `yaer:2020` produce a less-filtered result rather than
  an error. A future enhancement could derive per-filter param lists from
  `lib/queries/*/filter.rb` and surface them as suggestions.
- Host auto-detect ("I'm already on a sandbox tab, use that") is not
  implemented; explicit `@name` or the configured default is what you get.
- Some external services (notably ITIS) only expose POST-based search forms,
  which can't be linked to directly and therefore aren't included.

## Testing

Run the test suite:

```sh
npm test
```

No dependencies — uses Node 20+'s built-in `node:test` runner. Tests evaluate
the source files inside a `vm` sandbox with a stubbed `browser.*` API, then
assert against URLs returned from `resolveAndBuild` and related pure
functions. No network calls, no real tabs, no real storage.

The `test/` directory is not referenced from `manifest.json`, so Firefox
never loads it. When packaging for distribution (e.g. `web-ext build`), add
`test/` and `package.json` to the ignore list so they don't end up in the
shipped `.xpi`.

Test files:

- `test/parse.test.js` — tokenization, bang/host/disposition extraction, chain splits
- `test/url.test.js` — URL building for internal filters, external services, rawPath, auto-bracketing, host resolution
- `test/chain.test.js` — chain URL nesting, global @host/disposition in chains, validation errors

Add new cases alongside these as you add features.

## Publishing status

Not yet published on addons.mozilla.org. Until it is, use the temporary
install instructions above.
