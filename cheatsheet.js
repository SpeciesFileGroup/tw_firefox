// Builds the cheatsheet content client-side from the BANGS const exposed
// by bangs.js (loaded via <script> just before this file). Reads any
// `error` and `input` query params to render an error banner at the top
// — the omnibox handler navigates here with those params when a query
// is rejected.
//
// Lives as a real extension page rather than a `data:text/html` URL
// because Firefox blocks top-level navigation to data: URLs.

// Sentinels for bangs whose URL the runtime substitutes (cheatsheet,
// options page). We skip them in the listing because their nominal
// `url` field is just an internal marker, not something to show.
const META_SENTINEL_URLS = new Set(['__tw_cheatsheet__', '__tw_options__']);

function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function urlPatternFor(target) {
  if (target.url)      return target.url;
  if (target.path)     return `/tasks/${target.path}/filter`;
  if (target.fullPath) return `/tasks/${target.fullPath}`;
  return target.rawPath || '';
}

function buildSections(active) {
  const byTarget = new Map();
  for (const [alias, info] of Object.entries(active)) {
    if (!info || (info.url && META_SENTINEL_URLS.has(info.url))) continue;
    const key = info.path     ? `p:${info.path}`
              : info.fullPath ? `f:${info.fullPath}`
              : info.rawPath  ? `r:${info.rawPath}`
              :                 `u:${info.url}`;
    if (!byTarget.has(key)) byTarget.set(key, { target: info, aliases: [] });
    byTarget.get(key).aliases.push(alias);
  }
  const internal = [];
  const external = [];
  for (const item of byTarget.values()) {
    item.aliases.sort((a, b) => a.length - b.length || a.localeCompare(b));
    if (!item.target.url) {
      internal.push(item);
    } else {
      external.push(item);
      // Dual-sigil targets are listed in BOTH sections — they live on
      // third-party domains (GitHub issues, Matrix chat, Zoom room,
      // donation page, …) but function as project-internal infrastructure,
      // so users may look them up either way.
      if (item.target.dualSigil) internal.push(item);
    }
  }
  const byPrimary = (a, b) => a.aliases[0].localeCompare(b.aliases[0]);
  internal.sort(byPrimary);
  external.sort(byPrimary);
  return { internal, external };
}

function renderTable(items, sigil) {
  const rows = items.map(({ target, aliases }) => {
    const aliasCells = aliases.map(a => `<code>${sigil}${htmlEscape(a)}</code>`).join(' ');
    const examples = (target.examples || []).slice(0, 4).map(e =>
      `<code>${sigil}${htmlEscape(aliases[0])}${e.query ? ' ' + htmlEscape(e.query) : ''}</code>` +
      (e.hint ? ' <span class="muted">— ' + htmlEscape(e.hint) + '</span>' : '')
    ).join('<br>');
    return `<tr>
      <td class="aliases">${aliasCells}</td>
      <td>${htmlEscape(target.label)}</td>
      <td><code>${htmlEscape(urlPatternFor(target))}</code></td>
      <td>${examples || '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('\n');
  return `<table>
    <thead><tr><th>Aliases</th><th>Label</th><th>URL pattern</th><th>Examples</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderPage({ error, input, active }) {
  const { internal, external } = buildSections(active);
  // "Bang not found" errors get an extra hint pointing the user at the
  // options page, since the most common fix (after typo / sigil) is to
  // add a custom alias.
  const isBangNotFound = error && /^Bangs? not found/.test(error);
  const customHint = isBangNotFound ? `
      <p class="muted">Tip: you can define your own custom bangs in <a href="options.html">extension settings</a>.</p>` : '';
  const errBanner = error ? `
    <div class="error-banner">
      <h2>⚠ Couldn't run that query</h2>
      <p><strong>${htmlEscape(error)}</strong></p>
      ${input ? `<p class="muted">You typed: <code>tw ${htmlEscape(input)}</code></p>` : ''}${customHint}
    </div>` : '';

  return `
    ${errBanner}
    <h1>TaxonWorks Omnibox — Cheatsheet</h1>

    <h2>Syntax</h2>
    <ul>
      <li><code>!&lt;bang&gt;</code> / <code>~&lt;bang&gt;</code> / <code>@&lt;host&gt;</code> — bang for TaxonWorks (<code>!</code>) or external (<code>~</code>); host targets a configured TW instance.</li>
      <li><code>key:value</code> for filter params; <code>key:a,b,c</code> for arrays; quote values with spaces (<code>title:"A new species"</code>).</li>
      <li><code>&gt;</code> chains unified filters into one URL (e.g., find all taxon names with a source that has a DOI: <code>!s with_doi:true &gt; !tn</code>). Always <code>&gt;</code>, never <code>&lt;</code> — chains read left-to-right (send A to B); typing <code>&lt;</code> raises a clear error since reversing the direction would teach wrong habits in real Unix shells.</li>
      <li><code>;</code> sequences two navigations together with the first required to be context-setting like <code>!sel</code> (e.g., select project 13 and nav to the taxon name data model for id=5: <code>!sel 13 ; !dtn 5</code>).</li>
      <li>Trailing tab markers (last token; <code>\\</code>- and <code>/</code>-flavored both work): <code>\\</code> = new tab, <code>\\\\</code> = bg tab, <code>|</code> = API, <code>||</code> = API bg, <code>\\|</code> / <code>|\\</code> = open both.</li>
      <li>Type <code>tw !help</code> any time to bring this page back.</li>
    </ul>

    <h2>Prefix conventions</h2>
    <p class="muted">Internal (<code>!</code>) bangs follow a one-letter prefix convention so you can guess the right alias for a resource you don't have memorized. The prefix tells the extension <em>what kind of page</em> to land on; the rest of the alias names the resource.</p>
    <ul>
      <li><code>f&lt;short&gt;</code> — <strong>filter task</strong>. <code>!fco</code> = collection objects filter (same as the legacy short <code>!co</code>). <code>!ftn</code> = taxon names filter, <code>!fs</code> = sources filter, etc.</li>
      <li><code>b&lt;short&gt;</code> — <strong>browse</strong> page (the rich record-detail view). <code>!bco</code> = browse a collection object, <code>!btn</code> = browse taxonomy, <code>!bo</code> / <code>!botu</code> = browse OTU.</li>
      <li><code>n&lt;short&gt;</code> — <strong>new-record</strong> form. <code>!notu</code> = new OTU, <code>!ntn</code> = new taxon name, <code>!ns</code> = new source, <code>!nce</code> = new collecting event.</li>
      <li><code>d&lt;short&gt;</code> — <strong>data resource</strong> page (the standard Rails REST route, <code>/&lt;plural&gt;</code> or <code>/&lt;plural&gt;/&lt;id&gt;</code>). <code>!dtn</code> = taxon names index, <code>!dtn 5</code> = taxon name 5.</li>
    </ul>
    <p class="muted">Most short legacy aliases (<code>!s</code>, <code>!t</code>, <code>!co</code>, <code>!o</code>, <code>!ce</code>, …) predate the prefix scheme and stay as filter-task aliases — they're shorter to type than the <code>f&lt;short&gt;</code> form, so both still work. A handful of bangs (<code>!issue</code>, <code>!sfg</code>, <code>!chat</code>, <code>!zoom</code>, …) accept either sigil; those are listed in <em>both</em> sections below since they're project-internal infra hosted on a third-party domain.</p>

    <h2>TaxonWorks bangs (<code>!</code>) <span class="muted">— ${internal.length} targets</span></h2>
    ${renderTable(internal, '!')}

    <h2>External service bangs (<code>~</code>) <span class="muted">— ${external.length} targets</span></h2>
    ${renderTable(external, '~')}

    <p class="muted">Customize bangs, sync them via Firefox Sync, or export/import as JSON via the options page (Add-ons &rarr; TaxonWorks Omnibox &rarr; Preferences, or just type <code>tw !options</code>). Full README: <a href="https://github.com/SpeciesFileGroup/tw_firefox">github.com/SpeciesFileGroup/tw_firefox</a>.</p>
  `;
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const input = params.get('input');

  // Merge BANGS (from bangs.js) with user's bangOverrides from storage
  // (sync or local, depending on whether the user opted in).
  const active = { ...BANGS };
  try {
    const { bangOverrides } = await (await activeStorage()).get('bangOverrides');
    if (bangOverrides && typeof bangOverrides === 'object') {
      for (const [k, v] of Object.entries(bangOverrides)) {
        if (v === null) delete active[k];
        else active[k] = v;
      }
    }
  } catch (e) {
    // Non-fatal — fall back to built-in BANGS only.
    console.warn('cheatsheet: storage read failed, showing built-ins only', e);
  }

  document.getElementById('root').innerHTML = renderPage({ error, input, active });
})();
