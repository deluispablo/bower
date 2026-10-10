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


## Implementation — round 2 repair audit

Stopped under the implementation instruction: “if a red contradicts the packet or a ruling, stop and say so.”
Round 2 repaired the helper's pending location, but left contradictory consumers in the same required C05 suite.
No test was changed. All exploratory production edits were removed by restoring their original bytes using
read-only `git show`; no git command that writes, network call, commit, or new store/index was used.
Only this notes append remains as a tracked change. Line 3 remains `implementer: codex`.

### Remaining hard location conflict

`runner/test/c05-person-notes.test.ts:826–827`, `round4Pending`, now requires the clashed request's original
bytes in `.bower/changes/pending/abc123-run1/change-1.json` and its direct changes path to be absent.
This is the packet/ruling's required outcome, and the helper passed those location assertions in the experiment.

But its round 5 3 consumer still reads `activeBytes` from that absent direct path at line 1084, falling back to
an empty string. At line 1088 it requires the direct changes path to equal that empty string after newer runs.
Line 1090 then parses that string as JSON. Even inserting an empty placeholder cannot make both assertions
pass: JSON.parse('') throws, and such a placeholder is outside the ruled unchanged-byte move mechanism.
Line 1110 also finds the archive move using the file id at the absent original direct path.
These are unrepaired consumers of the very location round 2 changed; a conforming implementation cannot satisfy them.

Reproduction: the experiment passed round4Pending's pending-byte and absent-direct-path checks, then the required
C05 runner suite failed round 5 3 at line 1088, expected empty string, received undefined.
Evidence: `tmp-logs/implement-c05-runner.log` (failure section, round 5 3).
The earlier Reds section's other hand-restoration conflicts also remain in unchanged tests; round 5 1 still restores
an archived request after retention and expects no second effect. No replacement identity/provenance store was inferred.

### Checks actually run

All Vitest commands used `--maxWorkers=2`. Output stayed under `tmp-logs/`; only failures were read.
Results below describe the discarded experiment, not a delivered or validated implementation.

| Check | Result | Log |
| --- | --- | --- |
| Committed bounded reds before changes | Three behavioural reds | tmp-logs/implement-reds.log |
| Bounded reds, final experiment | Golden and horizon pass; pending stops at interrupted-move recovery control | tmp-logs/implement-green3.log |
| C05 runner person-notes/incorporation/between/marked-history | 39 pass, 9 fail; includes the hard location contradiction | tmp-logs/implement-c05-runner.log |
| C05 app contracts/reports/tidy | Pass | tmp-logs/implement-c05-app.log |
| TypeScript app | Pass | tmp-logs/implement-tsc-app.log |
| TypeScript node | Pass | tmp-logs/implement-tsc-node.log |
| TypeScript runner | Pass | tmp-logs/implement-tsc-runner.log |

The experiment moved planned append requests before the append so a crash could leave an evidence pointer.
That ordering failed the pending red's recovery control, which interrupts the first parent-changing request move
and expects the append already to have landed. This is an implementation failure, not the hard test contradiction above;
it was not bypassed or accepted. All engine/guard/planner/index/provider changes were removed.
The full data suite, full runner suite, eslint, pnpm check and e2e were not run after the required stop.
No validation claim applies to the restored production tree.

removed: 0 retained production lines; exploratory production edits removed completely.
tests changed: none.
left out: production implementation and remaining gates; requires red-owner repair of round 5 3's direct-path consumers.

Compatibility row drafts for the next implementation, not completed validation:

| Fixture/format | Required outcome | Status |
| --- | --- | --- |
| B1a pile control | Exact 20-read baseline | Control passed; preserved in restored source. |
| New requests, including old-format staging | Zero run-record reads; no migration | Experiment passed bounded golden; implementation discarded. |
| Waiting requests | Existing move to pending/run id, unchanged bytes, bound target/source ids | Pending helper passed; round 5 3 consumer remains contradictory. |
| Waiting evidence | Own run only, full RunRecords.found chain | No alternative evidence mechanism delivered. |
| Completed request recovery | No second append or completion after interrupted settlement move | Experiment failed recovery control; no change delivered. |
| Retention horizon | Folder listing metadata, no chain walk, TOO_OLD_WHY | Experiment passed horizon red; implementation discarded. |
| Stored v2 records/personal bytes | Parsers and TL-P4-32 addenda 2–6 outcomes unchanged | Required suites not all green; production restored. |

Sources: the official Drive files.list, parent/search and partial-response references already cited above,
without fetching under the no-network instruction. VaultIndex containment and RunRecords remain the intended
“index points to evidence” homes. No store, index file or second move/evidence mechanism remains in the tree.


## Red-owner repair — round 3

Lead-approved narrow round; no network, git writes, production edits, new store or index.
The user supplied round 3's rulings directly: (1) a hand-restored archived copy is a new request,
(2) waiting bytes and ids live in pending/<run id>, (3) the horizon uses listing creation time.
The underlying bounded rule is DECISIONS.md's DEFECTS smoke-request-slow ruling (line 471).
Ruling (1) supersedes TL-P4-32 addendum 4's hand-restore promise; expiry remains the v1 limit.
The per-assertion entries below use current file lines; removed assertions identify their old lines.

### Changed assertions and their supported paths

The lost-answer test still lands the append, refuses read-back, resumes the same persisted run,
and checks exactly one sourced line. Its final recovery also uses that same run, with different
model wording offered. No archived copy is restored.

The repeated-clash fixture now retries on run 20 after 19 clashes, while the origin is retained.
The final fresh named request has no new source evidence: no second append, no new completion,
and no appendEvidence field. A generic empty press was insufficient: it never created a run.

Round 5 1 renames the original request before admission, retaining the embedded change-1 id.
Its first completion is recorded by that id, despite the unrelated filename. After 20 newer runs,
two new piles still cannot give that archived request a second append or completion. Both
existing controls keep their filing, unchanged-note, and empty-completion assertions. Only
restore-specific assertions were dropped; the archived original's bytes are still checked.

Corpus press 2 now asks to update Garden plot without new source material. This is a fresh,
supported named request, not a restored archive copy. All expected.json assertions, Timeline
count 3, protected ranges, report counts, state question and ownership checks remain unchanged.
The corpus test title now describes the supported non-adoption path. The old rubric's word
“Replay” means the unchanged no-second-effect outcome here; it no longer promises hand restoration.

Run-folder fixtures use injected admission times AT + press - 1 via FakeDrive.setTimes.
The pending origin uses AT. Each retained newer run's listing creation time is set before the
next run reads it. No production clock or shared fixedDrive implementation was changed.

tests changed: runner/test/c05-person-notes.test.ts:237: ruling (1): unchanged score assertion now exercises a fresh source-free request, preserving every corpus expectation
tests changed: runner/test/c05-person-notes.test.ts:355: TL-P4-32 (3); ruling (1): model-call count remains unchanged on same-run recovery after the lost answer
tests changed: runner/test/c05-person-notes.test.ts:356: TL-P4-32 (3); ruling (1): resumed bytes still equal the landed bytes, through same-run recovery
tests changed: runner/test/c05-person-notes.test.ts:361: TL-P4-32 (3); ruling (1): exactly one line is checked after a repeated same-run recovery instead of archive restoration
tests changed: runner/test/c05-person-notes.test.ts:362: TL-P4-32 (3); ruling (1): offered replacement wording still cannot append on recovered completed work
tests changed: runner/test/c05-person-notes.test.ts:363: TL-P4-32 (3); ruling (1): full bytes remain unchanged through repeated same-run recovery
tests changed: runner/test/c05-person-notes.test.ts:old 361: ruling (1): drop only replay requestAction assertion: no hand restoration occurs
tests changed: runner/test/c05-person-notes.test.ts:421: expiry v1 limit: 19 clashes replace 22 so the final bound-source retry occurs within the 20-run horizon
tests changed: runner/test/c05-person-notes.test.ts:422: expiry v1 limit: origin is still retained at the retry; removed-origin retry is no longer promised
tests changed: runner/test/c05-person-notes.test.ts:425: expiry v1 limit: same exact sourced append is checked on run 20 rather than run 23
tests changed: runner/test/c05-person-notes.test.ts:427: expiry v1 limit: same successful update report is checked within retention
tests changed: runner/test/c05-person-notes.test.ts:430: ruling (1): fresh source-free named request preserves the no-second-append assertion
tests changed: runner/test/c05-person-notes.test.ts:432: ruling (1): real supported run 21 replaces hand-restored run 24 for the RunRecords assertion
tests changed: runner/test/c05-person-notes.test.ts:434: ruling (1): no appendEvidence field assertion is preserved on the supported final run
tests changed: runner/test/c05-person-notes.test.ts:435: ruling (1): empty manifest completedAppends assertion is preserved on the supported final run
tests changed: runner/test/c05-person-notes.test.ts:974: ruling (1); embedded record identity: archived original id is checked under the filename changed before admission
tests changed: runner/test/c05-person-notes.test.ts:975: ruling (1); embedded record identity: nonempty archived bytes still required under the unrelated original filename
tests changed: runner/test/c05-person-notes.test.ts:976: ruling (1); embedded record identity: embedded change-1 id remains exact despite the unrelated filename
tests changed: runner/test/c05-person-notes.test.ts:978: ruling (1); embedded record identity: completion still binds embedded request id to the target id
tests changed: runner/test/c05-person-notes.test.ts:988: ruling (1): both success and one-file filing control assertions survive without archive restoration
tests changed: runner/test/c05-person-notes.test.ts:989: ruling (1): retention control still requires the full original note bytes unchanged
tests changed: runner/test/c05-person-notes.test.ts:990: ruling (1): retention control still requires no second completed append
tests changed: runner/test/c05-person-notes.test.ts:991: ruling (1): original archived bytes remain exact; no copied file is created
tests changed: runner/test/c05-person-notes.test.ts:old 981: ruling (1): drop restore requestAction assertion from the retention control
tests changed: runner/test/c05-person-notes.test.ts:old 988: ruling (1): drop restored-copy byte assertion because hand-copy creation was removed
tests changed: runner/test/c05-person-notes.test.ts:old 989: ruling (1): drop restored-copy distinct-id assertion because hand-copy creation was removed
tests changed: runner/test/c05-person-notes.test.ts:old 996: ruling (1): drop already-active replay action assertion because no archived request is restored
tests changed: runner/test/c05-person-notes.test.ts:999: ruling (1): success and one-file filing assertions remain on the second supported pile
tests changed: runner/test/c05-person-notes.test.ts:1000: ruling (1): same no-second-append byte assertion after differently named original settled normally
tests changed: runner/test/c05-person-notes.test.ts:1002: ruling (1): same no-second-completion assertion on the second supported pile
tests changed: runner/test/c05-person-notes.test.ts:1003: ruling (1): same absence of a target edit operation on the second supported pile
tests changed: runner/test/c05-person-notes.test.ts:1090: ruling (2): waiting-byte equality reads pending/abc123-run1, never the absent direct changes path
tests changed: runner/test/c05-person-notes.test.ts:1108: ruling (2): expiry removes the pending request path
tests changed: runner/test/c05-person-notes.test.ts:1109: ruling (2): unchanged archive-byte assertion receives bytes read from the pending path at line 1086
tests changed: runner/test/c05-person-notes.test.ts:1112: ruling (2): archive move is matched to the file id from pending at line 1111
tests changed: runner/test/c05-person-notes.test.ts:1113: ruling (2): applied archive outcome uses the same pending file-id match
tests changed: runner/test/c05-person-notes.test.ts:1092: ruling (3): existing age comparison preserved; helper listing times at 827 and 950 now truthfully match admission times
tests changed: runner/test/c05-person-notes.test.ts:1118: ruling (3): same TOO_OLD_WHY assertion preserved with truthful retained-folder creation times
tests changed: harness/corpus/c05-note-not-written-by-bower/case.json:26: ruling (1): press 2 uses fresh source-free named consent; every expected.json assertion and no-second-effect bound preserved


### Verification and remaining reds

Final command (offline, exact touched runner files, both workers capped):
`pnpm -C runner exec vitest run test/c05-person-notes.test.ts test/c05-bounded-reads.test.ts --maxWorkers=2`
Output: tmp-logs/round3-verify.log. Result: 41 pass, 6 assertion-red tests, no load/syntax failure.
Only failures and the summary were read. git diff --check passes (read-only git).

Remain red ONLY on the new bounded rule, not on an obsolete hand-restore promise:

- bounded golden: archive media is still read (50), other-run media is still read (75), request
  reads 143 > exact pile baseline 20, no-waiting reads 91 > 20. Old-format direct requests still
  inherit history contrary to the no-migration/new-location rule. All bounds remain unchanged.
- bounded pending: clash still leaves the request directly in changes instead of pending/run id.
  The binned-source derived assertion also fails because this pre-implementation path has no
  pending evidence pointer; no source-id or subject-gone expectation was weakened.
- bounded horizon: manifest age still wins over listing age; 75 historical and 50 archive media
  reads remain. TOO_OLD_WHY and zero-media assertions stay exact.
- round 4 2: only the pending-byte and absent-direct-path assertions fail in its shared fixture.
- round 5 3: the same pending fixture fails, and its new pending-byte consumer cannot find the
  expected unchanged bytes. It stops at that location assertion before JSON.parse; no invalid JSON
  fixture was introduced. Later expiry assertions are preserved but blocked by the missing move.
- round 5 5: only pending-byte and absent-direct-path assertions fail.

Passing repaired points: same-run lost-answer/read-back recovery; within-horizon filed-source retry;
corpus score with all original expected assertions; differently named original record completion;
all other person-notes tests outside the three pending-location reds.
The bounded file is byte-for-byte unchanged, including pile baseline 20, zero archive/other-run
media reads, interrupted-settlement recovery, and at most baseline + 1 per waiting request.
No claim that later assertions blocked by a red have executed; production implementation remains next.

Earlier logs round3-touched.log and round3-touched-final.log include an intermediate empty-press
fixture mistake, repaired by the source-free named request before the final verify above.
No full check or e2e: this is the lead-approved red/test-only repair, with ui: false.
No commits: coordinator owns them. No non-test source edited.
Sources: Drive files.list, parent queries and partial-response fields already cited in Sources above;
not fetched under the explicit no-network instruction. Reused FakeDrive.setTimes and RunRecords.
removed: hand-restore setup and restore-specific assertions only, as individually cited above.
left out: production implementation, full check/e2e and coordinator commits/integration.

Round 3 owned diff files (read-only git diff --name-only):
- runner/test/c05-person-notes.test.ts
- harness/corpus/c05-note-not-written-by-bower/case.json
- docs/harness/2026-10-10-smoke-request-slow-notes.md
No other tracked file differs; bounded-read reds were not edited.
