# B1a contract reds

implementer: codex

Red-owning session only. Base HEAD: `11efecd1caf754bae89648ad44eaeb8895910aa8`, branch `b1a-contract`.
No production edits, network, git mutations, commits, live Drive, personal data or real timer waits.
The coordinator owns the commits. Twelve new tests fail as assertions at this HEAD, with passing existing-path controls.

## Reds

Every exact test name below starts with `B1a contract:`. Names are literal, not patterns.

| Exact test name | File | HEAD failure and positive control |
| --- | --- | --- |
| B1a contract: 1: MOC marks own three regions and person maps permit only link rewrites | `src/data/contracts/b1a-contract.test.ts` | New independently framed regions parse as invalid and cannot be edited. Existing personal MOC/hub state grants and consented Timeline appends are accepted, contrary to Q1. Controls: legacy/v2 notes parse, personal link rewrite works, ordinary personal-note consent still works, Current state still refuses personal edits. |
| B1a contract: 2: selection is closed candidate ids with five wants and exact step two targets | `runner/test/b1a-contract.test.ts` | Production `selectionOf` is missing; the helper fails `expect(...).toBeTypeOf('function')` before calling it. Control: the existing closed execution-reply validator admits an empty valid reply. Valid selection fixtures and negative variants pin outside/new ids, paths, six wants, unknown type/source, unclosed fields, destination parent/name, words-only sources and answer/pair pins sharing five. |
| B1a contract: 3: runner paths are explicit and the app refuses their content writes | `src/data/contracts/b1a-contract.test.ts` | Existing runner-file parser rejects valid retrieval state; all four runner paths are absent from RUNNER_WRITES, and public toggleTask sends their content writes. Controls: existing questions parse, ordinary task writes work, malformed retrieval values refuse. Tests observe zero sends and unchanged bytes, not merely hidden UI. |
| B1a contract: 3: retrieval state and cursor commit together before the hidden report barrier | `runner/test/b1a-contract.test.ts` | Main writes no retrieval state or index, so there is no joint state/cursor commit. Controls: a no-item instruction run settles its real Rules update, saves one manifest, leaves the original note intact, and the trace observes the real report barrier. Pins scope/account/version/coverage, exact file id, one joint write, projection, order and hidden rows. |
| B1a contract: 4: settled maintenance replays without rows or duplicate writes and done skips it | `runner/test/b1a-contract.test.ts` | Persisted manifest has zero maintain effects instead of one with declared inputs. Controls: the real provider is called, the instruction run settles, and a done redispatch neither replans nor changes derived bytes. |
| B1a contract: 4: maintenance uses settled refusals without fabricating rows or log entries | `runner/test/b1a-contract.test.ts` | No maintain operation or retrieval state follows the settled refusal. Control: after manifest persistence, touching Rules triggers the existing modifiedTime fence, produces a rejected edit, preserves its bytes and contributes no successful Rules row. The refused operation id must never appear in the maintenance log. |
| B1a contract: 5: a MOC edit uses the read version and duplicate edits are refused | `src/data/contracts/b1a-contract.test.ts` | New MOC edit recheck refuses the unchanged fetched bytes and its manifest refuses as shape. Controls: app write passes the read modifiedTime; a later touch is refused; ordinary edit recheck succeeds, changed bytes refuse, one ordinary edit parses, and duplicate ordinary edits refuse as one-per-file. The same checks must admit/refuse new MOC edits. |
| B1a contract: 6: old notes manifests and checkpoint chains retain meaning beside maintain | `src/data/contracts/b1a-contract.test.ts` | A sealed maintain manifest refuses as shape. Controls: all stored P2 manifests/checkpoints and their chains preserve exact values, literal ownership fixtures preserve statuses, new fake Unicode feed sizes are byte counts, and old character-count snapshot metadata remains readable as ruled. |
| B1a contract: case 6: lost maintenance reply resumes the same manifest before done | `runner/test/b1a-contract.test.ts` | The fault is never reached because main sends no maintenance write; HEAD reaches done instead of leaving an interrupted attempt. Controls: main persists one manifest, original note stays unchanged, same-run redispatch reuses its bytes without another provider call, and the existing parsed checkpoint chain ends done. The test lands a real state write, loses its reply, blocks reconciliation for that attempt, then restores transport and verifies one state send, same manifest/op, checkpoint completion, report order, no duplicate log lines and zero done-replay sends. |
| B1a contract: hidden paths addendum: a hidden-only feed advances only the retrieval cursor | `runner/test/b1a-contract.test.ts` | Cursor stays `11`; the real changes entry point is not called. Controls: existing isHidden classifies dot paths and visible notes, a valid empty Worker admission reaches production main, and index/hot/log/state contents stay unchanged. There are no admitted source effects in this case; hidden feed paths must not schedule maintain. |
| B1a contract: TL-P4-45 addendum: root index is an ordinary indexed note and dot paths stay hidden | `runner/test/b1a-contract.test.ts` | VaultIndex hides root index; no projection/state includes its id. Controls: ordinary note is listed, dot mechanism path is hidden, main runs, and root index bytes stay intact. |
| B1a contract: TL-P4-45 addendum: the app lists edits and permits the person root names | `src/data/contracts/b1a-contract.test.ts` | App tree hides root index, root log creation refuses, root hot move refuses. Controls: ordinary root note is listed, the existing root index task is editable, and the unrelated note is unchanged. |

## Ruling accounting

- Packet points 1–6 each have a named red above; both packet addenda have separate named reds.
- TL-P4-41 Q1: three separately framed marks; only those regions change; personal prose and Current state remain protected. No hierarchy creation is exercised or granted.
- Q2: validation stays in claude.ts's existing reply home; no runner two-step wiring is added. Five includes pinned answers/pairs and words-only sources. Targets are exactly chosen ids plus destination and its hub/MOC.
- Q4: one versioned scoped retrieval file contains cursor plus state; index is its projection; public app writes refuse; four mechanism paths explicitly join RUNNER_WRITES.
- Q5/Q11: maintenance is a manifest effect evaluated after settled outcomes and before the barrier; no rows for internal writes or refused effects; done skips it. Lost-reply recovery uses the existing main/manifest/checkpoint/write-once path.
- Q9: no large-request split or continuation is introduced; B12 remains outside this entry.
- DECISIONS TL-P4-41 addendum 1: Unicode create/update feed sizes (`é🙂`, 6 bytes; doubled, 12) are controls in point 6.
- DECISIONS TL-P4-41 addendum 2: historic fake snapshot size is deliberately retained and its bytes still read; no repair is added.
- TL-P4-45: all mechanism Markdown lives in .bower; root index/log/hot names are ordinary app names. Dot-path hiding remains the only general hiding rule.
- TL-P4-32 addendum 1: the person's link rewrite is accepted; ordinary C05 Timeline consent remains accepted. The stricter MOC/hub exclusion comes from Q1.

## Test-only support and corpus

`runner/test/corpus-run.ts` adds observations (wire and immutable dispatch), injected pacing/admission for a feed-only run,
and same-run redispatch through production main over the same FakeDrive. It does not plan, author a derived file or add a recovery engine.
`runner/test/drive-v3.ts` forwards existing start-token/changes ports to that same FakeDrive, converting its metadata to existing wire metadata.
The write trace observes real multipart/media sends, after seeding and independently of snapshot reads; it never renders expected outputs.

New corpus case: `harness/corpus/b1-maintenance-crash-resume/` (case 6). The existing rule settlement is its positive control.
An exact method verdict row was added to `docs/harness/2026-10-08-p4-method-rubric-changes.md`.
The case is scripted recovery evidence; no model quality or new capability admission is claimed.

Test-facing spellings pinned by these reds: `moc-rewrite` with `region/previous/text/recordIds`,
`maintain` with declared `inputs`, `selectionOf(value, context)` returning validated selection and exact allowedTargets,
and retrieval v1 with `folderId/account/cursor/files` and each file's `path/version/summary/coverage`.
These are the minimum concrete API/wire fixtures used to make the packet reviewable; no implementation is supplied.

## Compatibility

| Contracts change / commit | Stored proof | Meaning |
| --- | --- | --- |
| This red-only delivery; coordinator commit pending | `src/data/contracts/fixtures/p2/run-manifest.json`, `run-checkpoint.json`; ownership-fixtures-final literals | All existing records parse with exact original values and verified checkpoint chains. Old note parsing and Current state protections stay the same. A new maintain record intentionally refuses at HEAD. |
| Future implementation contract commit | Point 6 is the permanent verifier | Coordinator adds the implementation SHA/compatibility row; no stored fixture or old test may be weakened. |

## Existing tests requiring coordinator action

No existing test was changed. Two pre-existing assertions contradict TL-P4-45:

- `src/data/vault/drive-vault.test.ts:401`, exact name `Bower's own root names cannot be made, renamed into or moved to`.
- `src/data/vault/vault-index.test.ts:37`, exact name `hidden files are kept out of entries but reachable by systemId` (its root index expectations).

tests changed: none (existing tests).
removed: none.

## Red repair (TL-P4-45)

This repair supersedes the two pending amendments and `tests changed: none` above.
Validation HEAD: `f9da5278dddafa0eea23bc3cbcdaa7d1806ae806` on `b1a-contract`.
Only the two named existing tests and this notes file were edited; the coordinator owns commits.

tests changed: src/data/vault/drive-vault.test.ts: TL-P4-45 makes root index/hot/log ordinary notes; creation of index.md, rename into Log.md and move of hot.md to root must succeed, and root index.md must exist.
tests changed: src/data/vault/vault-index.test.ts: TL-P4-45 lists root index/hot/log as ordinary entries, not system ids; .bower/questions.json and .bower/index.md, hot.md and log.md stay hidden and reachable by systemId.

All other assertions remain unchanged. Soft assertions let all amended root-name expectations
run at HEAD, while the existing dot-path and Rules.md controls still execute.
No production code or second mechanism was added. The existing VaultIndex/DriveVault paths
remain the mechanism, following the repository standards cited in the offline review below.

Exact amended test names:
- `root index, hot and log names are ordinary notes that can be made, renamed into or moved to`
- `hidden files are kept out of entries but reachable by systemId`

Validation (output under `tmp-logs/`):
- `pnpm exec vitest run src/data/vault/drive-vault.test.ts src/data/vault/vault-index.test.ts --maxWorkers=2`
  exited 1: 2 expected failing tests, 235 passing tests, 8 AssertionErrors.
  Log: `tmp-logs/b1a-red-repair-vitest.log`.
  Create, rename and move each reject with `conflict` and the reserved-name message instead of resolving;
  root index.md is consequently absent. Entries omit all three root names and systemId returns
  their ids instead of undefined. These are exactly the TL-P4-45 contradictions.
  All four .bower systemId checks and the unchanged Rules.md check pass.
  There are no load/import/type/timer failures.
- `pnpm exec tsc -p tsconfig.app.json --noEmit` exited 0.
  Log: `tmp-logs/b1a-red-repair-tsc-app.log`.
- `pnpm exec eslint src/data/vault/drive-vault.test.ts src/data/vault/vault-index.test.ts` exited 0.
  Log: `tmp-logs/b1a-red-repair-eslint.log`.

No network, git write command, full check, other test file or e2e was run.

## Offline standard solution review

No external lookup was performed because this session forbids network access. The repository's existing standards and their references were reviewed:

- Closed reply validation reuses the existing Zod schema/refinement path in runner/src/claude.ts; standard strict-object validation: https://zod.dev/api#objects.
- Versioned, canonical record parsing stays in ownership-format, record-json, run-manifest and run-checkpoint. The source-state/cursor update is one atomic artifact write, following the atomic commit principle: https://www.sqlite.org/atomiccommit.html. Drive's changes workflow supplies the terminal cursor: https://developers.google.com/workspace/drive/api/guides/manage-changes.
- Derived projections are rebuilt from source state; retries reconcile the same operation identity through the existing write-once implementation. Its source cites https://stripe.com/docs/api/idempotent_requests and RFC 9110 9.2.2, with reserved creates https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds and update stamps https://developers.google.com/workspace/drive/api/guides/properties.
- The app and runner reuse VaultIndex, note-edit, stillAsSeen, engine, RunRecords, write-once and barrier. No second parser, planner, write fence, feed cache, renderer or recovery implementation was added.

## Validation

Only the two new targeted test files were run, each with `--maxWorkers=2`; all output stays under `tmp-logs/`.
Each test's observed failure is AssertionError, not a load/import/type/timer error. The missing selection export is an explicit failed expect.
Passing controls run in the same tests before or alongside the new expectations. This is intentionally a red-only delivery.

- `tmp-logs/b1a-app-red.log`: 5 tests, 5 expected failures.
- `tmp-logs/b1a-runner-red.log`: 7 tests, 7 expected failures.
- `tmp-logs/b1a-tsc-app.log`, `b1a-tsc-node.log`, `b1a-tsc-runner.log`: tsc app/node/runner pass.
- `tmp-logs/b1a-eslint-app.log`, `b1a-eslint-runner.log`: eslint on all touched TypeScript files passes.
- `tmp-logs/b1a-failures.txt`: failure-only extraction, for coordinator review.

Full pnpm check, corpus suites, second-brain suites and e2e were not run: the owner's instruction limits this session to targeted files.
No implementation, B1b feed/prefix algorithm, B1c renderer/folding, B1d runner wiring, B1e hierarchy, B12 split or UI change is included.

## Implementation

Status at the original implementation handoff: **blocked on the literal zero-call ruling and timing sign-off**.
Superseded by Red repair 3 and Implementation round 3 below; the implementation remains uncommitted.
The coordinator owns commits. All non-performance behavioral assertions now pass; the fixed goldens
and timing bounds remain unchanged. No test, fixture or corpus file was edited by this implementation session.
The earlier three fixed-test contradictions are resolved by the committed red repairs below.

### Changes and mechanism homes

- Ownership-format retains old required frames and admits the three independently marked MOC frames.
  Note-edit restricts person MOCs/hubs to link rewrites, replaces only the chosen MOC payload,
  reparses the result, and preserves Current state protections. MOC frames are admitted only at real boundaries;
  marker-shaped fenced payload text never changes an old note's ownership shape. Manifest changes and the per-file guard
  admit MOC rewrites without changing stored legacy records.
- Selection validation stays in claude.ts's existing Zod reply home: closed envelope/items, source/type/folder/
  candidate identities, five shared across wants and pins, and exact targets. Step-two wiring remains B1d.
- RUNNER_WRITES explicitly names retrieval and the three mechanism Markdown paths. Layout accepts versioned
  retrieval records; the app content-write path refuses these files. Root reserved-name restrictions are removed.
- Main declares one maintain operation after the provider's operations, using the existing scheduler, engine,
  immutable manifest, checkpoint chain, write-once and fenced effects. Recovery reuses the stored manifest;
  retrieval lands last, and its stamp proves the preceding projections settled. Done redispatch never plans again.
- RunnerDrive shares one planner read port and the existing ReadCache. A full-text or full-byte read supplies
  maintenance's prefix without another request for that version. Retrieval and target text use the same versioned
  cache. Fresh metadata reads for write fences remain fresh. A bootstrap token precedes a fresh snapshot listing,
  so a change racing that listing remains on the next feed; the earlier planner listing is not paired with a later token.
- Missing projection ids use write-once's reserveFor over holders, and the immutable manifest keeps the reservations.
  A fresh reserved create needs no existence probe. The existing engine calls readBack before replay; only that
  replay path probes the reserved ids. No recovery store or transport was introduced.
- Existing projection targets carry their frozen beforeContent and metadata in maintain's declared inputs.
  The ordinary runner-json effect refuses a changed modifiedTime or checksum and sends the version it read.
  Maintenance cannot adopt an intervening edit as its precondition. Prior log bytes are declared too; successful
  outcomes add op-id lines once, refused outcomes add none, and previous log lines remain intact.
- A first run with no indexed notes and no operations skips maintenance before any extra request. With stored
  retrieval and an empty feed, maintain adds no operations, prefixes, reservations, projections or cursor write.
  Bower-only bookkeeping does not cause a cursor-write feedback loop. External hidden changes retain the packet's
  cursor-only path, without refreshing derived files.
- The C05/corpus Rules expectation was a missing report row when Rules is first made. Scripted now contributes
  one Rules updated row grounded by that exact create id. The existing grounded home recognizes Rules as the
  one generated root note. Refused effects still produce no updated row. The held-pile main test now receives
  reading/writing/done, with waiting dispositions and nothingReady preserved.

removed: src/data/vault/layout.ts: HIDDEN_AT_ROOT and its special root-name isHidden branch.
removed: src/data/vault/drive-vault.ts: refuseReserved and its create/rename/move calls.
removed: runner/src/index.ts: direct generateIds, dynamic property delete, fresh-create existence probes.
removed: runner/src/drive.ts: separate planner ports/listings per caller; maintenance's same-version media rereads.
tests changed: none

### Lead handoff: zero-call discovery

The literal instruction “a run with no changes and no settled effects adds ZERO calls” is not fully met.
The existing planner does not read retrieval or the changes feed. With a valid stored retrieval file,
no operations, and an actually empty feed, calling production withMaintenance after the planner adds exactly:

1. read .bower/retrieval.json (GET media of the listed version);
2. list Drive changes from retrieval.cursor (GET /drive/v3/changes).

It then returns the unchanged manifest with zero effects and zero writes. The empty first-run case adds zero
calls; a done redispatch also adds zero maintenance calls. Evidence: tmp-logs/b1a-idle-measure.log and its
offline measurement script; operationsBefore=0, operationsAfter=0, exactly the two requests above.
Without a feed result supplied by an already-required read, no local cache can prove that a remote feed is empty.
Skipping that discovery would also lose the committed hidden-only feed behavior. The lead must rule whether
these two discovery reads are outside ZERO, or assign the existing planner a feed input before this can be accepted.
No call is moved into another phase or renamed to disguise this limitation.

### Exact golden and timing deltas

Fixtures and assertions were not changed. Measurements use the unchanged modelled driver at 150 ms per Drive
call and 80 ms per Worker call. Offline scratch bundles under tmp-logs compare the implementation with the same
source having only withMaintenance bypassed in the scratch bundle (never in the worktree). That control reproduces
both original call goldens, 78 and 88. Raw call traces and phase counts:
`tmp-logs/b1a-measure-baseline.json`, `tmp-logs/b1a-measure-maintain.json`.

| Fixture | Calls before -> after | Exact delta | Whole-run time before -> after | Exact time delta |
| --- | --- | --- | --- | --- |
| c04-offer-and-flat | 78 -> 91 | +13 (+16.6667%) | 10,520 -> 12,470 ms | +1,950 ms (+18.5361%) |
| c04-offer-and-flat with 25 earlier runs | 88 -> 102 | +14 (+15.9091%) | 11,940 -> 14,040 ms | +2,100 ms (+17.5879%) |

Each added C04 call, named individually (13 total):

1. get Drive changes start token for the bootstrap snapshot;
2. list root children for the bootstrap snapshot;
3. list children of root folders for the bootstrap snapshot;
4. list children of nested folders for the bootstrap snapshot;
5. list .bower children to check the name before create .bower/index.md;
6. read .bower metadata for create .bower/index.md's live parent fence;
7. create .bower/index.md;
8. list .bower children to check the name before create .bower/log.md;
9. read .bower metadata for create .bower/log.md's live parent fence;
10. create .bower/log.md;
11. list .bower children to check the name before create .bower/retrieval.json;
12. read .bower metadata for create .bower/retrieval.json's live parent fence;
13. create .bower/retrieval.json.

The +25 fixture adds exactly those same 13 calls plus call 14: list the earlier run folders' children for the
bootstrap snapshot's extra depth. There are no added content/prefix reads in either fixture. generateIds is the
same one pooled reservation as the control, moved earlier; it is not an added call. Checkpoint and report call
counts are unchanged. Every added call is discovery or an ordinary check/fence/create of the declared targets.

| Phase-count fixture | reads | apply | checkpoints | report | runner |
| --- | --- | --- | --- | --- | --- |
| C04 control -> maintain | 15 -> 20 | 47 -> 55 | 4 -> 4 | 10 -> 10 | 2 -> 2 |
| C04 +25 control -> maintain | 17 -> 23 | 46 -> 54 | 4 -> 4 | 10 -> 10 | 11 -> 11 |

Token, model and status phases each retain zero Drive calls. reads includes the reservation moved out of apply.
The five remaining failing assertions are all the unchanged call goldens or timing bound:

| Fixed test | Before / bound -> actual | Delta and required disposition |
| --- | --- | --- |
| drive-calls-golden: the C04 run makes the golden number of Drive calls per step | 78 -> 91; phase counts above | +13 named calls; red owner must pin them |
| drive-calls-golden: the C04 run makes at least 40 percent fewer Drive calls | bound <=82 -> 91 | 9 above bound; +13 from measured fixture baseline of 78 |
| drive-calls-golden: with 25 earlier runs a run makes 88 Drive calls | 88 -> 102 | +14 named calls; red owner must pin them |
| timing-counts: the timing line counts calls and bytes per phase and names the region | 78 -> 91 | +13; exact phase counts above |
| reads-report: plan reads finish under the budget with modelled Drive latency | bound <2,075 -> 2,580 ms | +600 ms from measured 1,980 ms baseline, **+30.3030%, flag to lead (>20%)** |

The reads timing exceeds its numerical boundary by 505 ms (24.3373% of 2,075), rather than by its measured delta.
Do not change a timing bound by that boundary excess: the measured C04 delta is 600 ms.
The +25 fixture's reads are 2,280 -> 3,030 ms: +750 ms, **+32.8947%, flag to lead (>20%)**.
Both fixtures' apply interval is 4,880 -> 6,230 ms: +1,350 ms, **+27.6639%, flag to lead (>20%)**;
`offer-and-flat apply takes at most half its modelled time` now passes its unchanged <=6,675 ms bound.
Whole-run deltas are below 20%; the phase deltas above are explicitly escalated, not waived.

### Research first (offline)

Network and outside-worktree reads were prohibited. Existing mechanism code and the packet's offline references
were reused; these URLs identify the standards and were not fetched or independently verified in this session.

| Contract piece | Existing home and standard |
| --- | --- |
| Independently framed MOC payloads | ownership-format raw byte spans, note-edit reparse invariant; https://spec.commonmark.org/0.31.2/ |
| Closed selection and candidate authority | claude.ts's Zod strict objects/refinements; https://zod.dev/api#objects and https://zod.dev/api#refinements |
| State and cursor in one versioned artifact | layout runner-file guard; https://www.sqlite.org/atomiccommit.html ; https://developers.google.com/workspace/drive/api/guides/manage-changes |
| Whole projections and replay by op id | immutable manifest/checkpoint engine and write-once; https://www.sqlite.org/wal.html ; https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2 |
| Reserved create ids | write-once reserveFor/holders; https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds |
| Reads by version and writes with that version | ReadCache, driveEffects, stillAsSeen/fenced adapter; https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1 ; https://developers.google.com/workspace/drive/api/reference/rest/v3/files |
| Runner-only paths and root visibility | RUNNER_WRITES and layout isHidden; packet TL-P4-45, no second allowlist |
| Rules create row | scripted report contributions and grounded's existing root Rules exception; fixture expectation is the authority |

### Draft compatibility rows

The coordinator chooses commit boundaries and fills SHAs. Notes go in a separate commit. No git write was run.

| Contracts change / commit | Stored proof | Meaning |
| --- | --- | --- |
| Implementation fix commit, SHA pending (ownership-format.ts, note-edit.ts, run-manifest.ts) | B1a point 6; stored P2 manifest/checkpoint literals and ownership fixtures; all src/data tests green | Old stored values parse and checkpoint chains verify unchanged. MOC regions, MOC changes and maintain are additive v2 contracts. Optional maintain log and target beforeContent preserve reading older input shapes. No stored record, test or fixture was changed. |
| Same fix: Rules-created report contribution and grounded's root-note path | B1a runner entry points, C05/corpus fixtures, src/data scripted/fake-worker tests | New first-Rules runs publish the row required by the corpus; saved manifests and reports are never regenerated, and retain their prior meaning. |

### Implementation validation

All Vitest commands used --maxWorkers=2; outputs are under tmp-logs; only failure sections and aggregate results
were read. Offline measurement reads are diagnostic traces, not changed tests or corpus expectations.

- Resume red: `b1a-resume-runner-red.log`: 511 pass, 9 fail. Failures included both Rules-report assertions,
  the held-pile status sequence and six call/timing assertions. This is the failing-assertion evidence for the fixes.
- `b1a-resume-data2.log`: 77 files, **3,935/3,935 pass**, including all five B1a app contracts and repaired seed test.
- `b1a-resume-app-reds-final.log`: the five B1a app reds pass explicitly.
- `b1a-resume-runner-final.log`: 43 files, **515 pass, 5 fail**, exactly the five golden/timing assertions listed above.
  All seven B1a runner reds, main, C05 incorporation, corpus, second-brain-method and recovery controls pass.
- Last cursor feedback-loop adjustment: `b1a-resume-idle-final.log`: B1a runner reds + main, **14/14 pass**.
  Both measured golden fixtures lack retrieval before bootstrap, so that adjustment cannot change their deltas.
- Last ownership-boundary adjustment: `b1a-resume-ownership-final.log`: note-edit and the B1a app contracts
  pass (69/69). The ownership parser tests live under src/data/vault; their separate targeted log is
  `b1a-resume-ownership-parser-final.log`, including the parse-once tests. This removes the draft's global MOC-marker scan from framed payloads.
- App, node and runner tsc pass: `b1a-resume-tsc-app-final.log`, `b1a-resume-tsc-node-final.log`,
  `b1a-resume-tsc-runner-final.log`.
- All touched TypeScript files pass eslint: `b1a-resume-eslint-app.log`, `b1a-resume-eslint-runner-final.log`,
  and the last parser adjustment in `b1a-resume-eslint-ownership-final.log`.
- `git diff --check` passes. No test, fixture or corpus path is modified. The new runner/src/index.ts is untracked;
  the coordinator must add it with the fix. Inventory includes grounded.ts for the Rules report home.

No pnpm check, e2e, network, push, deployment, git mutation or test modification was performed.
B1d wiring, B1e hierarchy and B2 hot generation are outside this packet. Full account identity binding is not
supplied by today's token grant; the existing draft's folder-scoped account fallback is unchanged.

Implementation file inventory: `src/data/contracts/ownership-format.ts`, `src/data/contracts/note-edit.ts`,
`src/data/contracts/run-manifest.ts`, `src/data/vault/layout.ts`, `src/data/vault/drive-vault.ts`,
`src/data/spine/engine.ts`, `src/data/spine/scripted.ts`, `src/data/spine/grounded.ts`, `runner/src/claude.ts`,
`runner/src/drive.ts`, `runner/src/main.ts`, new `runner/src/index.ts`, and this notes file.
Logs and offline measurement artifacts are under tmp-logs/.

## Red repair 2

The red-owning session amended only the three fixed tests identified in Implementation, plus this notes section.
The implementer's uncommitted non-test draft was preserved. The coordinator owns commits.

tests changed: src/data/fake/seed.test.ts: TL-P4-45 makes root index.md, log.md and hot.md ordinary visible notes; only those three expected booleans changed, with dot-path and other note controls retained.
tests changed: runner/test/claude-provider.test.ts: packet point 3 and TL-P4-45 add SYSTEM.retrieval, SYSTEM.index, SYSTEM.hot and SYSTEM.log to the exact RUNNER_WRITES list; the shared admission/parser checks and refusals remain unchanged.
tests changed: runner/test/main.test.ts: Q5's production manifest includes declared maintain after the scripted operations; build the expected manifest through withMaintenance over the independent twin adapter, assert its preceding operations and declared operationIds, and retain exact whole-manifest equality for default and named scripted providers and the unknown-provider refusal.

Authority and offline standard: packet (both addenda), TL-P4-41 Q4-Q5 and DECISIONS TL-P4-45.
Reuse the existing deterministic maintenance wrapper and RunnerDrive over the existing pretend Drive v3;
no additional planner, allowlist or fixture mechanism. No external source was fetched.

Before amendments, the three named tests failed on the obsolete root hiding, exact runner-only list,
and manifest-without-maintain assertions. The unchanged held-pile status assertion also failed.
Logs: `tmp-logs/b1a-red-repair2-app-before.log`, `tmp-logs/b1a-red-repair2-runner-before.log`.

Validation with the implementation draft in place (only these three test files, --maxWorkers=2):
- `pnpm exec vitest run src/data/fake/seed.test.ts --maxWorkers=2` exited 0: the file and
  `isHidden hides system files only` pass. Log: `tmp-logs/b1a-red-repair2-app.log`.
- `pnpm -C runner exec vitest run test/claude-provider.test.ts test/main.test.ts --maxWorkers=2`
  exited 1: claude-provider.test.ts passes (23 tests); main.test.ts has 6 passes and 1 unchanged failure.
  Both amended runner tests pass, including `main picks the scripted provider` for both provider settings.
  Remaining failure: `a run whose piles are all held ends done with nothing filed` receives
  reading/writing/saving/done instead of reading/writing/done. Its assertion was not amended.
  Log: `tmp-logs/b1a-red-repair2-runner.log`.
- `pnpm exec tsc -p tsconfig.app.json --noEmit` and `pnpm exec tsc -p runner/tsconfig.json --noEmit`
  exit 0. Logs: `tmp-logs/b1a-red-repair2-tsc-app.log`, `tmp-logs/b1a-red-repair2-tsc-runner.log`.
- ESLint passes on all three files when run from each owning project's directory.
  Commands: `pnpm exec eslint src/data/fake/seed.test.ts` and
  `pnpm -C runner exec eslint test/claude-provider.test.ts test/main.test.ts`.
  Logs: `tmp-logs/b1a-red-repair2-eslint-app.log`, `tmp-logs/b1a-red-repair2-eslint-runner.log`.
  Initial combined invocation hit ambiguous tsconfigRootDir parsing errors, not code errors;
  log: `tmp-logs/b1a-red-repair2-eslint.log`. No configuration was edited.

Only failure sections were read from test output; runner JSON result statuses confirmed the named passes.
Drive-call goldens, timing bounds and all other assertions remain unchanged. No full check, e2e,
network, git write command or production edit was performed by this repair session.
The next implementation session needs the fixed-test contradiction resolved by the authorized red owner/lead first.

Draft file inventory: `src/data/contracts/ownership-format.ts`, `src/data/contracts/note-edit.ts`,
`src/data/contracts/run-manifest.ts`, `src/data/vault/layout.ts`, `src/data/vault/drive-vault.ts`,
`src/data/spine/engine.ts`, `src/data/spine/scripted.ts`, `runner/src/claude.ts`, `runner/src/drive.ts`,
`runner/src/main.ts`, new `runner/src/index.ts`, and this notes file. Logs are untracked under tmp-logs/.
`git diff --check` passes. Git status confirms no test, fixture or corpus path changed.

## Red repair 3 (addendum 4)

Red-owning session, HEAD `32dcb0b2`, branch `b1a-contract`. Authority: the owner's supplied
TL-P4-41 addendum 4 ruling: exactly two additional idle discovery reads, goldens 91/102,
fixture-specific measured phase counts, whole-run growth under 20%, and maintain writes limited
per run to retrieval.json and .bower/index.md once each plus changed MOC regions.
All existing implementation edits and new runner/src/index.ts were preserved byte-for-byte.
Only four runner test files and this appended section were edited. No git write was run.

### Test accounting

tests changed: runner/test/drive-calls-golden.test.ts: addendum 4 pins C04 at 91 and the 25-earlier-run fixture at 102 with their own measured phase counts; the historical cut budget adds the 13 measured maintenance calls; apply adds the measured 1,350 ms to its old bound; both whole runs must remain strictly under 20% over their measured controls.
tests changed: runner/test/timing-counts.test.ts: addendum 4 changes the C04 timing total from 78 to 91 and pins every phase count, retaining region, bytes and field-order assertions.
tests changed: runner/test/reads-report.test.ts: addendum 4 adds the measured C04 600 ms to the old 2,075 ms reads boundary, never the 505 ms boundary excess; a separate 25-earlier-run assertion bounds reads at its measured 2,280 + 750 ms; report order and report call bounds remain intact.
tests changed: runner/test/b1a-contract.test.ts: add two addendum 4 entry-point contracts; trace also observes stamped metadata/folder/Bin sends, so the maintain write-set assertion cannot miss a non-content write. Existing behavioral assertions are unchanged.

Exact new test names:
- `B1a contract: addendum 4: a no-change run adds exactly two discovery reads and zero writes`
- `B1a contract: addendum 4: maintain writes only retrieval index once and changed MOC regions per run`

The idle contract runs production main with an empty admission, a real stored retrieval file and
an actually empty FakeDrive feed. The seed's cursor includes its own last retrieval create; no private
feed state is cleared or replaced. A delegating spy observes production withMaintenance after the
planner's required reads. Its complete additional Drive request trace is exactly:
1. GET media of the listed .bower/retrieval.json version;
2. one GET /drive/v3/changes at that retrieval cursor.
There is no added write, operation, prefix, reservation or projection request. The normal runner records
still persist through main; all existing derived bytes remain unchanged. This new contract passes.

The write-set contract runs independent bootstrap and existing-projection fixtures through main.
Each has settled instruction effects and a valid framed Bower MOC. Actual write-once bowerOp stamps
associate sends with the stored manifest's maintain operation, excluding ordinary source effects and
report/checkpoint writes. A real retrieval send is required as a positive control. Each target may be
sent at most once. Other targets must be Bower MOCs, change at least one framed MOC payload, and retain
all bytes outside those payloads, including the frame marks, Current state and personal content.
The source Plot note remains unchanged in both fixtures.

**Remaining product red:** the draft sends .bower/log.md from maintain in both fixtures. The two
failures are AssertionErrors at the write-set assertion, not setup/import/type/timer errors.
runner/src/index.ts currently declares index/log/retrieval targets and sends all three in apply;
its log target violates the supplied addendum 4 write set. No product fix was made. The authorized
91/102 goldens still describe the measured draft, including the log-create calls named below;
this session did not silently alter their pinned counts to anticipate a later product fix.

### Fixed goldens and measured timing bounds

The added calls retain the individual names from Implementation's "Exact golden and timing deltas":
1. Drive changes start token for bootstrap;
2. root-child listing for bootstrap;
3. root-folder-child listing for bootstrap;
4. nested-folder-child listing for bootstrap;
5. .bower-child listing for index create name check;
6. .bower metadata for index create parent fence;
7. .bower/index.md create;
8. .bower-child listing for log create name check;
9. .bower metadata for log create parent fence;
10. .bower/log.md create;
11. .bower-child listing for retrieval create name check;
12. .bower metadata for retrieval create parent fence;
13. .bower/retrieval.json create;
14. only in the 25-earlier-run fixture: earlier-run-folder-child listing at the extra snapshot depth.
The pooled generateIds call moved phase; it is not an added call.

| Fixture | Total | reads | apply | checkpoints | report | runner | Whole-run bound |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C04 | 91 | 20 | 55 | 4 | 10 | 2 | strictly below 10,520 * 1.2 = 12,624 ms |
| C04 +25 | 102 | 23 | 54 | 4 | 10 | 11 | strictly below 11,940 * 1.2 = 14,328 ms |

Token/model/status retain zero Drive calls in both fixtures. The C04 historical cut's old 82-call
boundary adds the measured 13 calls (95); the independent exact 91 golden still pins the fixture.
C04 reads use the old strict 2,075 boundary + measured 600 = strict 2,675 ms. C04 +25 reads use
measured control 2,280 + measured 750 = at most 3,030 ms. The existing C04 apply bound uses its old
6,675 + measured 1,350 = at most 8,025 ms. These increments come from the measurements, never a
boundary excess. The measured phase growth over 20% is accepted by the ruling; the whole-run
bound is enforced separately for each fixture. Unaffected report and runner overhead bounds were
not changed. All amended goldens, counts and timing assertions pass with the draft.

### Held-pile investigation

`a run whose piles are all held ends done with nothing filed` passes **unchanged** both before
this repair and in final validation. Its expected phases remain reading/writing/done. The earlier
extra-saving failure recorded under Red repair 2 is not reproducible with today's supplied draft.
The existing nothingReadyPlan contains zero operations. Its fixture has no indexed note outside
Inbox and no retrieval state, so withMaintenance returns that manifest before discovery or apply.
No applied or possible-effect outcome exists, and main's unchanged changedSomething check does
not announce saving at the report barrier. Waiting dispositions and nothingReady remain verified.
The historical failure would be a regression for this empty, unchanged fixture, not grounds to
weaken its status assertion under addendum 4. No main.test.ts assertion was updated.

### Validation and state

Command (all output redirected under tmp-logs; only failure sections and JSON result statuses read):
`pnpm -C runner exec vitest run test/b1a-contract.test.ts test/drive-calls-golden.test.ts test/timing-counts.test.ts test/reads-report.test.ts test/main.test.ts --maxWorkers=2`

- Before amendments: five obsolete golden/timing failures; held-pile test passes unchanged.
  Log: tmp-logs/b1a-red-repair3-before.log.
- Final: 5 files, 28 tests; **27 pass, 1 expected product red**, with two .bower/log.md write-set
  AssertionErrors in that test (bootstrap and existing projections). Both new scenarios reached
  the real maintain send. Idle contract, all amended fixed tests, all previous B1a controls and
  all seven main tests pass. Log: tmp-logs/b1a-red-repair3-runner.log.
  Failure-only extraction: tmp-logs/b1a-red-repair3-failures.txt.
- `pnpm exec tsc -p runner/tsconfig.json --noEmit` exits 0.
  Log: tmp-logs/b1a-red-repair3-tsc-runner.log.
- `pnpm -C runner exec eslint test/b1a-contract.test.ts test/drive-calls-golden.test.ts test/timing-counts.test.ts test/reads-report.test.ts`
  exits 0. Log: tmp-logs/b1a-red-repair3-eslint.log.
- git diff --check passes. Hash comparison against tmp-logs/b1a-red-repair3-draft-hashes.json
  confirms every pre-existing production edit and runner/src/index.ts is unchanged by this session.

An intermediate new +25 test callback returned a Map instead of void; that test-only type error
was corrected. An attempted sequential second-press test lacked a new manifest and was replaced
with independent bootstrap/existing-state fixtures, isolating this write-set contract. Final failures
are solely the two authorized write-set assertions; neither intermediate harness issue remains.

Offline standards: reuse production main, the existing manifest/checkpoint and write-once stamps,
the existing FakeDrive changes feed, and ownership-format byte spans. Existing repository references:
https://developers.google.com/workspace/drive/api/guides/manage-changes and
https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2 (not fetched; no network allowed).
No second planner, recovery path, ownership parser or production mechanism was added.

No full pnpm check or e2e was run: this red-only assignment explicitly requests the touched runner
files, runner tsc and touched-test eslint. No non-test implementation file, fixture, shared harness
record, branch or commit was changed. The coordinator owns committing the four tests and this note.
removed: none.

## Implementation round 3

Implementation complete for the supplied TL-P4-41 addendum 4 write-set ruling; the authorized red owner
must re-pin the call goldens to the measured totals below. Red repair 3 is committed at `66fe2952`.
The coordinator owns commits. This round changes only runner/src/index.ts and this notes file;
all other inherited implementation edits remain in place. No test, fixture or corpus file was changed.
The earlier blocked status and Implementation's log-generation description are historical and superseded here.

### Maintain write set

withMaintenance now declares only `.bower/index.md` and `.bower/retrieval.json`, in that order.
It no longer reserves a log id, reads previous log bytes, captures log input, renders op-id log lines,
or sends a log write. The existing immutable manifest, checkpoint, reserveFor, fenced effects and
write-once reconciliation remain the mechanism homes. Retrieval is still the last target and proves
projection settlement; each target occurs once. No MOC generator or new recovery path was added.
The bootstrap and existing-projection write-set scenarios both pass, as do lost-reply recovery,
settled refusal, replay and done controls. The no-change contract still measures exactly two discovery
reads (retrieval media and changes) with zero maintenance writes.

SYSTEM.log, RunnerWrite's log path and RUNNER_WRITES' log entry remain: TL-P4-45 reserves its path
for later B8, and the existing B1a app-write refusal and exact runner-path contract need it.
Being an admitted runner path does not make it a maintain target. The optional stored `inputs.log`
field remains readable in run-manifest; new maintain manifests omit it. This round changes no parser.

removed: runner/src/index.ts: SYSTEM.log from declared maintain targets and rendered target texts.
removed: runner/src/index.ts: previous log read/capture and successful-outcome op-id log generation.
removed: runner/src/index.ts: log reservation, name-check listing, parent fence and create calls from maintain.
tests changed: none

### Measured totals for the red owner

Offline diagnostic bundles reuse the unchanged modelled driver, corpus and earlier-runs helper.
Only import.meta paths are preserved by the scratch bundler so it reads the original fixtures.
No test assertion, fixture, corpus input or worktree production source is replaced by the measurement.
Raw requests and timing phase counts: `tmp-logs/b1a-round3-measure.json`.
Reproduction: `node tmp-logs/b1a-round3-build-measure.mjs`, then
`node tmp-logs/b1a-round3-measure.mjs`; stdout stays in the corresponding tmp-logs logs.

| Fixture | Pinned -> measured calls | reads | apply | checkpoints | report | runner |
| --- | --- | --- | --- | --- | --- | --- |
| C04 (`c04-offer-and-flat`) | 91 -> **88** | 20 | **52** (was 55) | 4 | 10 | 2 |
| C04 with 25 earlier runs | 102 -> **99** | 23 | **51** (was 54) | 4 | 10 | 11 |

Token, model and status each retain zero Drive calls. Both independent fixtures finish with code 0.
Exactly three calls go in each fixture, all from apply: the `.bower` child listing for the log's
create name check, the `.bower` metadata read for its live parent fence, and the `.bower/log.md`
create. There are zero log sends. Discovery, checkpoint, report and retention counts are unchanged.
The pooled generateIds request remains one request; it reserves one fewer maintenance id.
C04 adds 10 calls over its 78-call control; C04 +25 adds 11 over its 88-call control.

| Fixture | Whole-run ms before -> measured | Growth over original control | Reads ms | Apply interval ms | Report ms |
| --- | --- | --- | --- | --- | --- |
| C04 | 12,470 -> **12,020** | 14.2586% over 10,520 | 2,580 | **5,780** (was 6,230) | 2,280 |
| C04 +25 | 14,040 -> **13,590** | 13.8191% over 11,940 | 3,030 | **5,780** (was 6,230) | 3,630 |

Each whole run loses 450 ms (three sequential 150 ms Drive calls) and remains strictly under its
20% whole-run bound. Reads bounds remain green without amendment. The apply delta over the
original 4,880 ms control is now 900 ms; the existing authorized bound remains green.
The red owner can re-pin totals to 88/99 and apply phase counts to 52/51; no golden was edited here.

### Compatibility row drafts per contracts file

The coordinator chooses contract commit boundaries and substitutes the accepted implementation SHA.
These rows cover the inherited uncommitted contract edits as well as this round's validation.

| Contracts file / commit | Stored proof | Compatibility meaning |
| --- | --- | --- |
| `src/data/contracts/ownership-format.ts` / 254e728f | B1a points 1 and 6; stored ownership literals; ownership parser suite | Plain, legacy and existing v2 notes retain their statuses, byte spans and task meaning. Three optional independently framed MOC regions extend v2 only at real boundaries; fenced payload markers do not change old shapes. |
| `src/data/contracts/note-edit.ts` / 254e728f | B1a points 1, 5 and 6; note-edit suite and ownership fixtures | Existing note edits and Current state checks keep their meaning. Bower MOC payload edits are additive and version-fenced; a person's MOC/hub permits only the existing link rewrite. Duplicate edits still refuse. No stored bytes are migrated. |
| `src/data/contracts/run-manifest.ts` / 254e728f | B1a points 5 and 6; unchanged P2 manifest/checkpoint fixtures and verified chains | Stored v1/v2 manifests and checkpoints retain exact values. MOC changes and the last maintain effect are additive v2 shapes. Optional target beforeContent and log fields remain readable; new maintain records declare index/retrieval only and omit log. RunnerWrite retains the reserved B8 path. |

### Validation

All output is under tmp-logs. Vitest uses --maxWorkers=2; only failure sections and aggregate
statuses were read. The offline diagnostic JSON is measurement evidence, not altered test output.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm -C runner exec vitest run test/b1a-contract.test.ts --maxWorkers=2` before the fix | 8 pass, 1 fails on exactly two log write-set AssertionErrors (bootstrap and existing projections) | `tmp-logs/b1a-round3-before.log` |
| `pnpm exec vitest run src/data/contracts/b1a-contract.test.ts --maxWorkers=2` | 5/5 pass | `tmp-logs/b1a-round3-app-reds.log` |
| `pnpm -C runner exec vitest run test/b1a-contract.test.ts --maxWorkers=2` | 9/9 pass, including both addendum 4 contracts | `tmp-logs/b1a-round3-runner-reds.log` |
| `pnpm exec vitest run src/data --maxWorkers=2` | 77 files, 3,935/3,935 pass | `tmp-logs/b1a-round3-data.log` |
| `pnpm -C runner exec vitest run --maxWorkers=2` | 43 files, 520 pass, 3 expected golden failures in 2 files | `tmp-logs/b1a-round3-runner.log` |
| `pnpm exec tsc -p tsconfig.app.json --noEmit` | pass (exit 0) | `tmp-logs/b1a-round3-tsc-app.log` |
| `pnpm exec tsc -p tsconfig.node.json --noEmit` | pass (exit 0) | `tmp-logs/b1a-round3-tsc-node.log` |
| `pnpm exec tsc -p runner/tsconfig.json --noEmit` | pass (exit 0) | `tmp-logs/b1a-round3-tsc-runner.log` |
| ESLint on all inherited touched app TypeScript files | pass (exit 0) | `tmp-logs/b1a-round3-eslint-app.log` |
| `pnpm -C runner exec eslint src/claude.ts src/drive.ts src/index.ts src/main.ts` | pass (exit 0) | `tmp-logs/b1a-round3-eslint-runner.log` |

The three remaining failures are the unchanged exact assertions:
- drive-calls-golden: `the C04 run makes the golden number of Drive calls per step`: expected 91, measured 88.
- drive-calls-golden: `with 25 earlier runs a run makes 102 Drive calls`: its first C04 assertion expects 91,
  measured 88; the independent diagnostic measures the +25 fixture at 99, with apply 51.
- timing-counts: `the timing line counts calls and bytes per phase and names the region`: expected 91, measured 88.

They stop at the total assertion before the later phase assertions. The diagnostic independently measures
both full phase tables above. All other runner tests pass, including read/apply/whole-run budgets,
main's held-pile status, corpus, second-brain-method, refusal and recovery. There are no other failures.

Offline standard: existing write-once stamps and idempotent derived projections, following the packet's
https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2 reference; no URL was fetched.
No network, git write, commit, push, deployment, full pnpm check or e2e was run in this requested validation scope.
No screen was changed. `git diff --check` passes; read-only status confirms no test/fixture/corpus change.
The coordinator must include the still-untracked runner/src/index.ts in the fix and commit notes separately.


## Red repair 4 (re-pin)

Red-owning session on b1a-contract. Authority: the owner's supplied TL-P4-41 addendum 4
and Implementation round 3 measured totals. Only the two tests below and this appended
notes section change; inherited non-test implementation files remain byte-for-byte intact.
No network or git write command was run. The coordinator owns commits.

tests changed: runner/test/drive-calls-golden.test.ts: re-pin C04 91 -> 88 and C04 with 25 earlier runs 102 -> 99, with apply phase counts 55 -> 52 and 54 -> 51; name the three removed log calls and retain every other assertion and all Red repair 3 cut/timing bounds.
tests changed: runner/test/timing-counts.test.ts: re-pin timing total 91 -> 88 and apply 55 -> 52; name the three removed log calls and preserve region, byte accounting, phase order, other phase counts and timing field-order assertions.

Removed calls, each from apply in both fixtures:
1. .bower child listing for the log create name check;
2. .bower metadata read for the log create live parent fence;
3. .bower/log.md create.

C04 phases: token 0, reads 20, model 0, apply 52, checkpoints 4, report 10, status 0,
runner 2. C04 +25 phases: token 0, reads 23, model 0, apply 51, checkpoints 4, report 10,
status 0, runner 11. These are Implementation round 3's independently measured counts.
The pooled generateIds request remains one request. Maintenance adds 10/11 calls over
the original 78/88 controls. No other runner test pins 91/102 as a Drive-call total.

All numerical cut/timing bounds stay exactly as Red repair 3: cut allowance 13 calls,
apply allowance 1,350 ms, reads allowances 600/750 ms and strict whole-run growth below
20%. The measured round 3 apply delta is 900 ms (three fewer 150 ms calls); this re-pin
changes no bound. reads-report.test.ts and b1a-contract.test.ts remain untouched.

Red evidence: tmp-logs/b1a-red-repair4-before.log has exactly three obsolete total
AssertionErrors (expected 91, received 88), with no load/import/type/timer failures.
Offline standard: reuse the existing measured modelled driver and timing accounting;
packet reference https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2 (not fetched).
No new production or test mechanism was introduced.

### Validation

All command output stays under tmp-logs; only failure sections and aggregate statuses
were read. Vitest runs used --maxWorkers=2.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm -C runner exec vitest run test/drive-calls-golden.test.ts test/timing-counts.test.ts --maxWorkers=2` before re-pin | exit 1; three expected obsolete total AssertionErrors | `tmp-logs/b1a-red-repair4-before.log` |
| `pnpm -C runner exec vitest run --maxWorkers=2` | exit 0; 43 files, 523/523 tests pass | `tmp-logs/b1a-red-repair4-runner.log` |
| `pnpm exec tsc -p runner/tsconfig.json --noEmit` | exit 0 | `tmp-logs/b1a-red-repair4-tsc-runner.log` |
| `pnpm -C runner exec eslint test/drive-calls-golden.test.ts test/timing-counts.test.ts` | exit 0 | `tmp-logs/b1a-red-repair4-eslint.log` |

Read-only assertion comparison against HEAD confirms the only assertion changes are
91/102 -> 88/99 and apply 55/54 -> 52/51. A SHA-256 comparison against the session's
initial inherited dirty/untracked files confirms every implementation file is unchanged.
No obsolete 91/102 Drive-call pin remains in test files. `git diff --check` passes.
No full pnpm check or e2e was run within this explicitly runner-only validation scope.
removed: none (assertions, tests or implementation).
