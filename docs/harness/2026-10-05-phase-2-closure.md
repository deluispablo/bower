# Phase 2 closure round

The owner asked to finish phase 2, audit the code and test the whole local app before merging to main. Work is on `codex/close-phase-2`; all commits and the eventual merge stay local.

## Independent review

Review range: `4833d3c..5d26800`, plus the phase 2 data paths and deferred ledger. No Critical findings; six Important and two Minor findings. All eight are registered under `qa-11` in `harness/features.json` and stay open until their named regressions fail before the fix and pass afterward.

| Severity | Entry | Effect |
| --- | --- | --- |
| Important | `harness-timeout-red` | A browser or whole-test timeout could count as the red proof of a fix. |
| Minor | `harness-selected-files` | A test outside a verify's selected files could satisfy one of its named alternatives. |
| Important | `journal-before-run` | A tidy-up could start before waiting instructions reached Drive. |
| Important | `journal-storage-failure` | A rule could be reported saved when neither Drive nor device storage kept it. |
| Important | `journal-separate-clients` | Independent clients could create duplicate bookkeeping folders and hide one client's changes. |
| Important | `runner-json-shapes` | Files with the right version but wrong fields could crash a screen. |
| Important | `open-in-drive` | Open in Drive was a placeholder, including the recovery route for a file. |
| Minor | `search-root-scope` | Unrelated Drive matches could consume the bounded search pages before a Bower match. |

The reviewer also requested a screen regression for retrying a failed upload and a task-specific assertion for retaining seen state after the person's own edit. These will be checked in the evaluation and the final coverage review.

## Deferred ledger triage

The historical ledger records what each earlier round found. Its deferred labels are not proof that the issue still exists. The independent reviewer traced each one through the current implementation and tests:

| Historical finding | Current disposition |
| --- | --- |
| Rename/move stale metadata | `stillAsSeen` checks current name and parent; targeted regressions exist. The server's check/write race still requires a real-Drive integration test. |
| Own task edit makes a note new | `keepSeen` retains seen state after own writes; add a task-specific regression before closure. |
| Upload survives pile removal | Completion after removal follows the pile to the Bin; regression exists. |
| Failed pile creation leaves an empty folder | Known failures clean up the created folder; regression exists. A lost server response remains an integration boundary. |
| Sub-path restore renames the pile | Restore tracks `gone.top`; regression exists. |
| Drive change and journal line not atomic | Structural boundary; qa-11 tightens truthful failure reporting and prevents a run before instructions arrive. Crash-safe transactions are not promised. |
| Duplicate changes folders | Still current; `journal-separate-clients` must recover every line for both the app and runner. |
| Repeated reads of seen set | `VaultIndex.entries` reads it once. |
| Ordered-list tasks | Shared `TASK_LINE` recognises them; regressions exist. |
| Obsidian frontmatter | Block-list tags and quoted values covered; this is the supported subset, not a complete YAML parser. |
| Startup errors/demo bundle | Startup rejection handled; sources loaded dynamically; bundle sensor checks the real build. |
| Device state survives sign-out | `forgetThisPerson` and UI/tab tests cover it. The folder-keyed journal outbox intentionally stays. |
| modifiedTime check/write window | Documented Drive integration boundary; real-Drive smoke test needed in phase 3. |
| Journal lacks file id | Records carry Drive file ids. |
| PWA catches Worker routes | Production regression covers route exclusion. |
| Tiny uploads show misleading percent | Sending copy avoids claiming accurate progress for tiny uploads. |

Pending owner ruling: keep offline reading, a queue of uploads that survives closing the app, and real-Drive smoke tests for phase 3. This proposal has been sent to the owner; silence is not agreement. Phase 2 closure must record the actual answer.

## Evidence

- Initial `harness/init.sh`: all check gates passed; 364 unit tests.
- `phone-more-faint`: failed assertion before the change, passed via `harness/done.sh`, commit `9b0364e`.
- Initial complete demo browser suite: 187 passed, 53 intentional skips.
- Independent evaluator and complete fake/PWA browser suites: in progress.

## Closure conditions

All registered findings closed with honest proofs; complete check, demo, fake and production PWA gates green on the final revision; fresh independent reviewer and evaluator report no Critical or Important issues; owner agrees to the remaining product rulings. Only then update the phase status and merge locally to main.
