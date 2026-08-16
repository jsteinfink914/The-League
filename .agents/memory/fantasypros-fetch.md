---
name: FantasyPros fetch automation
description: How the browser-automation fetch script works and what dependencies it needs.
---

## Script: `scripts/fetch-fantasypros-values.js`

Automates `https://www.fantasypros.com/nfl/auction-values/calculator.php` with Playwright.

### Key learnings

- The calculator lives in a cross-origin iframe at `https://draftwizard.fantasypros.com/auction/fp_nfl.jsp`.
- After clicking **Calculate**, the iframe navigates (URL gains query string). The Playwright Frame object becomes stale — re-find it by `url().split('?')[0] === TARGET_FRAME_BASE` after the navigation.
- The `#` rank column is **empty** after Calculate (it was `'1.'` before). Use the row index as rank instead of parsing that cell.
- Table column order: `['#', 'Overall', 'Value', '']` — 3rd cell is `$147`, 4th is `147` (raw). The output CSV uses `['#', 'Overall', 'Points', 'Value']` to match `readFantasyProsValues` expectations.
- Validates: ≥200 rows, all values match `$\d+`, no duplicate player names; only then atomically replaces the CSV.

### System dependencies (required for Chromium headless)

Installed via Nix: `glib nss nspr atk at-spi2-atk cups dbus expat fontconfig freetype pango cairo libdrm mesa libkbcommon libgbm alsa-lib xorg.libX11 xorg.libXcomposite xorg.libXdamage xorg.libXext xorg.libXfixes xorg.libXrandr xorg.libxcb xorg.libxkbfile xorg.libXScrnSaver`

**Why:** Chromium headless shell requires these shared libraries at runtime on NixOS.

### Browser cache

`PLAYWRIGHT_BROWSERS_PATH` must point to `.cache/ms-playwright` in the project root when spawning from a server endpoint (the env var is injected explicitly in the `/api/commissioner/fetch` server route).

### Commissioner page

- Route: `/commissioner` — not in nav or tabs; accessible only via hidden `·` link at end of copyright line in Footer.
- Four steps: Fetch → Rookie Review (inline edit) → Generate → Audit.
- API endpoints under `/api/commissioner/`: `state` (GET), `fetch` (POST, 120s), `rookies` (PUT), `generate` (POST), `audit` (POST).
- Year is hardcoded as `2026` in both the page and all server endpoints; update both when the season year rolls over.
