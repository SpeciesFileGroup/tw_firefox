// Four kinds of bang targets:
//   - Internal filter: { path, label }      → /tasks/<path>/filter
//   - Internal task:   { fullPath, label }  → /tasks/<fullPath>   (non-filter
//                                             tasks like browse / new_foo)
//   - Raw path:        { rawPath, label }   → <rawPath>           (absolute,
//                                             for top-level pages like /hub).
//                                             May contain `{}` as a placeholder
//                                             that is filled with the URL-encoded
//                                             bare query (or `id:` fallback).
//                                             Optional `defaultArg`: if set,
//                                             substitutes for `{}` when the
//                                             user provides no bare/id value
//                                             (e.g. `defaultArg: 'list'` so
//                                             `!proj` → `/projects/list`).
//                                             Without `defaultArg` an empty
//                                             value collapses `/foo/{}` to
//                                             `/foo` (no trailing slash).
//   - External:        { url, label }       → arbitrary URL template; `{}` is
//                                             replaced with the URL-encoded query.
//                                             Optional `dualSigil: true`:
//                                             accept either `!key` or `~key`
//                                             (used for project-internal infra
//                                             that happens to live on a third-
//                                             party host, e.g. the GitHub
//                                             issue tracker).
//                                             Optional `numericUrl`: alternate
//                                             template used when the bare query
//                                             is purely digits — lets a tracker
//                                             bang direct-nav to a specific id
//                                             (`!issue 1234` → /issues/1234)
//                                             while non-numeric input still
//                                             routes through `url` (search).
//                                             Optional `keyValueInQuery: true`:
//                                             fold `key:value` tokens into the
//                                             `{}` substitution instead of
//                                             appending them as separate URL
//                                             params. For services whose own
//                                             search syntax uses `key:value`
//                                             (GitHub, Stack Overflow, …) so
//                                             `~issue is:closed` ends up as
//                                             `q=...+is:closed` rather than
//                                             a stray `&is=closed`.
// Either kind may include an optional `examples: [{ query, hint }]` that the
// omnibox shows as dropdown suggestions when the user has typed the bang and
// no further query. `query` is what fills in; `hint` is a short explanation.
// Multiple aliases may point to the same target.
// Shared target objects — aliases that should all surface the same examples
// reference the same object. If you add a new alias for one of these, point
// it at the existing const rather than cloning.
const PROJECT_TARGET = {
  rawPath: '/projects/{}', label: 'Project',
  // No id given → list all projects (`/projects` itself routes through a
  // "new or list?" landing page; `/projects/list` is what users actually want).
  defaultArg: 'list',
  examples: [
    { query: '',       hint: 'list all projects' },
    { query: '13',     hint: 'view project 13' },
    { query: 'id:13',  hint: 'same, key:value form' }
  ]
};

// Project switcher. The bang sets the project context as a server-side
// session cookie and then redirects to the user's workbench starting page.
//
// `sequential: true` marks this as a valid head of a `;` chain — i.e. the
// nav has a session-side-effect that subsequent navs depend on. Without
// this flag, `;` is rejected (sequencing two unrelated navs is just
// wasteful — the user would have typed the second URL directly).
const PROJECT_SELECT_TARGET = {
  rawPath: '/projects/{}/select',
  label: 'Select project',
  sequential: true,
  examples: [
    { query: '50',                        hint: 'select project 50' },
    { query: 'id:50',                     hint: 'same, key:value form' },
    { query: '50 ; !dtn 3893823',         hint: 'select 50, then view taxon name 3893823' }
  ]
};

const USER_TARGET = {
  rawPath: '/users/{}', label: 'User',
  // Bare `/users` is the index; with an id it shows the user's profile.
  examples: [
    { query: '',        hint: 'list all users' },
    { query: '277',     hint: 'view user 277' },
    { query: 'id:277',  hint: 'same, key:value form' }
  ]
};

// Project / community resources — third-party hosted but project-internal
// in spirit, so reachable via either sigil (`dualSigil: true`).
const SFG_TARGET = {
  url: 'https://speciesfilegroup.org',
  label: 'Species File Group',
  dualSigil: true
};

const EVENTS_TARGET = {
  url: 'https://speciesfilegroup.org/events.html',
  label: 'SFG events',
  dualSigil: true
};

const DONATE_TARGET = {
  url: 'https://www.givecampus.com/campaigns/49638/donations/new',
  label: 'Donate to Species File Group',
  dualSigil: true
};

// matrix.to is the standard Matrix-room launcher — friendlier than
// hard-coding Element web (lets users open in any Matrix client) but
// still requires a Matrix account to actually read messages. There is
// no general-purpose read-without-sign-on view for Matrix rooms.
const CHAT_TARGET = {
  url: 'https://matrix.to/#/#TaxonWorks:gitter.im',
  label: 'TaxonWorks chat (Matrix)',
  dualSigil: true
};

const TOGETHER_TARGET = {
  url: 'https://together.taxonworks.org',
  label: 'TaxonWorks Together',
  dualSigil: true
};

// Cheatsheet — the omnibox handler intercepts this sentinel `url` and
// navigates to cheatsheet.html (an extension page that lists every
// bang from BANGS + bangOverrides). dualSigil so `!help` and `~help`
// both resolve.
const CHEATSHEET_TARGET = {
  url: '__tw_cheatsheet__',
  label: 'Bang cheatsheet',
  dualSigil: true
};

// Options / settings page — sentinel intercepted in onInputEntered and
// swapped for runtime.getURL('options.html'). dualSigil for the same
// "doesn't matter which sigil" reason.
const OPTIONS_TARGET = {
  url: '__tw_options__',
  label: 'Extension settings',
  dualSigil: true
};

// Public room link for the SFG community-consult calls — same URL that's
// listed on speciesfilegroup.org/events.html.
const ZOOM_TARGET = {
  url: 'https://illinois.zoom.us/my/sfgcommons?pwd=eVI4UkdIUzdIYXRIcUhreVdES2ZQQT09',
  label: 'SFG Commons Zoom',
  dualSigil: true
};

// `dualSigil: true` lets this target be reached by either `!issue` or
// `~issue`. The TaxonWorks issue tracker is hosted on GitHub but functions
// as project-internal infra, so insisting on the `~` (external) sigil
// would be a usability hit.
const ISSUES_TARGET = {
  url: 'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+{}',
  // Pure-digit input direct-navs to a specific issue rather than searching
  // for the literal number string.
  numericUrl: 'https://github.com/SpeciesFileGroup/taxonworks/issues/{}',
  // GitHub's issue search uses `is:open`, `author:foo`, etc. inside `q=`.
  // Fold `key:value` tokens into the search string rather than turning
  // them into stray URL params (which GitHub would ignore).
  keyValueInQuery: true,
  label: 'TaxonWorks issues (GitHub)',
  dualSigil: true,
  examples: [
    { query: '',                        hint: 'all issues' },
    { query: 'is:open morphology',       hint: 'open issues mentioning "morphology"' },
    { query: 'is:closed author:mjy',    hint: 'closed issues by @mjy' },
    { query: '1234',                    hint: 'open issue #1234 directly' }
  ]
};

const SOURCES_TARGET = {
  path: 'sources', label: 'Sources',
  examples: [
    { query: 'title:"new species" year_start:2020', hint: 'title + year window' },
    { query: 'author_id:1,2',                       hint: 'filter by author(s)' },
    { query: 'with_doi:true',                       hint: 'sources with a DOI' }
  ]
};

const TAXON_NAMES_TARGET = {
  path: 'taxon_names', label: 'Taxon names',
  examples: [
    { query: 'name:Apis',              hint: 'name lookup' },
    { query: 'name:Apis rank:genus',   hint: 'filtered by rank' },
    { query: 'author:Linnaeus',        hint: 'by authority' }
  ]
};

const COLLECTION_OBJECTS_TARGET = {
  path: 'collection_objects', label: 'Collection objects',
  examples: [
    { query: 'year:2020',            hint: 'collected in a given year' },
    { query: 'collector_id:42',      hint: 'by collector' },
    { query: 'taxon_name_id:1234',   hint: 'by determined name' }
  ]
};

const BROWSE_TAXONOMY_TARGET = {
  fullPath: 'nomenclature/browse', label: 'Browse taxonomy',
  examples: [
    { query: 'taxon_name_id:1',  hint: 'root of the tree' },
    { query: 'Apidae',           hint: 'search by name' }
  ]
};

const NEW_TAXON_NAME_TARGET = {
  fullPath: 'nomenclature/new_taxon_name', label: 'New taxon name'
};

const BROWSE_OTU_TARGET = { fullPath: 'otus/browse',                label: 'Browse OTU' };
const BROWSE_IMG_TARGET = { fullPath: 'images/browse',              label: 'Browse images' };
const NEW_OTU_TARGET    = { fullPath: 'otus/new_otu',               label: 'New OTU' };
const NEW_IMG_TARGET    = { fullPath: 'images/new_image',           label: 'New image' };
const NEW_SOURCE_TARGET  = { fullPath: 'sources/new_source',         label: 'New source' };
const SOURCES_HUB_TARGET = { fullPath: 'sources/hub',                label: 'Sources hub' };

const GN_PARSER_TARGET = {
  url: 'https://parser.globalnames.org/?format=html&names={}&with_details=on',
  label: 'GN Parser',
  examples: [
    { query: 'Aedes aegypti L.',                                  hint: 'basic parse' },
    { query: 'Aedes (Stegomyia) aegypti (L.)',                    hint: 'subgenus + parenthetical author' },
    { query: 'Apis mellifera subsp. carnica',                     hint: 'infraspecific rank' },
    { query: 'code:zoological Alces alces (Linnaeus, 1758)',      hint: 'pin to zoological code' }
  ]
};

const BANGS = {
  // --- TaxonWorks filter tasks (internal) ---
  // Each filter resource also gets an `f<short>` alias mirroring the
  // `b<short>` browse / `n<short>` new conventions, so users who guess
  // `!fco` ("filter collection objects") land on the right page.
  s:           SOURCES_TARGET,
  fs:          SOURCES_TARGET,
  src:         SOURCES_TARGET,
  source:      SOURCES_TARGET,

  t:           TAXON_NAMES_TARGET,
  ftn:         TAXON_NAMES_TARGET,
  tn:          TAXON_NAMES_TARGET,
  n:           TAXON_NAMES_TARGET,
  name:        TAXON_NAMES_TARGET,

  tnr:         { path: 'taxon_name_relationships',    label: 'Taxon name relationships' },
  ftnr:        { path: 'taxon_name_relationships',    label: 'Taxon name relationships' },
  rel:         { path: 'taxon_name_relationships',    label: 'Taxon name relationships' },

  // `fo` is field_occurrences (predates the f-prefix convention), so the
  // `f<short>` alias for otus is `fotu`, not `fo`.
  o:           { path: 'otus',                        label: 'OTUs' },
  fotu:        { path: 'otus',                        label: 'OTUs' },
  otu:         { path: 'otus',                        label: 'OTUs' },

  co:          COLLECTION_OBJECTS_TARGET,
  fco:         COLLECTION_OBJECTS_TARGET,
  specimen:    COLLECTION_OBJECTS_TARGET,
  obj:         COLLECTION_OBJECTS_TARGET,

  fo:          { path: 'field_occurrences',           label: 'Field occurrences' },
  ffield:      { path: 'field_occurrences',           label: 'Field occurrences' },
  field:       { path: 'field_occurrences',           label: 'Field occurrences' },

  ce:          { path: 'collecting_events',           label: 'Collecting events' },
  fce:         { path: 'collecting_events',           label: 'Collecting events' },
  event:       { path: 'collecting_events',           label: 'Collecting events' },

  ad:          { path: 'asserted_distributions',      label: 'Asserted distributions' },
  fad:         { path: 'asserted_distributions',      label: 'Asserted distributions' },
  dist:        { path: 'asserted_distributions',      label: 'Asserted distributions' },

  ba:          { path: 'biological_associations',     label: 'Biological associations' },
  fba:         { path: 'biological_associations',     label: 'Biological associations' },
  bio:         { path: 'biological_associations',     label: 'Biological associations' },
  assoc:       { path: 'biological_associations',     label: 'Biological associations' },

  obs:         { path: 'observations',                label: 'Observations' },
  fobs:        { path: 'observations',                label: 'Observations' },
  observation: { path: 'observations',                label: 'Observations' },

  d:           { path: 'descriptors',                 label: 'Descriptors' },
  fd:          { path: 'descriptors',                 label: 'Descriptors' },
  desc:        { path: 'descriptors',                 label: 'Descriptors' },

  i:           { path: 'images',                      label: 'Images' },
  fi:          { path: 'images',                      label: 'Images' },
  img:         { path: 'images',                      label: 'Images' },
  image:       { path: 'images',                      label: 'Images' },

  snd:         { path: 'sounds',                      label: 'Sounds' },
  fsnd:        { path: 'sounds',                      label: 'Sounds' },
  sound:       { path: 'sounds',                      label: 'Sounds' },

  p:           { path: 'people',                      label: 'People' },
  fp:          { path: 'people',                      label: 'People' },
  person:      { path: 'people',                      label: 'People' },
  people:      { path: 'people',                      label: 'People' },

  l:           { path: 'loans',                       label: 'Loans' },
  fl:          { path: 'loans',                       label: 'Loans' },
  loan:        { path: 'loans',                       label: 'Loans' },

  ext:         { path: 'extracts',                    label: 'Extracts' },
  fext:        { path: 'extracts',                    label: 'Extracts' },
  extract:     { path: 'extracts',                    label: 'Extracts' },

  ap:          { path: 'anatomical_parts',            label: 'Anatomical parts' },
  fap:         { path: 'anatomical_parts',            label: 'Anatomical parts' },
  part:        { path: 'anatomical_parts',            label: 'Anatomical parts' },

  // `!ns` is reserved for "new source" below (more frequently used than
  // the namespaces filter). For the namespaces filter use `!namespace`,
  // `!nmsp`, or `!fnmsp`.
  nmsp:        { path: 'namespaces',                  label: 'Namespaces' },
  fnmsp:       { path: 'namespaces',                  label: 'Namespaces' },
  namespace:   { path: 'namespaces',                  label: 'Namespaces' },

  // NOTE: contents filter is mounted under /tasks/content/filter (singular scope).
  cnt:         { path: 'content',                     label: 'Contents' },
  fcnt:        { path: 'content',                     label: 'Contents' },
  content:     { path: 'content',                     label: 'Contents' },

  dwc:         { path: 'dwc_occurrences',             label: 'DwC occurrences' },
  fdwc:        { path: 'dwc_occurrences',             label: 'DwC occurrences' },
  occ:         { path: 'dwc_occurrences',             label: 'DwC occurrences' },

  ann:         { path: 'annotations',                 label: 'Annotations' },
  fann:        { path: 'annotations',                 label: 'Annotations' },
  a:           { path: 'annotations',                 label: 'Annotations' },

  // --- Browse tasks ---
  bt:          BROWSE_TAXONOMY_TARGET,
  btn:         BROWSE_TAXONOMY_TARGET,
  bco:         { fullPath: 'collection_objects/browse',  label: 'Browse collection object' },
  bo:          BROWSE_OTU_TARGET,
  botu:        BROWSE_OTU_TARGET,
  bce:         { fullPath: 'collecting_events/browse',   label: 'Browse collecting event' },
  bfo:         { fullPath: 'field_occurrences/browse',   label: 'Browse field occurrence' },
  bi:          BROWSE_IMG_TARGET,
  bimg:        BROWSE_IMG_TARGET,
  bsnd:        { fullPath: 'sounds/browse',              label: 'Browse sounds' },

  // --- New-record tasks ---
  ntn:         NEW_TAXON_NAME_TARGET,
  nt:          NEW_TAXON_NAME_TARGET,
  nc:          { fullPath: 'nomenclature/new_combination',                           label: 'New combination' },
  no:          NEW_OTU_TARGET,
  notu:        NEW_OTU_TARGET,
  nce:         { fullPath: 'collecting_events/new_collecting_event',                 label: 'New collecting event' },
  nfo:         { fullPath: 'field_occurrences/new_field_occurrences',                label: 'New field occurrence' },
  ni:          NEW_IMG_TARGET,
  nimg:        NEW_IMG_TARGET,
  ns:          NEW_SOURCE_TARGET,   // rebound from namespaces filter (see above)
  nsrc:        NEW_SOURCE_TARGET,
  nnmsp:       { fullPath: 'namespaces/new_namespace',                               label: 'New namespace' },
  nlead:       { fullPath: 'leads/new_lead',                                         label: 'New lead' },
  nad:         { fullPath: 'asserted_distributions/new_asserted_distribution',       label: 'New asserted distribution' },
  next:        { fullPath: 'extracts/new_extract',                                   label: 'New extract' },
  nd:          { fullPath: 'descriptors/new_descriptor',                             label: 'New descriptor' },
  ngaz:        { fullPath: 'gazetteers/new_gazetteer',                               label: 'New gazetteer' },
  nba:         { fullPath: 'biological_associations/new_ba',                         label: 'New biological association' },
  ncnt:        { fullPath: 'containers/new_container',                               label: 'New container' },

  // --- Hubs ---
  hub:         { rawPath:  '/hub',                                                   label: 'Hub' },
  hubt:        { rawPath:  '/hub?list=tasks',                                        label: 'Hub — Tasks' },
  hubf:        { rawPath:  '/hub?list=favorite',                                     label: 'Hub — Favorites' },
  hubd:        { rawPath:  '/hub?list=data',                                         label: 'Hub — Data' },
  shub:        SOURCES_HUB_TARGET,
  hubs:        SOURCES_HUB_TARGET,
  leadshub:    { fullPath: 'leads/hub',                                              label: 'Leads hub' },
  omh:         { fullPath: 'observation_matrices/observation_matrix_hub',            label: 'Observation matrix hub' },

  // --- Projects (view / list) ---
  proj:        PROJECT_TARGET,
  projects:    PROJECT_TARGET,
  nproj:       { rawPath: '/projects/new',                                           label: 'New project' },

  // --- Users / administration ---
  // `!users` mirrors `!proj`: bare → /users (index); `!users 277` → /users/277.
  // `!signup` is the new-user form (admin-only on most instances). The batch
  // form is a separate task page.
  users:        USER_TARGET,
  user:         USER_TARGET,
  signup:       { rawPath: '/signup',                                                label: 'New user (signup)' },
  nuser:        { rawPath: '/signup',                                                label: 'New user' },
  nusers:       { fullPath: 'administrator/batch_add_users',                         label: 'Batch add users' },
  reset:        { rawPath: '/forgot_password',                                       label: 'Reset password' },
  admin:        { rawPath: '/administration',                                        label: 'Administration' },
  useractivity: { rawPath: '/administration/user_activity',                          label: 'User activity dashboard' },
  ua:           { rawPath: '/administration/user_activity',                          label: 'User activity dashboard' },
  dataoverview: { rawPath: '/administration/data_overview',                          label: 'Data overview' },
  datahealth:   { rawPath: '/administration/data_health',                            label: 'Data health' },
  datareindex:  { rawPath: '/administration/data_reindex',                           label: 'Data reindex' },
  dataclass:    { rawPath: '/administration/data_class_summary',                     label: 'Data class summary' },
  cachemaps:    { rawPath: '/administration/cached_maps_status',                     label: 'Cached maps status' },

  // --- Issue tracker (dual-sigil — accepts !issue or ~issue) ---
  issue:        ISSUES_TARGET,
  issues:       ISSUES_TARGET,
  gh:           ISSUES_TARGET,
  git:          ISSUES_TARGET,

  // --- Help / cheatsheet (dual-sigil) ---
  help:         CHEATSHEET_TARGET,
  cheat:        CHEATSHEET_TARGET,

  // --- Extension settings (dual-sigil) ---
  config:       OPTIONS_TARGET,
  settings:     OPTIONS_TARGET,
  cfg:          OPTIONS_TARGET,
  options:      OPTIONS_TARGET,

  // --- Project / community resources (dual-sigil) ---
  sfg:          SFG_TARGET,
  events:       EVENTS_TARGET,
  donate:       DONATE_TARGET,
  give:         DONATE_TARGET,
  chat:         CHAT_TARGET,
  twt:          TOGETHER_TARGET,
  together:     TOGETHER_TARGET,
  zoom:         ZOOM_TARGET,

  // --- Project switcher (sets the active project for your session) ---
  sel:         PROJECT_SELECT_TARGET,
  select:      PROJECT_SELECT_TARGET,
  project:     PROJECT_SELECT_TARGET,

  // --- Dashboards ---
  dashboard:   { rawPath: '/dashboard',                                              label: 'Dashboard' },
  dash:        { rawPath: '/dashboard',                                              label: 'Dashboard' },
  dlo:         { fullPath: 'loans/dashboard',                                        label: 'Loans dashboard' },
  ddwc:        { fullPath: 'dwc/dashboard',                                          label: 'DwC dashboard' },
  omd:         { fullPath: 'observation_matrices/dashboard',                         label: 'Observation matrices dashboard' },

  // --- Additional task pages (specialized / analysis / power-user) ---

  // Sources
  gnf:         { fullPath: 'sources/gnfinder',                                       label: 'GN Finder (extract names from sources)' },
  gnfinder:    { fullPath: 'sources/gnfinder',                                       label: 'GN Finder (extract names from sources)' },
  dpack:       { fullPath: 'sources/documents_packager',                             label: 'Documents packager' },

  // Nomenclature / taxon names. Short alias beside the descriptive one.
  nst:         { fullPath: 'nomenclature/stats',                                     label: 'Nomenclature stats' },
  nomstats:    { fullPath: 'nomenclature/stats',                                     label: 'Nomenclature stats' },
  tns:         { fullPath: 'taxon_names/stats',                                      label: 'Taxon name stats' },
  tnstats:     { fullPath: 'taxon_names/stats',                                      label: 'Taxon name stats' },
  nmatch:      { fullPath: 'nomenclature/match',                                     label: 'Match against nomenclature' },
  pc:          { fullPath: 'nomenclature/paper_catalog',                             label: 'Paper catalog' },
  papercat:    { fullPath: 'nomenclature/paper_catalog',                             label: 'Paper catalog' },
  tntable:     { fullPath: 'taxon_names/table',                                      label: 'Taxon names table' },

  // People + unify (deduplication)
  auth:        { fullPath: 'people/author',                                          label: 'Author list' },
  authors:     { fullPath: 'people/author',                                          label: 'Author list' },
  psum:        { fullPath: 'people/summary',                                         label: 'People summary' },
  unify:       { fullPath: 'unify/objects',                                          label: 'Unify (merge duplicate objects)' },
  unifyp:      { fullPath: 'unify/people',                                           label: 'Unify people (merge duplicate people)' },

  // Project info
  pact:        { fullPath: 'projects/activity',                                      label: 'Project activity' },
  pdata:       { fullPath: 'projects/data',                                          label: 'Project data' },
  pyir:        { fullPath: 'projects/year_in_review',                                label: 'Project year in review' },

  // Imports / exports
  coldp:       { fullPath: 'exports/coldp',                                          label: 'Export — CoLDP' },
  // The exports/nomenclature controller has no `:index` — `/basic` is the
  // user-facing entry point (the basic-export form).
  nex:         { fullPath: 'exports/nomenclature/basic',                             label: 'Export — Nomenclature (basic)' },
  nomexp:      { fullPath: 'exports/nomenclature/basic',                             label: 'Export — Nomenclature (basic)' },
  dim:         { fullPath: 'dwca_import',                                            label: 'DwC-A import' },
  dwcimport:   { fullPath: 'dwca_import',                                            label: 'DwC-A import' },
  gim:         { fullPath: 'gazetteers/import_gazetteers',                           label: 'Import gazetteers' },
  gazimport:   { fullPath: 'gazetteers/import_gazetteers',                           label: 'Import gazetteers' },

  // Controlled vocabularies / labels
  cvm:         { fullPath: 'controlled_vocabularies/manage',                         label: 'Controlled vocabulary manager' },
  // The topics_hub controller registers its index as `get 'index'` (not
  // `get '/'`), so the URL is /tasks/.../topics_hub/index — appended here.
  topics:      { fullPath: 'controlled_vocabularies/topics_hub/index',               label: 'Topics hub' },
  // The biocuration controller has no `:index` — `/build_collection` is the
  // form users actually want.
  biocur:      { fullPath: 'controlled_vocabularies/biocuration/build_collection',   label: 'Biocuration (build collection)' },
  labels:      { fullPath: 'labels/print_labels',                                    label: 'Print labels' },
  plabels:     { fullPath: 'labels/print_labels',                                    label: 'Print labels' },

  // Collection-object workflows
  dig:         { fullPath: 'collection_objects/freeform_digitize',                   label: 'Freeform digitize' },
  digitize:    { fullPath: 'collection_objects/freeform_digitize',                   label: 'Freeform digitize' },
  gdig:        { fullPath: 'collection_objects/grid_digitize',                       label: 'Grid digitize' },
  gdigitize:   { fullPath: 'collection_objects/grid_digitize',                       label: 'Grid digitize' },
  cotable:     { fullPath: 'collection_objects/table',                               label: 'Collection objects table' },
  cosum:       { fullPath: 'collection_objects/summary',                             label: 'Collection objects summary' },
  comatch:     { fullPath: 'collection_objects/match',                               label: 'Match collection objects' },

  // Observation matrices
  ikey:        { fullPath: 'observation_matrices/interactive_key',                   label: 'Interactive key' },
  nmatrix:     { fullPath: 'observation_matrices/new_matrix',                        label: 'New observation matrix' },
  // `mview` accepts an optional matrix id: `!mview 5` → /tasks/.../view/5;
  // bare `!mview` collapses to /tasks/.../view (the index).
  mview:       { rawPath: '/tasks/observation_matrices/view/{}',                     label: 'View observation matrix' },
  imx:         { fullPath: 'observation_matrices/image_matrix',                      label: 'Image matrix' },
  imatrix:     { fullPath: 'observation_matrices/image_matrix',                      label: 'Image matrix' },

  // Biological associations
  bag:         { fullPath: 'biological_associations/biological_associations_graph',  label: 'Biological associations graph' },
  basum:       { fullPath: 'biological_associations/summary',                        label: 'Biological associations summary' },

  // Other tasks
  odup:        { fullPath: 'otus/duplicates',                                        label: 'OTU duplicates' },
  bad:         { fullPath: 'otus/browse_asserted_distributions',                     label: 'Browse asserted distributions' },
  cemeta:      { fullPath: 'collecting_events/metadata',                             label: 'Collecting events metadata' },
  cesp:        { fullPath: 'collecting_events/spatial_summary',                      label: 'Collecting events spatial summary' },
  cespatial:   { fullPath: 'collecting_events/spatial_summary',                      label: 'Collecting events spatial summary' },
  dkey:        { fullPath: 'leads/dichotomous_key',                                  label: 'Dichotomous key' },
  news:        { fullPath: 'news/browse',                                            label: 'News' },
  etype:       { fullPath: 'type_material/edit_type_material',                       label: 'Edit type material' },

  // Stepwise data-curation workflows. The two `parse/stepwise` routes
  // register their action as `get 'index'` (not `get '/'`), so /index is
  // part of the path; the other two use `get '/', action: :index`.
  stepdates:   { fullPath: 'collecting_events/parse/stepwise/dates/index',           label: 'Stepwise dates parser' },
  stepll:      { fullPath: 'collecting_events/parse/stepwise/lat_long/index',        label: 'Stepwise lat/long parser' },
  stepcoll:    { fullPath: 'collecting_events/stepwise/collectors',                  label: 'Stepwise collectors' },
  stepdet:     { fullPath: 'collection_objects/stepwise/determinations',             label: 'Stepwise determinations' },

  // --- Data resource pages (the items on /hub?list=data) ---
  // `d<short>` jumps to the standard Rails REST resource for that model.
  // Bare → `/<plural>` index; with a numeric (or `id:N`) argument → the
  // record's show page `/<plural>/<id>`. Pairs naturally with `!sel` —
  // `!sel 13 ; !dtn 5` selects project 13 then deep-links to taxon name 5.
  // Skipped where the prefix collides with an existing alias:
  //   `dlo` → loans dashboard (use `dl` for loans data)
  //   `ddwc` → DwC dashboard (use `docc` for DwC occurrences data)
  //   `d`/`desc` → descriptors filter (use `ddesc` for descriptors data)
  // Annotations has no `/annotations` resource so there's no `dann`.
  ds:          { rawPath: '/sources/{}',                     label: 'Sources data' },
  dtn:         { rawPath: '/taxon_names/{}',                 label: 'Taxon names data' },
  dtnr:        { rawPath: '/taxon_name_relationships/{}',    label: 'Taxon name relationships data' },
  dotu:        { rawPath: '/otus/{}',                        label: 'OTUs data' },
  do:          { rawPath: '/otus/{}',                        label: 'OTUs data' },
  dco:         { rawPath: '/collection_objects/{}',          label: 'Collection objects data' },
  dfo:         { rawPath: '/field_occurrences/{}',           label: 'Field occurrences data' },
  dce:         { rawPath: '/collecting_events/{}',           label: 'Collecting events data' },
  dad:         { rawPath: '/asserted_distributions/{}',      label: 'Asserted distributions data' },
  dba:         { rawPath: '/biological_associations/{}',     label: 'Biological associations data' },
  dobs:        { rawPath: '/observations/{}',                label: 'Observations data' },
  ddesc:       { rawPath: '/descriptors/{}',                 label: 'Descriptors data' },
  di:          { rawPath: '/images/{}',                      label: 'Images data' },
  dsnd:        { rawPath: '/sounds/{}',                      label: 'Sounds data' },
  dp:          { rawPath: '/people/{}',                      label: 'People data' },
  dl:          { rawPath: '/loans/{}',                       label: 'Loans data' },
  dext:        { rawPath: '/extracts/{}',                    label: 'Extracts data' },
  dap:         { rawPath: '/anatomical_parts/{}',            label: 'Anatomical parts data' },
  dnmsp:       { rawPath: '/namespaces/{}',                  label: 'Namespaces data' },
  // The contents filter is at /tasks/content/filter (singular), but the
  // REST resource route is /contents (plural). Match the route here.
  dcnt:        { rawPath: '/contents/{}',                    label: 'Contents data' },
  docc:        { rawPath: '/dwc_occurrences/{}',             label: 'DwC occurrences data' },

  // --- More data resources (the rest of /hub?list=data, alphabetical) ---
  // Same shape as above: bare → /<plural> index; with id → record show.
  // Where a `d<canonical-short>` collision was unavoidable, the chosen
  // alias diverges (e.g. `dotur` for otu_relationships since `dotu` is
  // OTUs; `ddload` for downloads since `dl` is loans).
  dav:         { rawPath: '/alternate_values/{}',                  label: 'Alternate values data' },
  dattr:       { rawPath: '/attributions/{}',                      label: 'Attributions data' },
  dbag:        { rawPath: '/biological_associations_graphs/{}',    label: 'Biological associations graphs data' },
  dbr:         { rawPath: '/biological_relationships/{}',          label: 'Biological relationships data' },
  dci:         { rawPath: '/container_items/{}',                   label: 'Container items data' },
  dcit:        { rawPath: '/citations/{}',                         label: 'Citations data' },
  dcn:         { rawPath: '/common_names/{}',                      label: 'Common names data' },
  dconf:       { rawPath: '/confidences/{}',                       label: 'Confidences data' },
  dcont:       { rawPath: '/containers/{}',                        label: 'Containers data' },
  dconv:       { rawPath: '/conveyances/{}',                       label: 'Conveyances data' },
  dcoo:        { rawPath: '/collection_object_observations/{}',    label: 'Collection object observations data' },
  dcprof:      { rawPath: '/collection_profiles/{}',               label: 'Collection profiles data' },
  dcs:         { rawPath: '/character_states/{}',                  label: 'Character states data' },
  dcvt:        { rawPath: '/controlled_vocabulary_terms/{}',       label: 'Controlled vocabulary terms data' },
  dda:         { rawPath: '/data_attributes/{}',                   label: 'Data attributes data' },
  ddep:        { rawPath: '/depictions/{}',                        label: 'Depictions data' },
  ddoc:        { rawPath: '/documents/{}',                         label: 'Documents data' },
  ddocu:       { rawPath: '/documentation/{}',                     label: 'Documentation data' },
  ddload:      { rawPath: '/downloads/{}',                         label: 'Downloads data' },
  dgarea:      { rawPath: '/geographic_areas/{}',                  label: 'Geographic areas data' },
  dgaz:        { rawPath: '/gazetteers/{}',                        label: 'Gazetteers data' },
  dgene:       { rawPath: '/gene_attributes/{}',                   label: 'Gene attributes data' },
  dgeoref:     { rawPath: '/georeferences/{}',                     label: 'Georeferences data' },
  did:         { rawPath: '/identifiers/{}',                       label: 'Identifiers data' },
  dimports:    { rawPath: '/import_datasets/{}',                   label: 'Import datasets data' },
  dlbl:        { rawPath: '/labels/{}',                            label: 'Labels data' },
  dlead:       { rawPath: '/leads/{}',                             label: 'Leads data' },
  dli:         { rawPath: '/loan_items/{}',                        label: 'Loan items data' },
  dnote:       { rawPath: '/notes/{}',                             label: 'Notes data' },
  dom:         { rawPath: '/observation_matrices/{}',              label: 'Observation matrices data' },
  domci:       { rawPath: '/observation_matrix_column_items/{}',   label: 'Observation matrix column items data' },
  domri:       { rawPath: '/observation_matrix_row_items/{}',      label: 'Observation matrix row items data' },
  dopl:        { rawPath: '/otu_page_layouts/{}',                  label: 'OTU page layouts data' },
  dor:         { rawPath: '/origin_relationships/{}',              label: 'Origin relationships data' },
  dorg:        { rawPath: '/organizations/{}',                     label: 'Organizations data' },
  dotur:       { rawPath: '/otu_relationships/{}',                 label: 'OTU relationships data' },
  dpr:         { rawPath: '/protocol_relationships/{}',            label: 'Protocol relationships data' },
  dprep:       { rawPath: '/preparation_types/{}',                 label: 'Preparation types data' },
  dprojsrc:    { rawPath: '/project_sources/{}',                   label: 'Project sources data' },
  dproto:      { rawPath: '/protocols/{}',                         label: 'Protocols data' },
  drepo:       { rawPath: '/repositories/{}',                      label: 'Repositories data' },
  drlc:        { rawPath: '/ranged_lot_categories/{}',             label: 'Ranged lot categories data' },
  dseq:        { rawPath: '/sequences/{}',                         label: 'Sequences data' },
  dseqr:       { rawPath: '/sequence_relationships/{}',            label: 'Sequence relationships data' },
  dser:        { rawPath: '/serials/{}',                           label: 'Serials data' },
  dtag:        { rawPath: '/tags/{}',                              label: 'Tags data' },
  dtd:         { rawPath: '/taxon_determinations/{}',              label: 'Taxon determinations data' },
  dtm:         { rawPath: '/type_materials/{}',                    label: 'Type materials data' },
  dtnc:        { rawPath: '/taxon_name_classifications/{}',        label: 'Taxon name classifications data' },

  // --- External biodiversity services (pass-through search) ---
  col:   { url: 'https://www.catalogueoflife.org/data/search?q={}',                                  label: 'Catalogue of Life',
           examples: [
             { query: 'Aedes aegypti', hint: 'scientific name' },
             { query: 'Homo sapiens',  hint: 'species lookup' }
           ] },
  clb:   { url: 'https://www.checklistbank.org/nameusage/search?q={}',                               label: 'ChecklistBank',
           // Any URL param CLB's nameusage search accepts can be passed as
           // `key:value` after the bang — the parser sends them all as
           // separate query-string params (see buildExternalUrl). The
           // dataset key shortcuts live on CLB's side: 3LR (COL Latest
           // Release), 3LXR (COL eXtended Latest Release), COL25 (COL
           // Annual Checklist 2025), or any numeric dataset id like 2317.
           examples: [
             { query: 'Aedes aegypti',                                                hint: 'scientific name' },
             { query: 'datasetKey:3LR Trifolium',                                     hint: 'scope to a dataset (3LR = COL Latest Release; also COL25, 3LXR, or any id)' },
             { query: 'authorship:Breuning authorshipYear:1938 rank:species',          hint: 'author + year + rank facets' },
             { query: 'nomCode:zoological extinct:false group:coleoptera',            hint: 'code + extinct flag + informal group' },
             { query: 'content:AUTHORSHIP status:synonym Linnaeus',                   hint: 'scope what q searches (content=AUTHORSHIP / SCIENTIFIC_NAME / VERNACULAR_NAME) + status filter' }
           ] },
  gbif:  { url: 'https://www.gbif.org/species/search?q={}',                                          label: 'GBIF species' },
  bhl:   { url: 'https://www.biodiversitylibrary.org/search?searchTerm={}',                          label: 'Biodiversity Heritage Library',
           examples: [
             { query: 'Coccidae monograph',  hint: 'keyword search' },
             { query: 'Aphididae Homoptera', hint: 'multiple keywords' }
           ] },
  inat:  { url: 'https://www.inaturalist.org/search?q={}',                                           label: 'iNaturalist' },
  bold:  { url: 'https://portal.boldsystems.org/result?query={}',                                    label: 'BOLD Systems' },
  worms: { url: 'https://www.marinespecies.org/aphia.php?p=taxlist&tName={}',                        label: 'WoRMS' },
  idig:  { url: 'https://www.idigbio.org/portal/search?rq={}',                                       label: 'iDigBio' },
  orcid: { url: 'https://orcid.org/orcid-search/search?searchQuery={}',                              label: 'ORCID',
           examples: [
             { query: 'Guralnick',          hint: 'surname search' },
             { query: '"Robert Guralnick"', hint: 'full name (quoted)' }
           ] },
  zb:    { url: 'https://zoobank.org/Search?search_include=0&search_terms={}&search_type=name',      label: 'ZooBank',
           examples: [
             { query: 'Apis mellifera', hint: 'name search' }
           ] },
  bn:    { url: 'https://bionomia.net/roster?q={}',                                                  label: 'Bionomia',
           examples: [
             { query: '"Smith, J."',        hint: 'last, first — use quotes' },
             { query: '"Linnaeus, Carl"',   hint: 'full form' }
           ] },
  pow:   { url: 'https://powo.science.kew.org/results?q={}',                                         label: 'Plants of the World (Kew)' },
  sn:       { url: 'https://scalenet.info/catalogue/{}',                                             label: 'ScaleNet' },
  scalenet: { url: 'https://scalenet.info/catalogue/{}',                                             label: 'ScaleNet' },

  ror:         { url: 'https://ror.org/search?query={}',                                             label: 'ROR' },
  gnp:         GN_PARSER_TARGET,
  gnparser:    GN_PARSER_TARGET,
  gnv:         { url: 'https://verifier.globalnames.org/?names={}',                                  label: 'GN Verifier' },
  gnverify:    { url: 'https://verifier.globalnames.org/?names={}',                                  label: 'GN Verifier' },
  gnverifier:  { url: 'https://verifier.globalnames.org/?names={}',                                  label: 'GN Verifier' },
  ipni:        { url: 'https://www.ipni.org/search?q={}',                                            label: 'IPNI' },
  wsc:         { url: 'https://wsc.nmbe.ch/search?query={}',                                         label: 'World Spider Catalog' },
  spider:      { url: 'https://wsc.nmbe.ch/search?query={}',                                         label: 'World Spider Catalog' },
  // Index Fungorum text search is JS-driven and ignores URL params, so
  // bare/non-numeric input lands on the search page for Ctrl+F. Numeric
  // (or `id:N`) routes to the working record-id template.
  if:          { url: 'https://www.indexfungorum.org/names/names.asp',
                 numericUrl: 'https://www.indexfungorum.org/names/NamesRecord.asp?RecordID={}',
                 label: 'Index Fungorum',
                 examples: [
                   { query: '549878',     hint: 'view record by IF RecordID' },
                   { query: 'id:549878',  hint: 'same, key:value form' },
                   { query: 'Boletus',    hint: 'open the search page (manual entry — IF\'s search ignores URL params)' }
                 ] },
  indexfungorum: { url: 'https://www.indexfungorum.org/names/names.asp',
                   numericUrl: 'https://www.indexfungorum.org/names/NamesRecord.asp?RecordID={}',
                   label: 'Index Fungorum' },
  algae:       { url: 'https://www.algaebase.org/search/species/?name={}',                            label: 'AlgaeBase (species)' },
  algaebase:   { url: 'https://www.algaebase.org/search/species/?name={}',                            label: 'AlgaeBase (species)' },
  wikispecies: { url: 'https://species.wikimedia.org/wiki/{}',                                       label: 'Wikispecies' },
  alex:        { url: 'https://openalex.org/works?search.title_and_abstract={}',                     label: 'OpenAlex' },
  oa:          { url: 'https://openalex.org/works?search.title_and_abstract={}',                     label: 'OpenAlex' },
  openalex:    { url: 'https://openalex.org/works?search.title_and_abstract={}',                     label: 'OpenAlex' },
  crossref:    { url: 'https://search.crossref.org/?from_ui=&q={}',                                  label: 'Crossref' },
  doi:         { url: 'https://dx.doi.org/{}',                                                       label: 'DOI',
                 examples: [
                   { query: '10.11646/zootaxa.4758.1.1', hint: 'Zootaxa paper' },
                   { query: '10.5281/zenodo.1234567',    hint: 'Zenodo record' }
                 ] },
  gs:          { url: 'https://scholar.google.com/scholar?q={}',                                     label: 'Google Scholar' },
  scholar:     { url: 'https://scholar.google.com/scholar?q={}',                                     label: 'Google Scholar' },

  vernet:      { url: 'https://www.vertnet.org/occurrence/search?q={}',                              label: 'VertNet' },
  pubmed:      { url: 'https://pubmed.ncbi.nlm.nih.gov/?term={}',                                    label: 'PubMed' },
  obis:        { url: 'https://obis.org/search/?entity=taxon&q={}',                                  label: 'OBIS' },
  eol:         { url: 'https://eol.org/search?utf8=%E2%9C%93&q={}',                                  label: 'Encyclopedia of Life' },
  ala:         { url: 'https://bie.ala.org.au/search?q={}',                                          label: 'Atlas of Living Australia' },
  plazi:       { url: 'https://tb.plazi.org/GgServer/search?fullText.ftQuery={}',                    label: 'Plazi TreatmentBank' },

  dryad:       { url: 'https://datadryad.org/search?q={}',                                           label: 'Dryad' },
  zen:         { url: 'https://zenodo.org/search?q={}',                                              label: 'Zenodo' },
  zenodo:      { url: 'https://zenodo.org/search?q={}',                                              label: 'Zenodo' },
  wos:         { url: 'https://www.webofscience.com/api/gateway?GWVersion=2&SrcApp=WEB&SrcAuth=ProQuest&DestApp=UA&DestLinkType=GeneralSearchSummary&topic={}', label: 'Web of Science' },
  trop:        { url: 'https://www.tropicos.org/name/Search?name={}',                                label: 'Tropicos' },
  tropicos:    { url: 'https://www.tropicos.org/name/Search?name={}',                                label: 'Tropicos' },

  iczn:        { url: 'https://www.iczn.org/home/CustomSearchForm/?Search={}&Source=All&action_customresults=Search', label: 'ICZN' },
  // ICTV's `find_the_species` page is JS-driven and ignores URL params; the
  // `/search/google` endpoint feeds their Google CSE and actually honors
  // `keys=`, matching how !iczn / !icn / !icnp full-text-search their sites.
  ictv:        { url: 'https://ictv.global/search/google?keys={}',                                         label: 'ICTV — virus taxonomy site search' },
  // ICVCN = International Code of Virus Classification and Nomenclature.
  // ICTV publishes the whole code text on a single static page; bang
  // just lands users there for Ctrl+F.
  icvcn:       { url: 'https://ictv.global/about/code',                                                    label: 'ICVCN — virus code (full text)' },
  icn:         { url: 'https://www.iapt-taxon.org/nomen/search.html?zoom_query={}', label: 'ICN (IAPT — algae, fungi, plants)' },
  icnp:        { url: 'https://the-icsp.org/index.php/component/finder/search?q={}',                       label: 'ICNP (ICSP — prokaryotes)' },

  // Mammal Diversity Database. Pure-digit / `id:` input direct-navs to
  // /taxon/<id>/ via numericUrl. Non-numeric input lands on the search
  // page — MDD's search is a client-side React app that doesn't honor
  // URL params, so we can't pre-fill the search box.
  mdd:         { url: 'https://www.mammaldiversity.org/search/',
                 numericUrl: 'https://www.mammaldiversity.org/taxon/{}/',
                 label: 'Mammal Diversity Database',
                 examples: [
                   { query: '1006285',     hint: 'view taxon by MDD id' },
                   { query: 'id:1006285',  hint: 'same, key:value form' },
                   { query: 'Bos taurus',  hint: 'open the search page (manual entry — MDD\'s search ignores URL params)' }
                 ] }
};

// TaxonWorks "throw to another filter" / radial chain support.
// When chaining `!a > !b`, the upstream stage's params are wrapped under the
// upstream target's `queryKey`. TW's filter classes know how to interpret
// `<resource>_query[...]` as a sub-scope. Only filter targets (not browse /
// new / hub / external) chain meaningfully.
const INTERNAL_QUERY_KEYS = {
  'sources':                     'source_query',
  'taxon_names':                 'taxon_name_query',
  'taxon_name_relationships':    'taxon_name_relationship_query',
  'otus':                        'otu_query',
  'collection_objects':          'collection_object_query',
  'field_occurrences':           'field_occurrence_query',
  'collecting_events':           'collecting_event_query',
  'asserted_distributions':      'asserted_distribution_query',
  'biological_associations':     'biological_association_query',
  'observations':                'observation_query',
  'descriptors':                 'descriptor_query',
  'images':                      'image_query',
  'sounds':                      'sound_query',
  'people':                      'person_query',
  'loans':                       'loan_query',
  'extracts':                    'extract_query',
  'anatomical_parts':            'anatomical_part_query',
  'namespaces':                  'namespace_query',
  'content':                     'content_query',
  'dwc_occurrences':             'dwc_occurrence_query',
  'annotations':                 'annotation_query'
};

// Per-filter override for the param name used when the user types bare text
// (no `key:value`). The base-class `Queries::Query::Filter` does NOT handle
// `query_term` generically — only `Queries::Source::Filter` does — so for
// every other filter a bare term routed to `query_term` is silently dropped
// by Rails strong params. Mapping each filter to the right text-search
// attribute (extracted from `lib/queries/<resource>/filter.rb` PARAMS in
// upstream TaxonWorks) makes `tw !tn foo` actually search for "foo".
//
// Filters absent from this map fall through to `query_term` (which works
// for `sources` natively, and is silently ignored elsewhere — same as
// today's behaviour, no regression).
const INTERNAL_BARE_TERM_KEYS = {
  'taxon_names':       'name',
  'otus':              'name',
  'descriptors':       'term',
  'sounds':            'name',
  'people':            'name',
  'anatomical_parts':  'name',
  'namespaces':        'name',
  'content':           'text'
};

// Params that the corresponding TaxonWorks filter declares as arrays
// (`param_name: []` in the filter class PARAMS). When the user types
// `key:value` for one of these, the parser auto-appends `[]` so they don't
// have to type `key[]:value` or `key:value,` themselves.
//
// Snapshot extracted from lib/queries/<resource>/filter.rb. May need
// refreshing when TaxonWorks adds or renames filter params; the existing
// `key[]:value` and `key:value,` escape hatches still work for any params
// missing from this map.
const INTERNAL_ARRAY_PARAMS = {
  'sources':                  new Set('author_id bibtex_type citation_object_type editor_id empty not_empty serial_id source_id taxon_name_id topic_id'.split(' ')),
  'taxon_names':              new Set('cached collecting_event_id collection_object_id combination_taxon_name_id name otu_id parent_id rank taxon_name_author_id taxon_name_classification taxon_name_id taxon_name_relationship_type_either taxon_name_relationship_type_object taxon_name_relationship_type_subject type'.split(' ')),
  'taxon_name_relationships': new Set('object_taxon_name_id subject_taxon_name_id taxon_name_id taxon_name_relationship_id taxon_name_relationship_set taxon_name_relationship_type'.split(' ')),
  'otus':                     new Set('collecting_event_id descriptor_id geo_shape_id geo_shape_type name otu_id taxon_name_id'.split(' ')),
  'collection_objects':       new Set('biocuration_class_id biological_association_id biological_relationship_id collecting_event_id collection_object_id determiner_id extract_id geographic_area_id import_dataset_id is_type loan_id otu_id preparation_type_id taxon_name_id'.split(' ')),
  'field_occurrences':        new Set('biocuration_class_id biological_association_id collecting_event_id determiner_id field_occurrence_id otu_id taxon_name_id'.split(' ')),
  'collecting_events':        new Set('collecting_event_id collection_object_id collector_id geo_shape_id geo_shape_type otu_id'.split(' ')),
  'asserted_distributions':   new Set('asserted_distribution_id asserted_distribution_object_id asserted_distribution_object_type asserted_distribution_shape_type biological_association_id geo_shape_id geo_shape_type geographic_area_id geographic_item_id otu_id source_id taxon_name_id'.split(' ')),
  'biological_associations':  new Set('anatomical_part_id any_global_id biological_association_id biological_association_object_id biological_association_object_type biological_association_subject_id biological_association_subject_type biological_associations_graph_id biological_relationship_id collecting_event_id collection_object_id field_occurrence_id geo_shape_id geo_shape_type object_biological_property_id object_object_global_id object_taxon_name_id otu_id subject_biological_property_id subject_object_global_id subject_taxon_name_id taxon_name_id'.split(' ')),
  'observations':             new Set('charater_state_id collection_object_id descriptor_id geo_shape_id geo_shape_type observation_id observation_matrix_id observation_object_id observation_object_type observation_type otu_id sound_id taxon_name_id'.split(' ')),
  'descriptors':              new Set('descriptor_id descriptor_type observation_matrix_id'.split(' ')),
  'images':                   new Set('biocuration_class_id collection_object_id collection_object_scope copyright_holder_id copyright_holder_organization_id creator_id depiction_object_type editor_id field_occurrence_id field_occurrence_scope image_id license otu_id otu_scope owner_id owner_organization_id sled_image_id source_id taxon_name_id'.split(' ')),
  'sounds':                   new Set('collecting_event_id collection_object_id conveyance_object_type field_occurrence_id otu_id otu_scope sound_id'.split(' ')),
  'people':                   new Set('exact except_project_id except_role only_project_id person_id role with without'.split(' ')),
  'loans':                    new Set('loan_id loan_item_disposition otu_id person_id role taxon_name_id'.split(' ')),
  'extracts':                 new Set('collection_object_id extract_id otu_id repository_id taxon_name_id'.split(' ')),
  'anatomical_parts':         new Set('anatomical_part_id collection_object_id field_occurrence_id origin_object_type otu_id'.split(' ')),
  'content':                  new Set('content_id otu_id topic_id'.split(' ')),
  'dwc_occurrences':          new Set('dwc_occurrence_id empty_rank otu_id person_id taxon_name_id'.split(' '))
};

// Unique target list (dedup'd: internal by path, external by url), sorted by label.
// Used by the options page to populate the custom-bangs target dropdown.
const BANG_TARGETS = (() => {
  const seen = new Map();
  for (const info of Object.values(BANGS)) {
    const key = info.path
      ? `p:${info.path}`
      : info.fullPath
      ? `f:${info.fullPath}`
      : info.rawPath
      ? `r:${info.rawPath}`
      : `u:${info.url}`;
    if (!seen.has(key)) seen.set(key, info);
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
})();
