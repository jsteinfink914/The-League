<script>
	import Wheel from '$lib/Lottery/Wheel.svelte';

	export let data;
	const { lotteryTeams, season } = data;

	// Weighted random pick, ported from Dynasty-Lottery utils/lottery.js
	const selectTeam = (teams) => {
		const total = teams.reduce((sum, team) => sum + team.odds, 0);
		let rand = Math.random() * total;
		for (const team of teams) {
			if (rand < team.odds) return team;
			rand -= team.odds;
		}
		return teams[teams.length - 1];
	};

	const runSimulation = (teams, rounds) => {
		const results = {};
		teams.forEach((team) => {
			results[team.name] = Array(teams.length).fill(0);
		});
		for (let i = 0; i < rounds; i++) {
			let remaining = [...teams];
			for (let pos = 0; pos < teams.length; pos++) {
				const selected = selectTeam(remaining);
				results[selected.name][pos]++;
				remaining = remaining.filter((t) => t !== selected);
			}
		}
		Object.keys(results).forEach((team) => {
			results[team] = results[team].map((count) => (count / rounds) * 100);
		});
		return results;
	};

	let teams = lotteryTeams ? lotteryTeams.map((t) => ({ ...t })) : [];
	let lotteryStarted = false;
	let remainingTeams = [];
	let draftOrder = [];
	let spinning = false;
	let rotation = 0;
	let revealingLast = false;
	let runId = 0;
	let simulationRounds = 10000;
	let simulationResults = null;
	let error = '';

	$: totalOdds = teams.reduce((sum, t) => sum + (Number(t.odds) || 0), 0);

	const validTeams = () =>
		teams.length === 6 &&
		teams.every((t) => t.name && Number(t.odds) > 0) &&
		new Set(teams.map((t) => t.name)).size === teams.length;

	const startLottery = () => {
		if (!validTeams()) {
			error = 'Need 6 teams with unique names and odds above 0.';
			return;
		}
		error = '';
		remainingTeams = teams.map((t) => ({ ...t }));
		draftOrder = [];
		simulationResults = null;
		rotation = 0;
		revealingLast = false;
		runId++;
		lotteryStarted = true;
	};

	const resetLottery = () => {
		lotteryStarted = false;
		remainingTeams = [];
		draftOrder = [];
		spinning = false;
		rotation = 0;
		revealingLast = false;
		runId++;
	};

	const spin = () => {
		if (spinning || remainingTeams.length === 0) return;
		spinning = true;
		const id = runId;

		const team = selectTeam(remainingTeams);
		const total = remainingTeams.reduce((sum, t) => sum + t.odds, 0);
		let cumulative = 0;
		const segments = remainingTeams.map((t) => {
			const start = (cumulative / total) * 360;
			cumulative += t.odds;
			const end = (cumulative / total) * 360;
			return { team: t, start, end };
		});
		const segment = segments.find((s) => s.team === team);
		const targetLocal = ((segment.start + segment.end) / 2 + 360) % 360;
		// The rotor may already be rotated from previous spins, so convert the
		// winning segment's midpoint to global (on-screen) coordinates first.
		// Then rotate forward ~5 turns so it lands exactly under the pointer.
		const targetGlobal = (((targetLocal + rotation) % 360) + 360) % 360;
		rotation = rotation + 360 * 5 - targetGlobal;

		setTimeout(() => {
			if (id !== runId) return;
			spinning = false;
			const newOrder = [...draftOrder, team];
			const newRemaining = remainingTeams.filter((t) => t !== team);
			if (newRemaining.length === 1) {
				// Final pick is determined — reveal it automatically, no spin needed.
				remainingTeams = [];
				revealingLast = true;
				setTimeout(() => {
					if (id !== runId) return;
					draftOrder = [...newOrder, newRemaining[0]];
					revealingLast = false;
				}, 1200);
			} else {
				draftOrder = newOrder;
				remainingTeams = newRemaining;
			}
		}, 3100);
	};

	const runSim = () => {
		if (!validTeams()) {
			error = 'Need 6 teams with unique names and odds above 0.';
			return;
		}
		if (!(simulationRounds >= 1 && simulationRounds <= 1000000)) {
			error = 'Simulation rounds must be between 1 and 1,000,000.';
			return;
		}
		error = '';
		simulationResults = runSimulation(teams, simulationRounds);
	};
</script>

<svelte:head>
	<title>Lottery | League Page</title>
</svelte:head>

<main>
	<h1>Draft Lottery</h1>
	<p class="sub">
		The bottom 6 regular-season finishers enter the lottery for picks 1&ndash;6,
		with odds set by the league constitution. Field below is based on the current
		{season} standings&mdash;final field locks when the regular season ends.
	</p>

	{#if !lotteryTeams}
		<p class="error">Couldn't load league standings. Try again once the season has started.</p>
	{:else}
		{#if error}<p class="error">{error}</p>{/if}

		{#if !lotteryStarted}
			<section class="card">
				<h2>Lottery Field</h2>
				<table>
					<thead>
						<tr><th>Finish</th><th>Team</th><th>Record</th><th>Odds (%)</th></tr>
					</thead>
					<tbody>
						{#each teams as team, i}
							<tr>
								<td>{team.finish}th</td>
								<td>{team.name}</td>
								<td>{team.record}</td>
								<td>
									<input
										type="number"
										min="0.1"
										step="0.1"
										bind:value={teams[i].odds}
										aria-label="Odds for {team.name}"
									/>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="total">Total odds: {totalOdds.toFixed(1)}%</p>
				<button class="primary" on:click={startLottery}>Start Lottery</button>
			</section>

			<section class="card">
				<h2>Odds Simulation</h2>
				<p class="sub">Monte Carlo simulation of each team's chance at every pick.</p>
				<div class="sim-controls">
					<input
						type="number"
						min="1"
						max="1000000"
						bind:value={simulationRounds}
						aria-label="Simulation rounds"
					/>
					<button class="primary" on:click={runSim}>Run Simulation</button>
				</div>
				{#if simulationResults}
					<table>
						<thead>
							<tr><th>Team</th><th>Pick 1</th><th>Pick 2</th><th>Pick 3</th><th>Pick 4</th><th>Pick 5</th><th>Pick 6</th></tr>
						</thead>
						<tbody>
							{#each teams as team}
								<tr>
									<td>{team.name}</td>
									{#each simulationResults[team.name] as pct}
										<td>{pct.toFixed(1)}%</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{:else}
			<section class="card lottery-run">
				<h2>Pick {draftOrder.length + 1} of 6</h2>
				{#if remainingTeams.length > 0}
					<Wheel teams={remainingTeams} {rotation} />
					<button class="primary spin" on:click={spin} disabled={spinning}>
						{spinning ? 'Spinning...' : `Spin for Pick ${draftOrder.length + 1}`}
					</button>
				{:else if revealingLast}
					<p class="done">And the final pick goes to...</p>
				{:else}
					<p class="done">Lottery complete.</p>
				{/if}

				{#if draftOrder.length > 0}
					<h3>Draft Order</h3>
					<ol class="draft-order">
						{#each draftOrder as team, i}
							<li><span class="pick">Pick {i + 1}</span> {team.name}</li>
						{/each}
					</ol>
				{/if}

				<button class="secondary" on:click={resetLottery}>Reset Lottery</button>
			</section>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 860px;
		margin: 0 auto;
		padding: 24px 16px 64px;
	}
	h1 {
		text-align: center;
		margin-bottom: 8px;
	}
	.sub {
		text-align: center;
		opacity: 0.75;
		max-width: 640px;
		margin: 0 auto 24px;
	}
	.card {
		background: var(--fff, #fff);
		border: 1px solid rgba(0, 49, 107, 0.25);
		border-radius: 12px;
		padding: 20px;
		margin-bottom: 24px;
		box-shadow: 0 2px 8px rgba(0, 49, 107, 0.08);
	}
	.card h2 {
		margin-top: 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin: 12px 0;
	}
	th, td {
		text-align: left;
		padding: 10px 8px;
		border-bottom: 1px solid rgba(0, 49, 107, 0.15);
	}
	th {
		font-size: 0.85em;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.7;
	}
	input[type='number'] {
		width: 90px;
		padding: 8px;
		border: 1px solid rgba(0, 49, 107, 0.35);
		border-radius: 8px;
		font-size: 1em;
		background: transparent;
		color: inherit;
	}
	.total {
		font-weight: bold;
	}
	button {
		cursor: pointer;
		border: none;
		border-radius: 8px;
		padding: 10px 20px;
		font-size: 1em;
		font-weight: 600;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.primary {
		background: #00316b;
		color: #fff;
	}
	.primary:hover:not(:disabled) {
		background: #004a9e;
	}
	.secondary {
		background: transparent;
		color: #00316b;
		border: 1px solid #00316b;
		margin-top: 16px;
	}
	.sim-controls {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 8px;
	}
	.lottery-run {
		text-align: center;
	}
	button.spin {
		margin: 20px 0 8px;
		font-size: 1.1em;
		padding: 12px 32px;
	}
	.done {
		font-size: 1.3em;
		font-weight: bold;
	}
	.draft-order {
		list-style: none;
		padding: 0;
		max-width: 420px;
		margin: 16px auto;
		text-align: left;
	}
	.draft-order li {
		padding: 10px 14px;
		border-bottom: 1px solid rgba(0, 49, 107, 0.15);
		font-size: 1.1em;
	}
	.pick {
		display: inline-block;
		min-width: 70px;
		font-weight: bold;
		color: #00316b;
	}
	.error {
		color: #c1121f;
		font-weight: 600;
		text-align: center;
	}
</style>
