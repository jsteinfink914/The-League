import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const ROOT = process.cwd();
const YEAR = 2026;
const RAW_DIR = path.join(ROOT, 'data', 'player-values', 'raw');
const REVIEW_DIR = path.join(ROOT, 'data', 'player-values', 'review');
const STATIC_DIR = path.join(ROOT, 'static');

function fileStat(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, mtime: stat.mtime.toISOString(), size: stat.size };
  } catch {
    return { exists: false, mtime: null, size: 0 };
  }
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

export async function GET() {
  const fpRawPath = path.join(RAW_DIR, `fantasypros-${YEAR}.csv`);
  const rookiesPath = path.join(REVIEW_DIR, `rookies-${YEAR}.csv`);
  const unmatchedRookiesPath = path.join(REVIEW_DIR, `unmatched-rookies-${YEAR}.csv`);
  const unmatchedRosterPath = path.join(REVIEW_DIR, `unmatched-roster-${YEAR}.csv`);
  const valuesPath = path.join(STATIC_DIR, 'Player_Values.txt');

  const rookies = readCsv(rookiesPath).filter((r) => Number(r.Rookie) === 1);
  const unmatchedRookies = readCsv(unmatchedRookiesPath);
  const auditIssues = readCsv(unmatchedRosterPath);
  const fpRowCount = readCsv(fpRawPath).length;
  const blockingIssues = auditIssues.filter(
    (issue) => !issue.Severity || issue.Severity === 'blocking'
  );
  const warningIssues = auditIssues.filter((issue) => issue.Severity === 'warning');
  const publishBlockers = [];
  if (!fileStat(fpRawPath).exists) publishBlockers.push('No FantasyPros export has been fetched.');
  if (!fileStat(valuesPath).exists) publishBlockers.push('No generated player values file exists.');
  if (!fileStat(unmatchedRosterPath).exists) publishBlockers.push('Run the roster audit before publishing.');
  if (blockingIssues.length) {
    publishBlockers.push(`${blockingIssues.length} unresolved roster/value issue(s) remain.`);
  }

  return json({
    year: YEAR,
    fpRaw: { ...fileStat(fpRawPath), rowCount: fpRowCount },
    rookiesReview: { ...fileStat(rookiesPath), rows: rookies },
    unmatchedRookies: { ...fileStat(unmatchedRookiesPath), rows: unmatchedRookies },
    auditIssues: {
      ...fileStat(unmatchedRosterPath),
      rows: auditIssues,
      blockingCount: blockingIssues.length,
      warningCount: warningIssues.length
    },
    playerValues: fileStat(valuesPath),
    publishReadiness: {
      ready: publishBlockers.length === 0,
      blockers: publishBlockers,
      warningCount: warningIssues.length
    }
  });
}
