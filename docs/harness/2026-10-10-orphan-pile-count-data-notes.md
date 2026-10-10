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
