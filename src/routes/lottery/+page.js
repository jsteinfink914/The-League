import { getLeagueStandings, getLeagueTeamManagers } from '$lib/utils/helper';
import { getTeamNameFromTeamManagers } from '$lib/utils/helperFunctions/universalFunctions';

// Draft lottery odds straight from the league constitution
// (Article 1, Draft Order Guidelines): the bottom 6 regular-season
// finishers enter a lottery for picks 1-6. Odds by finish, worst first:
// 21% / 21% / 21% / 16% / 12% / 9%.
const LOTTERY_ODDS_FROM_BOTTOM = [21, 21, 21, 16, 12, 9];

export async function load() {
	const [standingsData, teamManagersData] = await Promise.all([
		getLeagueStandings(),
		getLeagueTeamManagers()
	]).catch(() => [null, null]);

	if (!standingsData?.standingsInfo || !teamManagersData) {
		return { lotteryTeams: null, season: null };
	}

	const year = teamManagersData.currentSeason;
	const totalTeams = Object.keys(standingsData.standingsInfo).length;

	// Regular-season finish, worst first (wins, then ties, then points for).
	const sorted = Object.values(standingsData.standingsInfo).sort(
		(a, b) => a.wins - b.wins || a.ties - b.ties || a.fpts - b.fpts
	);

	const lotteryTeams = sorted.slice(0, 6).map((entry, i) => {
		let name = 'Unknown Team';
		try {
			name = getTeamNameFromTeamManagers(teamManagersData, entry.rosterID, year);
		} catch {
			// fall back to placeholder
		}
		return {
			rosterID: entry.rosterID,
			name,
			finish: totalTeams - i,
			odds: LOTTERY_ODDS_FROM_BOTTOM[i],
			record: `${entry.wins}-${entry.losses}${entry.ties ? `-${entry.ties}` : ''}`
		};
	});

	return { lotteryTeams, season: year };
}
