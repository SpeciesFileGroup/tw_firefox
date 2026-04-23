const test = require('node:test');
const assert = require('node:assert');
const { loadExtension } = require('./helpers.js');

const HOST = 'https://sfg.taxonworks.org';

// Helper: run resolveAndBuild with a given input and optional sandbox config,
// return just the URL for easy asserting.
async function url(input, opts = {}) {
  const ext = loadExtension(opts);
  const r = await ext.resolveAndBuild(input);
  return r.url;
}

// -------- Internal filter URLs (path → /tasks/<path>/filter) --------

test('internal filter: bare bang → bare filter URL on default host', async () => {
  assert.equal(await url('!t'), `${HOST}/tasks/taxon_names/filter`);
});

test('internal filter: scalar key:value', async () => {
  assert.equal(await url('!s title:Apis'), `${HOST}/tasks/sources/filter?title=Apis`);
});

test('internal filter: quoted value with spaces', async () => {
  assert.equal(
    await url('!s title:"A new species"'),
    `${HOST}/tasks/sources/filter?title=A%20new%20species`
  );
});

test('internal filter: bare terms become query_term', async () => {
  assert.equal(
    await url('!s new species 2020'),
    `${HOST}/tasks/sources/filter?query_term=new%20species%202020`
  );
});

// -------- Auto-bracketing (INTERNAL_ARRAY_PARAMS) --------

test('auto-array: bibtex_type is known array → auto-brackets', async () => {
  assert.equal(
    await url('!s bibtex_type:book'),
    `${HOST}/tasks/sources/filter?bibtex_type[]=book`
  );
});

test('auto-array: multi-value via comma', async () => {
  assert.equal(
    await url('!s bibtex_type:book,article'),
    `${HOST}/tasks/sources/filter?bibtex_type[]=book&bibtex_type[]=article`
  );
});

test('auto-array: explicit [] syntax with single value', async () => {
  assert.equal(
    await url('!s bibtex_type[]:book'),
    `${HOST}/tasks/sources/filter?bibtex_type[]=book`
  );
});

test('auto-array: explicit [] plus comma does not double-bracket', async () => {
  assert.equal(
    await url('!s bibtex_type[]:book,article'),
    `${HOST}/tasks/sources/filter?bibtex_type[]=book&bibtex_type[]=article`
  );
});

test('auto-array: unknown param stays scalar', async () => {
  assert.equal(
    await url('!s totally_unknown:hello'),
    `${HOST}/tasks/sources/filter?totally_unknown=hello`
  );
});

test('auto-array: known scalar param (not in array set) stays scalar', async () => {
  // `title` is scalar in the source filter's PARAMS (not an array)
  assert.equal(
    await url('!s title:Apis'),
    `${HOST}/tasks/sources/filter?title=Apis`
  );
});

// -------- Non-filter tasks (fullPath) --------

test('fullPath: browse taxonomy', async () => {
  assert.equal(await url('!bt'), `${HOST}/tasks/nomenclature/browse`);
});

test('fullPath: browse taxonomy with param', async () => {
  assert.equal(
    await url('!bt taxon_name_id:1'),
    `${HOST}/tasks/nomenclature/browse?taxon_name_id=1`
  );
});

test('fullPath: new taxon name (no params)', async () => {
  assert.equal(await url('!ntn'), `${HOST}/tasks/nomenclature/new_taxon_name`);
});

// -------- Top-level rawPath --------

test('rawPath: /hub', async () => {
  assert.equal(await url('!hub'), `${HOST}/hub`);
});

test('rawPath: /hub?list=favorite', async () => {
  assert.equal(await url('!hubf'), `${HOST}/hub?list=favorite`);
});

test('rawPath: appends extra params with & when query already present', async () => {
  assert.equal(
    await url('!hubf foo:1'),
    `${HOST}/hub?list=favorite&foo=1`
  );
});

test('rawPath: {} substitution from bare term', async () => {
  assert.equal(await url('!sel 50'), `${HOST}/projects/50/select`);
});

test('rawPath: {} substitution from id: fallback', async () => {
  assert.equal(await url('!sel id:50'), `${HOST}/projects/50/select`);
});

test('rawPath: !project alias of !sel', async () => {
  assert.equal(await url('!project 42'), `${HOST}/projects/42/select`);
});

// -------- External bangs --------

test('external: simple query', async () => {
  assert.equal(
    await url('!col Aedes aegypti'),
    'https://www.catalogueoflife.org/data/search?q=Aedes%20aegypti'
  );
});

test('external: key:value extras appended', async () => {
  assert.equal(
    await url('!clb datasetKey:3LR Trifolium'),
    'https://www.checklistbank.org/nameusage/search?q=Trifolium&datasetKey=3LR'
  );
});

test('external: path-placeholder template (ScaleNet)', async () => {
  assert.equal(
    await url('!sn Coccus rusci'),
    'https://scalenet.info/catalogue/Coccus%20rusci'
  );
});

test('external: quoted comma-containing value encodes verbatim', async () => {
  assert.equal(
    await url('!bn "Smith, J."'),
    'https://bionomia.net/roster?q=Smith%2C%20J.'
  );
});

test('external: @host is ignored for external bangs', async () => {
  assert.equal(
    await url('!col @sandbox Aedes'),
    'https://www.catalogueoflife.org/data/search?q=Aedes'
  );
});

// -------- Host resolution --------

test('host: @name picks a configured instance', async () => {
  assert.equal(
    await url('!t @sandbox name:Apis'),
    'https://sandbox.taxonworks.org/tasks/taxon_names/filter?name[]=Apis'
  );
});

test('host: @name fallback when unknown', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t @nonexistent name:Apis');
  // Falls back to default (sfg) and surfaces a note
  assert.ok(r.url.startsWith(`${HOST}/tasks/taxon_names/filter`));
  assert.match(r.note || '', /Unknown instance/);
});

test('host: auto-detect from active tab when no @name', async () => {
  const url = await (async () => {
    const ext = loadExtension({ activeTabUrl: 'https://sandblaster.taxonworks.org/tasks/sources/index' });
    const r = await ext.resolveAndBuild('!t name:Apis');
    return r.url;
  })();
  assert.ok(url.startsWith('https://sandblaster.taxonworks.org/'));
});

test('host: explicit @name beats active-tab auto-detect', async () => {
  const ext = loadExtension({ activeTabUrl: 'https://sandblaster.taxonworks.org/tasks/sources/index' });
  const r = await ext.resolveAndBuild('!t @dev name:Apis');
  assert.ok(r.url.startsWith('http://localhost:3000/'));
});

// -------- Disposition markers --------

test('disposition: | marker returns newForegroundTab', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis |');
  assert.equal(r.disposition, 'newForegroundTab');
});

test('disposition: || marker returns newBackgroundTab', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis ||');
  assert.equal(r.disposition, 'newBackgroundTab');
});

test('disposition: no marker returns null', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis');
  assert.equal(r.disposition, null);
});

// -------- Input with no recognized bang --------

test('no bang: returns null URL', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('just words no bang');
  assert.equal(r.url, null);
});
