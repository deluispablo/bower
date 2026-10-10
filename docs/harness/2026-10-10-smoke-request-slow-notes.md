# smoke-request-slow — implementation continuation

implementer: codex

HEAD at this continuation: `88a668bcde506714ccf602bdd9e1593985d958fa` (red round 5).
Worktree: `/private/tmp/bower-smoke-request-slow`, branch `smoke-request-slow`.
Current production and notes edits stay uncommitted; no test edits, git writes or external network.
The coordinator owns commits and integration. See Implementation for the current result; later sections retain prior audits.

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

Current continuation after the round-5 sweep (2026-10-10). The eight production changes are retained
uncommitted. No test was changed, no git write command ran, and no external network was used.
The historical implementation/repair audits below describe earlier attempts, not the current result.

Research cited without fetching under the no-network instruction: official
[Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list),
[parent queries](https://developers.google.com/workspace/drive/api/guides/search-files), and
[partial-response fields](https://developers.google.com/workspace/drive/api/guides/fields-parameter).
The standard index-points-to-evidence pattern reuses VaultIndex's containment discovery,
RunRecords.found's originating manifest and full checkpoint-chain verification, and the existing move effect.
No additional snapshot, ledger, store or index file was introduced.

Production files:
- src/data/spine/scripted.ts: removes archive admission and broad append-history/horizon walks;
  reads only the waiting requests' own runs, filters by embedded record id, and uses listing creation times.
  Settlement publishes an in-place bowerRun recovery pointer before the append, then moves unchanged request
  bytes into pending/run id. Archive remains dependent on the writes it settles. Waiting requests without
  retained evidence fail closed with TOO_OLD_WHY without resolving their titles again.
- src/data/vault/vault-index.ts: discovers physical pending requests through actual parent containment;
  the temporary pointer covers interruption before their physical move.
- src/data/contracts/run-manifest.ts: accepts the optional existing bowerRun move property and classifies
  pointer/pending relocation once, shared by the archive guard, engine and grounding checks.
- src/data/spine/engine.ts: a definite bound-append clash permits pending relocation; subsequent moves fence
  the name/place from their preceding applied move. Archive still requires successful derived edits.
- src/data/spine/grounded.ts: checks relocations separately from the single reported archive move.
- runner/src/claude.ts: waiting requests use only bound target/source ids, never their former titles.
  This removes reads of replacement-title notes and makes the unchanged 25-read retry bound pass.
  A fresh request's exact repetition of a cited Timeline line already shown is valid provider input;
  it grants no binding or source evidence. The existing planner/applyChanges still decides the no-op.
  This uses timelineBullets/parseTimelineLine, the attempt's ownership context, complete uncut note bytes,
  and the cited file id's listed name. It neither reads historical records nor authorizes fresh wording
  from a previously filed source. The previously failing run-21 control now publishes its verified run
  with unchanged personal bytes and zero new append completions.
- src/data/spine/records.ts: makes the now-unused APPENDS_RECORD_KEY export private; the existing
  bowerAppends metadata writer stays compatible. This clears both unused-code gates without changing record bytes.
- src/data/drive/fake-drive.ts: fixes DEFECT_LOG fake-drive-snapshot-feed in snapshot/restore itself.
  The changes array is serialized alongside files, restored before another feed read, and copied into
  snapshotWith's existing consistent twin. An older snapshot without that optional field still restores.
  A saved nonzero page token now returns the exact same feed and next token after restore.

Red evidence: tmp-logs/finish-initial-c05.log and finish-initial-fake.log reproduce the two C05 failures
and the dedicated fake snapshot failure. After restoring the feed, finish-c05-green.log reached the
remaining retry bound: 26 reads against an unchanged limit of 25. Selecting only the waiting target ids
made that red green. The whole targeted suite was run first; no remaining test contradicts the packet
or the round-2/3/5 supported-path rulings. Local DECISIONS still lacks the round-4/5/TL-P4-51 entries;
the owner's explicit assignment and the red-owner round-5 notes supply that authority.

removed: 94 production lines in the complete retained diff (git diff --numstat).
removed: archivedRecords and archived admission state; unrelated append-run discovery and retention chain walks.
removed: obsolete public APPENDS_RECORD_KEY export; its stored metadata spelling remains unchanged.
removed: provider title resolution for waiting requests, including needless reads of title replacements.
tests changed: none.

Compatibility row drafts for src/data/contracts/run-manifest.ts (review/integration remain pending):

| Stored format / contract | Compatibility | Evidence |
| --- | --- | --- |
| Existing v2 moves without bowerRun | Optional field stays optional; old shape and meaning remain. | Full src/data and runner suites pass. |
| bowerRun string/null on ordinary moves | Strict property parser accepts the pointer and its removal; no new manifest version. | Produced C05 manifests and complete chains parse/verify. |
| Existing archive dependency guards | Every archive still waits for all derived edits; only the in-place pointer is exempt. | C05 interrupted settlement and all existing C05 controls pass. |
| Pending relocation | Same move effect; a definite bound-append conflict can move to pending; bound ids remain fixed. | Bounded pending red passes all zeros and the five-file/25-read bounds. |
| Old manifests/checkpoints and personal bytes | Existing lenient reads and supported write-once recovery remain. | Full data 4141 and runner 551 tests pass; C05 app 18 pass. |
| Fake snapshot v1 without changes | Missing optional feed defaults to empty; files/resumable data still restore. | Existing fake reload/resumable/big-file controls pass. |
| Fake snapshot with changes | Files and feed share the existing snapshot home; stored cursor remains valid. | Dedicated fake red and restored gone-target control pass. |

Current verification (explicit Vitest commands use --maxWorkers=2; pnpm check uses its standard flags;
output under tmp-logs/):

| Check | Result | Log |
| --- | --- | --- |
| Whole C05 runner and corpus target | 100 pass, 8 files | finish-c05-green2.log |
| Bounded/person-notes reds after the behavioral edits | 63 pass, 2 files | finish-final-reds.log |
| C05 app contracts/reports/tidy screen | 18 pass, 3 files | finish-c05-app.log |
| src/data (final tree) | 4141 pass, 77 files | finish-data-final.log |
| Full runner suite (final tree) | 551 pass, 44 files | finish-runner-final.log |
| Dedicated FakeDrive tests | 33 pass | finish-fake-green.log |
| tsc app/node/runner | All pass | finish-tsc-app.log, finish-tsc-node.log, finish-tsc-runner.log |
| ESLint all eight touched production files | Pass (root/runner commands run separately) | finish-eslint-app.log, finish-eslint-runner.log |
| pnpm check through shared heavy lock | Fails on sandbox local-server permission; 5486 pass / 1 fail | finish-check.log |
| E2E c05-person-notes, capabilities, app on demo and fake | Both fail before tests: dev-server listen EPERM | finish-e2e-demo.log, finish-e2e-fake.log |
| App and runner builds | Pass | finish-build.log, finish-runner-build.log |
| Duplication gate | Pass, 19 clones unchanged | finish-duplication.log |
| Unused-code and unused-production-code gates | Pass after private marker cleanup | finish-unused-final.log |
| Dependency gate | Pass | finish-dependencies.log |
| Read-only git diff --check | Pass | Command output empty |

Every remaining failure/blocker, outside the implementation's targeted suites:
- src/e2e-port.test.ts:37: the local server cannot listen: EPERM on 127.0.0.1, then the test times out.
  pnpm check reports one uncaught listen EPERM and stops before API/runner/build/static gates.
  The requested runner checks and app/runner builds plus duplication/unused/dependency gates were run separately.
  A minimal server probe independently reproduces the restriction: finish-local-server-probe.log.
- runner/test/c05-person-notes.test.ts:779:31 and :779:77: inherited forbidden non-null assertions.
  The explicit no-test-change instruction keeps them intact. Separately reproduced with ESLint in
  finish-inherited-test-lint.log; touched production-file ESLint passes.
- Both demo and fake e2e commands acquired the shared heavy lock, then their local dev server failed
  before any screen test: listen EPERM on ::1:5301. See finish-e2e-demo.log and finish-e2e-fake.log.
  Permission escalation is unavailable in this environment; no gate or test was weakened to bypass it.

left out: commits (explicitly forbidden), independent reviews/integration, and blocked full-check/e2e completion.

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

## Implementation — after red repair round 3

Stopped on the user's explicit instruction: if a red contradicts the packet or ruling, stop; retain
production changes uncommitted. No tests were edited, no network was used, and no git write command ran.
The retained production changes are an incomplete implementation, not a green delivery.

### Remaining hand-restore contradictions

Two unchanged tests still require the hand-restore promise superseded by Update 2 and the round 3 ruling:

- `runner/test/c05-person-notes.test.ts:467`, `C05 person notes: fix 1 finding 4: a completed replay cannot
  consume the new request for the same note`, passes `{ kind: 'replay', id: 'change-1' }` at line 474.
  After the first successful append/archive, `addRequest` in `runner/test/corpus-run.ts:230–240` copies
  that archived record back into direct changes. The test then requires only change-2's binding and
  completion at lines 482–483. Under the ruling, the restored change-1 is new and older, so the existing
  oldest-request rule admits it before change-2. The failure is expected ['change-2'], received ['change-1'].
- `runner/test/c05-person-notes.test.ts:488`, `C05 person notes: fix 1 finding 5: an already-present bound
  append completes the request before replay`, likewise restores the archived change-1 at lines 497–498,
  supplies new source material and different model wording, and requires unchanged note bytes and no
  updated row at lines 500–501. A hand-restored copy is new under Update 2, so its fresh consent permits
  the offered append; this test requires retaining the superseded archive replay identity.

These are not the same-run recovery test repaired in round 3. Both explicitly invoke the corpus driver's
archive-to-inbox copy path. No archive/history scan or extra provenance ledger was restored to satisfy them.
Evidence: `tmp-logs/implementation-round3-c05-runner.log`, failure sections for fix 1 findings 4 and 5.

### Retained production changes

- `src/data/spine/scripted.ts`: removes archivedRecords and the archived admission flag; selects append
  evidence only from admitted waiting requests' runs, filters evidence by embedded request id, and
  derives the horizon from run-folder creation metadata. Missing waiting-run evidence fails closed.
  Plans pending relocation with ordinary move effects while keeping archive dependencies on successful edits.
- `src/data/vault/vault-index.ts`: includes requests physically under pending/run-id in journal discovery;
  resolves their evidence run by actual parent containment, including duplicate bookkeeping folders.
- `runner/src/claude.ts`: selects waiting history from admitted requests and shows bound target ids.
- `src/data/contracts/run-manifest.ts`: recognizes request relocation moves and permits the existing
  bowerRun property in move properties, retaining the existing manifest shape and chain authority.
- `src/data/spine/engine.ts`: permits a pending move after its bound append's definite conflict;
  subsequent moves fence the name/place returned by the earlier applied move, through the same move effect.
- `src/data/spine/grounded.ts`: distinguishes relocation moves from the request's one reported archive move.

Interrupted settlement recovery passed the bounded red's completionRecovery control. The implementation
uses an in-place move to publish a temporary bowerRun pointer before the append, then clears it with the
physical pending move. This permits own-run recovery when that physical move is interrupted. It adds no
store or index file and still verifies evidence through RunRecords.found. This intermediate metadata
pointer and the relocation guard/engine changes need independent review; they are not an accepted delivery.

### Verification at the stop

Every Vitest command used --maxWorkers=2 and wrote under tmp-logs/. Test files are unchanged.

| Check | Result | Log |
| --- | --- | --- |
| Committed bounded reds before production edits | Three behavioural reds | tmp-logs/implementation-round3-reds.log |
| Bounded reds after production edits | Golden/horizon pass; pending fails at gone-target control | tmp-logs/implementation-round3-green3.log |
| C05 runner person-notes/incorporation/between/marked-history | 42 pass, 6 fail | tmp-logs/implementation-round3-c05-runner.log |
| C05 app person-notes/reports/tidy | 18 pass | tmp-logs/implementation-round3-c05-app.log |
| TypeScript app | Pass | tmp-logs/implementation-round3-tsc-app.log |
| TypeScript node | Pass | tmp-logs/implementation-round3-tsc-node.log |
| TypeScript runner | Fail: five unchanged test references to absent SYSTEM.runs | tmp-logs/implementation-round3-tsc-runner.log |
| ESLint touched files | Command fails on ambiguous tsconfigRootDir when root/runner files are passed together | tmp-logs/implementation-round3-eslint.log |
| git diff --check | Pass before notes append | Read-only command |

Other failures are not presented as hand-restore contradictions:

- The bounded pending red gets past physical relocation, unchanged bytes, the five-file originating chain,
  and interrupted completion recovery. Its gone-target variant restores FakeDrive from a snapshot that
  keeps B1a's retrieval cursor but drops the changes feed. FakeDrive.listChanges rejects the saved cursor
  as 'Invalid fake changes page token'; runner/index.ts:73 refuses before the new report. The old report
  therefore lacks ASK_GONE. FakeDrive.snapshot/restore at lines 98–128 does not serialize the changes feed.
  No fake-feed or B1a maintenance change was made outside the diagnosed request-read mechanism.
- Existing round 4 1, round 5 2 and round 5 5 find the first move for the request file and call it the archive.
  They currently select the temporary in-place pointer move and fail their 'not applied' assertion.
  These are unresolved implementation/verification issues, not evidence for weakening those tests.
- The within-twenty-runs test reaches its fresh final run assertion but finds no manifest for run 21.
  The repaired fixture also refers to SYSTEM.runs, which does not exist in the current layout constant;
  its five references fail runner tsc. Neither the test nor layout was changed after the required stop.

The full src/data suite, full runner suite, pnpm check and e2e were not run after discovering the
hand-restore contradiction. Those gates remain required after red-owner reconciliation and completion
of the retained implementation. The pending retry's own-run read bound is not claimed green: the gone-target
control prevents execution from reaching that later assertion.

removed: 88 production lines in the retained diff (git diff --numstat); includes archivedRecords and broad history walks.
removed: archived admission flag and per-run manifest/checkpoint horizon walk; no archive media admission path remains.
tests changed: none.

Compatibility row drafts for the resumed implementation:

| Fixture/format | Outcome/status |
| --- | --- |
| B1a C04 control | Exact 20-read baseline passes in the bounded golden. B1a source unchanged. |
| New/direct requests, including old staging format | Bounded golden passes: zero archive/run media and no inherited binding. |
| Waiting requests | Physical pending relocation and unchanged-byte assertions pass; full retry bound not reached. |
| One-run evidence | Existing RunRecords.found full chain remains authoritative; no chain shortcut/store/index file. |
| Interrupted settlement move | Bounded completionRecovery passes: no second append/completion after filename/target renames. |
| Metadata horizon | Bounded horizon passes: listing creation time, zero chain reads, signed TOO_OLD_WHY. |
| Every named target settles | Pending first-run no-line row passes; final retry verification remains incomplete. |
| Stored v2 records/personal bytes | Bounded parser/chain and app controls pass; full suites remain unvalidated. |
| Hand-restored archive copy | Treated as new by ruling; fix 1 findings 4 and 5 still require superseded replay protection. |

Sources: the official Drive files.list, parent-query and partial-response references in Sources above,
cited without fetching under the no-network instruction. Existing VaultIndex discovery points to
RunRecords evidence; existing ordinary move effects publish relocation and its recoverable pointer.

left out: red-owner reconciliation, remaining implementation failures, full data/runner/check/e2e gates and commits.
All six production files listed above and these notes remain in place uncommitted, as requested.


## Red repair round 4

Authority: lead-approved repair round 4, DECISIONS after c62e2a15; the three rules in the red-owner assignment.
No network or git write commands. Only the two test files and this required notes section were edited.
The implementer's six uncommitted production files were left untouched.

Rule 1 (round 3 ruling, hand-restored copies are new requests under v1): finding 4 now interrupts only
archive publication after the original has moved into its originating pending folder. corpus-run's replay
observes `already-active`, never copies an archive to the inbox. The original completion cannot consume
change-2; all original assertions about new binding/completion, both lines and personal bytes remain.
Finding 5 now redispatches the exact completed run through runner main with its immutable admission.
The already-present line is explicitly proved completed before redispatch; its entire stored run remains
identical after redispatch. All existing note-byte, filing-report and no-updated-row assertions remain.
The offered different wording and additional source remain in the fixture. Same-run replay returns the
original filing report; the extra source is outside that immutable admission.

Rule 2 (pending first, archive at settle): the three first-run archive lookups now resolve the move's
actual destination, following either a captured file id or a planned create-folder operation. They assert
that the originating pending move exists and precedes the archive move in the manifest. Their original
archive outcome assertions remain unchanged; the temporary in-place pointer move is not selected.
All other assertions, including the retry archive outcome, are unchanged.

Rule 3 (DEFECT_LOG fake-drive-snapshot-feed): save a real nonzero cursor before snapshot, create one
change, positively prove the original feed, restore the snapshot, then require the identical feed and
terminal token from the saved cursor. No production repair is included.

tests changed: runner/test/c05-person-notes.test.ts:480: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:481: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:482: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:490: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:494: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:495: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:496: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:497: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:498: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:500: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:502: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:503: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:504: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:514: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:515: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:517: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:519: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:523: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:524: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:525: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:526: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:527: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:528: rule 1 (round 3 ruling): preserve replay/completion assertions through pending or same-run recovery; no archived copy.
tests changed: runner/test/c05-person-notes.test.ts:777: rule 2 (pending before archive): require pending and destination-selected archive in this order.
tests changed: runner/test/c05-person-notes.test.ts:778: rule 2 (pending before archive): require pending and destination-selected archive in this order.
tests changed: runner/test/c05-person-notes.test.ts:779: rule 2 (pending before archive): require pending and destination-selected archive in this order.
tests changed: runner/test/c05-person-notes.test.ts:814: rule 2 (pending before archive): retain the archive presence/outcome assertion against its destination, not the first move.
tests changed: runner/test/c05-person-notes.test.ts:815: rule 2 (pending before archive): retain the archive presence/outcome assertion against its destination, not the first move.
tests changed: runner/test/c05-person-notes.test.ts:978: rule 2 (pending before archive): retain the archive presence/outcome assertion against its destination, not the first move.
tests changed: runner/test/c05-person-notes.test.ts:1074: rule 2 (pending before archive): retain the archive presence/outcome assertion against its destination, not the first move.
tests changed: runner/test/c05-person-notes.test.ts:1075: rule 2 (pending before archive): retain the archive presence/outcome assertion against its destination, not the first move.
tests changed: runner/test/c05-person-notes.test.ts:1317: rule 2 (pending before archive): retain the archive presence/outcome assertion against its destination, not the first move.
tests changed: runner/test/c05-person-notes.test.ts:1318: rule 2 (pending before archive): retain the archive presence/outcome assertion against its destination, not the first move.
tests changed: src/data/drive/fake-drive.test.ts:43: rule 3 (fake-drive-snapshot-feed): prove the live cursor/feed control or identical restored answer to the saved token.
tests changed: src/data/drive/fake-drive.test.ts:45: rule 3 (fake-drive-snapshot-feed): prove the live cursor/feed control or identical restored answer to the saved token.

### Verification

Every Vitest invocation used `--maxWorkers=2`; output is under `tmp-logs/`.
- `red-repair-round4-runner-final.log`: person-notes + bounded-reads, 57 pass / 6 fail.
  Finding 4, finding 5, round 5 2 and round 5 5 pass; round 4 1 passes its repaired archive assertions.
- `red-repair-round4-fake.log`: 32 pass / 1 fail. New snapshot/feed red rejects the saved token with
  `Invalid fake changes page token` instead of returning the identical feed. This is the requested red.
- `red-repair-round4-finding5-final.log`: 1 pass (59 excluded by name filter), after explicit completion/evidence checks.
- Initial exploration log `red-repair-round4-runner.log`: finding 5's attempted pending fixture had no
  physical pending move for an already-present line. Replaced with authorized same-run recovery above.

Remaining failures (preserved, outside this repair's authorized assertion changes):
1. Bounded pending's gone-target control misses ASK_GONE: restore discards the feed and rejects the saved
   retrieval cursor before the new report. The dedicated FakeDrive red now reproduces that defect.
2. Fix 1 finding 2: final run-21 RunRecords.found answers `new`, not `run`; no manifest was published.
   The five existing SYSTEM.runs references remain unchanged and outside the three rules.
3. Round 4 1's later hand-restore retention control appends a new line and records a new completion.
   Its repaired first-run archive lookup passes; the later assertions were explicitly left unchanged.
4. Timeline list 2 with front matter: hand-restored archive request permits different wording and appends.
5. Timeline list 2 without front matter: same preserved hand-restore mismatch.
6. Timeline list 5 preseeded star line: same preserved hand-restore mismatch.

Zero-archive and other-run media assertions, the golden's bounds and all other tests are unchanged.
Golden and horizon pass. Pending retry's later media bounds are still blocked by its gone-target control.
No full check/e2e: this is an intentionally failing red repair; no UI or production implementation changed.
No commits; coordinator owns commits. Production remains uncommitted for the implementer.
Sources: existing official Drive references in this notes file, reused without a network request;
local existing corpus-run redispatchCase and RunRecords are reused rather than adding a replay mechanism.

## Implementation — round 4 continuation audit

Stopped under the user's explicit instruction: if a test still contradicts the packet or a ruling,
stop and retain the changes. Round 4 repairs findings 4/5 and the first-move selections, but four
remaining failing tests still require the superseded hand-restore protection. No production or test
file was edited in this continuation; the six retained production changes remain uncommitted.
No network request or git write command ran. Only this notes section was added.

Contradiction evidence, against DECISIONS smoke-request-slow round 3 at line 499:

- `runner/test/c05-person-notes.test.ts:844–852`, `C05 person notes: round 4 1: settlement survives
  recovery and retention`, still copies archived change-1 into direct changes after twenty newer
  runs, explicitly checks `outcome: 'restored'`, and requires unchanged personal bytes and no
  completion. The run supplies a new source and different wording. The unchanged assertions at
  lines 850 and 852 fail with the newly offered line and change-1's completion. This is the later
  retention control; the destination-selected archive assertions repaired in round 4 pass.
- `runner/test/c05-person-notes.test.ts:1386–1399`, the shared Timeline replay helper, still
  restores an archived request into direct changes, supplies a new source and different wording,
  and requires unchanged bytes, no updated row and no completion. Its byte assertion at line 1397
  fails in both `C05 timeline list: 2: plain list with front matter appends once, updates, archives
  and completes` and the corresponding `without front matter` test, and in
  `C05 timeline list: 5: preseeded Bower star line completes once and replay keeps exact bytes`.
- `runner/test/corpus-run.ts:230–240` proves this is a hand restore: when no active request exists,
  `addRequest` creates a new direct-changes file from the archived JSON and returns `restored`.
  These are neither same-run recovery nor a waiting request's physical pending path.

The round 3 ruling explicitly supersedes the old hand-restore promise: a copy restored by hand
counts as new and is outside supported v1 use. Reintroducing archive admission or historical scans,
or recognizing these copies through another ledger, would contradict the packet. No test was weakened
and no such production workaround was made. The round 4 notes already identify these remaining
contradictions under remaining failures 3–6; this continuation reproduced them.

Verification performed before the stop, with output under tmp-logs/ and --maxWorkers=2:

| Check | Result | Log |
| --- | --- | --- |
| Three bounded reds plus C05 runner person-notes/incorporation/between/marked-history | 61 pass, 6 fail | tmp-logs/implementation-round4-initial-runner.log |
| FakeDrive tests, including snapshot feed red | 32 pass, 1 fail | tmp-logs/implementation-round4-initial-fake.log |

Only failure output was inspected. The bounded golden and horizon pass. The pending red still fails
at its gone-target control because restored FakeDrive rejects the saved changes token; its later
retry bound is not reached. The independent fake snapshot/feed red reproduces that same defect at
`src/data/drive/fake-drive.test.ts:45`. This authorized snapshot repair remains unimplemented because
the user's stop condition was reached first. It belongs in FakeDrive.snapshot/restore, including
the existing snapshotWith delegation, with no second snapshot mechanism.

The other non-contradiction failure remains fix 1 finding 2, line 433: final run-21 RunRecords.found
returns `new` instead of `run`. No claim is made that this implementation issue is a ruling conflict.
App C05, full data/runner suites, app/node/runner tsc, ESLint, pnpm check and e2e were not run in this
continuation after the required stop. Earlier round 3 results above are not new validation claims.

removed: 0 additional production lines in this continuation; 88 production lines removed in the retained diff.
removed: retained archivedRecords/archive admission and broad history/horizon walks; no removal was undone.
tests changed: none.

Compatibility row drafts for the retained src/data/contracts/run-manifest.ts changes (not accepted validation):

| Stored format / contract | Required compatibility | Current evidence |
| --- | --- | --- |
| Existing v2 move properties without bowerRun | Continue parsing with unchanged meaning. | Optional field remains optional; full contract suite pending. |
| Move properties with bowerRun string/null | Strict writer/parser accepts the existing pointer and its removal. | Bounded golden and horizon parse produced manifests; full contract suite pending. |
| Existing edit/archive dependency guards | Keep every archive dependent on the writes it settles. | requestMoveKind exempts only the temporary pointer; repaired archive checks pass. |
| New pending relocation moves | Use ordinary move effects and RunRecords chain verification. | Physical pending controls pass; final pending bound blocked by fake feed failure. |
| Existing manifests/checkpoints and personal bytes | Preserve lenient historical reads and write-once supported recovery. | Same-run and repaired findings 4/5 pass; complete suites pending. |

Sources: reuse the official Drive files.list, parent-query and fields links in Sources above without fetching;
VaultIndex points to RunRecords evidence, and relocation uses the existing move effect.
left out: remaining hand-restore test reconciliation, fake snapshot feed repair, remaining implementation fixes,
full gates and commits. User-authorized retained production changes and all pre-existing test edits stay in place.


## Red repair round 5 (sweep)

Authority: the owner's round-5 assignment (TL-P4-51, DECISIONS after e7b5545e), and the bounded
rule at DECISIONS:471, round-2 clarification at :498 and round-3 supported-path ruling at :499.
The local DECISIONS file has no round-4/round-5 or TL-P4-51 lines; those instructions were supplied
explicitly in this session. No inference reinstates the superseded hand-restore promise.
No network, git write, production edit, formatting or reverted implementer change. This append is
the explicitly requested notes exception to the test-only scope. All six starting production-file
SHA-256 hashes still match (tmp-logs/round5-production-unchanged.log). Commits remain coordinator-owned.

### Every converted test and its point

tests changed: runner/test/corpus-run.ts:228: addRequest replay writes no file and never copies archived JSON into changes.
tests changed: runner/test/corpus-run.ts:178: later corpus replay presses pass the preceding immutable run to the existing redispatchCase.
tests changed: runner/test/corpus-run.ts:240: replay validates the original admitted request id and same Drive/root, then redispatches that run.
tests changed: runner/test/corpus-driver.test.ts:182: original request id/words remain distinct from fresh press-3; replay dispatch equals the original.
tests changed: runner/test/corpus-driver.test.ts:229: settled replay writes no second request; archive/personal bytes and exact one-record count remain.
tests changed: runner/test/corpus-driver.test.ts:256: replay and new tidy-up remain separately reported; same dispatch and entire replay snapshot are exact.
tests changed: runner/test/c05-person-notes.test.ts:486: fix 1 finding 4 uses the physically pending original plus new change-2, never archive restoration.
tests changed: runner/test/c05-person-notes.test.ts:493: its ordinary fresh generic tidy-up avoids competing named consent; change-2 alone binds/completes.
tests changed: runner/test/c05-person-notes.test.ts:718: round 3 6 filing collision redispatches the original run; final citation and exact note bytes remain.
tests changed: runner/test/c05-person-notes.test.ts:783: round 4 1 retains interrupted settlement recovery and twenty-newer-run retention controls.
tests changed: runner/test/c05-person-notes.test.ts:843: run 22 is an ordinary supported pile, with original archive bytes, one filed item and zero new completions.
tests changed: runner/test/c05-person-notes.test.ts:1386: shared Timeline replay uses the original immutable dispatch despite extra source/different offered wording.
tests changed: runner/test/c05-person-notes.test.ts:1431: Timeline list 2 with front matter still appends once, reports, archives and completes once.
tests changed: runner/test/c05-person-notes.test.ts:1431: Timeline list 2 without front matter keeps the same plain-list and no-second-append point.
tests changed: runner/test/c05-person-notes.test.ts:1520: Timeline list 5 keeps both '-' and '*' preseed controls, one completion and exact bytes on redispatch.
tests changed: runner/test/c05-person-notes.test.ts:1396: replay returns its original report/completion; exact stored-run bytes prove no additional update/completion.
tests changed: runner/test/c05-person-notes.test.ts:408: fix 1 finding 2 uses SYSTEM.dir/RUNS_NAME for run 1 listing times, with all numeric bounds unchanged.
tests changed: runner/test/c05-person-notes.test.ts:413: same test uses the existing run-folder constant for run 2.
tests changed: runner/test/c05-person-notes.test.ts:420: same test uses the existing constant for runs 3 through 19.
tests changed: runner/test/c05-person-notes.test.ts:873: round4Pending consumers round 4 2 and round 5 3 get truthful originating-folder times.
tests changed: runner/test/c05-person-notes.test.ts:996: round5NewerRuns consumers round 5 1 and round 5 3 use the existing run-folder constant.

Same-run replay returns the original persisted report, including its original updated row, rather than
a new empty report. Comparing the full original run's manifest/checkpoint bytes and completions establishes
no new update or completion. Exact note-byte checks, one filed-item counts, plain/star controls and every
original append/settlement assertion remain. No test asserts that a hand-restored copy inherits identity.
The pending finding-4 conversion initially used a named extra request that won oldest-request selection;
that fixture error was corrected to the existing generic tidy-up input before final verification, retaining
all change-2 binding/completion assertions. It is not a remaining implementation failure.

### Sweep coverage

Searched every runner test/helper for replay, restored, restore/request/archive combinations and archive
writes/reads, and every harness/corpus/*/case.json and replies.json. The only remaining explicit replay
inputs are the three driver tests above, now using same-run redispatch. Other replay mentions are existing
same-run recovery, replayed transports or unrelated Bin/cache restoration. Archived request seeding in
bounded reads is deliberate historical-load evidence, never hand-restore admission. No corpus case/reply
currently contains an archived-request replay input; no case/reply needed conversion. Corpus expected
scores, all numbers/bounds and zero archive/other-run media assertions are unchanged. The bounded-reads
file is unchanged. Search evidence: tmp-logs/round5-runner-sweep.log, round5-corpus-sweep.log and
round5-archive-sweep.log. The stale replay explanation in harness/corpus/README.md is outside the permitted
non-test edit scope and remains unchanged; this section records the driver's actual supported semantics.

### Final verification and EVERY remaining failure

All Vitest commands use --maxWorkers=2 and redirect output to tmp-logs; only failures/summaries were read.
- Whole C05 runner set plus every corpus*.test.ts: 100 tests, 98 pass, 2 fail (8 files).
  Command from runner/: pnpm exec vitest run test/c05-*.test.ts test/corpus*.test.ts --maxWorkers=2.
  Log: tmp-logs/round5-runner-final.log. All 33 corpus tests pass; C05 has 65 pass / 2 fail.
- FakeDrive: 33 tests, 32 pass, 1 fail.
  Command: pnpm exec vitest run src/data/drive/fake-drive.test.ts --maxWorkers=2.
  Log: tmp-logs/round5-fake.log.
- Runner tsc: pass, pnpm -C runner exec tsc --noEmit -p .; tmp-logs/round5-tsc-final.log.
- ESLint on all three touched runner files: fail, two inherited diagnostics below;
  tmp-logs/round5-eslint-final.log. No config or non-test file changed.
- Read-only git diff --check: pass.

1. Implementation pending (existing fake snapshot/feed defect): C05 bounded pending,
   runner/test/c05-bounded-reads.test.ts:348, misses ASK_GONE. FakeDrive.restore drops the saved
   changes feed, producing Invalid fake changes page token before a new report; the old report remains.
   The later own-run retry/media bounds are blocked by that hard assertion, not claimed executed/green.
2. Implementation/verification unresolved, preserved from round 4: C05 fix 1 finding 2,
   runner/test/c05-person-notes.test.ts:433, expects run-21 records but gets 'new'. The runner log
   shows the fresh named request's offered previously filed source is refused with lineCites (after
   one retry); no run-21 manifest is published. Fixing SYSTEM.runs removes the tsc error but does not
   resolve that provider/source-validation failure. No assertion or source fixture was weakened.
3. Implementation pending (dedicated fake snapshot/feed red): src/data/drive/fake-drive.test.ts:45,
   snapshot then restore preserves a previously stored changes page token and its feed, rejects
   with BowerError/Invalid fake changes page token instead of the exact original feed/token.
4. Anything else (inherited round-4 test lint): runner/test/c05-person-notes.test.ts:779:31,
   forbidden non-null assertion on archive!, @typescript-eslint/no-non-null-assertion.
5. Anything else (inherited round-4 test lint): runner/test/c05-person-notes.test.ts:779:77,
   forbidden non-null assertion on pending!, same rule. Both are outside the three authorized
   assertion repairs and left unchanged; no new eslint error is introduced by this sweep.

All converted restore-path tests pass. Bounded golden/horizon pass without changing their zeros or bounds.
No remaining failure invokes hand-restoration. Production completion, inherited lint, full pnpm check,
app/e2e gates and coordinator commits remain outside this red-only sweep; no full-gate green is claimed.
Sources: existing official Drive files.list, parent queries and fields URLs in Sources above, cited without
fetching under the no-network instruction; reused local redispatchCase, RunRecords and RUNS_NAME.
removed: archive-to-changes copying and obsolete restored/already-active driver outcomes; no production removal.

Round-5 owned changes: runner/test/corpus-run.ts, runner/test/corpus-driver.test.ts,
runner/test/c05-person-notes.test.ts, and this required notes append. No corpus file changed.

tests changed: src/data/drive/fake-drive.test.ts: new red for DEFECT_LOG fake-drive-snapshot-feed (lead ruling round 4): snapshot, restore, listChanges still answers a stored token.

## Fix round 1 red

- Exact red: `C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once`.
- Positive control: `C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once`.
- HEAD: `e432f3e887119e36dab3b14089447e8cd825ff77`; no production edits or git writes.
- Both variants run through runner main using `runOnDrive`, injected clock and FakeDrive transport.
  A changes the personal note after manifest publication, verifies the rejected conflict and physical
  `pending/A` request with unchanged bytes and no completion. B appends the saved bound line and records
  its completion; the red throws before the archive PATCH reaches FakeDrive. Its archive outcome is
  unapplied, the request remains physically pending, and its bytes are unchanged. No request is restored.
  C proposes the original source id with unchanged wording or different wording during ordinary pile work.
- Confirmed failure: unchanged wording records a second completion for the same request/target pair.
  Different wording records that second completion and adds a second personal Timeline line, a new
  timeline-append effect and an updated report row. Byte equality and empty completion/effect assertions
  are independent oracles; every produced run is parsed and its checkpoint chain verified.
- Positive control: B's archive PATCH lands; C records no second completion, append or personal update
  in either wording variant. A correction removes the now-ungranted model line while filing the new pile.
- Command: `pnpm -C runner exec vitest run test/c05-bounded-reads.test.ts --maxWorkers=2`.
  Output: `tmp-logs/smoke-request-slow-fix1-red.log`. Result: 1 expected failing red, 4 passing tests
  (positive control and all three pre-existing bounded-read tests). Every existing assertion and bound
  is preserved; no existing test was modified. Only additive test coverage and these requested notes.
- Research: no network, as instructed. Reused the existing RunRecords, main-entry test harness and
  before-landing transport interruption pattern. Packet reference: Drive parent queries and fields,
  https://developers.google.com/workspace/drive/api/guides/search-files and
  https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list.
  Physical pending placement points to the verified evidence; no new index or recovery mechanism.
- Full check/e2e intentionally not run in this test-only red session: production fix belongs to the
  implementation session; this red must remain failing for the coordinator to commit.
- Touched-file ESLint and runner typecheck pass after the final test edit; outputs:
  `tmp-logs/smoke-request-slow-fix1-lint.log`, `tmp-logs/smoke-request-slow-fix1-typecheck.log`.
  `git diff --check` passes. No commits made; coordinator owns commits.

## Fix round 1

Authority: the owner's fix-round assignment and the Blocking finding in
`docs/harness/2026-10-10-codex-smoke-request-slow-adversarial.md`.

The committed red was run before the edit:
`C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once`.
It failed on a second completion with unchanged wording, and a second completion, append,
append effect and update with different wording. Evidence: `tmp-logs/fix1-red.log`.

`src/data/spine/scripted.ts:2051` now includes waiting retries in the existing recovery-pointer
publication. The in-place move carries the new run id before the append; that append depends on
the pointer, and the existing pending move publishes the new physical run location before archive.
When B completes but its archive PATCH does not land, the next tidy-up finds B's verified completion
through the same RunRecords lookup. There is no new store, index or recovery path.

removed: 1 production line replaced; the `!line.waitingRun` exclusion from pointer publication.
tests changed: none.

All requested explicit Vitest commands used `--maxWorkers=2`; output is under `tmp-logs/`.

| Check | Result | Log |
| --- | --- | --- |
| Committed fix-round red before implementation | Expected assertion failure | fix1-red.log |
| Bounded reads, including fix-round red and archive-lands control | 5 pass | fix1-bounded-green.log |
| C05 person-notes, incorporation, between, marked-history runner tests | 64 pass | fix1-c05-runner.log |
| Full src/data suite | 4141 pass, 77 files | fix1-data.log |
| Full runner suite | 553 pass, 44 files | fix1-runner.log |
| tsc app | Pass | fix1-tsc-app.log |
| tsc node | Pass | fix1-tsc-node.log |
| tsc runner | Pass | fix1-tsc-runner.log |
| ESLint touched production file | Pass | fix1-eslint.log |
| pnpm check, shared heavy lock | 5486 pass / 1 fail, server-listen EPERM | fix1-check.log |
| c05-person-notes, capabilities, app e2e, demo and fake, shared heavy lock | Both blocked before tests, server-listen EPERM | fix1-e2e-demo.log, fix1-e2e-fake.log |

No test in the requested suites contradicts the ruling (TL-P4-51).

Every remaining gate failure:
- `src/e2e-port.test.ts:37`: `a server from another worktree is never reused` times out after
  its server cannot listen on 127.0.0.1 (uncaught EPERM). Check stops before API/runner/build/static
  gates; the required full runner suite, typechecks and touched-file lint passed separately.
- Demo and fake e2e cannot start the dev server on ::1:5301 (EPERM); no screen tests ran.
  Both commands acquired the shared heavy lock. These environment failures do not contradict a ruling.
  The app C05 tests also pass inside check: 12 person-note contracts, 5 reports and 1 tidy-screen test.

| Compatibility / bound | Evidence |
| --- | --- |
| Completed waiting retry after failed archive | Red passes for unchanged and different wording; no second completion, append or update. |
| Archive-lands behaviour | Positive control passes for both wording variants. |
| Own-run reads and zero archive reads | Unchanged bounded golden, pending and horizon assertions all pass. |
| Existing formats, binding and write-once recovery | Full data/runner and C05 suites pass; no format or reader change. |

Research: no network used. Reused the packet's standard index-points-to-evidence pattern:
Drive parent containment selects evidence, existing moves publish the pointer, and RunRecords
verifies that run's manifest/checkpoints. References cited without fetching:
[Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list),
[parent queries](https://developers.google.com/workspace/drive/api/guides/search-files), and
[partial-response fields](https://developers.google.com/workspace/drive/api/guides/fields-parameter).

The initial e2e invocation omitted the heavy lock and failed before tests on server-listen EPERM;
its log is `tmp-logs/fix1-e2e-unlocked.log`. Both gate runs were repeated through the required lock.
No test, contract bound or gate was weakened. No git write command was run.
left out: full-check/e2e completion (sandbox server-listen EPERM); commits and integration
(coordinator-owned); the unrelated minor plan.ts archive path.

tests changed: runner/test/c05-person-notes.test.ts: red repairs 1-5 per the lead's smoke-request-slow rulings (pending location, own-run read, hand restores are a v1 limit, archive move after pending); per-assertion lines above.
tests changed: runner/test/corpus-driver.test.ts: red round 5 (TL-P4-51): driver replay is a redispatch of the same run, never a hand restore.
tests changed: runner/test/corpus-run.ts: red round 5 (TL-P4-51): addRequest({kind:"replay"}) no longer copies archived JSON into changes/.

## Fix round 2 red

- Authority: owner assignment, TL-P4-29, BLOCK 1 in
  `docs/harness/2026-10-10-codex-smoke-request-slow-adversarial-2.md`.
- Exact red: `C05 bounded reads: fix 2: a waiting retry whose pending relocation failed completes once`.
- Positive control: `C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once`.
- Pre-append check: `C05 bounded reads: fix 2: a waiting retry interrupted after its pointer and before its append appends once`.
- HEAD: `7877a456c5610806d28647bcc0757c3f4ba6977e`. No network, production edits or git writes.
  All three checks use runner main via runOnDrive, FakeDrive transport and injected time.
- A clashes after manifest publication: fresh personal bytes remain intact, its edit is rejected with
  conflict, no completion is recorded, and unchanged request bytes physically land in pending/A.
  B publishes bowerRun=B before its append. The red throws before the pending/B PATCH lands;
  B's append and completion succeed, the relocation and dependent archive remain unapplied,
  and the unchanged request remains exactly in pending/A with bowerRun=B. No archive restore occurs.
- Confirmed HEAD failure: C records a second completion with unchanged wording. With different
  wording it also adds a second personal Timeline line, append effect and updated report row.
  All fixture assertions before those independent soft assertions pass. Log below captures both variants.
- Positive control: B's pending relocation and archive land; C records no second completion,
  append, effect or update for either wording. All five existing tests also pass unchanged.
- Pre-append interruption: B's pointer lands before the note upload is refused, with no completion
  recorded. The dependent pending relocation is not attempted; the request remains in pending/A
  with bowerRun=B and exact original bytes. C appends exactly one bound-source line, records one
  completion and one update, and archives the original bytes. Both wording variants pass at HEAD.
  Exact personal bytes plus a single line (original or freshly offered wording) and one append effect
  verify the requested once-only contract without adding a wording-retention requirement.
- Final command: `pnpm -C runner exec vitest run test/c05-bounded-reads.test.ts --maxWorkers=2`.
  Result: 1 expected failing red, 7 passing tests. Log: `tmp-logs/smoke-request-slow-fix2-red.log`.
- Touched-file ESLint and runner typecheck pass; logs:
  `tmp-logs/smoke-request-slow-fix2-lint.log`, `tmp-logs/smoke-request-slow-fix2-typecheck.log`.
  Read-only git diff --check passes. Full check/e2e and production repair are outside this red-only task.
- Research: no fetching under the owner's no-network instruction. Reused the existing runner-main
  harness, before-landing transport interruption, RunRecords parsing and checkpoint-chain verification.
  Packet sources: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list and
  https://developers.google.com/workspace/drive/api/guides/search-files. Existing pointers select evidence;
  no second store or recovery mechanism is introduced.
- Notes are the explicitly requested exception to the test-only edit scope. Commits are coordinator-owned.

tests changed: runner/test/c05-bounded-reads.test.ts: additive fix-round-2 pending-relocation red, landing control and pre-append interruption check through main; every existing assertion and bound is unchanged.

## Fix round 2

Authority: the owner's fix-round-2 assignment and the Blocking finding in
`docs/harness/2026-10-10-codex-smoke-request-slow-adversarial-2.md`.
No network request, git write command or test edit was made. Commits remain coordinator-owned.

The committed red ran before production edits: `C05 bounded reads: fix 2: a waiting retry whose
pending relocation failed completes once`. One test failed and seven passed. It recorded another
completion for unchanged wording, plus another append, append effect and update for changed wording.
Evidence: `tmp-logs/fix2-red.log`.

`VaultIndex.waitingRun` is the single rule for waiting-request run selection: the published `bowerRun`
property wins; only its absence permits the actual pending folder's name as fallback. The existing
in-place move publishes B before its append, and the existing physical move clears the property.
Failed relocation therefore leaves the request pointing at B, even while it physically remains in A.
History still verifies only the selected run through RunRecords; no archive scan or new mechanism.

The first precedence-only edit passed the relocation red but exposed the committed pre-append control:
B's append did not land, and the existing history reader omitted B's binding because its rejection
was `unknown`, rather than `conflict`. The final fix preserves that retry through B's own records.
`personalAppendHistory` accepts the engine's existing `unknown`/`UNCONFIRMED_WRITE_MESSAGE` outcome,
which `engine.ts:666` writes only after read-back reports `not-landed`, alongside its existing clash
case. It still requires a filed/captured source. Changed/gone read-back refusals and unreadable or
unresolved effects are not admitted by this addition. No fallback read of A is introduced.

### Waiting-run sweep

Searches covered `waitingRun`, `bowerRun`, `PROP.run`, `pending/`, and the broader `pending` spelling.
Evidence: `tmp-logs/fix2-run-sweep.log`, `fix2-run-sweep-all.log`, `fix2-run-sweep-repo.log`.
Every production decision about a waiting request's run is listed below:

- `src/data/vault/vault-index.ts:77`: the sole selector, published pointer before actual containment.
- `src/data/spine/scripted.ts:172`: personalAppendHistory selects verified evidence via waitingRun.
- `src/data/spine/scripted.ts:2413`: capture compares duplicate requests' selected runs via waitingRun.
- `src/data/spine/scripted.ts:2417`: capture stores the request's waitingRun from that same selector.
- `src/data/spine/scripted.ts:272`: settlement consumes that captured value for missing-evidence expiry.
- `src/data/spine/scripted.ts:2266`: archive consumes it to clear the temporary property, without reselection.
- `runner/src/claude.ts:410`: provider identifies waiting requests via waitingRun, then uses
  personalAppendHistory for bound target/source ids. It does not resolve their former titles.

Other matches were checked and do not select a waiting request's evidence run:

- `vault-index.ts:68-71`: journal discovery includes physical pending folders; selection is waitingRun.
- `scripted.ts:1857,2236-2242`: captures/creates the current run's pending destination.
- `scripted.ts:2060,2264`: publishes the current pointer and clears it on physical relocation.
- `run-manifest.ts:31,294,299,574-587`: parses properties and classifies planned pointer/pending moves;
  it compares the current manifest run, not the stored request's historical run.
- `grounded.ts:122-128` and `engine.ts:278-288`: use requestMoveKind for relocation validation/dependencies.
- `layout.ts:94-95`: property spellings only.
- `records.ts:307,323`: marks run folders and their records at creation, not waiting requests.
- `runner/src/spine/retention.ts:43,46,50,61,103`: stamps/checks record-folder retention and its contents,
  not request admission or history. No folder-first waiting-run selector remains.

removed: 6 production lines replaced (2 in scripted.ts, 4 in vault-index.ts); no mechanism removed.
tests changed: none.

### Verification

Every explicit Vitest command used `--maxWorkers=2`; output is under `tmp-logs/`.

| Check | Result | Log |
| --- | --- | --- |
| Committed red before edits | 1 expected failure, 7 pass | fix2-red.log |
| All bounded reads, fix 1/fix 2 reds, landing and pre-append controls | 8 pass | fix2-bounded-green.log |
| C05 person-notes, incorporation, between, marked-history runner tests | 64 pass | fix2-c05-runner.log |
| Full src/data suite | 4141 pass, 77 files | fix2-data.log |
| Full runner suite | 556 pass, 44 files | fix2-runner.log |
| tsc app | Pass | fix2-tsc-app.log |
| tsc node | Pass | fix2-tsc-node.log |
| tsc runner | Pass | fix2-tsc-runner.log |
| ESLint both touched production files | Pass | fix2-eslint.log |
| pnpm check, shared heavy lock | 5486 pass / 1 fail; listen EPERM | fix2-check.log |
| c05-person-notes, capabilities, app e2e, demo/fake, shared heavy lock | Both blocked before tests; listen EPERM | fix2-e2e-demo.log, fix2-e2e-fake.log |

No test in these requested suites contradicts a ruling (TL-P4-51). Tests, stored formats,
personal bytes, target/source identity, five-file own-run bound, exact pile baseline and all
zero archive/unrelated-run media assertions remain unchanged. Both wording variants pass in
the relocation-failure and pre-append-interruption tests. No second mechanism was added.

Research: no fetching under the no-network instruction. Reused the packet's index-points-to-evidence
pattern, existing VaultIndex, RunRecords, moves and engine read-back outcomes. Official references
cited without fetching: [Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list),
[parent queries](https://developers.google.com/workspace/drive/api/guides/search-files), and
[partial-response fields](https://developers.google.com/workspace/drive/api/guides/fields-parameter).

Every remaining gate failure:
- `src/e2e-port.test.ts:37`: the scratch server cannot listen on 127.0.0.1 (uncaught EPERM),
  so the identity test times out. Check stops before API/runner/build/static gates. Root lint,
  typecheck and all other 5486 root tests pass; the requested runner/typecheck/lint suites pass separately.
- Demo and fake e2e cannot start the dev server on `::1:5301` (EPERM); no screen tests ran.
  All three heavy commands acquired the shared lock after waiting for the other worktree's run.
These environment failures do not contradict a ruling; no test, gate or contract was weakened.

Final read-only `git diff --check` passes. The tracked diff contains only vault-index.ts, scripted.ts
and this notes append; every test is unchanged. No git write command or external network was used.
left out: full-check/e2e completion (sandbox listen EPERM), commits/integration (coordinator-owned),
and the review's unrelated minor plan.ts archive path.

## Known-green close (coordinator)

done.sh could not revert 4286793b (fix rounds 1-2 touched the same lines of scripted.ts and vault-index.ts). The red is proved by hand: at the red commits the bounded-reads reds failed as assertions (50 archive + 75 run-record media reads, 143 reads against 20, no pending move, manifest-age horizon; implementation notes, tmp-logs implementation-reds*), fix rounds 1 and 2 each committed a red that failed at its HEAD (duplicate completion; second completion), and all pass after the fix. Gates at 9142d472: pnpm check green, e2e demo 51 and fake 75 pass. Codex pass 3 PASS, P4-96 PASS.
