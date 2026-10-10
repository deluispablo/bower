# Packet: smoke-request-slow, bounded request reads (escalated; lead ruling 2026-10-10, DECISIONS after bd2671ba)

- **Entry:** `smoke-request-slow`. Worktree `/private/tmp/bower-smoke-request-slow`, branch `smoke-request-slow`. Escalated (C05 settlement, recovery, Drive calls). The sequence:
  1. a Codex red session (now);
  2. the Codex implementation, **after B1a integrates** (both edit scripted.ts);
  3. a Codex read-only pass;
  4. a fresh Claude review.
  `ui: false`.
- **Evidence:** staging 2ab7b490, scripted. A request-only run took 268 s, with reads 245 s and 757 Drive reads, against 51 s for a pile run. Diagnosis: `docs/harness/defects/2026-10-10-request-run-slow-reads-diagnosis.md`. 3e958da1 made `archivedRecords` read every archived change file and `retainedSince` walk every kept run's chain; `personalAppendHistory` also walks every bowerAppends run.
- **Ruling:**
  - No archive scan: `archivedRecords` is removed.
  - A waiting request (one whose target carries over on a clash) is moved to `.bower/changes/pending/<run id>/` with the existing move effect. So a new request needs 0 record reads, and a waiting one reads 1 run (its own).
  - The retention horizon comes from listing metadata (the run folders' listing), with no chain walk.
  - No migration.
  TL-P4-32 addenda 2–6 keep their outcomes: completed by the record id inside the bytes, never title-resolved once bound, TOO_OLD_WHY past the horizon, and NOTHING_FOUND_WHY.
- **Research first:** cite Drive files.list with parent queries and fields (bulk metadata, then by-id reads), and the standard "index points to evidence" pattern.

## Contract

1. A request's evidence is found by where it lives:
   - `.bower/changes/` holds new requests, with 0 record reads;
   - `.bower/changes/pending/<run id>/` holds waiting requests, read through that one run's records;
   - the archive holds settled requests, which are never read for admission.
2. A crash between settle and the move keeps today's write-once guarantees: no second append or completion, proved by the existing C05 reds still passing.
3. The horizon is read from the run folders' listing metadata (created/modified time or the name's run id), with no manifest or checkpoint reads.
4. `personalAppendHistory` reads only what the waiting requests' runs point to, or nothing when none wait.
5. One mechanism: the existing move effect and RunRecords. No new store or index file.

## Reds (a separate Codex session)

- A runner `main` Drive-call golden: 50 archived requests, 25 kept runs and 1 new request with no pile. Reads equal the pile-run baseline plus at most 1 per waiting request, with zero archive or kept-run media reads.
- A waiting request (clash) moves to pending/<run id> and settles on the next run, reading only that run.
- A horizon variant past 20 runs gives TOO_OLD_WHY with no chain walk.
- All existing C05 reds stay green.
Made-up data only; injected clock and transport.

## Verify

The reds by exact name, the C05 runner and app tests, `pnpm check`, then e2e c05-person-notes, capabilities and app on demo and fake.

## Commits

The red (tests only), then the fix, then the notes (`docs/harness/2026-10-10-smoke-request-slow-notes.md`, line 3 `implementer: codex`, with `removed:` lines and compatibility rows).
