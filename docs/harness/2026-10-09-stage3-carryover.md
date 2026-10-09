# Stage 3 carry-over (items for entries not yet registered)

Each item goes into its entry's note and packet when stage 3 is registered.

| Item | Source | Owner | Acceptance test |
| --- | --- | --- | --- |
| A report row is tied to its move by name (src/data/spine/report.ts:52-55); a same-name move falls to set aside. Breaks "match by id, never by name" | P4-35d minor, lead correction 2026-10-09 | `c3-planner-split` (report rows generated from operation metadata) | two moves with the same name get their own rows by op id |
| Retention race window: each of the ≤3 picks is listed just before its own trash, not all three first (runner/src/spine/retention.ts:126; window ~3 calls, no extra call) | P4-38e minor, lead 2026-10-09: touches data, so it is not polish; the first small item of stage 3 | retention (runner/src/spine) | each run folder is listed just before its own Bin |
