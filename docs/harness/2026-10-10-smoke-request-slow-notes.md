# smoke-request-slow — red delivery

implementer: codex

HEAD: `8298725934e68919d2e71901a98b84ef17de5fe6`.
Worktree: `/private/tmp/bower-smoke-request-slow`, branch `smoke-request-slow`.
Tests only; no implementation, existing-test edits, git writes, network, live Drive or real waits.
The coordinator owns both commits (tests first, then these notes separately).

## Reds

Every test below is in `runner/test/c05-bounded-reads.test.ts`.

1. `C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media`
   - Positive controls: real C04 pile run, exactly 15 reads in runner timing; fresh request without history,
     10 reads and the signed NOTHING_FOUND_WHY row. Both finish successfully.
   - HEAD: 50 unrelated archive media reads and 75 unrelated manifest/checkpoint media reads;
     the request-only run has 137 reads, exceeding the pile baseline of 15.
   - No waiting requests: a pile run with the same marked history reads 75 historical records,
     with 84 reads in the reads phase. It must read none of that history.
   - No migration: a real clashed staging request placed directly in changes is treated as new.
     HEAD instead reads five old records, retries its old binding, appends to the renamed old target,
     records a completion, and omits the new target's NOTHING_FOUND_WHY row.
2. `C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence`
   - Positive controls: an ordinary personal append through main, the real note-edit API, the manifest
     parser and every checkpoint parser/chain check. Completion and archive both land.
   - Recovery control: interrupt the request move after completion; rename the request file and target,
     add a replacement title and new source. The next run archives the same record bytes with no second
     append or completion. This control passes at HEAD.
   - Two targets: one clashed append and one target with no offered line. NOTHING_FOUND_WHY settles
     the latter in the first run. Only the clash waits; the omitted target never appends later.
   - HEAD: the request remains directly in changes; pending/<run id> is absent.
   - Retry: rename the target, source and request filename; add a replacement target with the old title,
     plus 25 unrelated retained runs and 50 archived requests. The actual retry retains the journal id
     inside the bytes and the bound target/source ids, resolves the final citation name, preserves
     personal text, completes once, and archives the exact unchanged request bytes.
   - HEAD: the retry also scans 50 archive files and 75 unrelated run records; its own run costs five
     media reads rather than the ruled one. Reads-phase calls are 146 rather than at most 16 (15 + 1).
   - Gone-target control: a binned bound target remains binned, reports ASK_GONE, archives the request,
     and gets no append/completion. This control passes at HEAD.
3. `C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk`
   - Positive controls: legitimate append; a fresh request with 25 kept runs gets NOTHING_FOUND_WHY;
     an old unbound request gets TOO_OLD_WHY, no note edit/completion, and an archive move.
   - Listing creation times are AT - 2000 + i; historical manifests have requestedAt = AT.
     A request at AT - 1000 is within the listing horizon. HEAD incorrectly reports TOO_OLD_WHY.
   - A request at AT - 60000 must fail closed with the signed TOO_OLD_WHY and unchanged personal bytes.
   - HEAD preserves that outcome but walks 75 unrelated manifest/checkpoint files and reads 50 archive
     files. Both media sets must be empty.

Final targeted red run: all three tests fail on the assertions above, with no load errors.
All positive controls reached their assertions successfully. Failure evidence: `tmp-logs/bounded-red.log`.

## Rulings carried into the reds

| Ruling | Pin |
| --- | --- |
| smoke-request-slow (1), no archive scan | Golden, pending and horizon assert zero archive media reads. Hand restores are outside v1. |
| smoke-request-slow (2), pending by run id | Pending asserts the physical request move, unchanged bytes, own run selection and numeric read bound. |
| smoke-request-slow (3), listing horizon | Horizon separates listing creation from manifest requestedAt and asserts zero chain reads. |
| smoke-request-slow (4), history only for waiting | Golden runs both a new request and a pile without any waiting request against marked history. |
| smoke-request-slow (5), no migration | Golden's old-format staging variant remains new despite an existing clashed binding. |
| TL-P4-32, consent from request/target, checkpoint idempotence, fresh-note clash | Positive append, pending rename/replacement and interrupted-move recovery use main and parsed production records. |
| Addendum 1, mechanical links remain admitted | Unmodified note-edit and keep-one-note tests pass; the positive append preserves personal ownership. |
| Addendum 2, one settlement/provenance home, oldest request, independent state | Existing C05 tests stay green; new tests consume RunRecords and the existing app/runner entry points. |
| Addendum 3, target/source ids and gone target | Pending renames both ids, creates an old-title replacement, and tests a binned target. |
| Addendum 4, no second effects rather than no admission | Interrupted-move recovery asserts no second append/completion; it does not forbid admission. |
| Addendum 5, embedded record id, no title rebinding, expiry | Renamed waiting/recovery files, renamed bound targets, old-title replacements and the horizon variant. |
| Addendum 6, every named target settles; only clash carries over | Pending pairs a clashed target with a NOTHING_FOUND_WHY target and verifies the latter never appends. |

## Existing expectations for coordinator review

No existing test was changed. The following expectations may conflict with the new ruling and need red-owner
repair only after a lead/coordinator decision; they were all green at this HEAD:

- `runner/test/c05-person-notes.test.ts:390`,
  `C05 person notes: fix 1 finding 2: a conflicted append survives twenty newer runs and retries its filed source`:
  promises retry after more than twenty consecutive clashes, contrary to the accepted expiry/v1 limit.
- `runner/test/c05-person-notes.test.ts:808`, helper `round4Pending`: asserts the waiting request stays directly
  in changes. Used by `C05 person notes: round 4 2: pending retries keep target and source ids`
  and `C05 person notes: round 5 3: a request past retention is left as written and archived without an append`.
- `runner/test/c05-person-notes.test.ts:1262`,
  `C05 person notes: round 5 5: only a clashed target retries on bound ids before archive`:
  explicitly expects the clashed request bytes directly in changes rather than pending/<run id>.
- `runner/test/c05-person-notes.test.ts:342`,
  `C05 person notes: landed append with lost answer and failed read-back resumes then replays exactly once`:
  restores an archived request by hand while its origin is retained, relying on archive/history discovery.
- `runner/test/c05-person-notes.test.ts:956`,
  `C05 person notes: round 5 1: archived completion uses the record id inside differently named bytes`:
  restores archive copies by hand after retention. That fixture is now outside supported use; its effect-only
  assertions might still pass via expiry, but archive evidence is no longer the promised mechanism.
- `runner/test/c05-person-notes.test.ts:1061`, the horizon test above also assumes fixedDrive's 1970 folder
  creation times can be ignored in favour of manifest requestedAt. It needs truthful listing-time fixtures.
- The existing corpus `c05-note-not-written-by-bower` explicitly restores an archived request on press 2.
  Its no-second-effect outcome stays covered, but that hand restore is now a documented v1 limit.

The strict one-read bound is deliberately not widened: the pending red checks at most one own-run media read
and at most baseline + 1 reads-phase calls. Existing RunRecords currently consumes five files for that origin.
If “one read” was intended as one logical RunRecords lookup rather than one Drive media read, the lead must
rule on that interpretation; the red-owning session has not changed the packet's number.
The C04 baseline is 15 at this HEAD. B1a's authorized added calls must be accounted for when it integrates,
following TL-P4-41 addendum 3; no baseline or existing golden was changed here.

## Verification

Only targeted files, every vitest invocation with `--maxWorkers=2`; output redirected under `tmp-logs/`.
Only failure output was inspected. No full check or e2e was run, per the red-session instruction.

| Gate | Result | Log |
| --- | --- | --- |
| New bounded-read file, final revision | 3 assertion reds, expected | tmp-logs/bounded-red.log |
| C05 runner files | pass | tmp-logs/c05-runner.log |
| C05 app files | pass | tmp-logs/c05-app.log |
| keep-one, state rewrite, pair ask, app answer loop | pass | tmp-logs/c05-runner-contracts.log |
| note-edit, manifest, checkpoint, state rewrite, RunRecords, Home cache | pass | tmp-logs/c05-app-contracts.log |
| tsc app | pass | tmp-logs/tsc-app.log |
| tsc node | pass | tmp-logs/tsc-node.log |
| tsc runner | pass | tmp-logs/tsc-runner.log |
| eslint touched TypeScript | pass | tmp-logs/eslint.log |

Runner C05 files: `c05-person-notes.test.ts`, `c05-incorporation.test.ts`, `c05-between.test.ts`,
`c05-marked-history.test.ts`. App C05 files: `src/data/contracts/c05-person-notes.test.ts`,
`src/data/contracts/c05-person-reports.test.ts`, `src/features/tidy/c05-person-notes.test.tsx`.

## Compatibility and method

| Fixture/format | Verdict | Evidence |
| --- | --- | --- |
| Existing stored v2 manifests/checkpoints | preserved | Every actual produced manifest/checkpoint parses and its chain verifies. Existing parser tests pass. |
| Existing personal note bytes | preserved | Author API returns the exact main-written bytes; clash/retry preserves the person's added text. |
| Bound target/source and record identity | preserved | Filename/title renames do not replace embedded request id or target/source ids. |
| Old-format staging waiting requests | new by ruling | Golden intentionally refuses inherited evidence from a direct changes file. |
| Existing corpus | unchanged | Loaded existing cases are varied in memory; no new corpus case or persistent rubric was added. |

No new corpus case means no new row is needed in `2026-10-08-p4-method-rubric-changes.md`.
The in-memory bounded-read variants agree with the method: a requested append remains sourced and personal;
absence of new evidence gets the signed row; expiry loses no personal bytes and asks for fresh consent.

removed: none (red-only delivery).
tests changed: none of the existing tests; only `runner/test/c05-bounded-reads.test.ts` was added.
left out: implementation after B1a, full check/e2e, integration and commits (coordinator-owned).

## Sources (cited without fetching; no network)

- [Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list): list metadata
  in bulk, select only the request's evidence, then read selected ids.
- [Drive parent/search queries](https://developers.google.com/workspace/drive/api/guides/search-files): folder
  containment is the discovery pointer; the journal id inside the bytes is the identity.
- [Drive partial-response fields](https://developers.google.com/workspace/drive/api/guides/fields-parameter):
  creation times belong to the metadata listing, so deriving the horizon needs no manifest media.
- Existing “index points to evidence” implementation: `VaultIndex` maps physical paths/ids, and `RunRecords.found`
  verifies originating manifests and checkpoint chains. The new reds use these homes, with no extra index/store.

## Implementation

Stopped before production edits under the implementation instruction: “if a red contradicts the packet or a
ruling, stop and say so.” No network or git writes were performed.

The committed bounded-read reds still pin the pre-B1a C04 reads baseline to 15 at
`runner/test/c05-bounded-reads.test.ts:262`. On this checkout the real pile control returns 20.
Both the golden and pending tests stop at that assertion, before their bounded-read scenarios.
The current C04 golden in `runner/test/drive-calls-golden.test.ts:31` explicitly pins reads to 20.
TL-P4-41 addenda 3–4 authorize B1a's maintenance calls; the Reds section above already requires those
authorized calls to be accounted for after B1a integrates. Making this control return 15 would contradict
that accepted behaviour. Tests cannot be changed by this implementation session, so the red owner must
reconcile this control before implementation resumes.

Verification: `pnpm -C runner exec vitest run test/c05-bounded-reads.test.ts --maxWorkers=2` failed all
three tests. The golden and pending fail with expected 15, received 20; the horizon still reproduces
the listing-age and historical-read defects. Output: `tmp-logs/implementation-reds.log`; only failures
were inspected. C05/app/data/runner suites, typechecks, eslint, full check and e2e were not run after
the required stop. No assertion or bound was weakened.

removed: none (implementation stopped before production edits).
tests changed: none.

Compatibility row drafts for the resumed implementation, not claims of completed validation:

| Fixture/format | Required outcome | Status |
| --- | --- | --- |
| B1a C04 pile control | Preserve authorized maintenance calls; reconcile the stale 15-read red. | Blocked on red-owner repair. |
| New requests directly in changes | Zero run-record reads; staging old-format waiting requests count as new. | Not implemented. |
| Waiting requests in pending/run id | Existing move effect; bound record/target/source ids; strict one-media-read bound. | Not implemented. |
| Settled requests | No archive scan; write-once recovery after interrupted settlement move. | Not implemented. |
| Retention horizon | Run-folder listing creation times; TOO_OLD_WHY without chain reads. | Not implemented. |
| Existing v2 manifests/checkpoints and personal bytes | Preserve parsers, verified evidence and TL-P4-32 addenda 2–6 outcomes. | Not revalidated. |

The existing conflicting tests and strict one-read interpretation listed above still require reconciliation;
this session has made no ruling on them and has introduced no store, index or alternative mechanism.

## Red repair

tests changed: `runner/test/c05-bounded-reads.test.ts`: re-pin the measured C04 pile control from 15 to 20
under TL-P4-41 addendum 4; preserve exact zero historical media and the measured baseline + at most one
read per waiting request. The bound still consumes `baseline.trace.reads` from the real pile run in the
same `c04-offer-and-flat` fixture; no constant is added to a request's measured reads.

At HEAD `707f3ca6`, the pre-repair run measured 20 in `pileBaseline`, failing its stale 15-read assertion
in both golden and pending. Evidence: `tmp-logs/red-repair-before.log`.
The repaired run passes that 20-read control and the golden still fails for 50 archived request media
reads and 75 unrelated manifest/checkpoint media reads. Its request-only reads are 143 against the
measured baseline of 20; its no-waiting pile reads 75 historical records and costs 91 against 20.
Every historical-media assertion remains exactly `[]`.

Verification: `pnpm -C runner exec vitest run test/c05-bounded-reads.test.ts --maxWorkers=2`;
exit 1, three assertion reds, no load errors. Evidence: `tmp-logs/red-repair.log`.
Pending proceeds beyond the repaired baseline and fails on the missing pending move and gone-target
control; horizon still fails on listing age and historical media. No other test expectations changed.
No non-test source edits, network, git writes, full check or e2e. Existing notes were preserved;
commits remain coordinator-owned.

## Implementation — current attempt after red repair

Stopped before production edits: the required unchanged C05 tests contradict the pending-location ruling
and the committed pending red. This is the user's stop condition, not a request for implementation approval.
No tests, production files, git state or network resources were changed.

The stale B1a baseline is resolved in this checkout. The real C04 pile control now passes its exact
20-read assertion in `runner/test/c05-bounded-reads.test.ts:262`. The three bounded-read tests still
fail on behavioural assertions, with no load error: 50 archive media reads, 75 unrelated run media
reads, 143 request reads against 20, no physical pending move, and manifest-age horizon selection.
The golden also still finds five historical media reads for an old-format request directly in changes.
Evidence: `tmp-logs/implementation-reds-current.log`.

The incompatible location requirements are explicit:

- `runner/test/c05-bounded-reads.test.ts:335` requires the clashed request in
  `.bower/changes/pending/<run id>/`; line 336 requires its direct changes path to be absent.
  These assertions match `docs/harness/DECISIONS.md:471` and packet contract 1.
- `runner/test/c05-person-notes.test.ts:824`, in `round4Pending`, requires that same clashed
  request directly in changes. The helper feeds round 4 2 and round 5 3.
- `runner/test/c05-person-notes.test.ts:1262`, round 5 5, requires the unchanged clashed request
  bytes directly in changes. A real move to pending necessarily makes this assertion fail.

The unmodified round 4 2 and round 5 5 tests both pass on this checkout:
`pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2 -t
'C05 person notes: round 4 2: pending retries keep target and source ids|C05 person notes: round 5 5: only a clashed target retries on bound ids before archive'`.
Exit 0; output: `tmp-logs/implementation-conflicting-c05.log`. No failure output to inspect.
Keeping duplicate request copies to satisfy both locations would contradict the ruling that waiting
requests leave the new-request inbox, as well as introduce unsupported discovery semantics.
These tests need red-owner reconciliation before an implementation can make every gate green;
this session has no authorization to change them.

The notes' other listed conflicts remain relevant. The strict one-media-read assertion at
`runner/test/c05-bounded-reads.test.ts:373` has not been widened or reinterpreted as a logical lookup.
`RunRecords.found` currently verifies an originating manifest plus all checkpoint links
(`src/data/spine/records.ts:231` onward); selecting one run alone does not make that five-file
fixture cost one media read. No new store, index file or alternative provenance mechanism was added.
No ruling beyond the packet and the cited decision was inferred.

The full C05 runner/app, data and runner suites, typechecks, eslint, pnpm check and e2e were not run
after the required stop. The targeted existing-test run above documents the contradiction; it is
not a claim of full validation. All vitest invocations used `--maxWorkers=2` and wrote under tmp-logs/.

removed: none; 0 production lines removed (stopped before implementation).
tests changed: none.

Compatibility row drafts, not completed implementation claims:

| Fixture/format | Required outcome | Current result |
| --- | --- | --- |
| B1a C04 pile control | Preserve the authorized 20-read baseline. | Repaired control passes. |
| New changes requests, including old-format staging | Zero record reads and no inherited binding. | Red; production unchanged. |
| Waiting requests | Move unchanged bytes to pending/run id; retry bound ids. | Blocked by unchanged C05 location tests. |
| Waiting-run evidence | One media read, with RunRecords as the only provenance home. | Strict bound unchanged; not implemented. |
| Settled requests and interrupted moves | No archive scan; no second append or completion. | Recovery control passes before edits; not reimplemented. |
| Run retention horizon | Listing creation time, no manifest/checkpoint walk. | Red; production unchanged. |
| Stored v2 records and personal bytes | Existing parser/chain checks and TL-P4-32 addenda 2–6 outcomes. | Positive controls pass; full suites not run. |

Sources remain the official Drive list/search/fields references above, cited without fetching under
the no-network instruction. Existing VaultIndex containment points to RunRecords evidence; no
additional index or storage mechanism was introduced.

## Red repair round 2 — lead ruling 2026-10-10

Tests only; coordinator owns commits. No production edit, git write or network access.
Only the two named pending locations and waiting-run read bounds changed. Every other existing
assertion remains, including target/source ids, unchanged bytes, archive after settlement,
the exact 20-read pile control and zero archive/other-run media reads.
The round4Pending location checks use soft assertions so the existing retry and retention
assertions still execute while pending implementation is absent. Bytes are captured before the run.

tests changed: runner/test/c05-person-notes.test.ts:826: rule 1: unchanged request bytes belong in pending/abc123-run1, for round 4 2 and round 5 3.
tests changed: runner/test/c05-person-notes.test.ts:827: rule 1: a waiting request must be absent directly in changes.
tests changed: runner/test/c05-person-notes.test.ts:1265: rule 1: the clashed target keeps unchanged request bytes in pending/abc123-run1.
tests changed: runner/test/c05-person-notes.test.ts:1266: rule 1: the clashed request leaves the direct changes inbox.
tests changed: runner/test/c05-bounded-reads.test.ts:331: rule 2: pin one manifest plus four verified checkpoint links to five files.
tests changed: runner/test/c05-bounded-reads.test.ts:376: rule 2: one run means its full five-file chain, with no wider bound.
tests changed: runner/test/c05-bounded-reads.test.ts:377: rule 2: baseline plus one contradicts the five-file chain; pin baseline plus five (25).

Run: `pnpm -C runner exec vitest run test/c05-person-notes.test.ts test/c05-bounded-reads.test.ts --maxWorkers=2`.
Output: `tmp-logs/red-repair-round2.log`.
Sources: existing official Drive list/search/fields citations above; no network fetch.

Result: exit 1; 47 tests, 41 passed, six failed (three bounded reads, three person notes).
The affected person-notes tests fail only on the new pending-byte/direct-inbox location assertions:
- `C05 person notes: round 4 2: pending retries keep target and source ids`.
- `C05 person notes: round 5 3: a request past retention is left as written and archived without an append`.
- `C05 person notes: round 5 5: only a clashed target retries on bound ids before archive`.
All other person-notes assertions pass, including the retry, byte and settlement controls.
Bounded golden and horizon retain their archive/history, no-migration and horizon reds.
Bounded pending fails its pending location checks and the unchanged gone-target ASK_GONE check.
That hard gone-target assertion stops the test before the retry read bounds; those bounds are
rewritten but not reached by this implementation. Nothing was weakened to get past that failure.
The exact 20-read pile control passes. A focused pending rerun after moving the five-file fixture
pin before the gone-target control verifies one manifest plus four checkpoint links equals five;
it has the same three assertion failures, with no load error.
Command: `pnpm -C runner exec vitest run test/c05-bounded-reads.test.ts --maxWorkers=2 -t
'C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence'`.
Output: `tmp-logs/red-repair-round2-chain.log` (exit 1).
No check/e2e run for this red-only repair; production implementation and full gates remain pending.
removed: only the four superseded test assertion lines; no production lines.
