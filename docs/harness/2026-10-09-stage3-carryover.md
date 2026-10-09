# Stage 3 carry-over (items for entries not yet registered)

Each item goes into its entry's note and packet when stage 3 is registered.

| Item | Source | Owner | Acceptance test |
| --- | --- | --- | --- |
| A report row is tied to its move by name (src/data/spine/report.ts:52-55); a same-name move falls to set aside. Breaks "match by id, never by name" | P4-35d minor, lead correction 2026-10-09 | `c3-planner-split` (report rows generated from operation metadata) | two moves with the same name get their own rows by op id |
| Retention race window: each of the ≤3 picks is listed just before its own trash, not all three first (runner/src/spine/retention.ts:126; window ~3 calls, no extra call) | P4-38e minor, lead 2026-10-09: touches data, so it is not polish; the first small item of stage 3 | retention (runner/src/spine) | each run folder is listed just before its own Bin |
| Two Timeline lines on one hub get one report row (report-misses-hub-line, scripted.ts:929/1342) | Stage 2 smoke, TL-P4-17 addendum 2 | `c3-planner-split` (report rows keyed by op id) | every Timeline line a run writes has its own report row |
| api/src/vault.ts keeps reserved ids across requests: same rule, not a batch site | P4-39 minor, TL-P4-17 addendum 3 | `c3-reservation-worker` (escalated, after c3-reservation-upload; Durable Object storage as a third keeper behind the write-once port); stays on the allowlist until then | the Worker template retried after a lost answer makes one file per intent |
