// Shared loader for the Manager Overview dataset: player values,
// FantasyPros market values, cap history, and the cap/trade/draft
// builders combined into per-manager rows. The Manager Overview page
// and the Ask bot both load through here so their numbers can never
// disagree — one pipeline, two consumers.
import Papa from 'papaparse';
import { buildCapAnalysisData } from './capAnalysis';
import { buildTradeAnalysisData } from './tradeAnalysis';
import { buildDraftAnalysisData } from './draftAnalysis';
import { buildCombined } from './managerOverview';
import {
    buildRookieContracts,
    buildValueIndexes,
    parseFantasyProsMarketCsv,
} from '../playerNameLookup';

export const MANAGER_OVERVIEW_VALUE_YEAR = '2026';

export const loadManagerOverviewData = async (onStep = () => {}) => {
    onStep('Loading player data…');
    const [playerMapRes, managerMapRes, playerValuesRes, nflPlayersRes] = await Promise.all([
      fetch('/fp_sleeper_mapping.txt'),
      fetch('/Manager_map.txt'),
      fetch('/Player_Values.txt'),
      fetch('https://api.sleeper.app/v1/players/nfl')
    ]);

    const [playerMapText, managerMapText, playerValuesText, nflPlayers] = await Promise.all([
      playerMapRes.text(),
      managerMapRes.text(),
      playerValuesRes.text(),
      nflPlayersRes.json()
    ]);

    const playerMappings = Papa.parse(playerMapText, { header: true }).data;
    const sleeperToFantasyPros = new Map(
      playerMappings.filter(e => e.Sleeper && e.Fantasy_Pros).map(e => [e.Sleeper, e.Fantasy_Pros])
    );

    const managerMappings = Papa.parse(managerMapText, { header: true }).data;
    const managerMapRaw = new Map(managerMappings.map(e => [e.Index, e.Name]));

    const playerValues = Papa.parse(playerValuesText, { header: true, skipEmptyLines: true }).data;
    const historyRows = playerValues
      .filter(e => e.Year && e.Name)
      .map(e => ({ Year: Number(e.Year), Name: String(e.Name).trim(), Value: parseFloat(e.Value) || 0, Rookie: Number(e.Rookie) === 1 ? 1 : 0 }));

    const yearRows = historyRows.filter(e => String(e.Year) === MANAGER_OVERVIEW_VALUE_YEAR);
    const valueIndexes = { ...buildValueIndexes(yearRows), sleeperToFantasyPros };
    const rookieContracts = buildRookieContracts(historyRows);

    let marketValueByName = new Map();
    try {
      const mktRes = await fetch(`/fantasypros-${MANAGER_OVERVIEW_VALUE_YEAR}.csv`);
      if (mktRes.ok) marketValueByName = parseFantasyProsMarketCsv(await mktRes.text());
    } catch (e) { console.warn('FP market file not loaded:', e); }

    let preloadedHistory = null;
    try {
      const histRes = await fetch('/cap-history.json');
      if (histRes.ok) {
        const histJson = await histRes.json();
        if (Array.isArray(histJson.seasonTrends)) {
          preloadedHistory = histJson.seasonTrends;
        }
      }
    } catch (e) { console.warn('[ManagerOverview] cap-history.json not available:', e.message); }

    onStep('Building cap analysis…');
    const capData = await buildCapAnalysisData({ historyRows, marketValueByName, rookieContracts, valueIndexes, players: nflPlayers, managerMapRaw, valueYear: MANAGER_OVERVIEW_VALUE_YEAR, preloadedHistory });

    onStep('Building trade analysis…');
    const tradeData = await buildTradeAnalysisData({ players: nflPlayers });

    onStep('Building draft analysis…');
    const draftData = await buildDraftAnalysisData({ players: nflPlayers });

    const combined = buildCombined(capData, tradeData, draftData);
    return { capData, tradeData, draftData, combined };
};
