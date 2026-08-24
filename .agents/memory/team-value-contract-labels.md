---
name: Team value contract labels
description: Durable rules for keeping team-value contract labels and calculations aligned.
---

Team Values should number only the rookie-contract phases (Years 1–3). Players beyond the rookie deal should use the plain “Market” label, not a “Year 4+” or “Year 5” label. Year 3 uses the rookie-plus-market blend; when a current market quote is absent, use an explicit `$0` market fallback and show that assumption.

**Why:** The league rule treats a missing Year 3 market value as zero rather than leaving the player unresolved. The generator, audit output, and UI must agree so valid fallback values are not mislabeled.

**How to apply:** Keep contract-year classification, displayed formulas, and generated `Player_Values.txt` values aligned. When updating annual values, audit every Year 3 row against `(rookie value + market value) / 2`; substitute zero only when the market row is absent, and expose the fallback in the formula and audit warning.