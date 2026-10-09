# Stage 3 carry-over (items for entries not yet registered)

Each item goes into its entry's note and packet when stage 3 is registered.

| Item | Source | Owner | Acceptance test |
| --- | --- | --- | --- |
| A report row is tied to its move by name (src/data/spine/report.ts:52-55); a same-name move falls to set aside. Breaks "match by id, never by name" | P4-35d minor, lead correction 2026-10-09 | `c3-planner-split` (report rows generated from operation metadata) | two moves with the same name get their own rows by op id |
