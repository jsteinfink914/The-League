import { getLeagueData } from './leagueData';
import { getLeagueRosters } from './leagueRosters';
import { waitForAll } from './multiPromise';
import { get } from 'svelte/store';
import { playoffHistory } from '$lib/stores';
import { managers as managerList } from '$lib/utils/leagueInfo';

// Managers are keyed by Sleeper user ID (leagueInfo), NOT display name:
// handles change between seasons (e.g. Sween was "NotDeadLast" in 2022),
// user IDs don't.
const nameByManagerID = new Map(managerList.map(m => [m.managerID, m.name]));

// All-time playoff history: for every completed season, each manager's
// finish (champ / final / sf / qf), aggregated into appearance counts by
// finishing round. The current in-progress season is excluded (same
// convention as Awards: it starts from the previous completed season).
export const getPlayoffHistory = async () => {
	const storeValue = get(playoffHistory);
	if (storeValue && storeValue.rows) {
		return storeValue;
	}
	const leagueData = await getLeagueData();
	if (!leagueData) {
		throw new Error('Failed to fetch league data for playoff history');
	}

	let seasonID = leagueData.status == 'complete' ? leagueData.league_id : leagueData.previous_league_id;

	const seasons = [];
	const byManager = new Map();
	const ensure = (name) => {
		if (!byManager.has(name)) {
			byManager.set(name, { manager: name, apps: 0, champ: 0, final: 0, sf: 0, qf: 0, finishes: {} });
		}
		return byManager.get(name);
	};
	// Seed every current manager so 0-appearance managers still get a row.
	for (const m of managerList) ensure(m.name);

	while (seasonID && seasonID != 0) {
		const season = await getSeasonFinishes(seasonID);
		seasonID = season.previousSeasonID;
		if (!season.finishes) continue;
		seasons.push(season.year);
		for (const [name, finish] of Object.entries(season.finishes)) {
			const row = ensure(name);
			row.apps++;
			row[finish]++;
			row.finishes[season.year] = finish;
		}
	}

	const rows = [...byManager.values()].sort((a, b) =>
		b.champ - a.champ || b.final - a.final || b.sf - a.sf || b.apps - a.apps || a.manager.localeCompare(b.manager)
	);
	const data = { rows, seasons };
	playoffHistory.update(() => data);
	return data;
};

// One season's finishes: { year, previousSeasonID, finishes: {name: finish} }
const getSeasonFinishes = async (seasonID) => {
	const [leagueRes, rostersData, usersRes, bracketRes] = await waitForAll(
		fetch(`https://api.sleeper.app/v1/league/${seasonID}`, { compress: true }),
		getLeagueRosters(seasonID),
		fetch(`https://api.sleeper.app/v1/league/${seasonID}/users`, { compress: true }),
		fetch(`https://api.sleeper.app/v1/league/${seasonID}/winners_bracket`, { compress: true }),
	).catch((err) => { console.error(err); });

	if (!leagueRes.ok || !usersRes.ok || !bracketRes.ok) {
		return { previousSeasonID: null, finishes: null };
	}

	const [league, users, bracket] = await waitForAll(
		leagueRes.json(),
		usersRes.json(),
		bracketRes.json(),
	).catch((err) => { console.error(err); });

	const year = league.season;
	const previousSeasonID = league.previous_league_id;
	if (!bracket || !bracket.length) {
		return { previousSeasonID, year, finishes: null };
	}

	const displayByUser = new Map(users.map(u => [u.user_id, u.display_name]));
	// getLeagueRosters returns rosters as a map keyed by roster_id, not an array.
	const nameByRoster = new Map(Object.values(rostersData.rosters).map(r => [
		r.roster_id,
		nameByManagerID.get(r.owner_id) || displayByUser.get(r.owner_id) || 'Unknown',
	]));

	// The championship path: the final is the last-round match fed by
	// winners (placement games are fed by losers) — same test Awards uses.
	// Semifinal losers are found by tracing the final's t*_from.w match IDs;
	// placement-game results never change a team's finish.
	const rounds = league.settings.playoff_rounds || Math.max(...bracket.map(m => m.r));
	const byMatch = new Map(bracket.map(m => [m.m, m]));
	const final = bracket.find(m => m.r === rounds && m.t1_from && m.t1_from.w);
	if (!final) {
		return { previousSeasonID, year, finishes: null };
	}

	const finishes = {};
	const setFinish = (rosterID, finish) => {
		const name = nameByRoster.get(rosterID);
		if (name && finishes[name] === undefined) finishes[name] = finish;
	};
	setFinish(final.w, 'champ');
	setFinish(final.l, 'final');
	for (const from of [final.t1_from, final.t2_from]) {
		const semi = from && byMatch.get(from.w);
		if (semi) setFinish(semi.l, 'sf');
	}
	const appeared = new Set();
	for (const m of bracket) {
		if (m.t1) appeared.add(m.t1);
		if (m.t2) appeared.add(m.t2);
	}
	for (const rosterID of appeared) setFinish(rosterID, 'qf');

	return { previousSeasonID, year, finishes };
};
