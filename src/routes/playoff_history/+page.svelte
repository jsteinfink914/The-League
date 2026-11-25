<script>
	import LinearProgress from '@smui/linear-progress';
	import { page } from '$app/stores';
	import { createSetParams } from '$lib/utils/urlParams';

	export let data;
	const { historyData } = data;

	const FINISH_LABEL = { champ: '🏆 Champ', final: 'Final', sf: 'Semi', qf: 'Quarter' };
	const FINISH_RANK = { champ: 4, final: 3, sf: 2, qf: 1 };
	const setParams = createSetParams(page);

	// One sort state drives both tables. No params = the all-time ranking
	// (titles, then finals, then semis, then appearances). Clicking a
	// season column in the grid sorts by that year's finish, best first.
	let sortKey = $page.url.searchParams.get('sort');
	let sortDir = $page.url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

	function setSort(key) {
		if (sortKey === key) {
			sortDir = sortDir === 'desc' ? 'asc' : 'desc';
		} else {
			sortKey = key;
			sortDir = key === 'manager' ? 'asc' : 'desc';
		}
		setParams({ sort: sortKey, dir: sortDir });
	}
	const sortValue = (row, key) => {
		if (key === 'manager') return row.manager;
		if (key === 'apps' || key === 'champ' || key === 'final' || key === 'sf' || key === 'qf') return row[key] || 0;
		return FINISH_RANK[row.finishes[key]] || 0;
	};
	// Stable sort over the default-ordered rows, so ties keep ranking order.
	// sortKey/sortDir are passed in so the template references them directly.
	const applySort = (rows, key, dir) => {
		if (!key) return rows;
		const copy = [...rows];
		copy.sort((a, b) => {
			const va = sortValue(a, key), vb = sortValue(b, key);
			const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
			return dir === 'asc' ? cmp : -cmp;
		});
		return copy;
	};
	const arrow = (key) => (sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');
</script>

<style>
	.wrap { max-width: 1000px; margin: 0 auto; padding: 1rem; }
	.note { opacity: 0.75; font-size: 0.9rem; margin: 0.25rem 0 1rem; }
	.loading { max-width: 500px; margin: 80px auto; width: 85%; }
	.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
	.counts-table th:not(:first-child), .counts-table td:not(:first-child) { text-align: center; }
	.counts-table th.sortable { cursor: pointer; user-select: none; }
	.counts-table .sticky-col { position: sticky; left: 0; background: var(--fff, #fff); z-index: 1; text-align: left; }
	.counts-table thead .sticky-col { background: var(--headerPrimary); z-index: 2; }
	.zero { opacity: 0.4; }
	.title-count { font-weight: 700; }
	.finish-chip { display: inline-block; padding: 0.1rem 0.55rem; border-radius: 999px; background: var(--eee, #eee); font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
	.finish-champ { background: var(--color-primary, #3498db); color: #fff; }
	.finish-final { background: transparent; border: 1px solid var(--color-primary, #3498db); color: var(--color-primary, #3498db); }
	.missed { opacity: 0.4; }
	h2 { margin-top: 2rem; }
</style>

<div class="wrap">
	<h1>Playoff History</h1>
	{#await historyData}
		<div class="loading">
			<p>Retrieving playoff history...</p>
			<LinearProgress indeterminate />
		</div>
	{:then history}
		<p class="note">Completed seasons ({history.seasons.join(', ')}). Finish = the round a team was eliminated in — placement games don't count. The current season joins the table once its playoffs are done.</p>

		<div class="league-card">
			<div class="table-wrap">
			<table class="league-table counts-table">
				<thead>
					<tr>
						<th class="sticky-col sortable" on:click={() => setSort('manager')}>Manager{arrow('manager')}</th>
						<th class="sortable" on:click={() => setSort('apps')}>Appearances{arrow('apps')}</th>
						<th class="sortable" on:click={() => setSort('champ')}>Champion{arrow('champ')}</th>
						<th class="sortable" on:click={() => setSort('final')}>Runner-up{arrow('final')}</th>
						<th class="sortable" on:click={() => setSort('sf')}>Semifinal{arrow('sf')}</th>
						<th class="sortable" on:click={() => setSort('qf')}>Quarterfinal{arrow('qf')}</th>
					</tr>
				</thead>
				<tbody>
					{#each applySort(history.rows, sortKey, sortDir) as row}
						<tr>
							<td class="sticky-col"><strong>{row.manager}</strong></td>
							<td>{row.apps || '—'}</td>
							<td>{#if row.champ}<span class="title-count">🏆 {row.champ}</span>{:else}<span class="zero">0</span>{/if}</td>
							<td>{row.final || ''}{#if !row.final}<span class="zero">0</span>{/if}</td>
							<td>{row.sf || ''}{#if !row.sf}<span class="zero">0</span>{/if}</td>
							<td>{row.qf || ''}{#if !row.qf}<span class="zero">0</span>{/if}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			</div>
		</div>

		<h2>Season by season</h2>
		<div class="league-card">
			<div class="table-wrap">
			<table class="league-table counts-table">
				<thead>
					<tr>
						<th class="sticky-col sortable" on:click={() => setSort('manager')}>Manager{arrow('manager')}</th>
						{#each history.seasons as year}<th class="sortable" on:click={() => setSort(String(year))}>{year}{arrow(String(year))}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each applySort(history.rows, sortKey, sortDir) as row}
						<tr>
							<td class="sticky-col"><strong>{row.manager}</strong></td>
							{#each history.seasons as year}
								<td>
									{#if row.finishes[year]}
										<span class="finish-chip finish-{row.finishes[year]}">{FINISH_LABEL[row.finishes[year]]}</span>
									{:else}
										<span class="missed">—</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			</div>
		</div>
	{:catch error}
		<p class="note">Playoff history couldn't be loaded right now.</p>
	{/await}
</div>
