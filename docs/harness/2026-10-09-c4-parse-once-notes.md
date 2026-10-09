# c4-parse-once implementation — session 2

Owner: this implementation follows TL-P4-29 ruling 2 and the packet's TL-P4-22 addenda 18 and 25.
The separate red session committed `b48a7655`; its test is unchanged. The coordinator owns the fix commit,
then this separate notes commit, integration, and the locked check/e2e gates. No writing git command was run.

## Research

The offline reference supplied by the fixed red is [Memoization](https://en.wikipedia.org/wiki/Memoization):
reuse the result of a pure function for the same inputs. The established bounded lookup pattern is also
[Identity Map](https://martinfowler.com/eaaCatalog/identityMap.html), which scopes reused reads to a single
business transaction. Applied here, the pure function is the existing ownership parser, the identity is
`(fileId, sha256Sync(exact parser bytes))`, and the unit of work is one execution attempt. These are offline
citations; no network request was made. The red's reference was read before implementation.

## Owner and handoffs

`ownership-format.ts` owns the context type, fetched identity type, and the only memo lookup.
`createOwnershipContext(parser?)` provides the specified dependency injection seam; `read(fileId, bytes)`
hashes locally through the existing `hashes.ts` home. Separate maps for file ids and byte hashes retain each
fetched version, including earlier versions, without retaining the input bytes. Invalid parse results are
also reusable. There is no metadata fetch, path/name key, new hash helper, or global cache.

The fake Worker creates a context before `planRun`, including the running scenario's initial attempt.
The existing fake planning adapter already forwards PlanOptions, so it requires no change.
The Worker passes its context to `FakeRunService.admit`; admission passes it into `launch`, `execute`,
`apply`, and `driveEffects`. Recovery calls `launch` without an inherited context and creates a fresh one.
The context lives in the attempt's call chain, never in durable rows or the service's manifest cache.

The runner creates a context before constructing its provider and effects. Both receive the same context.
Production `main` puts it into ScriptedRun, which the existing provider dispatcher forwards unchanged.
The scripted and Claude providers put it into PlanOptions. Planning carries it from decide to build for
re-authoring edits after final citation names are known. Every `runTidy` execution, including recovery,
creates a fresh context; nothing is stored beyond the invocation.

The planner supplies the actual read file id for fetched note parsing, state/Timeline inspection, and edits.
The effects adapter supplies `effect.before.fileId` when rechecking read bytes. Optional fetched arguments
keep standalone operations on their existing uncached path.

Candidate before/after invariant parses remain direct `parseOwnership` calls. Generated intermediate text
loses fetched identity after the first edit step; rewritten candidates, synthetic rule fragments and the
missing-rules template remain uncached. No authoring algorithm, stored format, byte splice, section rule,
Drive call, or test bound changed.

## Files and adapters touched

Fix files:

- `src/data/contracts/ownership-format.ts`: context and memo home.
- `src/data/contracts/note-format.ts`: optional fetched identity for parseNote and timelineBullets.
- `src/data/contracts/note-edit.ts`: fetched identity through read helpers and edit/recheck entry points.
- `src/data/spine/scripted.ts`: PlanOptions/ScriptedRun context and actual ids at fetched parse sites.
- `src/data/spine/engine.ts`: effects/recheck adapter shares the attempt context.
- `src/data/fake/fake-worker.ts`: planning owner and admission handoff.
- `src/data/fake/fake-run-service.ts`: attempt/effects handoff and fresh recovery context.
- `runner/src/main.ts`: attempt owner, provider/effects injection, production provider handoff.
- `runner/src/claude.ts`: Claude planning adapter forwards context into PlanOptions.
- `src/data/demo/script.ts`: scripted planning adapter forwards context into PlanOptions.
- `docs/ARCHITECTURE.md`: Note sections mechanism row records one parse per read note per attempt.

Notes file (separate commit): `docs/harness/2026-10-09-c4-parse-once-notes.md`.
No read adapter needed an edit: fake-runner forwards remaining PlanOptions, providerFor forwards ScriptedRun,
and the existing read results already expose the required file ids. `hashes.ts` is unchanged.

compatibility: d146960e

## Tests and validation

tests changed: none
removed: none (candidate validation and existing fallback parsing remain).

Baseline red: `pnpm exec vitest run src/data/contracts/parse-once.test.ts` failed all four tests.
The named parse-lifetime tests failed the assertion that one attempt context exists (zero observed);
the two changed-version guards reported the absent createOwnershipContext function.
Log: `/tmp/parse-once-red.log`.

The fixed red then passed through both fake Worker/service and runTidy, with fenced and external-change guards.
Log: `/tmp/parse-once-red-green.log`.

Required final runs, all exit 0:

- `pnpm exec tsc -p tsconfig.app.json > /tmp/parse-once-tsc.log 2>&1`
- `pnpm exec vitest run src/data > /tmp/parse-once-unit.log 2>&1`
- `pnpm -C runner exec vitest run > /tmp/parse-once-runner.log 2>&1`

The complete data run includes the unchanged fixed red, ownership tests, fake/spine tests and large-note
size-cap test. The complete runner run includes the unchanged exact 78/88 Drive-call goldens and phase counts.
Final logs were searched only for failures; no failures were found. `git diff --check` passed.
The preliminary TypeScript run found two unused helper parameters and a missing build-scope context;
those were corrected before the required final successful runs.

`pnpm check` and e2e were not run, as instructed: the coordinator runs them under the lock.
Left out: none within the assigned implementation scope; commits and integration remain with the coordinator.

## Round 2 (addendum 27)

Owner: TL-P4-22 addendum 27 and TL-P4-29; the separate session's committed round-2 red is unchanged.
The coordinator owns the fix commit and then the separate notes commit. No writing git command or network
request was run. The offline memoization and Identity Map references above remain the standard approach;
this round only forwards the existing attempt context to the remaining fetched-note parse sites.

Sites threaded (current file:line):

- `src/data/fake/fake-worker.ts:266`: create the same attempt context before the initial pile read;
  `:268` passes it to that read, `:276` to scoped admission, and `:278` still passes it to planning.
  The existing service/effects handoff retains that context, and recovery still creates a fresh context.
- `src/data/spine/scripted.ts:354` and `:370`: forward PlanOptions.context to the inbox read and capturePiles.
- `src/data/spine/read.ts:22`: ScriptedRead.piles accepts the optional context; no parsing or memo here.
- `runner/src/provider.ts:32`: runnerScripted forwards the piles argument to listedPiles.
- `src/data/fake/fake-runner.ts:28`: fakeScripted forwards the piles argument to DriveVault.piles.
- `src/data/spine/plan.ts:103`: CaptureOptions carries the context to the recorded-note parse at `:190`;
  `:313`, `:419` and `:423` forward it through scoped admission; listedPiles accepts it at `:458`
  and supplies the actual note id at its fetched-text parse at `:476`.
- `src/data/vault/drive-vault.ts:583` and `:621`: the fake pile read forwards context into parsed;
  `:668` supplies the recorded note id when that note differs from the first note; `:1811`–`:1813`
  accept context in parsed, and `:1820` supplies the fetched file id to parseNote.

Fix inventory: the seven code files listed above. Notes inventory: this file, for the coordinator's notes commit.
There is still only one memo beside parseOwnership, keyed by file id and the exact-byte SHA-256 from hashes.ts.
No context is retained on DriveVault or its persistent caches. Candidate parsing, bytes, stored formats,
read/write calls, and standalone parsing behaviour are unchanged.

compatibility: eb909a67

tests changed: none
removed: uncached fetched-note parse calls at listedPiles, capturePiles and the vault pile reader;
replaced with the existing context lookup, with uncached fallback for standalone calls.
removed: late context initialization in FakeWorker.begin; moved before its first pile read, not duplicated.
removed: none of the candidate validation, tests, bounds, goldens, parser, or hashing mechanism.

Baseline: `/tmp/parse-once-r2-red.log` failed the whole-attempt pile red on both entry points:
each of two pile-note keys parsed three times in fake Worker/service and twice in runTidy, expected once.
The first full data run then identified the fake Worker's initial pile read, still outside the context;
that read and scoped admission now share the same context as planning and effects.

Final required runs, all exit 0; logs searched only for test/TypeScript failures, none found:

- `pnpm exec tsc -p tsconfig.app.json > /tmp/parse-once-r2-tsc.log 2>&1`
- `pnpm exec vitest run src/data > /tmp/parse-once-r2-unit.log 2>&1`
- `pnpm -C runner exec vitest run > /tmp/parse-once-r2-runner.log 2>&1`

The complete data run passes the unchanged whole-attempt pile red, existing reds and changed-version guards,
including fake Worker/service and runTidy, and the large-note test. The runner suite passes the unchanged
Drive-call goldens at exactly 78 and 88 with their phase counts. `git diff --check` passes, and the test-file
diff is empty. No pnpm check or e2e was run, as instructed. Nothing remains outside the assigned scope.
