---
name: Zero-market rostered players
description: How to resolve rostered players omitted from FantasyPros' current auction-value export.
---

FantasyPros' annual auction-value export can exclude active rostered players whose current market value is $0. Keep verified, roster-accurate $0 rows in a separate supplemental source; the fetched export must remain unmodified and the prepare/generate/audit flow must merge the supplement. Do not map a player to a merely similar name.

**Why:** Fuzzy audit suggestions can point to unrelated players with superficially similar names, which would silently assign an incorrect market value. Preserving the raw export makes refresh provenance inspectable, while a deterministic supplemental merge keeps verified zero-value players resolved after every fetch.

**How to apply:** After a refresh, inspect blocking roster rows against the fetched source. Use mappings only for verified alternate names. For a player absent from the source, add a distinct $0 row with the correct name and position to the supplemental source, rebuild the rookie review so first-year players retain rookie status, then generate and audit. Reject duplicate stable source names rather than silently retaining ambiguity.