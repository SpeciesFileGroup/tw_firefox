const test = require('node:test');
const assert = require('node:assert');
const { loadExtension } = require('./helpers.js');

const HOST = 'https://sfg.taxonworks.org';

// Helper: run resolveAndBuild and return the first action's URL.
// `resolveAndBuild` now returns { actions: [{url, destination, disposition}, ...] }.
// For test cases without explicit trailing markers, exactly one action exists.
async function url(input, opts = {}) {
  const ext = loadExtension(opts);
  const r = await ext.resolveAndBuild(input);
  return r.actions.length ? r.actions[0].url : null;
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

test('internal filter: bare terms become query_term for sources', async () => {
  // sources is the only filter whose base class natively handles `query_term`.
  assert.equal(
    await url('!s new species 2020'),
    `${HOST}/tasks/sources/filter?query_term=new%20species%202020`
  );
});

test('internal filter: bare terms route to per-filter key (taxon_names → name[])', async () => {
  // taxon_names declares `name: []` so the bare term auto-brackets.
  assert.equal(
    await url('!tn Apis mellifera'),
    `${HOST}/tasks/taxon_names/filter?name[]=Apis%20mellifera`
  );
});

test('internal filter: bare terms route to per-filter key (descriptors → term, scalar)', async () => {
  // descriptors declares `:term` (scalar), not `term: []`.
  assert.equal(
    await url('!d wing length'),
    `${HOST}/tasks/descriptors/filter?term=wing%20length`
  );
});

test('internal filter: filters without a mapping fall back to query_term', async () => {
  // collection_objects has no clear text-search param; query_term is harmless
  // (Rails strong params will just ignore it).
  assert.equal(
    await url('!co some text'),
    `${HOST}/tasks/collection_objects/filter?query_term=some%20text`
  );
});

// -------- f<short> aliases (mirrors b/n prefix conventions) --------

test('f-prefix alias: !fco resolves to collection_objects filter', async () => {
  assert.equal(await url('!fco'), `${HOST}/tasks/collection_objects/filter`);
});

test('f-prefix alias: !ftn resolves to taxon_names filter', async () => {
  assert.equal(await url('!ftn Apis'), `${HOST}/tasks/taxon_names/filter?name[]=Apis`);
});

test('f-prefix alias: !fotu resolves to otus filter (fo is field_occurrences)', async () => {
  assert.equal(await url('!fotu'), `${HOST}/tasks/otus/filter`);
  // `fo` predates the f-prefix convention and resolves to field_occurrences.
  assert.equal(await url('!fo'), `${HOST}/tasks/field_occurrences/filter`);
});

// -------- d<short> aliases (data resource index pages) --------

test('d-prefix alias: !dtn resolves to /taxon_names data page', async () => {
  assert.equal(await url('!dtn'), `${HOST}/taxon_names`);
});

test('d-prefix alias: !dco resolves to /collection_objects data page', async () => {
  assert.equal(await url('!dco'), `${HOST}/collection_objects`);
});

test('d-prefix alias: !docc resolves to /dwc_occurrences data (ddwc is dashboard)', async () => {
  assert.equal(await url('!docc'), `${HOST}/dwc_occurrences`);
  // `ddwc` predates this convention and resolves to the DwC dashboard task.
  assert.equal(await url('!ddwc'), `${HOST}/tasks/dwc/dashboard`);
});

test('d-prefix alias: !dcnt resolves to /contents (plural in REST routes)', async () => {
  // The filter task uses singular (/tasks/content/filter), but the REST
  // resource route is /contents.
  assert.equal(await url('!dcnt'), `${HOST}/contents`);
});

// -------- Projects --------

test('!proj bare → /projects/list via defaultArg', async () => {
  // Plain `/projects` is a "new or list?" landing page; `/projects/list` is
  // what users actually want when they don't specify an id.
  assert.equal(await url('!proj'), `${HOST}/projects/list`);
});

test('!proj 13 → /projects/13 via {} substitution', async () => {
  assert.equal(await url('!proj 13'), `${HOST}/projects/13`);
});

test('!proj id:13 → /projects/13 (id: fallback)', async () => {
  assert.equal(await url('!proj id:13'), `${HOST}/projects/13`);
});

test('!nproj → /projects/new (literal path, no substitution)', async () => {
  assert.equal(await url('!nproj'), `${HOST}/projects/new`);
});

test('rawPath {} with empty value and no defaultArg strips trailing slash', async () => {
  // Regression test for the `/foo/{}` → `/foo` collapse — important so
  // user-defined custom bangs with `rawPath: '/foo/{}'` don't 301-redirect.
  // !sel has `/projects/{}/select`; an empty arg used to give
  // `/projects//select`. Now it collapses to `/projects/select`.
  assert.equal(await url('!sel'), `${HOST}/projects/select`);
});

// -------- Users / administration --------

test('!users bare → /users (index)', async () => {
  assert.equal(await url('!users'), `${HOST}/users`);
});

test('!users 277 → /users/277', async () => {
  assert.equal(await url('!users 277'), `${HOST}/users/277`);
});

test('!signup → /signup', async () => {
  assert.equal(await url('!signup'), `${HOST}/signup`);
});

test('!nusers → /tasks/administrator/batch_add_users', async () => {
  assert.equal(await url('!nusers'), `${HOST}/tasks/administrator/batch_add_users`);
});

test('!admin → /administration', async () => {
  assert.equal(await url('!admin'), `${HOST}/administration`);
});

test('!ua → /administration/user_activity', async () => {
  assert.equal(await url('!ua'), `${HOST}/administration/user_activity`);
});

// -------- Issue tracker (dual-sigil) --------

test('~issue → GitHub issue tracker, bare (all issues)', async () => {
  // No `is:open` is baked into the template — users can pass `is:open`
  // explicitly. See the keyValueInQuery test below for why.
  assert.equal(
    await url('~issue'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+'
  );
});

test('!issue (cross-sigil — opt-in via dualSigil) resolves to the same target', async () => {
  assert.equal(
    await url('!issue'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+'
  );
});

test('~issues gnparser → search issues for "gnparser"', async () => {
  assert.equal(
    await url('~issues gnparser'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+gnparser'
  );
});

test('!issues gnparser → same as ~issues (dual-sigil)', async () => {
  assert.equal(
    await url('!issues gnparser'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+gnparser'
  );
});

test('~issue is:closed sounds → key:value folded into q= (keyValueInQuery)', async () => {
  // Regression test for the original report: `is:closed` was getting
  // extracted as a stray `&is=closed` URL param while `is:open` stayed
  // baked into q=, so the result silently showed open issues. Now `is:`
  // tokens flow into the q= search string and the user's intent wins.
  // (Spaces between the joined bare tokens encode as %20, the same way
  // every other external bang encodes its bare query.)
  assert.equal(
    await url('~issue is:closed sounds'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+is%3Aclosed%20sounds'
  );
});

test('!gh / !git resolve to the same target as !issue', async () => {
  const expected = 'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+';
  assert.equal(await url('!gh'),  expected);
  assert.equal(await url('~gh'),  expected);
  assert.equal(await url('!git'), expected);
  assert.equal(await url('~git'), expected);
});

test('!sfg / ~sfg → speciesfilegroup.org (dualSigil)', async () => {
  assert.equal(await url('!sfg'), 'https://speciesfilegroup.org');
  assert.equal(await url('~sfg'), 'https://speciesfilegroup.org');
});

test('!donate / !give resolve to the same GiveCampus URL (dualSigil)', async () => {
  const expected = 'https://www.givecampus.com/campaigns/49638/donations/new';
  assert.equal(await url('!donate'), expected);
  assert.equal(await url('~give'),   expected);
});

test('!chat → matrix.to launcher (dualSigil)', async () => {
  assert.equal(
    await url('!chat'),
    'https://matrix.to/#/#TaxonWorks:gitter.im'
  );
});

test('!twt / !together → together.taxonworks.org (dualSigil)', async () => {
  assert.equal(await url('!twt'),       'https://together.taxonworks.org');
  assert.equal(await url('~together'),  'https://together.taxonworks.org');
});

test('!zoom / ~zoom → SFG Commons Zoom (dualSigil)', async () => {
  const expected = 'https://illinois.zoom.us/my/sfgcommons?pwd=eVI4UkdIUzdIYXRIcUhreVdES2ZQQT09';
  assert.equal(await url('!zoom'), expected);
  assert.equal(await url('~zoom'), expected);
});

// -------- Additional task pages (route-audit additions) --------

test('!dashboard → /dashboard (rawPath, app root)', async () => {
  assert.equal(await url('!dashboard'), `${HOST}/dashboard`);
});

test('!reset → /forgot_password', async () => {
  assert.equal(await url('!reset'), `${HOST}/forgot_password`);
});

test('!gnf → /tasks/sources/gnfinder', async () => {
  assert.equal(await url('!gnf'), `${HOST}/tasks/sources/gnfinder`);
});

test('!coldp → /tasks/exports/coldp', async () => {
  assert.equal(await url('!coldp'), `${HOST}/tasks/exports/coldp`);
});

test('!dwcimport → /tasks/dwca_import (top-level scope)', async () => {
  assert.equal(await url('!dwcimport'), `${HOST}/tasks/dwca_import`);
});

test('!unify / !unifyp → /tasks/unify/objects + /people', async () => {
  assert.equal(await url('!unify'),  `${HOST}/tasks/unify/objects`);
  assert.equal(await url('!unifyp'), `${HOST}/tasks/unify/people`);
});

test('!labels / !plabels → /tasks/labels/print_labels', async () => {
  assert.equal(await url('!labels'),  `${HOST}/tasks/labels/print_labels`);
  assert.equal(await url('!plabels'), `${HOST}/tasks/labels/print_labels`);
});

test('!mview accepts optional matrix id (rawPath {} substitution)', async () => {
  assert.equal(await url('!mview'),    `${HOST}/tasks/observation_matrices/view`);
  assert.equal(await url('!mview 5'),  `${HOST}/tasks/observation_matrices/view/5`);
  assert.equal(await url('!mview id:5'), `${HOST}/tasks/observation_matrices/view/5`);
});

test('!datahealth → /administration/data_health (admin diagnostic)', async () => {
  assert.equal(await url('!datahealth'), `${HOST}/administration/data_health`);
});

// -------- Routes that need /index appended (lock-in tests) --------

test('!topics → /tasks/.../topics_hub/index (route uses get \'index\')', async () => {
  // Regression: the topics_hub controller has no `get '/'` index route, so
  // `/tasks/controlled_vocabularies/topics_hub` 404s — `/index` is required.
  assert.equal(
    await url('!topics'),
    `${HOST}/tasks/controlled_vocabularies/topics_hub/index`
  );
});

test('!biocur → biocuration/build_collection (no :index in controller)', async () => {
  // The biocuration controller has no index — build_collection is the
  // user-facing form.
  assert.equal(
    await url('!biocur'),
    `${HOST}/tasks/controlled_vocabularies/biocuration/build_collection`
  );
});

test('!nomexp → exports/nomenclature/basic (no :index in controller)', async () => {
  assert.equal(
    await url('!nomexp'),
    `${HOST}/tasks/exports/nomenclature/basic`
  );
});

// -------- Stepwise data-curation workflows --------

test('!stepdates → parse/stepwise/dates/index (route uses get \'index\')', async () => {
  assert.equal(
    await url('!stepdates'),
    `${HOST}/tasks/collecting_events/parse/stepwise/dates/index`
  );
});

test('!stepll → parse/stepwise/lat_long/index', async () => {
  assert.equal(
    await url('!stepll'),
    `${HOST}/tasks/collecting_events/parse/stepwise/lat_long/index`
  );
});

test('!stepcoll → stepwise/collectors (route uses get \'/\')', async () => {
  assert.equal(
    await url('!stepcoll'),
    `${HOST}/tasks/collecting_events/stepwise/collectors`
  );
});

test('!stepdet → collection_objects/stepwise/determinations', async () => {
  assert.equal(
    await url('!stepdet'),
    `${HOST}/tasks/collection_objects/stepwise/determinations`
  );
});

// -------- Short aliases for previously-long-only bangs --------

// -------- Sequential `;` chains (multi-group) --------

async function actionsFor(input, opts = {}) {
  const ext = (require('./helpers.js').loadExtension)(opts);
  const r = await ext.resolveAndBuild(input);
  return r.actions;
}

test(';: !sel 13 ; !dtn 5 → two URLs marked sequential', async () => {
  const acts = await actionsFor('!sel 13 ; !dtn 5');
  assert.equal(acts.length, 2);
  assert.equal(acts[0].url, `${HOST}/projects/13/select`);
  assert.equal(acts[1].url, `${HOST}/taxon_names/5`);
  assert.equal(acts[0].sequential, true);
  assert.equal(acts[1].sequential, true);
});

test(';: leading literal `tw` in second group is silently stripped', async () => {
  // `tw !sel 13 ; tw !dtn 5` — the second `tw` is the omnibox keyword
  // written out, not a query term. Should resolve identically to the
  // version without the redundant `tw`.
  const acts = await actionsFor('!sel 13 ; tw !dtn 5');
  assert.equal(acts.length, 2);
  assert.equal(acts[0].url, `${HOST}/projects/13/select`);
  assert.equal(acts[1].url, `${HOST}/taxon_names/5`);
});

test(';: three groups produce three sequential actions', async () => {
  const acts = await actionsFor('!sel 13 ; !dtn 5 ; !proj');
  assert.equal(acts.length, 3);
  assert.equal(acts[0].url, `${HOST}/projects/13/select`);
  assert.equal(acts[1].url, `${HOST}/taxon_names/5`);
  assert.equal(acts[2].url, `${HOST}/projects/list`);
  assert.ok(acts.every(a => a.sequential));
});

test(';: a group can itself contain a > chain', async () => {
  // `!sel 13 ; !s with_doi:true > !tn` → group 1 is the project switcher,
  // group 2 is a normal filter chain (sources → taxon names).
  const acts = await actionsFor('!sel 13 ; !s with_doi:true > !tn');
  assert.equal(acts.length, 2);
  assert.equal(acts[0].url, `${HOST}/projects/13/select`);
  // The chain composes via queryKey nesting — same as a standalone chain.
  assert.ok(acts[1].url.startsWith(`${HOST}/tasks/taxon_names/filter?`));
  assert.ok(acts[1].url.includes('source_query%5Bwith_doi%5D=true') ||
            acts[1].url.includes('source_query[with_doi]=true'));
});

test(';: rejects when first group\'s destination is not sequential-flagged', async () => {
  // `!s 5 ; !tn foo` — the source-show nav doesn't carry a side effect to
  // the next nav, so sequencing it would just throw away the first nav.
  // Reject with a clear error rather than silently doing the wrong thing.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!s id:5 ; !tn foo');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /can't lead a `;` chain/);
});

test(';: trailing `|` routes the LAST nav to the API endpoint', async () => {
  // !sel goes frontend (no API equivalent for rawPath). The last nav
  // (!t with bare term Apis) honours the `|` marker — API destination,
  // new foreground tab. Disposition applies to the first nav (where the
  // tab opens); destination applies to the last nav (where the user lands).
  const acts = await actionsFor('!sel 13 ; !t Apis |');
  assert.equal(acts.length, 2);
  assert.equal(acts[0].url, `${HOST}/projects/13/select`);
  assert.equal(acts[0].destination, 'frontend');
  assert.equal(acts[0].disposition, 'newForegroundTab');
  // taxon_names HAS an API path → /api/v1/taxon_names?...
  assert.match(acts[1].url, /\/api\/v1\/taxon_names\?/);
  assert.equal(acts[1].destination, 'api');
});

test(';: trailing `\\` keeps frontend, opens last nav in a new tab', async () => {
  const acts = await actionsFor('!sel 13 ; !dtn 5 \\');
  assert.equal(acts.length, 2);
  assert.equal(acts[0].disposition, 'newForegroundTab');
  assert.equal(acts[1].url, `${HOST}/taxon_names/5`);
});

test(';: trailing `||` → API in new background tab', async () => {
  const acts = await actionsFor('!sel 13 ; !t Apis ||');
  assert.equal(acts.length, 2);
  assert.equal(acts[0].url, `${HOST}/projects/13/select`);
  assert.equal(acts[0].disposition, 'newBackgroundTab');
  assert.match(acts[1].url, /\/api\/v1\/taxon_names\?/);
  assert.equal(acts[1].destination, 'api');
});

test(';: dual-open markers (\\| / |\\ / /| / |/) are rejected explicitly', async () => {
  // Forward-slash variants (`/|`, `|/`) are accepted as aliases for the
  // backslash forms (`\|`, `|\`) — same dual-open rejection should fire.
  const ext = require('./helpers.js').loadExtension();
  for (const marker of ['\\|', '|\\', '/|', '|/']) {
    const r = await ext.resolveAndBuild(`!sel 13 ; !t Apis ${marker}`);
    assert.equal(r.actions.length, 0, `marker "${marker}" should reject`);
    assert.match(r.error, /Dual-open markers.*don't apply in sequential chains/);
  }
});

// -------- Cheatsheet / help bangs --------

test('!help / !cheat / ~help / ~cheat all resolve to the cheatsheet sentinel', async () => {
  // The runtime intercepts CHEATSHEET_SENTINEL in onInputEntered and
  // swaps it for the extension page URL (cheatsheet.html with optional
  // ?error=&input= params). We can only assert the sentinel resolution
  // here; the page is rendered client-side by cheatsheet.js.
  const ext = require('./helpers.js').loadExtension();
  for (const input of ['!help', '~help', '!cheat', '~cheat']) {
    const r = await ext.resolveAndBuild(input);
    assert.equal(r.actions.length, 1, input);
    assert.equal(r.actions[0].url, ext.CHEATSHEET_SENTINEL, input);
  }
});

test('!config / !settings / !cfg / !options resolve to the options sentinel', async () => {
  const ext = require('./helpers.js').loadExtension();
  for (const input of ['!config', '!settings', '!cfg', '!options', '~config']) {
    const r = await ext.resolveAndBuild(input);
    assert.equal(r.actions.length, 1, input);
    assert.equal(r.actions[0].url, ext.OPTIONS_SENTINEL, input);
  }
});

test('cheatsheetUrl() returns the extension page URL, with query params for error mode', async () => {
  const ext = require('./helpers.js').loadExtension();
  // No browser global in the sandbox, so the helper falls back to a
  // recognizable relative URL we can match against.
  assert.equal(ext.cheatsheetUrl(), 'cheatsheet.html');
  assert.equal(
    ext.cheatsheetUrl({ error: 'something broke' }),
    'cheatsheet.html?error=something+broke'
  );
  assert.equal(
    ext.cheatsheetUrl({ error: 'x', input: '!s id:5 ; !tn foo' }),
    'cheatsheet.html?error=x&input=%21s+id%3A5+%3B+%21tn+foo'
  );
});

test('forward-slash markers work as aliases for backslash markers', async () => {
  // `/` ≡ `\`, `//` ≡ `\\`, `/|` ≡ `\|`, `|/` ≡ `|\`. Verifying single-action
  // forms; dual-open variants are exercised in the rejection test above.
  assert.deepEqual(
    (await actionsFor('!t Apis \\')).map(a => [a.destination, a.disposition]),
    (await actionsFor('!t Apis /')).map(a => [a.destination, a.disposition])
  );
  assert.deepEqual(
    (await actionsFor('!t Apis \\\\')).map(a => [a.destination, a.disposition]),
    (await actionsFor('!t Apis //')).map(a => [a.destination, a.disposition])
  );
});

test(';: rejects `|` when last nav has no API equivalent', async () => {
  // !dtn is rawPath (no API endpoint). Asking for API destination should
  // fail with a clear error, not silently skip the last nav.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!sel 13 ; !dtn 5 |');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /doesn't have an api URL/);
});

test(';: !select alias also leads a sequential chain', async () => {
  const acts = await actionsFor('!select 13 ; !dtn 5');
  assert.equal(acts.length, 2);
  assert.equal(acts[0].url, `${HOST}/projects/13/select`);
  assert.equal(acts[1].url, `${HOST}/taxon_names/5`);
});

test(';: a chain inside a group still rejects rawPath upstream', async () => {
  // Within a single group, `>` requires the upstream to have a queryKey.
  // !sel is rawPath (no queryKey) — using `>` with it should still error.
  // Use `;` to split into separate navigations instead.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!sel 13 > !tn');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /can't be a chain source/);
});

test('short aliases resolve to same target as their descriptive twins', async () => {
  // !auth ≡ !authors, !dash ≡ !dashboard, !pc ≡ !papercat, etc.
  assert.equal(await url('!auth'),     await url('!authors'));
  assert.equal(await url('!dash'),     await url('!dashboard'));
  assert.equal(await url('!pc'),       await url('!papercat'));
  assert.equal(await url('!nst'),      await url('!nomstats'));
  assert.equal(await url('!tns'),      await url('!tnstats'));
  assert.equal(await url('!nex'),      await url('!nomexp'));
  assert.equal(await url('!dim'),      await url('!dwcimport'));
  assert.equal(await url('!gim'),      await url('!gazimport'));
  assert.equal(await url('!dig'),      await url('!digitize'));
  assert.equal(await url('!gdig'),     await url('!gdigitize'));
  assert.equal(await url('!imx'),      await url('!imatrix'));
  assert.equal(await url('!cesp'),     await url('!cespatial'));
});

test('~issue is:open author:mjy → multiple key:value tokens fold into q=', async () => {
  assert.equal(
    await url('~issue is:open author:mjy'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+is%3Aopen%20author%3Amjy'
  );
});

test('regular external bangs still reject the wrong sigil', async () => {
  // Sanity: dualSigil is opt-in. Other external bangs (e.g. ~gbif) still
  // refuse `!gbif` so the sigil split keeps signalling intent — and the
  // unresolved-bang detector now surfaces an error pointing at `!gbif`.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!gbif Apis');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /Bang not found:.*!gbif/);
});

// -------- Unresolved bang detection --------

test('unknown bang surfaces an error, not a silent no-op', async () => {
  // Regression: typing `tw !aeorgihaoegf` used to silently drop the bang
  // and become a bare query, leading to nothing happening on Enter. Now
  // we error out so onInputEntered redirects to the cheatsheet.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!aeorgihaoegf');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /Bang not found:.*!aeorgihaoegf/);
});

test('unresolved bang in a chain stage also errors', async () => {
  // `!s > !nonsense` would previously silently drop the second stage and
  // resolve as a plain `!s` filter — confusing because the user typed a
  // chain. Now it errors.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!s > !nonsense');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /Bang not found:.*!nonsense/);
});

test('multiple unresolved bangs are reported together', async () => {
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!foo ; !bar');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /Bangs not found:.*!foo.*!bar/);
});

// -------- numericUrl with id: form --------

test('~if 549878 → Index Fungorum NamesRecord (numericUrl)', async () => {
  // `if` is a reserved word in JS but valid as an object literal key.
  // Sanity check that the parser/lookup is happy with it.
  assert.equal(
    await url('~if 549878'),
    'https://www.indexfungorum.org/names/NamesRecord.asp?RecordID=549878'
  );
});

test('~if Boletus → search page (IF\'s text search ignores URL params)', async () => {
  assert.equal(await url('~if Boletus'), 'https://www.indexfungorum.org/names/names.asp');
});

test('~mdd 1006285 → /taxon/1006285/ (bare numeric)', async () => {
  assert.equal(
    await url('~mdd 1006285'),
    'https://www.mammaldiversity.org/taxon/1006285/'
  );
});

test('~mdd id:1006285 → /taxon/1006285/ (id: form, consumed not appended)', async () => {
  // Regression: `id:1006285` MUST NOT also leak into the URL as
  // `?id=1006285` once we've used it for the path.
  const u = await url('~mdd id:1006285');
  assert.equal(u, 'https://www.mammaldiversity.org/taxon/1006285/');
  assert.doesNotMatch(u, /[?&]id=/);
});

test('~mdd with non-numeric input lands on the search page', async () => {
  // MDD's search ignores URL params; the bang just lands the user there.
  assert.equal(await url('~mdd Bos taurus'), 'https://www.mammaldiversity.org/search/');
});

test('!issue id:1234 keeps existing behavior (keyValueInQuery folds id: into q=)', async () => {
  // Sanity: ISSUES_TARGET sets keyValueInQuery, so `id:1234` becomes
  // part of the q= search string rather than triggering numericUrl.
  // Pure bare digits still direct-nav, as before.
  assert.equal(
    await url('!issue 1234'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues/1234'
  );
  assert.match(
    await url('!issue id:1234'),
    /\/issues\?q=is%3Aissue\+id%3A1234$/
  );
});

test('< between bangs raises an error (not auto-corrected)', async () => {
  // Unix `<` is the reverse-direction redirect; auto-correcting would
  // silently change the destination. We surface as an error so users
  // learn to use `>` rather than building a wrong-shell habit.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('!s with_doi:true < !tn @sanddollar');
  assert.equal(r.actions.length, 0);
  assert.match(r.error, /`<` isn't a chain operator/);
});

test('plain text without bang-shaped tokens stays silent', async () => {
  // No `!`/`~` sigils → not bang-shaped → no error, no action. Lets the
  // user paste arbitrary text in the omnibox without spurious cheatsheet
  // redirects.
  const ext = require('./helpers.js').loadExtension();
  const r = await ext.resolveAndBuild('foo bar baz');
  assert.equal(r.actions.length, 0);
  assert.equal(r.error, null);
});

test('!issue 1234 → direct nav via numericUrl', async () => {
  assert.equal(
    await url('!issue 1234'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues/1234'
  );
});

test('~issue 1234 → direct nav (dualSigil also routes numericUrl)', async () => {
  assert.equal(
    await url('~issue 1234'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues/1234'
  );
});

test('!issue with non-numeric input still uses search template', async () => {
  // A trailing digit in a phrase is not "purely digits" → search template.
  assert.equal(
    await url('!issue bug 42'),
    'https://github.com/SpeciesFileGroup/taxonworks/issues?q=is%3Aissue+bug%2042'
  );
});

test('numericUrl is opt-in: ~gbif 1234 still searches, does not direct-nav', async () => {
  // Without `numericUrl` on the target, numeric input is just another query.
  assert.equal(
    await url('~gbif 1234'),
    'https://www.gbif.org/species/search?q=1234'
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
    await url('~col Aedes aegypti'),
    'https://www.catalogueoflife.org/data/search?q=Aedes%20aegypti'
  );
});

test('external: key:value extras appended', async () => {
  assert.equal(
    await url('~clb datasetKey:3LR Trifolium'),
    'https://www.checklistbank.org/nameusage/search?q=Trifolium&datasetKey=3LR'
  );
});

test('external: path-placeholder template (ScaleNet)', async () => {
  assert.equal(
    await url('~sn Coccus rusci'),
    'https://scalenet.info/catalogue/Coccus%20rusci'
  );
});

test('external: quoted comma-containing value encodes verbatim', async () => {
  assert.equal(
    await url('~bn "Smith, J."'),
    'https://bionomia.net/roster?q=Smith%2C%20J.'
  );
});

test('external: @host is ignored for external bangs', async () => {
  assert.equal(
    await url('~col @sandbox Aedes'),
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
  assert.ok(r.actions[0].url.startsWith(`${HOST}/tasks/taxon_names/filter`));
  assert.match(r.note || '', /Unknown instance/);
});

test('host: auto-detect from active tab when no @name', async () => {
  const ext = loadExtension({ activeTabUrl: 'https://sandblaster.taxonworks.org/tasks/sources/index' });
  const r = await ext.resolveAndBuild('!t name:Apis');
  assert.ok(r.actions[0].url.startsWith('https://sandblaster.taxonworks.org/'));
});

test('host: explicit @name beats active-tab auto-detect', async () => {
  const ext = loadExtension({ activeTabUrl: 'https://sandblaster.taxonworks.org/tasks/sources/index' });
  const r = await ext.resolveAndBuild('!t @dev name:Apis');
  assert.ok(r.actions[0].url.startsWith('http://localhost:3000/'));
});

// -------- Trailing markers --------

test('marker `\\`: frontend, new foreground tab', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis \\');
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].destination, 'frontend');
  assert.equal(r.actions[0].disposition, 'newForegroundTab');
  assert.ok(r.actions[0].url.includes('/tasks/taxon_names/filter'));
});

test('marker `\\\\`: frontend, new background tab', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis \\\\');
  assert.equal(r.actions[0].destination, 'frontend');
  assert.equal(r.actions[0].disposition, 'newBackgroundTab');
});

test('marker `|`: API, new foreground tab', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis |');
  assert.equal(r.actions[0].destination, 'api');
  assert.equal(r.actions[0].disposition, 'newForegroundTab');
  assert.ok(r.actions[0].url.includes('/api/v1/taxon_names'));
});

test('marker `||`: API, new background tab', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis ||');
  assert.equal(r.actions[0].destination, 'api');
  assert.equal(r.actions[0].disposition, 'newBackgroundTab');
  assert.ok(r.actions[0].url.includes('/api/v1/taxon_names'));
});

test('marker `\\|`: dual-open, frontend FG + API BG', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis \\|');
  assert.equal(r.actions.length, 2);
  assert.equal(r.actions[0].destination, 'frontend');
  assert.equal(r.actions[0].disposition, 'newForegroundTab');
  assert.equal(r.actions[1].destination, 'api');
  assert.equal(r.actions[1].disposition, 'newBackgroundTab');
});

test('marker `|\\`: dual-open, API FG + frontend BG', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis |\\');
  assert.equal(r.actions.length, 2);
  assert.equal(r.actions[0].destination, 'api');
  assert.equal(r.actions[0].disposition, 'newForegroundTab');
  assert.equal(r.actions[1].destination, 'frontend');
  assert.equal(r.actions[1].disposition, 'newBackgroundTab');
});

test('no marker: single frontend action with null disposition', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!t Apis');
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].destination, 'frontend');
  assert.equal(r.actions[0].disposition, null);
});

test('API destination rejects external bang (no API equivalent)', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('~col Aedes |');
  assert.equal(r.actions.length, 0);
});

test('API destination rejects non-filter targets (browse / hub)', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('!hub |');
  assert.equal(r.actions.length, 0);
});

// -------- Input with no recognized bang --------

test('no bang: returns no actions', async () => {
  const ext = loadExtension();
  const r = await ext.resolveAndBuild('just words no bang');
  assert.equal(r.actions.length, 0);
});
