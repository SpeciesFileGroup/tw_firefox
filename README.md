# TaxonWorks Quick Filter

A Firefox address-bar extension that jumps you straight to a TaxonWorks filter
task — and, while you're at it, to any of ~35 biodiversity-informatics
services that you might reference during the same session. Type `tw`, a space,
a bang, and any `key:value` params — hit Enter.

```
tw !s title:"A new species" year_start:2020 author_id:1,2
   └┬┘ └──────────────┬───────────────────┘ └─────┬─────┘
    │                 │                           └── array param
    │                 └── namespaced params (any key the filter accepts)
    └── bang picks the filter task (sources, here)
```

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
| `tw !col Aedes aegypti`              | Catalogue of Life search                          |
| `tw !clb datasetKey:3LR Trifolium`   | ChecklistBank query pinned to a dataset           |
| `tw !orcid Guralnick`                | ORCID people search                               |
| `tw !bn "Smith, J."`                 | Bionomia roster search                            |
| `tw !doi 10.1234/abcd`               | Resolve a DOI via `dx.doi.org`                    |
| `tw !gnp Aedes aegypti L.`           | GN Parser (with details)                          |
| `tw !t Apis |`                       | Open taxon names filter in a new tab              |
| `tw !col Aedes aegypti ||`           | Open CoL result in a new **background** tab       |
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
  them: `key:"a, b"`.
- **Instance selector** — `@name` anywhere in the input picks which configured
  TaxonWorks host to send to. No `@name` means "use the configured default".
  Ignored for external service bangs.
- **Bare terms** — anything not matching the above is joined with spaces:
  - TW filters → sent as `query_term=...`, which most filters use as a loose
    full-text match.
  - External services → substituted into the `{}` placeholder in the service's
    URL template.
- **Tab-disposition markers** — a trailing ` |` (space then pipe) forces the
  result into a new foreground tab; trailing ` ||` forces a new background
  tab (current tab keeps focus). The marker must be the last whitespace-
  separated token in the query; values like `foo|bar` or `Apis||` (no
  preceding space) are treated as regular content, so there's no collision
  with query values that happen to contain `|`. `|` is Shift+Backslash on a
  US layout, directly above Enter, so no hand movement between completing
  the query and marking the disposition. Overrides both the key-modifier
  behavior (Alt+Enter, etc.) and the configured default below.

## Tab behavior

By default, pressing plain Enter opens the result in the current tab. You can
change this in the options page — pick one of **Current tab**, **New tab**,
or **New background tab**. The full precedence is:

1. **Query marker** — `|` or `||` in the typed query wins.
2. **Modifier-key gesture** — if Firefox hands us an explicit disposition
   (Alt+Enter, Ctrl+Alt+Enter, middle-click), that wins.
3. **Configured default** — the options-page setting above.
4. **Fallback** — current tab.

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

These don't touch a TaxonWorks instance — they're convenience pass-throughs to
biodiversity-informatics services you might reference while working in a
project. Bare terms form the query string (substituted into `{}` in the URL
template); `key:value` tokens are appended as extra URL parameters, so you can
pin a dataset or filter if the destination service supports it. `@instance`
is ignored for external bangs.

Example: `tw !clb datasetKey:3LR Trifolium` →
`https://www.checklistbank.org/nameusage/search?q=Trifolium&datasetKey=3LR`

### Nomenclature & taxonomy

| Bang(s)                                 | Service                        |
| --------------------------------------- | ------------------------------ |
| `!iczn`                                 | ICZN                           |
| `!ictv`                                 | ICTV                           |
| `!zb`                                   | ZooBank                        |
| `!ipni`                                 | IPNI                           |
| `!pow`                                  | Plants of the World (Kew)      |
| `!trop` / `!tropicos`                   | Tropicos                       |
| `!sn` / `!scalenet`                     | ScaleNet                       |
| `!wsc` / `!spider`                      | World Spider Catalog           |
| `!wikispecies`                          | Wikispecies                    |

### Checklists & catalogues

| Bang(s)       | Service            |
| ------------- | ------------------ |
| `!col`        | Catalogue of Life  |
| `!clb`        | ChecklistBank      |
| `!eol`        | Encyclopedia of Life |

### Occurrence data

| Bang(s)   | Service                       |
| --------- | ----------------------------- |
| `!gbif`   | GBIF species                  |
| `!idig`   | iDigBio                       |
| `!vernet` | VertNet                       |
| `!inat`   | iNaturalist                   |
| `!obis`   | OBIS                          |
| `!ala`    | Atlas of Living Australia     |

### Molecular & specimen

| Bang    | Service      |
| ------- | ------------ |
| `!bold` | BOLD Systems |

### People, institutions & attribution

| Bang    | Service   |
| ------- | --------- |
| `!orcid`| ORCID     |
| `!bn`   | Bionomia (roster search) |
| `!ror`  | ROR       |

### Literature & citations

| Bang(s)                                 | Service                             |
| --------------------------------------- | ----------------------------------- |
| `!bhl`                                  | Biodiversity Heritage Library       |
| `!plazi`                                | Plazi TreatmentBank                 |
| `!pubmed`                               | PubMed                              |
| `!gs` / `!scholar`                      | Google Scholar                      |
| `!crossref`                             | Crossref                            |
| `!doi`                                  | DOI resolver (`dx.doi.org`)         |
| `!alex` / `!oa` / `!openalex`           | OpenAlex                            |
| `!wos`                                  | Web of Science                      |

### Data repositories

| Bang(s)               | Service |
| --------------------- | ------- |
| `!dryad`              | Dryad   |
| `!zen` / `!zenodo`    | Zenodo  |

### Scientific-name parsing & verification

| Bang(s)                                 | Service                           |
| --------------------------------------- | --------------------------------- |
| `!gnp` / `!gnparser`                    | Global Names Parser (HTML output) |
| `!gnv` / `!gnverify` / `!gnverifier`    | Global Names Verifier             |

## Example suggestions in the dropdown

If you type a bang with no further query (e.g. `tw !col`), the omnibox
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

- **External-service bangs** (e.g. `!col`, `!gbif`, `!doi`) send your query
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

## Publishing status

Not yet published on addons.mozilla.org. Until it is, use the temporary
install instructions above.
