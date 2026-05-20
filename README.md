# TaxonWorks Omnibox

<img width="200" height="200" alt="taxonworks_labs_logo_black" src="https://github.com/user-attachments/assets/aed6a9d3-e737-4954-861c-99dfc3f89040" />

TaxonWorks Labs Product


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
  - Internal aliases follow these prefix conventions: `f<short>` for filter
    tasks (`!fco` → collection objects filter, mirroring the existing
    `!co`), `b<short>` for browse (`!bco`), `n<short>` for new-record
    (`!nco`), and `d<short>` for the standard data resource page at
    `/<plural>` (`!dtn` → `/taxon_names`).
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
| `tw co! @dev`                        | Collection objects on localhost — suffix sigil OK |
| `tw !ba subject_taxon_name_id:1234`  | Biological associations                           |
| `tw ~col Aedes aegypti`              | Catalogue of Life search (external — `~` sigil)   |
| `tw ~clb datasetKey:3LR Trifolium`   | ChecklistBank query pinned to COL latest release  |
| `tw ~orcid Guralnick`                | ORCID people search                               |
| `tw ~bn "Smith, J."`                 | Bionomia roster search                            |
| `tw ~doi 10.1234/abcd`               | Resolve a DOI via `dx.doi.org`                    |
| `tw ~gnp Aedes aegypti L.`           | GN Parser (with details)                          |
| `tw !t Apis \`                       | Frontend in a new tab                             |
| `tw !t Apis ||`                      | API view in a new background tab                  |
| `tw !t Apis \|`                      | Both: frontend in new tab + API in new bg tab     |
| `tw !sel 50`                         | Switch to project 50 (rawPath `{}` substitution)  |
| `tw !sel 13 ; !dtn 3893823`          | Switch to project 13, then deep-link to that taxon name (sequential `;`) |
| `tw !help`                           | Open the cheatsheet — every built-in bang, with examples         |

## Installing

### Signed release (recommended)

1. Download the latest signed `.xpi` from
   [Releases](https://github.com/SpeciesFileGroup/tw_firefox/releases).
2. In Firefox, open `about:addons`.
3. Click the gear icon → **Install Add-on From File…**
4. Pick the `.xpi` file.
5. Once installed, open the extension's options page (three-dot menu →
   **Manage Extension** → **Options**) and set your default TaxonWorks
   instance.

The signed extension persists across Firefox restarts and auto-updates to new
releases. Type `tw ` (with a trailing space) in the address bar to start
using it.

### Development / temporary load

To test changes during development, you can load the extension directly from
this repo. Temporary add-ons are removed when Firefox restarts — you'll need
to re-load after every restart.

1. Clone this repo somewhere Firefox can read it.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**
4. Pick the `manifest.json` file in the repo root.

For a persistent unsigned install during development, use Firefox Developer
Edition, Nightly, or ESR-unbranded, and set
`xpinstall.signatures.required = false` in `about:config`. Regular Firefox
releases require signed add-ons.

## Syntax

Anything after `tw ` is passed to the extension. Tokens are whitespace-separated
except inside double quotes.

- **Bang** — one of the keys below, prefixed or suffixed with `!`: `!s`, `s!`.
  The first bang wins if you type more than one.
- **Namespaced param** — `key:value`. The `key` is forwarded to the destination
  URL as-is.
  - For TaxonWorks filters, any param the filter class accepts will work.
    Unknown keys are silently dropped by Rails.
  - For external services, params are appended to the template URL, so similar
    key:value syntax should work for services that support URL parameters. Params
    are almost always case sensitive and different conventions can be used
    (e.g., datasetID, datasetId, dataset_id, DatasetId, DatasetID).
- **Quoted value** — `key:"two words"`. Use for anything with spaces.
- **Array value** (TW filters only) — `key:a,b,c` expands to
  `key[]=a&key[]=b&key[]=c`. For values that legitimately contain commas, quote
  them: `key:"a, b"`. The extension also ships a snapshot of which TW filter
  params are declared as arrays (e.g. `bibtex_type`, `author_id`,
  `taxon_name_id`); for those, `key:value` automatically becomes `key[]=value`,
  so you don't have to remember which params want the bracket form. If TW
  added a new array param after the snapshot was taken, you can still force
  it with `key[]:value` or `key:value,` (trailing comma).
- **Instance selector** — `@hostname` anywhere in the input picks which configured
  TaxonWorks host to send to. No `@hostname` means either "target the TaxonWorks
  instance in the currently focussed Firefox tab" or "use the configured default".
  @hostname is ignored for external service bangs.
- **Bare terms** — anything not matching the above is joined with spaces:
  - TW filters → sent as the filter's text-search param. The base class doesn't
    handle `query_term` generically — only `Sources` does — so each supported
    filter is mapped to the right attribute (e.g. `taxon_names` → `name`,
    `otus` → `name`, `descriptors` → `term`, `content` → `text`). Filters
    without a clear text param fall back to `query_term` (silently dropped by
    Rails, same as before).
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
  the same physical US keyboard key (`\`/`|`):

  | Marker | Destination | Disposition |
  | --- | --- | --- |
  | (none) | Frontend | Current tab (or configured default) |
  | `\` | Frontend | New foreground tab |
  | `\\` | Frontend | New background tab |
  | `\|` | API | New foreground tab |
  | `\|\|` | API | New background tab |
  | `\\|` | Frontend (FG) + API (BG) — opens both | — |
  | `\|\` | API (FG) + Frontend (BG) — opens both | — |

  Mnemonic: shift up to switch destination from frontend to API. The
  marker has to be the last whitespace-separated token; values that happen
  to contain `\` or `|` (e.g. `foo|bar` or `Apis\\`) are regular content,
  so there's no collision. Markers override both the key-modifier
  behavior (Alt+Enter, etc.) and the configured default below.

  **Forward-slash aliases:** `/`, `//`, `/|`, `|/` are accepted everywhere
  the corresponding `\`, `\\`, `\|`, `|\` are. Backslash is awkward to
  type on most layouts and people genuinely confuse the two when writing
  chains by hand, so both forms work identically.

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
| Same as above, on sandbox, opened in a API foreground tab | `tw !t name:Apis > !ba @sandbox |` |

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

## Sequential navigation (`;`) — project-scoped deep links

`>` is composition (one URL, nested params, one tab, one page). `;` is
sequencing — two separate page loads in the same tab, where the first
sets a session-side-effect that the second relies on:

```
tw !sel 13 ; !dtn 3893823
  → 1. open /projects/13/select        (sets the project context cookie,
                                         redirects to the workbench)
    2. wait for that tab to finish loading
    3. update the same tab to /taxon_names/3893823 — now scoped to project 13
```

The use case: TaxonWorks doesn't currently expose project-scoped deep
links of the form `/projects/13/taxon_names/3893823`, so emailing a
collaborator a direct link to a record inside *your* project isn't
possible natively. `;` fills the gap — you (and anyone with the
extension installed) can paste a `tw !sel … ; …` chain into the omnibox
and land on the right record.

**Restrictions, by design:**

- The first group's destination must be a context-setting bang —
  currently only `!sel` / `!select` / `!project`. Trying e.g.
  `!s id:5 ; !tn foo` is rejected with a clear error: chaining two
  unrelated navigations would just throw away the first.
- Within a `;` group you can still use `>` for filter composition
  (`!sel 13 ; !s with_doi:true > !tn` selects the project, then
  navigates to a sources→taxon-names chain).
- Trailing tab markers split cleanly. **Single-action markers**
  (`\`, `\\`, `|`, `||`) work, with their two parts routing
  separately:
  - **disposition** (which tab — current, new foreground, new
    background) applies to the *first* nav (where the tab opens; the
    whole sequence rides in it),
  - **destination** (frontend HTML vs API JSON) applies to the *last*
    nav (where the user lands).

  So `tw !sel 13 ; !t Apis |` selects project 13 in the current tab,
  then loads `/api/v1/taxon_names?...` (project-13-scoped via the
  cookie). `tw !sel 13 ; !t Apis ||` does the same in a new background
  tab. If the last nav doesn't have an API equivalent (e.g.
  `!dtn 5 |` — `!dtn` is a rawPath bang with no API endpoint), the
  chain is rejected with a clear error rather than silently dropping
  the marker.

  **Dual-open markers** (`\|`, `|\`) are rejected outright in
  sequential chains — combining sequential nav, dual-open, and a
  project-context cookie is the kind of triple combination that's
  easy to misread. If you want both the UI and the API of a record
  inside a project, run two separate `;` chains (one with `|`, one
  without).
- A leading literal `tw` token is silently stripped from each group, so
  shareable forms like `tw !sel 13 ; tw !dtn 5` work the same as
  `!sel 13 ; !dtn 5`. Useful for pasting from docs/emails.

If the second tab's load times out (15s) or the tab is closed before
loading completes, the second navigation is skipped silently — the
first nav still happened, so the user can recover manually.

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
appended as extra URL parameters, so you can add additional parameters if 
the destination service supports it. `@instance` is ignored for external
bangs. Remember to pay close attention to the casing of parameter keys:
external services can follow different naming conventions than Rails.

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

To target a specific instance for a single query, use `@hostname`:

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

## Backup & sync

The options page has a **Backup & sync** section with three controls:

- **Export settings** — downloads a JSON file containing your custom
  bangs, host list, and default tab behavior. Save it for backup or
  share it with collaborators.
- **Import settings** — loads a JSON file containing your custom bangs. 
  Schema-stamped (`tw-firefox-omnibox/1`) so future format changes
  won't silently corrupt old files.
- **Use Firefox Sync** — opt-in checkbox. When on, the same settings
  move to `browser.storage.sync` so they propagate across the Firefox
  profiles you're signed in to. Off by default; no Mozilla account
  required for the extension to work. The toggle migrates existing
  settings between the two storage areas in one step (no manual
  re-entry). The toggle itself is per-device — flip it on your work
  laptop without affecting your phone.

## Publishing status

Distribution is **self-hosted on GitHub Releases**, signed by Mozilla as an
unlisted addon. Signed `.xpi` files are available at
[Releases](https://github.com/SpeciesFileGroup/tw_firefox/releases). Firefox
auto-updates from the most recent release via the `update_url` baked into the
manifest; users install the signed `.xpi` once from a release page and
subsequent versions arrive automatically. Not published on addons.mozilla.org.

## Releasing

The release pipeline lives in `.github/workflows/release.yml`. A pushed
tag of the form `v*` (e.g. `v0.1.0`) triggers it. The workflow lints,
runs tests, submits the source to Mozilla for unlisted signing, and
attaches the signed `.xpi` plus an `updates.json` to a new GitHub Release.

### One-time setup

1. **Create AMO API credentials.** Sign in to
   `https://addons.mozilla.org/developers/addon/api/key/` and generate a
   key pair. You'll get a "JWT issuer" (looks like `user:1234567:8`) and
   a "JWT secret" (long hex string). Both are tied to your AMO account —
   any account works as long as it owns the addon ID
   `tw-quick-filter@taxonworks`.
2. **Add repo secrets.** In the GitHub repo's Settings → Secrets and
   variables → Actions, add:
   - `AMO_JWT_ISSUER` — the JWT issuer
   - `AMO_JWT_SECRET` — the JWT secret
3. **First release.** The first time the workflow runs, Mozilla creates
   the signed unlisted listing for the extension ID. Subsequent releases
   just re-sign the same listing under a new version.

### Per-release

```bash
# 1. Bump the version in BOTH places (they must match)
#    - manifest.json:  "version": "0.1.0"
#    - package.json:   "version": "0.1.0"
# 2. Commit and push to main
git add manifest.json package.json
git commit -m "Bump version to 0.1.0"
git push

# 3. Tag and push the tag — this triggers the release workflow
git tag v0.1.0
git push origin v0.1.0
```

The workflow will appear under the Actions tab. When it finishes (a few
minutes — most of that is Mozilla signing), the new release will appear
on the Releases page with the `.xpi` and `updates.json` attached.

If the tag's version doesn't match `manifest.json` the workflow fails
fast — bump and retag.

To delete a botched release: delete the tag and the release on GitHub,
fix the issue, retag with the same version. Mozilla's signing service
will reject re-submission of an already-signed version, so if signing
succeeded but a later step failed you have to bump to a new version.

### How auto-update works

- The manifest's `browser_specific_settings.gecko.update_url` points at
  `https://github.com/SpeciesFileGroup/tw_firefox/releases/latest/download/updates.json`.
- GitHub redirects `releases/latest/download/<asset>` to the matching
  asset on the most recent non-prerelease release, so the URL above
  always serves the freshest `updates.json`.
- Firefox polls that URL on its own schedule (~every 24h, plus on
  startup), reads the version inside, and silently downloads the
  matching `.xpi` if it's newer than the installed version.
- Each release's `updates.json` lists only that release's version. Older
  installs polling will see the new version and update; you don't need
  to maintain a cumulative version history.

### Local builds (for testing without releasing)

```bash
npm install            # one-time, installs web-ext
npm run lint           # static checks
npm run build          # produces an unsigned .zip in web-ext-artifacts/
```

The unsigned build can be loaded as a Temporary Add-on via
`about:debugging` for development. For a signed build without cutting a
release, `npm run sign` (with `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`
in the environment) signs locally and downloads the .xpi.


## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/SpeciesFileGroup/tw_firefox. This project is intended to be a safe, welcoming space for collaboration, and contributors are expected to adhere to the [code of conduct](https://github.com/SpeciesFileGroup/tw_firefox/blob/main/CODE_OF_CONDUCT.md).

## License

The Firefox extension is available as open source under the terms of the [MIT license](https://github.com/SpeciesFileGroup/tw_firefox/blob/main/LICENSE.txt). You can learn more about the MIT license on [Wikipedia](https://en.wikipedia.org/wiki/MIT_License) and compare it with other open source licenses at the [Open Source Initiative](https://opensource.org/license/mit/).

## Code of Conduct

Everyone interacting in the Wikimelon project's codebases, issue trackers, chat rooms and mailing lists is expected to follow the [code of conduct](https://github.com/SpeciesFileGroup/tw_firefox/blob/main/CODE_OF_CONDUCT.md).

