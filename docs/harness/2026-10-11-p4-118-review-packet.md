# Packet: P4-118 review (q1b-questions-ui)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-q1b-questions-ui`.

## What to review

- **Diff:** `git diff claude/p3...HEAD -- src e2e`. The red is 27280ef2, the implementation is 0949a37a, and the e2e repair plus two app fixes (focus settling, 44 px targets) is 034336a1.
- **Contract:** the packet `docs/harness/2026-10-11-q1b-questions-ui-packet.md` (Contract, the signed test table, "Ruled": TL-P4-44 addendum 9 and TL-P4-55 (3)), and the spec `docs/design/specs/2026-10-10-questions-ui.md`.
- **Gates (coordinator):** pnpm check, plus e2e q1-questions, app and messages-wait-for-sheets on demo and fake, all green on the current HEAD.

## Look hardest at

- One Questions card, exported from Home and reused in RunView, with one answer handler through answerQuestion. Check for any second store, data-port write or toast/Dock change.
- The run window: askedAt is at or after the RunState start, for live and stored askings alike. "N more questions on Home" counts honestly.
- Answers go by option id, never by label. Text is trimmed and limited to 1,000 characters. A failed save keeps the card and the draft.
- Focus moves as the packet says, including after the async continuation (034336a1), with no timers racing Radix FocusScope.
- Ids are unique across the Home card and the sheet card. Targets are at least 44 px on coarse pointers.
- The e2e repairs, including e2e/messages-wait-for-sheets.spec.ts:121, keep every assertion.
- You may run `pnpm exec vitest run src/features/home src/features/tidy src/features/piles --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the full review (findings with file:line and severity), then the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every card line under 120 characters.
