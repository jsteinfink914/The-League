# Player Value Update Pipeline

This folder holds the yearly inputs and review files used to generate `static/Player_Values.txt`.

## Annual workflow

1. Fetch the FantasyPros auction calculator table directly:

```bash
npm run values:fetch -- --year YYYY
```

The command uses a browser session to select Half PPR, 16 teams, a $500
budget, and Overall Rankings. It verifies those settings and requires a
complete-looking result table before atomically replacing
`data/player-values/raw/fantasypros-YYYY.csv`. It does not log in or store
credentials. Use `--output /tmp/fantasypros-YYYY.csv` to test a fetch without
changing the project input.

Verified zero-market rows are kept separately from the unmodified fetched export in
`data/player-values/raw/fantasypros-YYYY-supplemental.csv`. Fetch validates that
source; prepare, generate, and audit reapply it after reading a fresh FantasyPros
export. A
supplemental row is appended only when its stable player name is absent from the
fetched export; the fetched row wins if it is already present.

If FantasyPros changes the calculator UI, blocks automation, or returns an
incomplete table, the command exits without replacing the existing CSV.

2. Let the script fetch Sleeper's NFL player JSON, or save it yourself to `data/player-values/raw/sleeper-players-YYYY.json`.
3. Run:

```bash
npm run values:prepare -- --year YYYY --fantasypros data/player-values/raw/fantasypros-YYYY.csv --fetch-sleeper
```

If you already have Sleeper JSON saved locally, run:

```bash
npm run values:prepare -- --year YYYY --fantasypros data/player-values/raw/fantasypros-YYYY.csv --sleeper data/player-values/raw/sleeper-players-YYYY.json
```

If you skip both `--fetch-sleeper` and `--sleeper`, the script will create an empty rookie review file for manual entry.

5. Review `data/player-values/review/rookies-YYYY.csv`.
6. Add missing name mappings to `static/fp_sleeper_mapping.txt` if needed.
7. Generate the static app file:

```bash
npm run values:generate -- --year YYYY --fantasypros data/player-values/raw/fantasypros-YYYY.csv
```

8. Audit league rosters for name mismatches (run after generate, before relying on team values):

```bash
npm run values:audit -- --year YYYY --fetch-sleeper
```

If you already have Sleeper JSON saved locally:

```bash
npm run values:audit -- --year YYYY --sleeper data/player-values/raw/sleeper-players-YYYY.json
```

Review `data/player-values/review/unmatched-roster-YYYY.csv` and add any needed rows to `static/fp_sleeper_mapping.txt`. The audit exits with a non-zero code when flagged players remain.

`values:generate` also copies `data/player-values/raw/fantasypros-YYYY.csv` to `static/fantasypros-YYYY.csv` so the Team Values page can show year-3 blend math (rookie + market).

## Rules encoded by the generator

`Rookie = 1` marks only the player's league-entry rookie year.

- Rookie year: rookie value
- Year 2: rookie value
- Year 3: halfway between rookie value and that year's FantasyPros market value
- Year 3 with no current FantasyPros market value: halfway between rookie value and `$0`
- Year 4 and later: FantasyPros market value
- Everyone without a historical rookie row: FantasyPros market value

Rookie contracts are matched by **normalized name** (suffixes like Jr./III/Sr. are ignored), so a 2025 rookie row for `Luther Burden` still applies to `Luther Burden III` in later years. Add explicit rows to `static/fp_sleeper_mapping.txt` when Sleeper and Fantasy Pros names differ in ways normalization cannot handle.

The rookie value defaults to the FantasyPros market value in the review file, but you can edit `RookieValue` before generation if your league sets it differently.
