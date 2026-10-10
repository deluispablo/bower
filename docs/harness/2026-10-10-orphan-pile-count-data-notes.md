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

Implementer: codex. Base HEAD `e4b3ff309f54073132148eb0dbe732e9b55c4cf2`.
Status: **blocked under TL-P4-51**. The production changes remain in place, uncommitted.
No test was edited; no git-writing command was run. The coordinator's `harness/codex-run.sh`
owns commits. This is an unfinished implementation, not an integration-ready delivery.

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

- `src/data/pile-readiness.ts`: one common record-reader/copy merger now supports loose and
  folder declarations, rejects conflicting pile/declaration identities, excludes parser-identified
  foreign roots, and retains completeness for refused current-root evidence. The legacy loose
  helper preserves its pre-read folder/stamped-disposition filters for existing callers.
- `orphanState` uses `accountPile`'s validated disposition identity/hash and member digest facts;
  matching anchors anywhere in the listed root are excluded. Missing context is checked using
  the existing `contextRemoved` journal fact and keyed Bin evidence; ambiguous context-only
  history stays unknown. No shared Pile/SetAside or stored/wire contract changes.
- `src/data/vault/drive-vault.ts`: the full loose-discovery path and `orphanSummary` share a
  snapshot promise and the existing listing, parsed declaration/disposition caches and ReadCache.
  Concurrent reads share results; refresh invalidates the snapshot; local index changes invalidate
  by evidence identity. The summary returns only `{ count, complete }`.
- `src/data/sources.ts`: app-local summary capability with the frozen value shape. As with the
  existing declaration-specific `chooseAgain` door, the interface capability is optional for
  sources that do not implement declarations; DriveVault exposes the concrete method.

removed: src/data/pile-readiness.ts:201-246 (base): legacy-only copy merger replaced by the common reader.
removed: src/data/vault/drive-vault.ts:774-776 (base): separate loose scan replaced by full-read classification.
removed: no files, tests, contract formats, upload mechanisms or numeric bounds.
tests changed: none.

### Every contradicting test (whole targeted suite completed before stopping)

The packet requires a general current-root classification from the full read, validating retirement
rather than accepting a disposition stamp. These four existing call budgets explicitly depend on
not reading earlier stamped declarations at all. Filtering those records solely from stamps would
restore the budgets but defeat the packet's damaged/unrelated-disposition and unknown-evidence
rules. No bound was changed and no purported stamp-only optimization was added.

1. `src/data/live/home-cache.test.ts:110` — `Home reads each file of the live-shaped folder once in one load (golden)`.
   Assertion `:120` requires `readBytes: 1`, total `:121` requires 26 calls. Actual `readBytes: 21`;
   the 20 earlier declarations are now checked once by the general read.
2. `src/data/live/home-cache.test.ts:169` — `a refresh during a read in flight never reads one file at one modifiedTime twice (C05 findings 4)`.
   The no-duplicate-per-version assertion passes; its additional `:190` budget requires 28 calls,
   actual 48 because the same 20 earlier declaration candidates must now be checked.
3. `src/data/live/home-cache.test.ts:209` — `Home makes the same Drive calls after 10 and after 500 earlier runs`.
   Assertion `:219` requires equal totals. Actual 37 and 527: the candidate history is read for
   valid retirement/unknown facts, rather than suppressed by listing stamps.
4. `src/data/live/home-cache.test.ts:229` — `an empty inbox reads no old pile records`.
   Assertion `:235` requires no reads of old records. Actual 31 record reads (48 total calls).
   An empty Inbox cannot exclude valid unresolved folder declarations whose anchors never appeared.

Lead ruling required on these four contracts before resuming. They are not permission to modify tests.

### All other failing tests (six; not declared packet contradictions)

These failures are also preserved for the next diagnosis/fix round; no green suite is claimed.

- `src/data/fake/fake-runner.test.ts:646` — `a declared loose file that has not arrived is looked up in the Bin once per listing`.
  Assertion `:656`: expected one Bin query, actual two. Summary accounting and legacy row accounting
  currently repeat the lookup; the result needs to be shared.
- `src/data/fake/fake-worker.test.ts:2645` — `a retired loose declaration costs the inbox no digest and no lookup of its member`.
  Assertion `:2657`: expected zero Bin queries, actual one, for a context key rather than the member.
  The general read also classifies context history; this needs precise diagnosis before changing retirement.
- `src/data/live/live.test.ts:400` — `reused sources isolate account and folder changes (queued admissions cannot block or dispatch in B, flushJournal)`.
  Assertion `:418`: expected one process call after drain, actual zero. Added full-read awaits change
  this schedule; account isolation was not verified past this failed assertion.
- `src/data/live/live.test.ts:400` — `reused sources isolate account and folder changes (queued admissions cannot block or dispatch in B, process)`.
  Assertion `:418`: expected two process calls after drain, actual one. Same schedule-sensitive failure.
- `src/data/vault/drive-vault.test.ts:2072` — `an unreadable declaration affects only its own pile`.
  Assertion `:2108`: expected one log of the injected refusal, actual four; anchored and general
  declaration reads currently log the same failed evidence more than once.
- `src/data/vault/drive-vault.test.ts:2293` — `offline, a declared pile logs one error per listing`.
  Assertion `:2308`: expected one log, actual two; existing note refusal and general read both log.

### Verification and environment

- Initial plain `pnpm exec` attempts triggered dependency restoration and failed network fetches.
  They were interrupted; no intentional network request or research call was made. Local dependencies
  were then linked from the existing app installation into ignored worktree `node_modules`.
- Actual assertion red: local `vitest run src/data/orphan-pile-count.test.ts --maxWorkers=2`,
  11/11 failed the absent `orphanSummary` capability assertion before production edits.
- After implementation the same red file passed 11/11, including both pinned fast-check properties.
  Exact expanded names are recorded in the original Reds section above; no value assertions changed.
- Whole targeted suite: local `vitest run src/data --maxWorkers=2`, 79 files,
  4,161 passed and 10 failed. Only failure sections and aggregate lines were read.
- Repeated the requested whole suite through pnpm with dependency restoration disabled and offline
  enforced: `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data --maxWorkers=2`.
  The pnpm run also completed all 79 files: 4,161 passed and 10 failed. Its final failure log
  is preserved under `/tmp/e3-orphan/`.
- App and node TypeScript pass; touched production-file ESLint passes. App TypeScript also passed
  through pnpm with the same offline flags; node TypeScript and ESLint were rerun through that pnpm path.
- `git diff --check` passes. No server, screen/e2e change or git write.
- `pnpm check` and e2e were not run after the TL-P4-51 stop condition; this data-only entry has `ui: false`.
  No gate mark or integration success is claimed.
- Logs were generated under `tmp-logs/`, copied to `/tmp/e3-orphan/`, and `tmp-logs/` was deleted
  as requested. No important result exists only in chat.

Left out: resolution of the four contradictory numeric/read contracts, remaining six failures,
full gates, UI, test changes, commits and integration. Production changes remain in place for review.


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
