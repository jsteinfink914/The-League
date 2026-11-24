<script>
	import LinearProgress from '@smui/linear-progress';

	export let data;
	const { historyData } = data;

	const FINISH_LABEL = { champ: '🏆 Champ', final: 'Final', sf: 'Semi', qf: 'Quarter' };
</script>

<style>
	.wrap { max-width: 1000px; margin: 0 auto; padding: 1rem; }
	.note { opacity: 0.75; font-size: 0.9rem; margin: 0.25rem 0 1rem; }
	.loading { max-width: 500px; margin: 80px auto; width: 85%; }
	.counts-table th:not(:first-child), .counts-table td:not(:first-child) { text-align: center; }
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
			<table class="league-table counts-table">
				<thead>
					<tr>
						<th>Manager</th>
						<th>Appearances</th>
						<th>Champion</th>
						<th>Runner-up</th>
						<th>Semifinal</th>
						<th>Quarterfinal</th>
					</tr>
				</thead>
				<tbody>
					{#each history.rows as row}
						<tr>
							<td><strong>{row.manager}</strong></td>
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

		<h2>Season by season</h2>
		<div class="league-card">
			<table class="league-table counts-table">
				<thead>
					<tr>
						<th>Manager</th>
						{#each history.seasons as year}<th>{year}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each history.rows as row}
						<tr>
							<td><strong>{row.manager}</strong></td>
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
	{:catch error}
		<p class="note">Playoff history couldn't be loaded right now.</p>
	{/await}
</div>
