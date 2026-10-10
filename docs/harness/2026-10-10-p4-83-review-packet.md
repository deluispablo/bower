# Packet: P4-83 review (b1b-ports, written by Codex; escalated: transport; TL-P4-41 Q3, Q10)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b1b-ports`. You may run `pnpm exec vitest run src/data/drive --maxWorkers=2` there.

## What to review

- **Diff:** `git diff claude/p3...b1b-ports -- src`: drive-api.ts (five read ports, DRIVE_OPS), drive-http.ts, fake-drive.ts, read-cache.ts; the reds in drive-contract.ts, drive-ops.test.ts, drive-http.test.ts, fake-drive.test.ts, parity.test.ts, live.test.ts.
- **Contract:** `docs/harness/2026-10-10-b1b-packet.md` (ports only: no retrieval.json, no cursor commit, no index building); TL-P4-41 Q3, Q10, addenda 1-2. Codex passes 1-3 in `docs/harness/2026-10-10-codex-b1b-ports-adversarial*.md`; the last is a Minor by ruling (DEFECT fake-restore-legacy-size).

## Look hardest at

- The prefix read: 4,096 bytes on whole characters for 206 and 200; 416 and empty; Workspace files never read; a prefix never stored as the whole file in the read cache; the existing transport, retry and auth paths reused.
- The feed: every page drained to newStartPageToken; no loss or loop; removed stubs and out-of-scope ids; the parents walk (cycles, depth, Bin) and the over-50 rule; restrictToMyDrive on changes.list.
- Fake parity with http per the cited Drive docs; nothing persisted; Drive-call goldens unchanged; BowerError sentences.
- The red owner's test changes (byte compare by value, My Drive scope, live wrapper, factory injection) weaken nothing.

Already run by the coordinator: pnpm check and e2e (app, capabilities, qa5, robustness) on demo and fake.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
