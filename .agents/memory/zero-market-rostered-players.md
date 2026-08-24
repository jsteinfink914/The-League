---
name: Zero-market rostered players
description: How to resolve rostered players omitted from FantasyPros' current auction-value export.
---

FantasyPros' annual auction-value export can exclude active rostered players whose current market value is $0. Add explicit, roster-accurate $0 source rows and rerun prepare, generate, and audit; do not map a player to a merely similar name.

**Why:** Fuzzy audit suggestions can point to unrelated players with superficially similar names, which would silently assign an incorrect market value. An explicit zero remains visible as an audit warning while removing the unresolved state.

**How to apply:** After a refresh, inspect blocking roster rows against the fetched source. Use mappings only for verified alternate names. For a player absent from the source, add a distinct $0 row with the correct name and position, rebuild the rookie review so first-year players retain rookie status, then generate and audit.