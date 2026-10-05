# Current-v1 malformed requests observation

Assignment: contracts-2 / P2 / C11, C14; planning revision `2026-10-05-contracts-2`. Registration reference: root `c193218` ACTIVE. All application modules were read from immutable Git source `6305ca9dfa126fd08ef9fe819a4ba2000cb78437`, independent of later integration changes. Final read-only integration HEAD was `7f49572e4412f3a379f0166717d46f4fed8c7e68`, with empty `git status --short`; this is not the observed source target.

## Method and evidence

Observed in Node `v26.10.0` using already-installed TypeScript `6.0.3` to transpile exact Git objects in memory. No repository edits, source builds, test suites, installation, browser, credentials, provider or model calls occurred. Local/session storage were private in-memory maps. Each case used a separate public `FakeDrive`, public `DriveVault`, and direct public `runFake`; no private runner methods or raw fake storage mutation were used.

Reproduce with:

```sh
node /private/tmp/bower-o3-malformed-observation-probe.cjs
```

The [script](/private/tmp/bower-o3-malformed-observation-probe.cjs), [complete results](/private/tmp/bower-o3-malformed-observation-results.json), [summary](/private/tmp/bower-o3-malformed-observation-summary.json), and [stderr](/private/tmp/bower-o3-malformed-observation-stderr.log) are retained. Results contain loaded-source SHA-256 hashes, raw request bytes and hashes, before/after app reads and guards, phase callbacks, actual returned report or exception, live-tree additions/removals, Bin, remaining piles and journal, and archived journal bytes. Every case also has full before/after FakeDrive snapshots under the same prefix. Stderr was empty. Exit 0 means the observation script completed; it is not an assertion suite or acceptance proof.

Synthetic setup: Bower root, Inbox/Projects/Areas/Resources/Archive, `.bower/changes`, and `.bower/requests.json`. Create a valid empty requests file, read its actual `modifiedTime`, and call `writeText` with that time and fixture bytes. Add one request, `Describe the synthetic garden observation.`, and one text pile, `Synthetic garden observation to preserve.`, using public `DriveVault` APIs; await `settled()`. Read before bytes/tree/journal, test `isRunnerFile` and `vault.requests()`, then call `runFake` with `{scope:'all', scale:'instant', failOnce:false}`. Read after bytes/tree/Bin through the public fake API and after requests/piles/journal using a fresh `DriveVault`.

The valid current-v1 request fixture has string `id`, string `text`, finite numeric `at`, and string `done`; the existing `isRunnerFile` accepts it. The CJS loader transpiles without static type checking. Invalid cases deliberately violate those existing fields; no schema or enum was added.

## Actual observations

| Fixture | App before / after | Direct runner outcome | Requests bytes | Pile / journal afterward |
| --- | --- | --- | --- | --- |
| Valid control: `{v:1,done:[valid prior request]}` | Accepted / accepted | Returned `phase:done`, one filed note, request wording in report | Rewritten with new completed request plus valid prior request | 0 Inbox piles; original folder in Bin; 0 pending journal, 1 archived request |
| Invalid JSON: `{ "v": 1, "done": [` followed by newline | Syntax error / accepted | Returned `phase:done`, same filing/report shape as control | Malformed bytes replaced by valid v1 containing only new completed request | 0 Inbox piles; original folder in Bin; 0 pending journal, 1 archived request |
| Wrong nested entry: `{v:1,done:[{id:'request-before',text:123,at:'later',done:[]}]}` | Rejected / rejected | Returned `phase:done`, same filing/report shape as control | Rewritten, prepending new completed request and retaining invalid prior entry | 0 Inbox piles; original folder in Bin; 0 pending journal, 1 archived request |
| Wrong container: `{v:1,done:{request:valid prior request}}` | Rejected / rejected | Threw `TypeError: old is not iterable`; no returned report | Exact bytes preserved, matching before/after SHA-256 | 0 Inbox piles; original folder in Bin; 1 pending request journal, 0 archived |

All callbacks reached `queued`, `reading` (total 1), `writing`, and `saving`; the exception case did not return a terminal result. This does not establish what `FakeWorker` would publish, because the service wrapper was not invoked.

The app consistently returned `BowerError`, code `unknown`, sentence `Bower could not read its latest update. Try again.` for each invalid pre-run input. Its diagnostics were `.bower/requests.json is not valid JSON` for syntax and `.bower/requests.json has an unsupported shape` for nested/container violations. The latter remained after the runner for both shape cases. These diagnostics were captured from app reads, not invented runner diagnostics.

All four cases actually created `Resources/Ideas` and `Resources/Ideas/Synthetic garden observation to preserve..md`. The double dot follows the synthetic text's period and is incidental to this packet. The new note contained:

```md
---
summary: Synthetic garden observation to preserve.
by: bower
kind: Note
---

Synthetic garden observation to preserve.

## Timeline
- Today · Written from a note you added.
```

Snapshots retain original `Pile note.md` text beneath the trashed pile folder; there was no hard deletion. The wrong-container case's generated note existed before the exception, and the Inbox pile was already absent from `fresh.piles()`. Its pending request JSON remained in `.bower/changes`; neither archive nor hashes file was added. The done cases additionally created archive and hashes files, and their returned report had one `filed` item, empty `created`, `updated`, `setAside`, and `questions`, `yourChanges:0`, and the new request wording. Results preserve the exact reports.

## Source explanation and contract relevance

These source references are to `6305ca9`, not the mutable worktree: `src/data/fake/fake-runner.ts:79–102` files piles before `doRequests`, then archives journal and writes hashes; `:236–240` reads `done` and spreads it without nested validation; `:287–295` casts parsed JSON and treats `SyntaxError` as missing. In contrast, `src/data/vault/drive-vault.ts:647–660` rejects invalid syntax and unsupported shape; `src/data/vault/layout.ts:85–107` checks request field types and the v1 requests container. `DriveVault.requests` at `:563–569` consumes that guarded file. The observations reproduce this producer/consumer divergence; they are not solely a code hypothesis.

C11: malformed persisted request history can be silently replaced or remain app-unreadable while the runner returns done. C14: unsupported requests can be discovered after filing and removing the source pile from Inbox, with no returned report and a still-pending request journal. Bin preserves the original pile content in this fake observation, but no recovery/retry action was exercised or certified.

Lead-review proposal only: decide the existing-v1 invalid-input policy and its pre-write boundary, then retain these three cases plus valid control as regression inputs. A compatible remedy should explicitly address original-byte preservation, useful app-readable refusal, and whether pile effects are allowed before a request-file rejection. This packet does not adopt an API, new schema, checkpoint, semantic operation, or mandatory v2 design; it does not establish O3 completion/readiness for O4.

Optional duplicate/malformed journal experiment: NOT RUN, deliberately omitted to keep the registered requests observation bounded. Provider premise probes R1–R4: NOT RUN. Browser, real durability, concurrent external writes, service-level failure state, retry, restoration from Bin, and full acceptance: NOT RUN. No active UI or server was owned; synthetic fake instances ended with the process. Private evidence files are retained for coordinator reproduction/incorporation; shared records remain coordinator-owned.
