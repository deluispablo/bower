# Packet: P3-6 delta review (run status retry, lost-reply read-back, /status stand-in)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: [TL-P3-12](2026-10-07-tl-p3-12-r3-r4-and-p3-6-close.md) approves one delta review at the batch close; `settle()` decides what a person is told after an ambiguous write, which makes it data-safety work. This is the [TL-P2-46](2026-10-06-tl-p2-46-review-fallback.md) fallback until Codex returns. Counters: read only this packet, the three packets below and the diffs, never the workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs** (read-only; do not edit, commit or run e2e):
  - `git diff 0b48fe4..47d0f16 -- src api`, the batch's code;
  - and per change: `bc2c593`, `dfb5c7f` (run status retry), `8e7c710` (lost-reply read-back), `1478e39`, `b32b46c` (`/status`, logs).
- **Contracts:** [client-retry packet](2026-10-07-p3-6-client-retry-packet.md) with its [round 2](2026-10-07-p3-6-client-retry-fix-packet.md); [lost-reply packet](2026-10-07-p3-6-lost-reply-packet.md) (amended: a read-back that matches is a plain success, with no "Saved." sentence); [worker-logs packet](2026-10-07-p3-6-worker-logs-packet.md).
- **Look hardest at:**
  - `settle()`: whether an ambiguous write can ever be told as saved when it wasn't, or as not saved when it was. Is the "old state" test right for a toggle (modifiedTime) and for a move or rename (name and parent)? Can a person's next action double-apply (for example toggling twice)? Does the journal and index stay single on every branch?
  - `runs.ts`: whether a remembered 4xx can stop status for good (no foreground return, no Try again path); a race between `again` and a beat or generation change; 401 and 429 left alone.
  - `/status`: session, allowlist and error codes per the TL-P3-05 contract; that the 500 path names no cause.
- **Run:** only unit tests you name, by file (`pnpm exec vitest run <file>` or `pnpm -C api exec vitest run <file>`). Keep to one file at a time.
- **Report, under 20 lines:** a verdict (`PASS` or `BLOCKING`). Only Critical and Important findings against the contracts block, each with a reproduction (a failing test you wrote in `/private/tmp`, or exact steps). Minor findings in one line each.
