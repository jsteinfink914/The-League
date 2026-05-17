# Player Value Update Pipeline

This folder holds the yearly inputs and review files used to generate `static/Player_Values.txt`.

## Annual workflow

1. Open the FantasyPros auction calculator.
2. Use these settings:
   - Half PPR
   - 16 teams
   - $500 budget
3. Copy the table into `data/player-values/raw/fantasypros-YYYY.csv`.
4. Let the script fetch Sleeper's NFL player JSON, or save it yourself to `data/player-values/raw/sleeper-players-YYYY.json`.
5. Run:

```bash
npm run values:prepare -- --year YYYY --fantasypros data/player-values/raw/fantasypros-YYYY.csv --fetch-sleeper
```

If you already have Sleeper JSON saved locally, run:

```bash
npm run values:prepare -- --year YYYY --fantasypros data/player-values/raw/fantasypros-YYYY.csv --sleeper data/player-values/raw/sleeper-players-YYYY.json
```

If you skip both `--fetch-sleeper` and `--sleeper`, the script will create an empty rookie review file for manual entry.

6. Review `data/player-values/review/rookies-YYYY.csv`.
7. Add missing name mappings to `static/fp_sleeper_mapping.txt` if needed.
8. Generate the static app file:

```bash
npm run values:generate -- --year YYYY --fantasypros data/player-values/raw/fantasypros-YYYY.csv
```

9. Audit league rosters for name mismatches (run after generate, before relying on team values):

```bash
npm run values:audit -- --year YYYY --fetch-sleeper
```

If you already have Sleeper JSON saved locally:

```bash
npm run values:audit -- --year YYYY --sleeper data/player-values/raw/sleeper-players-YYYY.json
```

Review `data/player-values/review/unmatched-roster-YYYY.csv` and add any needed rows to `static/fp_sleeper_mapping.txt`. The audit exits with a non-zero code when flagged players remain.

## Rules encoded by the generator

`Rookie = 1` marks only the player's league-entry rookie year.

- Rookie year: rookie value
- Year 2: rookie value
- Year 3: halfway between rookie value and that year's FantasyPros market value
- Year 4 and later: FantasyPros market value
- Everyone without a historical rookie row: FantasyPros market value

Rookie contracts are matched by **normalized name** (suffixes like Jr./III/Sr. are ignored), so a 2025 rookie row for `Luther Burden` still applies to `Luther Burden III` in later years. Add explicit rows to `static/fp_sleeper_mapping.txt` when Sleeper and Fantasy Pros names differ in ways normalization cannot handle.

The rookie value defaults to the FantasyPros market value in the review file, but you can edit `RookieValue` before generation if your league sets it differently.
