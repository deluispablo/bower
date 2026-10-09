# Packet: c4-parse-once (TL-P4-22 addendum 18; escalated, contracts)

- **Entry:** `c4-parse-once`. Worktree `/private/tmp/bower-c4-parse-once`, branch `c4-parse-once` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 18 (main 5083a711): b1 is split off from c4-test-timers.
  - TL-P4-22 addendum 13 (1): one pass, in the same home.
  - The diagnosis `docs/harness/defects/2026-10-09-load-timeouts.md`: "Why did the size cap get slower?" and option b1.
  - Mechanism map row "Note sections" (`ARCHITECTURE.md:98`).
- **Starting model:** `bower-escalated` (Opus), because it touches `src/data/contracts`. Afterwards: a Claude review and one Codex pass. The contract sign-off is a Codex read-only pass (TL-P4-28 ruling 1).
- **Not ui.** Nothing the person sees changes.

## Live evidence

- The size-cap run (`fake-worker.test.ts:4325`, "note edits past the size cap wait for the next run") parses about 850 times.
- Profile: `parseOwnership` takes 75% of the time inclusive.
- There are 13 `parseOwnership` call sites in `note-edit.ts` (:184, :214, :302, :463/:464, :566, :622, :697/:698, :771) and `note-format.ts` (:79, :134). `ownership-format.ts:222` is the parse home's own caller.
- The byte table from c4-test-timers (a1) already makes each parse one pass. This entry removes the repeated parses of the same bytes.

## Contract (addendum 18)

1. **One parse per note per run, through the existing parse home** (`parseOwnership`, `ownership-format.ts:163`).
   - There is one per-run memo, keyed by the file id and the md5 the run read for it. A note whose md5 changed is parsed again.
   - There is no second parser, and no cache that outlives a run.
2. **Who owns the memo.** The run, meaning the runner engine and the fake Worker's run, which reach note-edit and note-format through the same paths as today. The app's own single edits may keep parsing once per call. Name the owner and how the memo reaches the 13 sites in the notes. Pass the parsed result in, or read it from the run's memo; never key by name or path.
3. **Behaviour is unchanged.**
   - The bytes written, the sections and every ownership test stay as they are.
   - The Drive-call goldens do not rise (C04 78, 25-runs 88).
   - Compatibility: no format change. Every commit under `src/data/contracts` gets a compatibility row.
4. **Research first:** cite the standard approach (memoising a pure parse by content hash) in the notes.
5. **Mechanism map:** extend the "Note sections" row: "one parse per note per run (`c4-parse-once`)".

## Red

- `each unchanged note is parsed at most once per run`: a spy on `parseOwnership` over a fake run with several notes and several decisions per note. It counts the calls per (file id, md5) and expects at most 1. It fails today.
- `a note changed during the run is parsed again`: a guard. The md5 changes between two reads, so the parse count is 2 and the new sections are used.
- The size-cap test stays unchanged and must not slow down.

A worker may not loosen its own red (TL-P4-22 addendum 22).

## Verify

- The reds.
- `src/data/contracts` and `src/data/fake` unit tests, plus the runner tests and goldens.
- `pnpm check`, through `bash harness/with-lock.sh` (the lock is now `/tmp/bower-heavy.lockf`).

## Commits

1. The red.
2. The fix.
3. The notes (`docs/harness/2026-10-09-c4-parse-once-notes.md`), with compatibility rows, `tests changed:` lines and `removed:` lines.
