<script>
	// Spinning prize wheel, segments weighted by each team's lottery odds.
	// Ported from the Dynasty-Lottery app (components/Wheel.js).
	export let teams = []; // [{ name, odds }]
	export let rotation = 0;

	const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];

	const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
		const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
		return {
			x: centerX + radius * Math.cos(angleInRadians),
			y: centerY + radius * Math.sin(angleInRadians)
		};
	};

	const describeArc = (x, y, radius, startAngle, endAngle) => {
		const start = polarToCartesian(x, y, radius, endAngle);
		const end = polarToCartesian(x, y, radius, startAngle);
		const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
		return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y, 'L', x, y, 'Z'].join(' ');
	};

	$: totalOdds = teams.reduce((sum, team) => sum + team.odds, 0);
	$: segments = (() => {
		let cumulative = 0;
		return teams.map((team) => {
			const startAngle = totalOdds > 0 ? (cumulative / totalOdds) * 360 : 0;
			cumulative += team.odds;
			const endAngle = totalOdds > 0 ? (cumulative / totalOdds) * 360 : 0;
			return { team, startAngle, endAngle };
		});
	})();
</script>

<div class="wheel-wrap">
	<div class="wheel-rotor" style="transform: rotate({rotation}deg)">
		<svg viewBox="0 0 100 100" class="wheel-svg">
			{#each segments as segment, index}
				<path
					d={describeArc(50, 50, 45, segment.startAngle, segment.endAngle)}
					fill={colors[index % colors.length]}
					stroke="white"
					stroke-width="0.5"
				/>
			{/each}
			{#each segments as segment}
				{@const angle = (segment.startAngle + segment.endAngle) / 2}
				{@const labelPos = polarToCartesian(50, 50, 30, angle)}
				<text
					x={labelPos.x}
					y={labelPos.y}
					text-anchor="middle"
					fill="white"
					font-size="4.2"
					font-weight="bold"
					dy=".35em"
				>
					{segment.team.name}
				</text>
			{/each}
			<circle cx="50" cy="50" r="4" fill="#1a1a2e" stroke="white" stroke-width="1" />
		</svg>
	</div>
	<svg viewBox="0 0 100 100" class="wheel-pointer">
		<polygon points="50,1 45,9 55,9" fill="#e63946" stroke="white" stroke-width="0.8" />
	</svg>
</div>

<style>
	.wheel-wrap {
		position: relative;
		width: 100%;
		max-width: 320px;
		aspect-ratio: 1 / 1;
		margin: 0 auto;
	}
	.wheel-rotor {
		position: absolute;
		inset: 0;
		transition: transform 3s cubic-bezier(0.33, 0, 0.66, 1);
		will-change: transform;
	}
	.wheel-svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.wheel-pointer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 2;
	}
</style>
