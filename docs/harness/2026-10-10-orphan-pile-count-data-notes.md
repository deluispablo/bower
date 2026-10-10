# orphan-pile-count-data red delivery

implementer: codex

Role: independent red-owning session only (TL-P4-29). Base HEAD:
`e910ddce7269718976aadbd67afd9f22643e5788`, branch `orphan-pile-count-data`.
Only the new test file and this notes file were written, plus requested logs under `tmp-logs/`.
No app code, existing test, contract, runner file, or harness state was changed.
No network, server, e2e, full-suite command, or git-writing command was used.
Coordinator owns the separate red and notes commits.

## API seam and evidence limit

The packet, prep section 5, and TL-P4-53 rule an app-local summary with a known count and completeness,
but do not freeze a concrete method name or field names. This file provisionally uses
`VaultSource.orphanSummary(): Promise<{ count: number; complete: boolean }>`.
The seam is isolated in `summary()` so the lead can rule its spelling without changing contract numbers.
No summary stub, alternative scanner, or production implementation was added.

At HEAD, all eleven reds fail the explicit assertion:
`VaultSource.orphanSummary must expose the cached count and completeness`:
expected type `function`, received `undefined`.
Both fast-check failures have this same AssertionError as their cause.
This is the missing-capability red allowed by the requested missing-export assertion helper;
it is not evidence that eleven independent value-level failures have already been observed.
The value assertions become reachable when the approved summary capability exists.
There are no import/load errors, fixture assertion failures, timer-gate failures, or unhandled rejections.

## Reds

Every exact expanded name is below. All share the HEAD failure reason above.

1. `orphan-pile-count-data: orphan folder declaration remains countable after anchor creation fails`
   - Pins `{ count: 1, complete: true }` after a declaration commits but its folder create fails.
   - Positive controls: actual `addPile` makes a discoverable anchored context pile; the failed add leaves
     one parser-valid folder declaration with two members and no matching anchor.
   - Reload uses a fresh `DriveVault`. Summary must neither create a folder nor mutate Drive.
2. `orphan-pile-count-data: orphan count merges queued loose work and copied declarations once`
   - Pins one orphan from a queued loose member and two identical declaration copies.
   - Real `addPile`, real upload queue, fake IndexedDB, injected queue clock, and two transfer barriers.
     Stop/dispose and a fresh queue/vault model reload over the same retained bytes.
   - Positive controls: IndexedDB holds the original bytes; the fresh vault lists the loose work once;
     a real anchored control with two absent members keeps `setAside: 'not-arrived'` and contributes zero.
3. `orphan-pile-count-data: orphan count cannot retire unresolved work from disposition stamp alone (damaged)`
4. `orphan-pile-count-data: orphan count cannot retire unresolved work from disposition stamp alone (unrelated)`
5. `orphan-pile-count-data: orphan count cannot retire unresolved work from disposition stamp alone (mismatched-hash)`
   - Damaged and mismatched-hash cases use a loose declaration from an actual failed upload;
     the unrelated case uses an actual failed folder creation.
   - A matching listing stamp cannot yield complete zero: unresolved work remains counted or completeness is false.
   - Positive controls: canonical, parser-valid consumed disposition; identical declaration copies;
     foreign-root declaration; mismatched declaration digest; eventual valid consumption gives count zero.
     The damaged copy may continue to make completeness unknown after work is consumed.
6. `orphan-pile-count-data: orphan count reports an unchecked candidate as unknown`
   - Pins `{ count: 0, complete: false }` during an injected retryable read refusal, then
     `{ count: 1, complete: true }` after refresh/retry.
   - Positive controls before the red: the saved loose declaration parses; the real full read reaches
     the exact-id barrier and logs the injected BowerError. No filename matching or timed wait.
7. `orphan-pile-count-data: summary shares the full-read cache and refresh invalidation`
   - Full read, concurrent summaries, and another full read share one listing and one declaration read.
     A removed declaration stays in the cached snapshot until the existing refresh notifies subscribers;
     the next summary becomes complete zero.
   - Positive control: the committed declaration parses with exactly two members.
8. `orphan-pile-count-data: ambiguous context-only history is unknown and intentional removal is retired`
   - Pins unknown completeness when only a context-only declaration survives a vanished anchor,
     with no member, Bin, or removal evidence.
   - Positive controls: the context pile is initially anchored and discoverable; a separate root's
     deliberate `removePile` leaves no live declaration or pile and yields complete zero.
9. `orphan-pile-count-data: a matching anchor moved within the root is excluded without recreation`
   - Pins one orphan from unresolved work while a matching context anchor moved to Areas contributes zero.
   - Positive controls: real `addPile` and `move`, identity retained by id, no longer in Inbox.
     Reading the summary must leave the complete Drive snapshot unchanged.
10. `orphan-pile-count-data: generated orphan counts dedupe declarations and exclude foreign roots`
    - fast-check: seed `531001`, 12 runs, pile counts 1–4, identical copies 1–4, member counts 2–5.
      Every pile comes from actual failed `addPile` folder creation; records use the existing canonical helper.
    - Positive control: current-root copy multiplicity equals `count * copies`.
    - HEAD counterexample: `[2,4,5]`, path `0`; the underlying failure is the missing API assertion.
11. `orphan-pile-count-data: generated unreadable or conflicting evidence never becomes a complete zero`
    - fast-check: seed `531002`, 12 runs, identical copies 1–4, unreadable/conflicting variants.
      One known orphan survives beside uncertain evidence: `{ count: 1, complete: false }`.
    - Positive control: known declaration copies have the generated multiplicity.
    - HEAD counterexample: `[2,false]`, path `0`; the underlying failure is the missing API assertion.

Both properties use `endOnFailure: true`; HEAD stops at the first generated counterexample.
No generator bound, expected count, or tolerance was loosened to obtain a result.

## Preservation and contradictions

tests changed: none (all pre-existing assertions preserved byte-for-byte).
removed: none.
Contradicting existing count assertions found: none. The existing loose discovery tests deliberately
omit folder declarations and skip stamped dispositions (`src/data/pile-records.test.ts:60`,
`src/data/pile-records.test.ts:74`; `src/data/pile-readiness.test.ts:75`, `src/data/pile-readiness.test.ts:82`).
Those assert the existing discovery helper's return/read behavior, not the new summary's count or completeness;
this delivery preserves them and does not claim that loosening them is authorized.
Likewise `src/data/vault/drive-vault.test.ts:2134`, `src/data/vault/drive-vault.test.ts:2150`
keep a vanished folder out of `piles()`; counting its unresolved declaration in a separate summary does not
require changing those assertions. Only the newly assigned file was run, as explicitly requested.

## Verification

- `pnpm exec vitest run src/data/orphan-pile-count.test.ts --maxWorkers=2`
  exited 1: 1 test file, 11 tests, 11 expected assertion reds at the unchanged HEAD.
  Log: `tmp-logs/orphan-pile-count-red.log`.
- `pnpm exec tsc -p tsconfig.app.json --noEmit` exited 0.
  Log: `tmp-logs/orphan-pile-count-tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit` exited 0.
  Log: `tmp-logs/orphan-pile-count-tsc-node.log`.
- `pnpm exec eslint src/data/orphan-pile-count.test.ts` exited 0.
  Log: `tmp-logs/orphan-pile-count-eslint.log`.
- Only failure patterns and aggregate result lines were read from test output.
  An initial ESLint non-null assertion was removed; final typecheck and lint both pass.
- `pnpm check` and e2e were not run: this session was explicitly restricted to the new red test file,
  app/node TypeScript, and touched-file ESLint. Production and UI implementation are left to their assigned sessions.

## Standard solution and sources

No network research was performed. The protocol reference is inherited from the packet's prep,
and the durability behavior is checked against the existing in-worktree store transaction completion code.

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  retain the session URI, query status using `Content-Range: bytes */N`, handle 308 with the server offset,
  and restart expired sessions using the same reserved identity. These reds reuse the real queue, without
  changing or duplicating the existing resumable protocol.
- [IndexedDB transaction model](https://www.w3.org/TR/IndexedDB/#transaction-concept): transaction completion
  is the staging boundary, and browser storage does not itself guarantee permanent retention.
  The queue/store test uses actual fake IndexedDB transactions rather than a substitute pending table.

Left out: production summary implementation, a lead ruling on the provisional API spelling,
upload staging/sign-out fixes, UI/copy, integration, full gates, and coordinator-owned commits.

## Implementation

Implementer: codex. Round 2, 2026-10-10. Base HEAD `490ebebd` (red repair 1),
following first-attempt implementation `29e871ca` and original base `e4b3ff30`.
Status: **blocked under TL-P4-51** after completing the whole targeted suite.
Round-2 production changes remain in place, uncommitted. No test was edited,
no network request was made, and no git-writing command was run. The coordinator owns commits.

### Research before implementation

No network research was authorized or performed. The prep's standard-source references were
reused and compared with the local mechanisms before implementation:

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  retain the session URI, query status with `Content-Range: bytes */N`, interpret 308 as partial
  completion, and recover expiry using the existing reserved identity. Local evidence:
  `src/data/drive/drive-http.ts:364` and `:384`, and `src/data/upload-queue.ts:475`.
  Recovery accounting adds no second upload protocol and never recreates an anchor.
- [IndexedDB transaction model](https://www.w3.org/TR/IndexedDB/#transaction-concept):
  record and bytes share a transaction; transaction completion is the device-staging boundary,
  not a promise against browser eviction. Local evidence: `src/data/upload-store.ts:82`
  and `:213`. The orphan summary is derived read-only evidence, never another durable store.

### Changes left in place

The first attempt introduced the common declaration reader/copy merger, `orphanState`,
the shared full-read snapshot, and the app-local `orphanSummary` capability in `sources.ts`.
The round-2 diff touches only `pile-readiness.ts` and `vault/drive-vault.ts`:

- `findPileDeclarations` excludes declarations retired by a listing disposition stamp before
  reading them (TL-P4-53 addendum 5). Damaged, foreign and unrelated stamps are the accepted
  v1 limit. Unstamped unanchored declarations still retain the existing unknown/completeness rules.
- Matching live anchors are excluded by pile identity, declaration identity and anchor kind from
  the listing. Their own row read remains the sole declaration-read/log path; the general query
  no longer retries or logs that same anchored failure. A matching moved anchor is also excluded.
- `orphanState` returns the missing-loose-row decision alongside its summary classification,
  derived from the same `accountPile` call and Bin evidence. The existing full-read snapshot
  retains this decision; `looseMissing` consumes it without another accounting or Bin query.
  A loose file deliberately Binned from Inbox stays removed. No second scan or store was added.
- The snapshot uses its index's root identity and returns its existing promise directly;
  loose row discovery no longer repeats the root lookup or stamp/anchor scan. Both unchanged
  live account/folder admission schedules now pass their original 30-turn drain assertions.
- Refresh still invalidates the one snapshot, and refused unanchored evidence still makes
  completeness false. No shared Pile/SetAside, stored format or upload protocol changed.

removed: src/data/vault/drive-vault.ts:822-830 (round-2 base): duplicate root/stamp/anchor filtering.
removed: src/data/vault/drive-vault.ts:836-846 (round-2 base): second member accounting and Bin lookup.
removed: src/data/pile-readiness.ts:201-246 (original base): legacy-only merger replaced in first attempt.
removed: no files, tests, contract formats, upload mechanisms or numeric bounds.
tests changed: none (round 2; red repair 1 below was committed before this assignment).

### Every remaining contradicting test (whole targeted suite completed before stopping)

Exactly one failing test remains; no other contradiction or failure appeared in any of the 79 data files:

1. `src/data/live/home-cache.test.ts:229` — `an empty inbox reads no old pile records`.
   Assertion `:235` requires zero reads from `.bower/piles`; actual is one declaration byte read
   (18 total Drive calls). All 30 stamped historical declarations are now skipped.
   The remaining record is the fresh, **unstamped** declaration made by `liveShape`
   (`src/data/fake/live-shape.ts:29`). This test directly trashes its real anchor and every
   other Inbox child (`home-cache.test.ts:50-54`) without a disposition stamp or Bower removal
   record. The cold live listing excludes Binned anchors and their descendants, while the
   declaration survives in `.bower/piles`. Addendum 5 therefore does not retire this record.

The opposing unchanged E3 contracts are:

- `src/data/orphan-pile-count.test.ts:137` —
  `orphan-pile-count-data: orphan folder declaration remains countable after anchor creation fails`.
  An unstamped declaration with no anchor must be inspected and counted; an empty Inbox
  alone cannot suppress general folder classification.
- `src/data/orphan-pile-count.test.ts:313` —
  `orphan-pile-count-data: summary shares the full-read cache and refresh invalidation`.
  The first `piles()` reads the unanchored folder declaration once (`:325`), even with no live
  Inbox anchor; deferring all folder evidence until a later summary breaks this full-read contract.
- `src/data/orphan-pile-count.test.ts:337` —
  `orphan-pile-count-data: ambiguous context-only history is unknown and intentional removal is retired`.
  A surviving unstamped context-only declaration with a vanished anchor is unknown; empty
  Inbox alone is not retirement evidence.

These three E3 tests pass and are listed to identify both sides of the remaining contradiction,
not as additional failures. Skipping every folder declaration or skipping all records for an empty
Inbox would hide real failed-anchor work or violate the shared full-read read assertion. Reading
Bin member evidence requires the member identities inside this unstamped declaration. No second
query, fixture-specific branch, retirement assumption, test change or bound change was added.
A lead ruling is needed on this direct-Bin unstamped-declaration case before continuing.

The other three previously contradictory Home goldens now pass unchanged:
`home-cache.test.ts:110` (one declaration read, 26 calls), `:169` (28 calls),
and `:209` (equal calls after 10 and 500 earlier runs).

### Six other failures resolved

All pass unchanged in both the focused run and the whole data run:

- `src/data/fake/fake-runner.test.ts:646`: missing loose member has one shared Bin lookup.
- `src/data/fake/fake-worker.test.ts:2645`: retired declaration has no member digest or Bin lookup.
- `src/data/live/live.test.ts:400/:418`, `flushJournal`: fresh B admission dispatches after the same drain.
- `src/data/live/live.test.ts:400/:418`, `process`: fresh B admission dispatches after the same drain.
- `src/data/vault/drive-vault.test.ts:2072`: anchored declaration refusal is read/logged by its own path only;
  the existing one-log-per-failure assertion across refresh/retry remains unchanged.
- `src/data/vault/drive-vault.test.ts:2293`: offline declared pile logs once per listing; no general duplicate.

### Round-2 verification and environment

All pnpm invocations used `--config.verifyDepsBeforeRun=false --config.offline=true`
to reuse the installed local dependencies without network or dependency restoration.
Only failure sections and aggregate test counts were read from test output.

- Before edits: vitest over `orphan-pile-count.test.ts`, `live/home-cache.test.ts`,
  `fake/fake-runner.test.ts`, `fake/fake-worker.test.ts`, `live/live.test.ts`, and
  `vault/drive-vault.test.ts`, `--maxWorkers=2`: 605 passed, 13 assertion failures.
  This reproduced the three repaired reds, four Home goldens, and six other failures.
- After edits, the same six files: 617 passed, one failed (`home-cache.test.ts:229/:235`).
  All 11 orphan reds pass, including the three stamp-only v1-limit cases and both pinned properties.
- Whole requested target: `pnpm exec vitest run src/data --maxWorkers=2`
  with the offline flags above: 79 files, 4,170 passed, one failed, exit 1.
  Every remaining failing/contradicting test is listed above before the TL-P4-51 stop.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: pass, exit 0.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: pass, exit 0.
- `pnpm exec eslint src/data/pile-readiness.ts src/data/vault/drive-vault.ts`: pass, exit 0.
- `git diff --check`: pass. No test-file diff; no git write.
- Logs were created under `tmp-logs/`: `round-2-red.log`, `round-2-focused.log`,
  `round-2-data.log`, `round-2-tsc-app.log`, `round-2-tsc-node.log`, `round-2-eslint.log`.
  Their failure evidence and results are recorded here; `tmp-logs/` was deleted before delivery.
- `pnpm check` was not run after the remaining TL-P4-51 contradiction. E2e is not applicable
  to this data-only `ui: false` entry; no server, integration or check mark is claimed.

Left out: the one direct-Bin unstamped-declaration Home contradiction, full gates, UI,
test changes, commits and integration. Round-2 production changes remain in place for review.


## Red repair 1

Red-owning session, sweep TL-P4-51, TL-P4-53 addendum 5 (lead, 2026-10-10).
Only the three stamp-dependent red cases and this requested notes section changed.
No network or git-writing command was used; the coordinator owns commits.

Listing disposition stamps alone now retire their declarations. Damaged, foreign or unrelated
stamps are a **v1 limit**. Only unstamped declarations require reading and unknown accounting.
Each expanded changed test is listed separately:

tests changed: src/data/orphan-pile-count.test.ts: TL-P4-53 addendum 5: (damaged) is a v1 limit; require complete zero and no stamped declaration reads before and after refresh.
tests changed: src/data/orphan-pile-count.test.ts: TL-P4-53 addendum 5: (unrelated) is a v1 limit; require complete zero and no stamped declaration reads before and after refresh.
tests changed: src/data/orphan-pile-count.test.ts: TL-P4-53 addendum 5: (mismatched-hash) is a v1 limit; require complete zero and no stamped declaration reads before and after refresh.

The shared exact test name is now
`orphan-pile-count-data: v1 limit retires stamped declarations without reading them (%s)`.
Preserved: real failed loose upload/folder creation, identical unresolved copies, parser-valid
consumed disposition, foreign-root declaration exclusion, consumed pile absence, and the
valid-consumption exact-zero control after refresh. No generator, unstamped count, completeness
or unknown-never-zero assertion changed. No tests removed.

C02 sweep: searched the E1/E2/E3 test paths from prep section 3
(`upload-queue.test.ts`, `live/live.test.ts`, `vault/drive-vault.test.ts`,
`pile-readiness.test.ts`, `pile-records.test.ts`) for stamp/disposition/retirement/foreign/unrelated
assumptions, plus data test names mentioning C02 and stamp-only damaged/foreign/unrelated retirement.
No other C02 test requires converting this assumption. Existing query/loose-discovery stamp-skip
assertions already follow this rule and are unchanged. No foreign-disposition red existed.

### Verification

Both runs used:
`pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data/orphan-pile-count.test.ts src/data/live/home-cache.test.ts --maxWorkers=2`.

- Before repair: 17 passed, 4 failed (unchanged Home goldens); original orphan suite 11/11 passed.
- After repair: 14 passed, 7 failed. All eight unchanged orphan cases pass. Three repaired cases
  fail at `src/data/orphan-pile-count.test.ts:269`: expected `{ count: 0, complete: true }`,
  actual `{ count: 1, complete: true }`. Subsequent no-declaration-read assertions are present
  but not reached by the committed implementation. These are the new intended reds.
- Four Home goldens remain byte-for-byte unchanged and fail as before:
  `home-cache.test.ts:110` readBytes 21 versus 1; `:169` calls 48 versus 28;
  `:209` calls 37 versus 527 instead of equality; `:229` 31 pile record reads versus zero.
- Touched-test ESLint and `git diff --check` pass.
- Output went to `tmp-logs/red-repair-1-before.log`, `red-repair-1-after.log`, and
  `red-repair-1-eslint.log`; only failures/tails were read. `tmp-logs/` deleted before delivery.
- Full check/e2e not run: this authorized repair is test-only and data-only, with the targeted
  run requested. No green implementation or integration mark is claimed.

removed: none.
Left out: production repair, four Home failures, full gates, integration and coordinator commits.


## Red repair 2

TL-P4-53 addendum 5, lead ruling (a), 2026-10-10.

tests changed: src/data/live/home-cache.test.ts: TL-P4-53 addendum 5: unstamped declarations are read; stamped ones never

Renamed the empty-Inbox golden: zero stamped-record reads, exactly one current
unstamped declaration read as bytes, and exactly one call for that declaration.
Every other test and assertion is unchanged. This test had no total-call assertion;
none was added or changed. No production edits or git-writing commands were used.

Verification:
- The requested pnpm exec command unexpectedly triggered dependency fetching.
  DNS failed; interrupted after inspecting output. No successful network access occurred.
- Retried with --config.verifyDepsBeforeRun=false --config.offline=true and
  --maxWorkers=2: exited 1, Command "vitest" not found. No tests executed.
- git diff --check passed. Output in tmp-logs/ was deleted before delivery.

removed: none.
Left out: test verification (local Vitest missing), production changes, full gates and coordinator commits.

## Fix round 1 reds

Independent red-owning session, TL-P4-29, 2026-10-10. Unchanged production HEAD:
`1decc02781d1ddc19d83e7b3d2a14d086a77a570`.
Finding: BLOCK 1 in `2026-10-10-codex-orphan-pile-count-data-adversarial.md`.
Only the two test files and this requested notes file changed. No network or git-writing command.

tests changed: src/data/live/home-cache.test.ts: repair 2 matches the fake's rooted Bower/.bower/piles/declaration- path; exactly one unstamped byte read and every stamped-read assertion remain intact.
tests changed: src/data/orphan-pile-count.test.ts: add the fix 1 context-only failed-Add history-flat regression; all existing assertions, property runs, seeds and bounds are unchanged.

Exact new test:
`orphan-pile-count-data: fix 1: a failed context-only Add costs the same reads with a small or large change history`.

The regression uses real `DriveVault.addPile` with context text and zero members, refusing
only the declaration-stamped folder create under the Inbox. Positive controls prove the
declaration committed, parses as a context-only folder declaration, and has no live anchor.
Both fixtures contain parser-valid unrelated request records under `.bower/changes/archive`,
with exact archive populations of 2 and 200. Each reload uses a new `DriveVault` and resets
the fake Drive counter after fixture setup and positive-control reads.

Cold `piles()` followed by `orphanSummary()` preserves the unknown context-only result
`{ count: 0, complete: false }`, reads the declaration exactly once, shares the full-read cache,
and leaves the complete Drive snapshot unchanged. The new assertions require equal total
Drive reads across history sizes and zero archived byte/text reads, matched by record id.
No fixed total-call bound was introduced or changed.

At the unchanged production HEAD, the new red fails on the equality assertion:
`Drive reads with 2 and 200 archived changes: 5 and 203: expected 203 to be 5`.
Both fixtures reach that assertion after all positive controls and cache/unknown/read-only
checks pass. The subsequent zero-archive-read assertion remains present for implementation.
This is an assertion red reproducing BLOCK 1, with no load errors or missing capability.

Verification (offline local dependencies; no install needed):
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data/orphan-pile-count.test.ts src/data/live/home-cache.test.ts --maxWorkers=2`
  exited 1: 22 tests, 21 passed, only the new fix 1 red failed. All 10 Home cache tests pass,
  including the repaired rooted-path assertion; all 11 existing orphan tests pass.
- Touched-file ESLint passed; app TypeScript (`tsc -p tsconfig.app.json --noEmit`) passed.
- `git diff --check` passed. Only failures and the test-output tail were read.
- Output was redirected to `tmp-logs/fix-round-1-vitest.log`, `fix-round-1-eslint.log`,
  `fix-round-1-tsc.log`, and `vitest-version.log`; `tmp-logs/` deleted before delivery.
- Full check/e2e not run for this test-only red repair. Production repair and coordinator
  commits remain pending; no implementation green or integration mark is claimed.

Sources: the existing fake Drive/cold-vault test pattern and the packet's previously cited
Google Drive resumable upload and IndexedDB transaction references above. No network research.
removed: none.

## Fix round 1

Implementer: codex, 2026-10-10. Base HEAD `add7f811`.
Implemented both assigned findings from the adversarial review in `drive-vault.ts` only.
No network, git-writing command, test edit, server, or e2e run was used.
Coordinator owns commits and integration.

### Changes and mechanism reuse

- `declarationsFor` reads only current journal files for the existing `contextRemoved`
  predicate, evaluated against the declaration's intended folder path. Archived changes are
  excluded from both this read and its snapshot evidence. No recreation or writes were added.
- The existing lazy journal promise and versioned `ReadCache` still supply all candidates.
  Its rejection logs error details once and records only that rejection's identity in the
  snapshot closure; candidates sharing it retain unknown completeness without duplicate logs.
  This adds no persistent store, scanner, or cache. Refresh retains its existing retry behavior.
- A rejected full-read promise now logs its details before evicting the failed snapshot.
  Authentication/session refusals still propagate and log at that rejection handler.
- `orphanState`, member accounting, declaration/disposition caches, stamped retirement, unknown
  context-only classification, the summary API, and Home's assertions are unchanged.

removed: src/data/vault/drive-vault.ts:740 (base): archived lines from snapshot journal evidence.
removed: src/data/vault/drive-vault.ts:752-753 (base): recovery's active-and-archived journal reader.
removed: src/data/vault/drive-vault.ts:772 (base): silent rejected-snapshot eviction handler.
removed: no files, tests, contracts, bounds, or upload mechanisms.
tests changed: none.

### Red and green evidence

Exact committed regression:
`orphan-pile-count-data: fix 1: a failed context-only Add costs the same reads with a small or large change history`.
The unchanged baseline failed its equality assertion: 5 versus 203 Drive calls for 2 versus
200 archived changes. `src/architecture.test.ts`, `errors are never swallowed`, also failed
on the `.catch` at base `drive-vault.ts:772`. Both are green after the fix.

Commands used `pnpm --config.verifyDepsBeforeRun=false --config.offline=true` to prevent network
and dependency restoration. Vitest was installed; no installation was needed.
Outputs went under `tmp-logs/`; only failures and aggregate results were read.

- Before edits: Vitest over `src/data/orphan-pile-count.test.ts`,
  `src/data/live/home-cache.test.ts`, and `src/architecture.test.ts`, `--maxWorkers=2`:
  27 passed, the two assigned assertion reds failed.
- After edits: the same focused suite: 3 files, 29 tests passed.
  All 10 Home cache tests and all 12 orphan tests pass, including the committed fix-round red.
- Requested full target: `pnpm exec vitest run src/data src/architecture.test.ts --maxWorkers=2`:
  80 files, 4,179 tests passed, exit 0. Contradicting tests: none.
- App/node TypeScript, `tsc -p tsconfig.app.json --noEmit` and
  `tsc -p tsconfig.node.json --noEmit`: both passed, exit 0.
  An intermediate narrowing error in the rejection marker was corrected; final app check passed.
- ESLint on `src/data/vault/drive-vault.ts`: passed, exit 0. `git diff --check`: passed.
- A temporary Node verification probe using the real `FakeDrive` and `DriveVault` made
  two real failed context-only Adds and refused one current journal line. It verified
  one read and one detailed error log per snapshot, cached unknown completeness, and
  one further read/log after refresh. Passed, exit 0. No test file changed.
- `pnpm check` ran through its built-in `harness/with-lock.sh` heavy-run lock. Lint passed;
  build-mode TypeScript stopped with TS5033/EPERM while writing app/node/sw build info
  under `node_modules/.tmp/`. This environment failure prevents a full check mark;
  it is not a test/ruling contradiction. Separate required app/node checks above pass.
- Logs: `fix-1-red.log`, `fix-1-focused.log`, `fix-1-data.log`, `fix-1-tsc-app.log`,
  `fix-1-tsc-node.log`, `fix-1-eslint.log`, `fix-1-shared-failure.log`, `fix-1-check.log`.
  Evidence is recorded here; `tmp-logs/`, including temporary probe scripts, was deleted.

Standard solution: reused the local current-journal query, `contextRemoved`, and existing
single-flight versioned `ReadCache`; inherited protocol/durability sources were not fetched:
[Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable)
and [IndexedDB transactions](https://www.w3.org/TR/IndexedDB/#transaction-concept).
No upload protocol or durability mechanism changed.

Left out: full check mark (sandbox EPERM), UI/e2e (`ui: false`), test changes, commits, integration.

## Fix round 2 reds

Independent red-owning session, 2026-10-10; base HEAD
`2d358967e311fa1784df98f758242e091e15952e`. Reproduces BLOCK 1 in
`2026-10-10-codex-orphan-pile-count-data-adversarial-2.md`.
Only the assigned test and this requested notes section were edited. No network or
git-writing command was used; coordinator owns commits. Production stays at HEAD.

tests changed: src/data/orphan-pile-count.test.ts: add the history-flat class regression for both cold entry points and three pile shapes; preserve every existing assertion and bound byte-for-byte.
removed: none.

Exact expanded names:

- `orphan-pile-count-data: fix 2: anchored missing context through cold piles`
- `orphan-pile-count-data: fix 2: unanchored failed Add through cold piles`
- `orphan-pile-count-data: fix 2: normal pile with context through cold piles`
- `orphan-pile-count-data: fix 2: anchored missing context through cold orphanSummary`
- `orphan-pile-count-data: fix 2: unanchored failed Add through cold orphanSummary`
- `orphan-pile-count-data: fix 2: normal pile with context through cold orphanSummary`

Each test compares 2 with 200 parser-valid unrelated archived request records,
identified by exact id for byte/text read counting. Each history size uses a fresh
fake Drive and cold DriveVault. The anchored failure comes through real context-only
`addPile`: its declaration and folder commit; the keyed context write loses connectivity;
the exact anchor's cleanup Bin attempt also loses connectivity and logs once.
Positive controls verify the surviving identity-matched empty folder and valid declaration.
The unanchored control fails anchor creation, as in fix 1; the normal control makes a
real context note and checks its member identity. Both public entry points are exercised
as the first cold read, without a substitute recovery scanner or summary stub.

Every case asserts zero archived-change reads and equal total Drive reads across the
two histories. Soft assertions expose both failures after both populations are measured.
All cases retain read-only snapshots, one declaration byte read, shared summary/cache
read counts, and the expected rows and summary: missing anchored context is held as
`not-arrived` with complete zero; unanchored context-only evidence remains unknown;
normal context stays readable and contributes complete zero. No fixed call bound is changed.

### HEAD evidence and verification

The entire assigned file ran with `--maxWorkers=2`: 18 tests, 16 passed, two expected
assertion reds. Both anchored missing-context tests fail at unchanged production HEAD:

- `src/data/orphan-pile-count.test.ts:362`: archived reads `[2, 200]`, expected `[0, 0]`.
- `src/data/orphan-pile-count.test.ts:365`: total Drive calls 4 versus 202, expected equality.

Both cold entry points reach these same failures after all fixture, row, summary,
cache and snapshot assertions pass. All four new controls and all 12 pre-existing
tests pass. No contradicting existing assertion or bound was found. A read-only
comparison with HEAD confirmed that removing only the new block reproduces the
original test file byte-for-byte. An initial new normal-control assertion expected
`setAside: null`; inspection of the actual row corrected this new assertion to
`undefined`, the existing normal-row shape. No pre-existing assertion was edited.

Vitest was present; no offline installation was necessary. All pnpm commands used
`--config.verifyDepsBeforeRun=false --config.offline=true`, with no network.

- File run: `pnpm exec vitest run src/data/orphan-pile-count.test.ts --maxWorkers=2`,
  with an OS-temp config wrapper, `--configLoader runner`, and temp `--fsModuleCachePath`.
  Exit 1, only the two anchored reds above.
- Touched-file ESLint: exit 0.
- App TypeScript, `tsc -p tsconfig.app.json --noEmit --incremental false`: exit 0.
- Read-only `git diff --check`: passed.

Logs: `/tmp/orphan-pile-count-fix2-p0c3eya0/vitest.log`, `eslint.log`, and `tsc.log`.
The temp config imports the unchanged app config and places the Vite/module caches
in the same OS-temp directory. A temp setup changes only the worker process cwd,
so the existing timer-gate CPU reporter writes under that temp directory too.
An initial `/tmp` setup path had a module-resolution error before tests loaded;
using its canonical `/private/tmp` path resolved it. Final run has no load errors,
fixture errors, timer violations or unhandled rejections. No test writes to the repository.
No full check/e2e ran: this assignment is red-only, `ui: false`, and prohibits test
output in the repository; the standard full check writes repository artifacts.

Standard approach: reuse the existing fake-Drive/cold-Vault regression and real Add
entry point. Protocol and durability sources remain the packet's inherited Google
Drive resumable upload and IndexedDB transaction references above; no source was
fetched and no upload or durability mechanism changed.

Left out: production fix, full check/e2e, commits and integration.


## Fix round 2

Implementer: codex, 2026-10-10. Follow-up base HEAD
`e36f5f7100b72c4da48c67defe5bc9f25fd68e79`.
Final status: **blocked under TL-P4-51** after the whole targeted suite completed.
The scoped production fix remains uncommitted for `harness/codex-run.sh`.
No network, git-writing command, test edit, dependency install, server, or e2e run.

### Ruling and existing mechanism

TL-P4-53 addendum 6 (lead, 2026-10-10), supplied in the assignment: a missing
context gets one Bin lookup by identity through the existing c2-pile-records
"binned counts as removed" lookup. Binned means removed; with nothing left the
reason is "Nothing is left in it. Remove it from your inbox." Cost stays flat
with history; no archive scan. The earlier round-2 stop at
`src/data/fake/fake-runner.test.ts:1018-1024` is resolved and that test now passes.
The earlier current-only journal fix remains in HEAD unchanged.

`declaredState` extends its existing `binnedByItem` callback: the missing
context's exact declaration member key joins missing member keys in one query.
The returned file identity is established through `PROP.item`, never its name
or path. Its one promise supplies both row accounting and `contextBinned`,
including the repeated accounting after queue hydration. `setAsideFor` consumes
that fact through the existing `setAsideOf`; no removal line is required for a
context whose identity is in the Bin. An empty pile therefore gets `empty`;
a pile with ready things still in it gets no missing-context reason.

The existing `fullDeclarations` snapshot also retains these Bin promises by
folder identity and queried identities. `declarationSnapshot` extracts the
existing listing/evidence identity check without changing its invalidation
criteria. Row reads and repeated `orphanSummary` reads reuse the same promise;
refresh and changed listing/journal evidence replace the snapshot as before.
No persistent table, second Bin scanner, new Drive API, archive scan, shared
contract, upload protocol, automatic recreation, or runner change was added.

removed: src/data/vault/drive-vault.ts:739-741 (follow-up base): inline snapshot check, extracted unchanged.
removed: src/data/vault/drive-vault.ts:778 (follow-up base): separate snapshot assignment, replaced by its shared initializer.
removed: src/data/vault/drive-vault.ts:869-870 (follow-up base): member-only Bin callback, replaced by the combined lookup.
removed: no files, tests, formats, upload mechanisms, or numeric bounds.
tests changed: none.

### Red and green evidence

Baseline focused run completed: 3 files, 99 passed, one failed (100 tests).
All 18 orphan tests and all 10 Home cache tests passed. The sole assertion red:
`src/data/fake/fake-runner.test.ts:1018`,
`a pile left with nothing is offered for removal, never filed`, at `:1024`:
expected "Nothing is left in it. Remove it from your inbox." but received
"Some of its things have not arrived yet." It passes after this fix.

An intermediate focused run exposed repeated Bin reads on summaries. Those
were corrected by sharing the existing full-read snapshot before the final
runs below. Neither cache assertion nor any other test was edited.

Final commands use `pnpm --config.verifyDepsBeforeRun=false --config.offline=true`:

- `exec vitest run src/data/orphan-pile-count.test.ts --maxWorkers=2`: exit 0;
  all 18 reds/control tests pass. Both exact anchored history-flat regressions
  pass: `orphan-pile-count-data: fix 2: anchored missing context through cold piles`
  and `orphan-pile-count-data: fix 2: anchored missing context through cold orphanSummary`.
  The four other fix-2 controls, fix-1 history-flat regression, shared-cache
  assertions and both pinned properties also pass unchanged.
- `exec vitest run src/data src/architecture.test.ts --maxWorkers=2`: exit 1;
  80 files, 4,181 passed, four failed (4,185 tests). Every failure is listed
  below. All Home goldens and architecture tests pass unchanged.
- `exec tsc -p tsconfig.app.json --noEmit --incremental false`: exit 0.
- `exec tsc -p tsconfig.node.json --noEmit --incremental false`: exit 0.
- `exec eslint src/data/vault/drive-vault.ts`: exit 0.
- Read-only `git diff --check`: pass.

Vitest 5.0.3 was installed; offline installation was unnecessary. Each Vitest
command also uses `--configLoader runner`, an OS-temp config wrapper, and an
OS-temp `--fsModuleCachePath`. The wrapper imports the unchanged app config,
redirects Vite/module caches, and prepends a temp setup that moves only worker
cwd into OS temp. Temp `src` and `docs` symlinks support existing relative
fixture reads. CPU reports stay in OS temp; no test writes into the repository.
No repository test/config/setup file changed. Only failure sections and
aggregate results were read; successful typecheck/lint logs are empty.

Logs/config: `/private/tmp/orphan-pile-count-fix2-final-1kdlgoa4/`:
`baseline.log`, `focused.log` (intermediate), `reds.log`, `data.log`,
`tsc-app.log`, `tsc-node.log`, `eslint.log`, `vitest.config.ts`, `cwd.ts`.
`pnpm check` was not run: its standard tests write repository artifacts,
prohibited by this assignment, and the completed target requires the TL-P4-51
stop. No full check mark is claimed. E2e does not apply (`ui: false`).

### Every contradicting test (whole target completed before stopping)

Exactly four tests fail against the supplied addendum-6 rule:

1. `src/data/fake/fake-runner.test.ts:1031` —
   `a note missing for no reason you gave holds the pile until it is written again`.
   Assertion `:1043` expects "Some of its things have not arrived yet.".
   The fixture directly Bins the context (`:1036`); ready members remain live.
   The new Bin fact removes the missing-context reason, so `heldWith` returns
   "held, with no reason in the Inbox". The runner still holds this pile under
   its older journal-only rule; runner files are outside the owned scope.
2. `src/data/fake/fake-worker.test.ts:3636` —
   `a pile waiting for its context note is held, never restored by the runner`.
   Assertion `:3667` expects `not-arrived`, receives `undefined`. The fixture
   directly Bins the context at `:3645`, with no removal line; its ready things
   remain. Treating that exact Binned context as removed contradicts the old
   missing-context expectation. The later retry assertions are not reached.
3. `src/data/vault/drive-vault.test.ts:2026` —
   `a note to write again is not an empty pile, for the inbox and the tidy-up alike`.
   Assertion `:2030` expects `not-arrived`, receives `empty`. The helper at
   `:2015-2023` moves its member out and directly Bins the context; nothing is
   left. This is exactly the addendum-6 empty-pile case. The subsequent runner
   expectation at `:2031` retains the older rule and is not reached.
4. `src/data/vault/drive-vault.test.ts:2034` —
   `your changes are read once per listing, and one that cannot be read affects only its pile`.
   Assertion `:2044` expects two `not-arrived` reasons, receives two `empty`
   reasons. Both fixtures use the same helper that Bins context after moving
   all members out. Bin evidence now determines removal before journal reads.
   Its later current-journal read-count (`:2045`) and refusal-based reasons
   (`:2052-2053`) also assume journal evidence is required and are not reached.

These are all failures from the whole requested target, not just the first
one found. Reverting Bin removal to require a journal line would contradict
the supplied ruling. No test was changed, weakened, skipped, or deleted.
No fixture-specific branch or alternate retirement rule was added. Stopped
with all four contradictions recorded for the lead under TL-P4-51.

### Standard approach and sources

No network research was authorized or performed. Reused the existing c2 Bin
lookup documented in `src/data/drive/drive-api.ts:132-138`, its real Drive
implementation, and the existing full-read snapshot evidence check.
Inherited standard reference:
[Drive file search](https://developers.google.com/workspace/drive/api/guides/search-files)
(`trashed = true` plus exact app-property identity predicates).
Packet protocol/durability references remain
[Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable)
and [IndexedDB transactions](https://www.w3.org/TR/IndexedDB/#transaction-concept).
No upload or device durability mechanism changed.

Left out: lead reconciliation of the four contradictory tests and runner
expectations, full check mark, UI/e2e, test changes, commits, and integration.


## Red sweep 3

TL-P4-53 addendum 7, lead ruling 2026-10-10: missing contexts must be
missing without binning. Addendum 6 still treats a binned context as removed.
Changed only test fixtures and this requested record; no production change,
network request, git write, commit, or integration.

The fixtures reload FakeDrive snapshots with the exact context id absent
from the stored files, including the Bin. This models a context write that
never landed, or a context never created. The declaration, context key,
original words, members and journal records remain as before. Reused the
snapshot fixture approach already in drive-vault.test.ts (the vanished
fixture), and FakeDrive.snapshot/restore. The Worker test rebuilds its
consumers on the restored Drive and retains its injected clock and fenced
write observers. Every existing assertion is unchanged: reasons, journal
reads, retries, report rows, read bounds and no-write expectations.

### Every changed test

Each path below records one changed test, including each consumer of the
shared missing-context helpers. Line references describe the resulting tree.

- tests changed: src/data/fake/fake-runner.test.ts: TL-P4-53 addendum 7: `a note missing for no reason you gave holds the pile until it is written again` (:1037) now has an absent context, preserving the not-arrived sentence and all hold/no-write assertions.
- tests changed: src/data/fake/fake-runner.test.ts: TL-P4-53 addendum 7: `a note written again by someone else during the run is not written twice` (:1102) starts with an absent context, preserving both runs and the single rewritten note assertion.
- tests changed: src/data/fake/fake-worker.test.ts: TL-P4-53 addendum 7: `a pile waiting for its context note is held, never restored by the runner` (:3636) has an absent context, preserving capture exclusion, fenced writes, reports, not-arrived and Try again assertions.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `a note to write again is not an empty pile, for the inbox and the tidy-up alike` (:2034) uses the absent-context helper, preserving empty items and both not-arrived reasons.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `your changes are read once per listing, and one that cannot be read affects only its pile` (:2042) uses the absent-context helper twice, preserving journal-read counts and both refusal reasons.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `Try again on another client writes a missing note again, then asks for the file` (:1342) models a never-created context, preserving the declared key, words, conflict and no-upload assertions.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `Try again writes no note while a tidy-up holds the pile, nor one already written again elsewhere` (:1400) models a never-created context, preserving busy refusal, no writes, missing words and one-note retry assertions.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `a person's retry after a double failure makes one file` (:3055) starts its pile-note case with no context ever created, preserving lost-reply recovery and one-note assertions.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `a pile note retried with new words after a double failure is one note with the new words` (:3084) starts with no context ever created, preserving double-failure retries and final words.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `a pile note retried after a double failure never overwrites an edit made between tries` (:3133) uses the converted lostPileNote fixture, preserving intervening-edit refusal and subsequent save assertions.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `a pile note binned elsewhere after a double failure is refused first, then made with the new words` (:3148) uses the converted initial missing-context fixture; its later intentional Bin and refusal/retry assertions remain unchanged.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `a missing pile note written again, its answer lost, is made once by its reserved id` (:3274) models a never-created context, preserving successful retry, one lost reply and one-note assertions.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `a pile note whose create landed and then moved is refused on retry and not written in its new place` (:3904) starts with no context ever created, preserving the later move and all refusal, words and no-second-note assertions.
- tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 7: `every app create, its answer lost, against a move, rename or Bin elsewhere: success only as it was made` (:4213) starts its pile-note variants with no context ever created; all matrix cases and assertions remain unchanged.

### TL-P4-51 grep sweep

Searched src test files for every trash call, missing-context/missing-note
wording and context/Bin wording. Raw search records are in OS temp:
`/tmp/orphan-all-bin-grep.txt`, `/tmp/orphan-missing-context-grep.txt`, and
`/tmp/orphan-pile-context-grep.txt`. Besides the four named contradictions,
converted ten more tests using Bin only to set up a missing-context create
or retry. Left intentional removal fixtures intact, including noteBinnedByYou,
new words after a declared note was removed, context replacement/reordering,
and later Bin races: those points explicitly test removal or replacement,
rather than a context missing for no reason the person gave.

### Verification

Whole requested target completed: **4 files, 513 tests passed**, with
`--maxWorkers=2`. Exact files:
`src/data/fake/fake-runner.test.ts`, `src/data/fake/fake-worker.test.ts`,
`src/data/vault/drive-vault.test.ts`, `src/data/orphan-pile-count.test.ts`.
Log: `/tmp/orphan-pile-red3.Lz0Hkv/verify.log`.
No contradicting test remains in this target. The four prior failures are
recorded in Fix round 2 above; no assertion was weakened to reconcile them.

Used an OS-temp Vitest configuration with the original app configuration,
original app setup and the same timer gate, excluding only its repository
CPU-report writer. Cache and configuration artifacts stay in OS temp.
An initial setup failed before tests because its temp module was outside
Vite's allowed paths; a second start was stopped to ensure setup-file arrays
could not include the repository report writer. The completed run uses
explicit setup-file replacement and an allowed OS-temp path.
`git diff --check` passed. Full check and e2e were not run: this task permits
only test edits and explicitly forbids tests writing into the repository.
No screen or production mechanism changed. Coordinator owns commits.

Standard reference inherited from Fix round 2:
[Drive file search](https://developers.google.com/workspace/drive/api/guides/search-files)
(exact identity and distinct trashed evidence); no network used.

Touched-test ESLint passed; log: `/tmp/orphan-pile-red3.Lz0Hkv/lint.log`.
Final diff check passed; only the three test files and this requested notes
record differ. All 14 changed tests are listed above.


## Escalated completion after red sweep 3

Implementer: codex, 2026-10-10. Base HEAD
`4f5f03bf1eece3f224808ddc28f0692f8e9e3541` (red sweep 3 committed).
Final status: **done**. This supersedes the earlier TL-P4-51 blocked statuses:
all required targets now pass under TL-P4-53 addenda 5–7. No remaining
contradicting test was found in the whole requested suite.

No production fix was needed. The existing production implementation in
`src/data/vault/drive-vault.ts`, `src/data/pile-readiness.ts` and
`src/data/sources.ts` passes the repaired committed contract unchanged.
Addendum 5 listing-stamp retirement, addendum 6 exact-identity Bin removal,
and addendum 7 missing-without-binning fixtures remain intact.
Only this notes file changed in this completion session.

tests changed: none.
removed: none.
No network, git-writing command, dependency install, server, or e2e run.
The coordinator owns the notes commit and integration.

### Final verification

Every pnpm command used `--config.verifyDepsBeforeRun=false --config.offline=true`.
Logs and all test-generated artifacts are under
`/private/tmp/orphan-pile-final-0fmdacwz/`.

- `pnpm exec vitest run src/data/orphan-pile-count.test.ts --maxWorkers=2`:
  exit 0; one file, all 18 exact orphan reds and controls passed unchanged.
  Log: `reds.log`. Exact test names and original assertions are recorded above.
- `pnpm exec vitest run src/data src/architecture.test.ts --maxWorkers=2`:
  exit 0; 80 files, all 4,185 tests passed. Log: `data.log`.
  The four prior contradictions and all repaired retry fixtures now pass.
- `pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false`:
  exit 0. Log: `tsc-app.log` (empty).
- `pnpm exec tsc -p tsconfig.node.json --noEmit --incremental false`:
  exit 0. Log: `tsc-node.log` (empty).
- `pnpm exec eslint src/data/vault/drive-vault.ts src/data/pile-readiness.ts src/data/sources.ts`:
  exit 0. Log: `eslint.log` (empty).
- Read-only `git diff --check`: passed before the notes update.

Both Vitest runs use `--configLoader runner`, a temp `vitest.config.ts`,
and `--fsModuleCachePath` in the same temp directory. The wrapper imports
the unchanged app config, redirects Vite caches, and explicitly orders
`cwd.ts` before the original app and timer-gate setup files. Only worker cwd
moves to OS temp. Temp `src` and `docs` symlinks support existing read-only
fixture reads. The original timer gate and CPU reporter both run; CPU
reports are written under OS temp, never into the repository. No test,
repository config, or setup file was edited. Only failure-pattern searches
and aggregate counts were read from test output; there were no failures.

`pnpm check` was not run: its standard command writes repository artifacts,
which this assignment prohibits. The explicitly requested data/architecture,
app/node TypeScript and scoped ESLint checks all passed. No full check mark
is claimed. E2e does not apply to this data-only `ui: false` entry.

### Standard approach and sources

No network research was performed, as instructed. Reused the inherited
standard references and existing production mechanism recorded above:
[Drive file search](https://developers.google.com/workspace/drive/api/guides/search-files),
[Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable),
and [IndexedDB transactions](https://www.w3.org/TR/IndexedDB/#transaction-concept).
No second scanner, durable store, or upload protocol was added.

Left out: full check mark, UI/e2e, commits and integration.

## Known-green close (coordinator)

The first implementation (29e871ca) was followed by rounds 2-3 and the addenda 5-7 work on the same lines of drive-vault.ts and pile-readiness.ts, so done.sh cannot revert it cleanly. The reds are proved: at f53be704 all 11 failed on the absent orphanSummary (Reds section); each fix round committed reds that failed at their HEAD (fix 1, fix 2 history-flat; this notes file). After: orphan 18/18, data+architecture 4185; pnpm check green; e2e app/capabilities demo 35 and fake 49; P4-101 PASS.
