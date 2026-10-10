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
