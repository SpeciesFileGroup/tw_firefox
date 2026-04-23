const test = require('node:test');
const assert = require('node:assert');
const { loadExtension } = require('./helpers.js');

const ext = loadExtension();
const { tokenize, parse, matchBang, matchInstance, queryKeyFor } = ext;

test('tokenize splits on whitespace', () => {
  assert.deepEqual(tokenize('!s title year_start:2020'), ['!s', 'title', 'year_start:2020']);
});

test('tokenize preserves quoted values with spaces', () => {
  assert.deepEqual(tokenize('!s title:"A new species"'), ['!s', 'title:"A new species"']);
});

test('tokenize keeps the pipe attached to a word without whitespace', () => {
  assert.deepEqual(tokenize('!s Apis|'), ['!s', 'Apis|']);
});

test('matchBang: prefix form', () => {
  assert.equal(matchBang('!s').label, 'Sources');
});

test('matchBang: suffix form', () => {
  assert.equal(matchBang('s!').label, 'Sources');
});

test('matchBang: unknown returns null', () => {
  assert.equal(matchBang('!nonsense'), null);
});

test('matchBang: not a bang at all', () => {
  assert.equal(matchBang('hello'), null);
});

test('matchInstance: valid @name', () => {
  assert.equal(matchInstance('@sandbox'), 'sandbox');
});

test('matchInstance: not a host token', () => {
  assert.equal(matchInstance('@'), null);
  assert.equal(matchInstance('sandbox'), null);
});

test('parse: empty input → no stages', () => {
  assert.equal(parse('').stages.length, 0);
});

test('parse: single bang', () => {
  const r = parse('!t');
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].target.label, 'Taxon names');
  assert.equal(r.stages[0].bangToken, '!t');
  assert.deepEqual(r.stages[0].rest, []);
});

test('parse: bang with params', () => {
  const r = parse('!s title:Apis year_start:2020');
  assert.equal(r.stages.length, 1);
  assert.deepEqual(r.stages[0].rest, ['title:Apis', 'year_start:2020']);
});

test('parse: @host extracted anywhere', () => {
  assert.equal(parse('!t @sandbox name:Apis').hostName, 'sandbox');
  assert.equal(parse('@sandbox !t name:Apis').hostName, 'sandbox');
  assert.equal(parse('!t name:Apis @sandbox').hostName, 'sandbox');
});

test('parse: first @host wins if multiple', () => {
  assert.equal(parse('!t @sfg @sandbox').hostName, 'sfg');
});

test('parse: trailing | sets foreground disposition', () => {
  const r = parse('!t Apis |');
  assert.equal(r.disposition, 'newForegroundTab');
  assert.deepEqual(r.stages[0].rest, ['Apis']);
});

test('parse: trailing || sets background disposition', () => {
  const r = parse('!t Apis ||');
  assert.equal(r.disposition, 'newBackgroundTab');
});

test('parse: non-trailing | is a regular token', () => {
  const r = parse('!t | middle');
  assert.equal(r.disposition, null);
  assert.deepEqual(r.stages[0].rest, ['|', 'middle']);
});

test('parse: no-space-before | is not a marker', () => {
  // Apis| tokenizes as single token "Apis|"
  const r = parse('!t Apis|');
  assert.equal(r.disposition, null);
  assert.deepEqual(r.stages[0].rest, ['Apis|']);
});

test('parse: chain splits on >', () => {
  const r = parse('!s type:book > !tn');
  assert.equal(r.stages.length, 2);
  assert.equal(r.stages[0].target.label, 'Sources');
  assert.equal(r.stages[1].target.label, 'Taxon names');
});

test('parse: 3-stage chain', () => {
  const r = parse('!s type:book > !tn rank:species > !co year:2020');
  assert.equal(r.stages.length, 3);
  assert.deepEqual(r.stages.map(s => s.target.label),
    ['Sources', 'Taxon names', 'Collection objects']);
});

test('parse: chain with @host and | (both global)', () => {
  const r = parse('!s type:book > !tn @sandbox |');
  assert.equal(r.stages.length, 2);
  assert.equal(r.hostName, 'sandbox');
  assert.equal(r.disposition, 'newForegroundTab');
});

test('parse: < is NOT a chain operator (stays in rest)', () => {
  const r = parse('!s type:book < !tn');
  // No chain happens — all tokens after !s flow into its rest
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].target.label, 'Sources');
  assert.ok(r.stages[0].rest.includes('<'));
});

test('parse: external bang behaves as single stage', () => {
  const r = parse('!col Aedes aegypti');
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].target.label, 'Catalogue of Life');
  assert.ok(r.stages[0].target.url);
});

test('queryKeyFor: known internal filter', () => {
  const { BANGS } = ext;
  assert.equal(queryKeyFor(BANGS.s), 'source_query');
  assert.equal(queryKeyFor(BANGS.t), 'taxon_name_query');
  assert.equal(queryKeyFor(BANGS.co), 'collection_object_query');
});

test('queryKeyFor: external bang returns null', () => {
  const { BANGS } = ext;
  assert.equal(queryKeyFor(BANGS.col), null);
});

test('queryKeyFor: browse (fullPath) target returns null', () => {
  const { BANGS } = ext;
  assert.equal(queryKeyFor(BANGS.bt), null);
});
