# Packet: c4-parse-once (TL-P4-22 addenda 18 and 25; escalated, contracts)

- **Entry:** `c4-parse-once`. Worktree `/private/tmp/bower-c4-parse-once`, branch `c4-parse-once` from `claude/p3`. Merge `claude/p3` first.
- **Ruling sweep:**
  - TL-P4-22 addendum 18 (main 5083a711): b1 is split off from c4-test-timers.
  - TL-P4-22 addendum 25 (main f1de4257): this contract, folded in from the Codex sign-off `2026-10-09-c4-parse-once-contract-signoff.md`.
  - TL-P4-22 addendum 13 (1): one pass, in the same home.
  - The diagnosis `docs/harness/defects/2026-10-09-load-timeouts.md`. Addendum 18 replaces its per-decision scope (b1) with one parse per attempt.
  - The mechanism map row "Note sections" (`ARCHITECTURE.md:98`).
- **Starting model:** `bower-escalated` (Opus), because it touches `src/data/contracts`. Afterwards: a Claude review and one Codex pass.
- **Not ui.** Nothing the person sees changes.

## Evidence (historical)

- The diagnosis measured an earlier revision: about 850 parses in the size-cap run, with `parseOwnership` at 75% of the time inclusive.
- Today's large-note workload is `fake-worker.test.ts:4359-4395`, "the size-cap run fits its time bound with no load" (`encoded < 3_000_000_000`). Keep its bound and its convergence assertions exactly as they are.
- The parse sites:
  - `note-edit.ts` :184, :214, :302, :463/:464, :566, :622, :697/:698, :771;
  - `note-format.ts` :79, :134;
  - the parse home itself, `ownership-format.ts:163` (with its own caller at :222).

## Contract

1. **The memo is only for text the run read from Drive.**
   - It is keyed by (fileId, hash of the exact bytes handed to the parser). The hash is the repository's one hash home, `contracts/hashes.ts` (`sha256Hex`, or `sha256Sync` where the path is synchronous). The engine already checks SHA-256 at `src/data/spine/engine.ts:467`. Add no md5 helper.
   - It parses at most once per key within one attempt, through `parseOwnership`.
   - Never infer identity from a path, a name or the bytes. Never fetch metadata only to build a key.
2. **Candidates are not memoised.** Text the run made (note-edit's before and after at :463/:464, :697/:698, and the generated text carried at :775-783) is not memoised. Count its parses separately, and validate the before and the after each on their own through `parseOwnership`.
3. **Lifetime: one attempt.** An attempt is one execution, not every recovery that shares a run id.
   - Create one context before planning. Pass that same context through planning and effects, and discard it on every exit.
   - The handoffs: in the fake, planning at `fake-worker.ts:276-279` hands to the service apply at `fake-run-service.ts:451-473`; in the runner, `runner/src/main.ts:259-277`.
   - A recovery creates a fresh context. Standalone app operations share no run context and may keep parsing once per call.
4. **Thread the file id** from each caller to its parse site. `parseOwnership(bytes)`, `applyChanges(bytes, changes)` and `parseNote(path, raw)` get the id through the context call, not through a second parser.
5. **Fragments and templates with no file id stay uncached:** the synthetic rule fragment at `scripted.ts:2009` and the missing-Rules.md template at `:2071-2074`. They are excluded from the per-file count and still go through `parseOwnership`.
6. **One home.** The context type and its lookup live next to the parse home in `src/data/contracts/ownership-format.ts`. There is no second parser and no cache that outlives an attempt.
7. **Behaviour is unchanged.**
   - The bytes written and the sections stay the same. Every ownership test is unchanged.
   - The Drive-call goldens stay exactly as they are: C04 at 78, the 25-earlier-runs case at 88, and the existing phase counts (`runner/test/drive-calls-golden.test.ts`). Hash locally and add no Drive call.
   - Format: unchanged. Every commit under `src/data/contracts` still gets a compatibility row.
8. **Research first:** cite the standard approach (memoising a pure parse by content hash, scoped to one unit of work) in the notes.
9. **Mechanism map:** the "Note sections" row gains "one parse per read note per attempt (`c4-parse-once`)".

## Owned files

- `src/data/contracts/ownership-format.ts` (the context), `note-edit.ts`, `note-format.ts`, `hashes.ts` (read only);
- `src/data/spine/engine.ts`, `src/data/spine/scripted.ts`;
- `runner/src/main.ts`, plus the runner's read and plan adapters that the threading needs (name each one in the notes), including `runner/src/claude.ts` (:1165 builds PlanOptions) and the scripted planning adapter `src/data/demo/script.ts` (:79-85 builds PlanOptions for planScripted; added 2026-10-09 after implementation session 2 stopped on it); for round 2, `src/data/spine/plan.ts` (addendum 27), `src/data/spine/read.ts` (ScriptedRead.piles takes the context) and `src/data/fake/fake-runner.ts` (forwards it), which only forward the context;
- `src/data/fake/fake-worker.ts`, `src/data/fake/fake-run-service.ts`;
- tests: `src/data/contracts/*.test.ts`, `src/data/fake/fake-worker.test.ts`, `runner/test/*`;
- `docs/ARCHITECTURE.md` and the notes.

Anything outside this list: stop and report it on your card.

## Red

- `each unchanged note is parsed at most once per run` (keep this exact name).
  - Observe the parser's actual misses together with their context key.
  - Assert a non-empty, explicit set of expected (fileId, hash) keys, with exactly one parse for each, and the expected resulting bytes.
  - Exclude fixture setup and parsing done during assertions.
  - Run it through both the fake Worker/service entry point and `runTidy`.
  - Include two file ids with identical bytes (separate entries), unchanged versions read again across planning and effects, a second attempt (fresh misses), and a recovery (fresh misses).
  - It must fail today.
- `a note changed during the run is parsed again` (keep this exact name). This is a correctness guard, not necessarily a red.
  - Read version A, write version B through the existing fenced path, then read B in the same context.
  - Assert one miss for each fetched version's key, reuse when a version is read again, and B's exact sections and output.
  - Count generated candidates separately.
  - Add an external-change variant (B written outside).
- The large-note test at `:4359` stays unchanged and must not slow down.

A worker may not loosen its own red (TL-P4-22 addendum 22).

## Verify

- The reds, run through both entry points.
- The `src/data/contracts`, `src/data/fake` and `src/data/spine` unit tests, plus the runner tests and the goldens, exactly.
- `pnpm check` through `bash harness/with-lock.sh` (the lock is `/tmp/bower-heavy.lockf`).

## Commits

1. The red.
2. The fix.
3. The notes (`docs/harness/2026-10-09-c4-parse-once-notes.md`): the owner and handoffs, the adapters touched, compatibility rows, `tests changed:` lines and `removed:` lines.
