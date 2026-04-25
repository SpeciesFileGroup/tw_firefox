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

test('parse: trailing \\ sets frontend FG action', () => {
  const r = parse('!t Apis \\');
  assert.deepEqual(r.actions, [{ destination: 'frontend', disposition: 'newForegroundTab' }]);
  assert.deepEqual(r.stages[0].rest, ['Apis']);
});

test('parse: trailing | sets API FG action', () => {
  const r = parse('!t Apis |');
  assert.deepEqual(r.actions, [{ destination: 'api', disposition: 'newForegroundTab' }]);
});

test('parse: trailing || sets API BG action', () => {
  const r = parse('!t Apis ||');
  assert.deepEqual(r.actions, [{ destination: 'api', disposition: 'newBackgroundTab' }]);
});

test('parse: trailing \\| sets dual-open frontend FG + API BG', () => {
  const r = parse('!t Apis \\|');
  assert.equal(r.actions.length, 2);
  assert.deepEqual(r.actions[0], { destination: 'frontend', disposition: 'newForegroundTab' });
  assert.deepEqual(r.actions[1], { destination: 'api',      disposition: 'newBackgroundTab' });
});

test('parse: trailing |\\ sets dual-open API FG + frontend BG', () => {
  const r = parse('!t Apis |\\');
  assert.equal(r.actions.length, 2);
  assert.deepEqual(r.actions[0], { destination: 'api',      disposition: 'newForegroundTab' });
  assert.deepEqual(r.actions[1], { destination: 'frontend', disposition: 'newBackgroundTab' });
});

test('parse: non-trailing | is a regular token (no marker)', () => {
  const r = parse('!t | middle');
  assert.equal(r.actions, null);
  assert.deepEqual(r.stages[0].rest, ['|', 'middle']);
});

test('parse: no-space-before | is not a marker', () => {
  // Apis| tokenizes as single token "Apis|"
  const r = parse('!t Apis|');
  assert.equal(r.actions, null);
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
  assert.deepEqual(r.actions, [{ destination: 'api', disposition: 'newForegroundTab' }]);
});

test('parse: < is NOT a chain operator (stays in rest)', () => {
  const r = parse('!s type:book < !tn');
  // No chain happens — all tokens after !s flow into its rest
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].target.label, 'Sources');
  assert.ok(r.stages[0].rest.includes('<'));
});

test('parse: external bang uses ~ sigil', () => {
  const r = parse('~col Aedes aegypti');
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].target.label, 'Catalogue of Life');
  assert.ok(r.stages[0].target.url);
});

test('parse: ! sigil rejects external alias', () => {
  // `!col` should NOT match the Catalogue of Life external bang.
  const r = parse('!col Aedes aegypti');
  assert.equal(r.stages.length, 0);
});

test('parse: ~ sigil rejects internal alias', () => {
  // `~s` should NOT match the Sources internal bang.
  const r = parse('~s name:Apis');
  assert.equal(r.stages.length, 0);
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
