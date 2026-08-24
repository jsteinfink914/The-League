import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { chromium } from 'playwright';
import { readSupplementalRows, sourceNameKey } from './fantasypros-supplemental.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_URL = 'https://www.fantasypros.com/nfl/auction-values/calculator.php';
const RAW_DIR = path.join(ROOT, 'data', 'player-values', 'raw');
const SUPPLEMENTAL_SUFFIX = '-supplemental.csv';
const TARGET_FRAME_BASE = 'https://draftwizard.fantasypros.com/auction/fp_nfl.jsp';
const REQUIRED_SETTINGS = {
  scoring: { value: 'HALF', label: 'Half PPR' },
  teams: { value: '16', label: '16 Teams' },
  tb: { value: '500', label: '$500 Budget' }
};
const MINIMUM_ROWS = 200;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const year = Number(args.year);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    fail('Missing or invalid --year YYYY.');
  }

  const outputPath = resolvePath(
    args.output || path.join(RAW_DIR, `fantasypros-${year}.csv`)
  );
  const supplementalPath = resolvePath(
    args.supplemental || path.join(RAW_DIR, `fantasypros-${year}${SUPPLEMENTAL_SUFFIX}`)
  );
  const url = args.url || DEFAULT_URL;
  const browser = await chromium.launch({ headless: !Boolean(args.headed) });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    let frame = await findCalculatorFrame(page);
    await frame.locator('select[name="scoring"]').waitFor({ state: 'visible', timeout: 30_000 });

    await selectRequiredSettings(frame);
    await selectOverallRankings(frame);

    // Calculate submits the form — the iframe navigates to a new URL.
    // After navigation the frame object is stale; re-find by base URL.
    frame = await calculateAndRefindFrame(frame, page);

    await verifySettingsAfterCalculate(frame);

    const rows = await extractOverallRows(frame);
    validateRows(rows);
    const supplementalRows = readSupplementalIfPresent(supplementalPath);
    writeCsvAtomically(outputPath, rows);

    console.log(`Fetched ${rows.length} FantasyPros overall rows.`);
    console.log(
      `Settings: ${Object.values(REQUIRED_SETTINGS)
        .map((s) => s.label)
        .join(', ')}`
    );
    console.log(`Output: ${relative(outputPath)}`);
    if (supplementalRows.length) {
      console.log(
        `Verified supplemental source: ${relative(supplementalPath)} ` +
          `(${supplementalRows.length} zero-market rows reapplied by prepare, generate, and audit).`
      );
    }
  } catch (error) {
    fail(`FantasyPros fetch failed safely: ${error.message}`);
  } finally {
    await browser.close();
  }
}

async function findCalculatorFrame(page) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => f.url().split('?')[0] === TARGET_FRAME_BASE);
    if (frame) return frame;
    await page.waitForTimeout(250);
  }
  throw new Error(
    'The FantasyPros calculator iframe did not load. The site may have changed, ' +
      'blocked automation, or require a browser session.'
  );
}

async function selectRequiredSettings(frame) {
  for (const [name, setting] of Object.entries(REQUIRED_SETTINGS)) {
    await frame.locator(`select[name="${name}"]`).selectOption(setting.value);
    const actual = await frame.locator(`select[name="${name}"]`).inputValue();
    if (actual !== setting.value) {
      throw new Error(
        `Could not select ${setting.label}; FantasyPros returned "${actual}".`
      );
    }
  }
}

async function selectOverallRankings(frame) {
  await frame.getByRole('link', { name: 'Overall Rankings', exact: true }).click();
  await frame.locator('#OverallTable').waitFor({ state: 'visible', timeout: 15_000 });
}

async function calculateAndRefindFrame(frame, page) {
  const calculateButton = frame.locator('input[type="submit"][value="Calculate"]');
  if ((await calculateButton.count()) !== 1) {
    throw new Error('The FantasyPros Calculate button was not found.');
  }

  // The frame navigates on submit; waitForNavigation on the frame itself.
  await Promise.all([
    frame.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null),
    calculateButton.click()
  ]);

  // Re-find because the URL query string changed.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const updated = page.frames().find((f) => f.url().split('?')[0] === TARGET_FRAME_BASE);
    if (updated) {
      try {
        await updated.locator('select[name="scoring"]').waitFor({ state: 'visible', timeout: 5_000 });
        return updated;
      } catch {
        // not ready yet
      }
    }
    await page.waitForTimeout(300);
  }

  throw new Error('Calculator frame did not recover after Calculate.');
}

async function verifySettingsAfterCalculate(frame) {
  for (const [name, setting] of Object.entries(REQUIRED_SETTINGS)) {
    const actual = await frame.locator(`select[name="${name}"]`).inputValue();
    if (actual !== setting.value) {
      throw new Error(
        `FantasyPros did not preserve ${setting.label} after Calculate (got "${actual}").`
      );
    }
  }
  if (!(await frame.locator('#OverallTable').isVisible())) {
    throw new Error('FantasyPros did not return the Overall Rankings table.');
  }
}

async function extractOverallRows(frame) {
  // Wait for at least one data row to appear.
  await frame.locator('#OverallTable tr:nth-child(2)').waitFor({ state: 'attached', timeout: 15_000 });

  return frame.locator('#OverallTable tr').evaluateAll((tableRows) => {
    // Header: ['#', 'Overall', 'Value', '']
    // Data:   ['',  'Player (TEAM - POS)',  '$147', '147']
    // After Calculate, the rank cell is empty — use row index instead.
    return tableRows
      .slice(1) // drop header
      .map((row, idx) => {
        const cells = [...row.cells].map((c) => c.textContent.trim());
        const player = cells[1] || '';
        const dollarValue = cells[2] || '';
        const rawPoints = cells[3] || '';
        if (!player || !/^\$\d+$/.test(dollarValue)) return null;
        return {
          '#': idx + 1,
          Overall: player,
          Points: rawPoints,
          Value: dollarValue
        };
      })
      .filter(Boolean);
  });
}

function validateRows(rows) {
  if (rows.length < MINIMUM_ROWS) {
    throw new Error(
      `Only ${rows.length} overall rows extracted; refusing to replace input — result looks incomplete.`
    );
  }

  const duplicates = rows
    .map((r) => sourceNameKey(r.Overall))
    .filter((n, i, a) => a.indexOf(n) !== i);
  if (duplicates.length) {
    throw new Error(
      `Overall table has duplicate player labels: ${[...new Set(duplicates)].join(', ')}.`
    );
  }
}

function readSupplementalIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return readSupplementalRows(filePath);
  } catch (error) {
    throw new Error(error.message);
  }
}

function writeCsvAtomically(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  const csv = Papa.unparse(rows, {
    columns: ['#', 'Overall', 'Points', 'Value'],
    header: true,
    newline: '\n'
  });
  try {
    fs.writeFileSync(tmp, `${csv}\n`);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fs.existsSync(tmp)) fs.rmSync(tmp);
    throw err;
  }
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    result[key] = value;
  }
  return result;
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function relative(p) {
  return path.relative(ROOT, p) || '.';
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

main();
