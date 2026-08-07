---
name: Team value contract labels
description: Durable rules for keeping team-value contract labels and calculations aligned.
---

Team Values should number only the rookie-contract phases (Years 1–3). Players beyond the rookie deal should use the plain “Market” label, not a “Year 4+” or “Year 5” label. Year 3 must show the rookie-plus-market blend when a market quote exists; if it does not, the UI must say the blend is unavailable instead of implying math was performed.

**Why:** The static player-value generator already applies the league contract rules, so a broader or independently inferred UI label can make correct values appear mismatched and can hide missing market inputs.

**How to apply:** Keep contract-year classification, displayed formulas, and generated `Player_Values.txt` values aligned. When updating annual values, audit every year-3 row against `(rookie value + market value) / 2` and avoid silently treating missing market data as a valid blend.