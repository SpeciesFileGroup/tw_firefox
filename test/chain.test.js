const test = require('node:test');
const assert = require('node:assert');
const { loadExtension } = require('./helpers.js');

const HOST = 'https://sfg.taxonworks.org';

async function resolve(input, opts = {}) {
  const ext = loadExtension(opts);
  return await ext.resolveAndBuild(input);
}

// -------- Basic chain URL building --------

test('2-stage chain: sources → taxon names (upstream params only)', async () => {
  const r = await resolve('!s type:book > !tn');
  assert.equal(
    r.url,
    `${HOST}/tasks/taxon_names/filter?source_query[type]=book`
  );
});

test('2-stage chain: upstream and destination both have params', async () => {
  const r = await resolve('!s type:book > !tn rank:species');
  // Upstream params nested under source_query; destination params at top.
  // Chain URL path keeps brackets literal (matches TW radial UI output).
  // `rank` is auto-bracketed (taxon_names declares it as array).
  assert.equal(
    r.url,
    `${HOST}/tasks/taxon_names/filter?source_query[type]=book&rank[]=species`
  );
});

test('3-stage chain: nested wrapping', async () => {
  const r = await resolve('!s type:book > !tn > !co year:2020');
  // source params nested inside taxon_name_query wrapper at chain depth 2
  assert.match(r.url, /taxon_name_query\[source_query\]\[type\]=book/);
  assert.match(r.url, /[?&]year=2020/);
});

// -------- Chain globals (host, disposition) --------

test('chain: @host applies to destination host', async () => {
  const r = await resolve('!s type:book > !tn @sandbox');
  assert.ok(r.url.startsWith('https://sandbox.taxonworks.org/tasks/taxon_names/filter'));
});

test('chain: trailing | still marks disposition', async () => {
  const r = await resolve('!s type:book > !tn |');
  assert.equal(r.disposition, 'newForegroundTab');
  assert.ok(r.url.includes('source_query[type]=book'));
});

// -------- Array-param auto-bracketing in chains --------

test('chain: array param on destination auto-brackets', async () => {
  const r = await resolve('!t Apis > !s author_id:1,2');
  assert.match(r.url, /author_id\[\]=1&author_id\[\]=2/);
});

test('chain: array param on upstream stage auto-brackets inside wrap', async () => {
  const r = await resolve('!s author_id:1,2 > !tn');
  assert.match(r.url, /source_query\[author_id\]\[\]=1/);
  assert.match(r.url, /source_query\[author_id\]\[\]=2/);
});

// -------- Validation errors --------

test('chain validation: external as destination is rejected', async () => {
  const r = await resolve('!s type:book > !col');
  assert.equal(r.url, null);
  assert.match(r.error || '', /External services can't receive a chain/);
});

test('chain validation: non-filter upstream is rejected', async () => {
  // !bt is browse (fullPath), has no queryKey
  const r = await resolve('!bt taxon_name_id:1 > !s');
  assert.equal(r.url, null);
  assert.match(r.error || '', /can't be a chain source/);
});

test('chain validation: external upstream is rejected', async () => {
  const r = await resolve('!col Apis > !tn');
  assert.equal(r.url, null);
  assert.match(r.error || '', /can't be a chain source/);
});

// -------- Single-stage backward-compat --------

test('single-stage chain (no >): same as before chain feature', async () => {
  const r = await resolve('!s type:book year_start:2020');
  assert.equal(
    r.url,
    `${HOST}/tasks/sources/filter?type=book&year_start=2020`
  );
});

// -------- Edge cases --------

test('chain: query_term from bare terms nests correctly', async () => {
  const r = await resolve('!t Apis > !s');
  // Apis becomes query_term, wrapped under taxon_name_query
  assert.equal(
    r.url,
    `${HOST}/tasks/sources/filter?taxon_name_query[query_term]=Apis`
  );
});

test('chain: empty upstream stage still chains (just wrapping key)', async () => {
  const r = await resolve('!s > !tn name:Apis');
  // Source contributes nothing; taxon names has name=Apis (auto-bracketed).
  // Chain path uses literal brackets.
  assert.equal(
    r.url,
    `${HOST}/tasks/taxon_names/filter?name[]=Apis`
  );
});

test('chain on rawPath destination: not meaningful but URL builds', async () => {
  // Chain into /hub (rawPath). Not something a user would really do, but
  // the URL builder should produce a sensible output rather than crash.
  const r = await resolve('!s type:book > !hub');
  // hub has no queryKey, but it's the destination so that's fine.
  assert.ok(r.url.startsWith(`${HOST}/hub`));
});
