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
- Adding a metric = add the page function first (with a test), then one
  registry entry that calls it (with a test). The matcher stays dumb:
  aliases and parameter extraction only, no numbers.
