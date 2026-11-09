# League Page patterns

How this site is built, so new work lands in the proven shape. Every rule here
exists because breaking it shipped a bug.

## Sections are routes, filters are query params

- A tab or section is a path segment: `/h2h/luck`, `/trade_analysis/log`.
  The page body lives in a shared component under `src/lib/<Name>/` taking a
  `section` prop; each route is a thin wrapper. The base route is a small
  client-side redirect to the default section (the deploy snapshot cannot
  delete files, so old routes become redirects, never removed files).
- Filters, sorts, and search live in the URL query string (`?season=2024`,
  `?sort=wins&dir=asc`, `?manager=Oscar`, `?q=`). Defaults are omitted from
  the URL. Update params with the shared `setParams` helper in
  `src/lib/utils/urlParams.js` (replaceState, keepFocus, noScroll) so views
  are shareable and the back button behaves.

## Sortable tables: pass key and direction as arguments

Svelte only re-renders when a variable referenced DIRECTLY in the template
expression changes. Reading sort state inside a helper function called from a
reactive statement silently never updates (the H2H luck table shipped this:
clicks updated the URL, rows never moved).

    const sortRows = (rows, key, dir) => ...
    {#each sortRows(rows, sortKey, sortDir) as row}

Never `{#each sortedRows}` where `sortedRows` is computed in a `$:` block that
reads sort state through a function.

## SSR safety: params at init means empty data

Reading `$page.url.searchParams` during component init also runs on the
server, where client-fetched data is still empty. Any block gated on a param
must also guard on the data existing:

    {#if selectedManager && managerRosters[selectedManager]}

(/team_values?manager=Oscar shipped a 500 on direct load without this.)

## Colors: theme variables only, never raw hex

The site flips palette on `prefers-color-scheme` via CSS variables
(--fff, --g111, --g222, --g333, --ddd, --blueOne, --headerPrimary, --f3f3f3,
--waiverAdd, --waiverDrop, ...). Hardcoded hex looks right in the mode you
built it in and wrong in the other (Schedule page, H2H). Chart.js series
colors are the one exception - canvas cannot read CSS variables without
extra plumbing; keep them in the chart config only.

## Data-layer changes: run the function, not just the build

A compiling build never executes helpers. Before pushing a change to a
math/data helper, run it against real Sleeper data or a node:test case with
fixtures shaped exactly like the producer's output, and grep the producer
for exact field names (the H2H outage: consumer read `g.myGroups`, producer
names it `groups`). Pure helpers live in `*Math.js` modules with tests in
`test/`.

## Before any push: npm run smoke

Unit tests, the manager-name drift check, a production build, and a preview
sweep of every route plus the known deep links, failing on any server error
or error page. About a minute. A green build alone is not verification.

## Ask registry (src/lib/ask)
- The registry is the single source of truth for what the site can show
  and answer: the /ask directory renders from it, and the Ask bot's
  answers come from its query entries.
- A query's run() must call the same functions and loaders the pages
  use; never re-derive a metric in the registry. When a calculation
  changes, the answer changes with it.
- Every chat turn is logged to the ask_log table via POST /api/ask/log
  (question, matched entry, route taken — local/followup/llm/miss —
  and the answer headline). Before adding aliases for a phrasing,
  check GET /api/ask/log?misses=1 for what the matcher actually
  missed; a page/guide hit that was really a stat question is a
  misroute, so the chat asks the LLM router before showing a card.
- Routing is LLM-primary for fresh questions (the router only picks
  a registry entry + params; numbers are always computed locally).
  The local matcher handles param-only follow-ups and is the
  fallback when the router is unconfigured or unsure — do not grow
  the alias list to chase phrasings the router already handles.
- The router may return up to 3 picks for comparison questions.
  Narration (POST /api/ask/narrate) writes prose ABOUT computed
  results only: the server returns it solely when every number in
  the prose appears in the results (narrationIsGrounded). The model
  phrases numbers; it never originates one. Any failure anywhere in
  the chain degrades to the plain computed tables.
- Adding a metric = add the page function first (with a test), then one
  registry entry that calls it (with a test). The matcher stays dumb:
  aliases and parameter extraction only, no numbers.

- Sleeper reads: historical data (completed seasons/weeks) goes through fetchJsonCached in request.js (session promise cache, failures evicted); live data (current week, NFL state) is never cached. Parallelism is allSettledWithConcurrency (cap 6).
- The router may also return a PLAN against a dataset in
  src/lib/ask/datasets.js (filters / rankBy / sort / limit),
  validated by validatePlan and executed by the spec's own
  execute(). Datasets are typed views over tables the pages
  already compute; the model sees only their schemas. Transform
  questions ("rank by draft only", "exclude cap") are plans, not
  new registry entries. Bespoke analytics stay fixed entries.
