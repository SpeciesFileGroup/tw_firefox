// Four kinds of bang targets:
//   - Internal filter: { path, label }      → /tasks/<path>/filter
//   - Internal task:   { fullPath, label }  → /tasks/<fullPath>   (non-filter
//                                             tasks like browse / new_foo)
//   - Raw path:        { rawPath, label }   → <rawPath>           (absolute,
//                                             for top-level pages like /hub).
//                                             May contain `{}` as a placeholder
//                                             that is filled with the URL-encoded
//                                             bare query (or `id:` fallback).
//   - External:        { url, label }       → arbitrary URL template; `{}` is
//                                             replaced with the URL-encoded query.
// Either kind may include an optional `examples: [{ query, hint }]` that the
// omnibox shows as dropdown suggestions when the user has typed the bang and
// no further query. `query` is what fills in; `hint` is a short explanation.
// Multiple aliases may point to the same target.
// Shared target objects — aliases that should all surface the same examples
// reference the same object. If you add a new alias for one of these, point
// it at the existing const rather than cloning.
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
  s:           SOURCES_TARGET,
  src:         SOURCES_TARGET,
  source:      SOURCES_TARGET,

  t:           TAXON_NAMES_TARGET,
  tn:          TAXON_NAMES_TARGET,
  n:           TAXON_NAMES_TARGET,
  name:        TAXON_NAMES_TARGET,

  tnr:         { path: 'taxon_name_relationships',    label: 'Taxon name relationships' },
  rel:         { path: 'taxon_name_relationships',    label: 'Taxon name relationships' },

  o:           { path: 'otus',                        label: 'OTUs' },
  otu:         { path: 'otus',                        label: 'OTUs' },

  co:          COLLECTION_OBJECTS_TARGET,
  specimen:    COLLECTION_OBJECTS_TARGET,
  obj:         COLLECTION_OBJECTS_TARGET,

  fo:          { path: 'field_occurrences',           label: 'Field occurrences' },
  field:       { path: 'field_occurrences',           label: 'Field occurrences' },

  ce:          { path: 'collecting_events',           label: 'Collecting events' },
  event:       { path: 'collecting_events',           label: 'Collecting events' },

  ad:          { path: 'asserted_distributions',      label: 'Asserted distributions' },
  dist:        { path: 'asserted_distributions',      label: 'Asserted distributions' },

  ba:          { path: 'biological_associations',     label: 'Biological associations' },
  bio:         { path: 'biological_associations',     label: 'Biological associations' },
  assoc:       { path: 'biological_associations',     label: 'Biological associations' },

  obs:         { path: 'observations',                label: 'Observations' },
  observation: { path: 'observations',                label: 'Observations' },

  d:           { path: 'descriptors',                 label: 'Descriptors' },
  desc:        { path: 'descriptors',                 label: 'Descriptors' },

  i:           { path: 'images',                      label: 'Images' },
  img:         { path: 'images',                      label: 'Images' },
  image:       { path: 'images',                      label: 'Images' },

  snd:         { path: 'sounds',                      label: 'Sounds' },
  sound:       { path: 'sounds',                      label: 'Sounds' },

  p:           { path: 'people',                      label: 'People' },
  person:      { path: 'people',                      label: 'People' },
  people:      { path: 'people',                      label: 'People' },

  l:           { path: 'loans',                       label: 'Loans' },
  loan:        { path: 'loans',                       label: 'Loans' },

  ext:         { path: 'extracts',                    label: 'Extracts' },
  extract:     { path: 'extracts',                    label: 'Extracts' },

  ap:          { path: 'anatomical_parts',            label: 'Anatomical parts' },
  part:        { path: 'anatomical_parts',            label: 'Anatomical parts' },

  // `!ns` is reserved for "new source" below (more frequently used than
  // the namespaces filter). For the namespaces filter use `!namespace` or
  // the short `!nmsp`.
  nmsp:        { path: 'namespaces',                  label: 'Namespaces' },
  namespace:   { path: 'namespaces',                  label: 'Namespaces' },

  // NOTE: contents filter is mounted under /tasks/content/filter (singular scope).
  cnt:         { path: 'content',                     label: 'Contents' },
  content:     { path: 'content',                     label: 'Contents' },

  dwc:         { path: 'dwc_occurrences',             label: 'DwC occurrences' },
  occ:         { path: 'dwc_occurrences',             label: 'DwC occurrences' },

  ann:         { path: 'annotations',                 label: 'Annotations' },
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

  // --- Project switcher ---
  sel:         { rawPath: '/projects/{}/select',                                     label: 'Select project',
                 examples: [
                   { query: '50',    hint: 'select project 50' },
                   { query: 'id:50', hint: 'same, key:value form' }
                 ] },
  project:     { rawPath: '/projects/{}/select',                                     label: 'Select project' },

  // --- Dashboards ---
  dlo:         { fullPath: 'loans/dashboard',                                        label: 'Loans dashboard' },
  ddwc:        { fullPath: 'dwc/dashboard',                                          label: 'DwC dashboard' },
  omd:         { fullPath: 'observation_matrices/dashboard',                         label: 'Observation matrices dashboard' },

  // --- External biodiversity services (pass-through search) ---
  col:   { url: 'https://www.catalogueoflife.org/data/search?q={}',                                  label: 'Catalogue of Life',
           examples: [
             { query: 'Aedes aegypti', hint: 'scientific name' },
             { query: 'Homo sapiens',  hint: 'species lookup' }
           ] },
  clb:   { url: 'https://www.checklistbank.org/nameusage/search?q={}',                               label: 'ChecklistBank',
           examples: [
             { query: 'Aedes aegypti',      hint: 'scientific name' },
             { query: 'datasetKey:2317',    hint: '3i (dataset 2317)' },
             { query: 'datasetKey:COL25',   hint: 'COL Annual Checklist 2025' },
             { query: 'datasetKey:3LR',     hint: 'COL Latest Release' },
             { query: 'datasetKey:3LXR',    hint: 'COL eXtended Latest Release' }
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
  ictv:        { url: 'https://ictv.global/search/find_the_species?search_text={}&search_modifier=contains', label: 'ICTV' }
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
