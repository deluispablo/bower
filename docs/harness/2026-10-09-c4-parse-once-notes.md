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
