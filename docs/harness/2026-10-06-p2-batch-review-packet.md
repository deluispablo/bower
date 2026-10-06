# Packet: P2 batch review at the freeze

Starting model: Codex, `model_reasoning_effort=medium` (TL-P2-44 rule 1 default; one cross-provider review of Claude-built batches 1–5).

- **Frozen SHA:** `4d7ab08` (code). `e27069d` on top is docs only. Checkout: `/private/tmp/bower-p2-freeze` (detached, read-only).
- **Diff range:** `e7cb3bc..4d7ab08`, paths `src/` and `e2e/` (batches 1–5, about 49 files).
- **Contract:** P2 exit as narrowed by `docs/harness/2026-10-06-tl-p2-38-fast-close.md` §1–2, over the rows in `docs/P2_ACCEPTANCE.md` (capability matrix, C01–C16). C13 tidy-up undo, C15 beyond what exists, R2–R4 and O7 are out of scope.
- **Read:** `docs/harness/WORKER.md` (reviewer rules), the two contract files above, then the diff. Do not read other harness documents.
- **Judge:** only Critical or Important findings against the contract block. Important = a person would notice it, or a data risk (lost bytes, overwritten user text, hard delete, a write without the modifiedTime it read, a primary journey broken). Each blocking finding needs file:line, the C row and a concrete reproduction (a test name or steps over the fake services). Minor findings: one line each.
- **Research first:** when a finding rests on a platform rule (Drive API, IndexedDB, service worker), cite the source.
- **Do not** run e2e or edit files. You may run `pnpm vitest run <file>` to confirm a reproduction, output to `/tmp/p2-batch-review-*.log`.
- **Deliver, under 40 lines:** verdict (CLEAN / BLOCKING), blocking findings, minors, rows you could not judge from the diff.
