# Packet: runner-reports-reading-total (P3-14)

Starting model: `bower-implementer` (Sonnet), per TL-P3-24 point 2. On staging, the runner went from `queued` (revision 9) straight to `writing` (revision 10), and `/status` showed `total` 0 for the whole run. The contract's phase order is `queued` → `reading` with `total` → `writing` → `saving` → `done`. The app shows "Reading your changes" and a count from those values.

- **Entry:** `runner-reports-reading-total`. Checkout `/private/tmp/bower-p3-reading`, branch `claude/p3-reading`, from the commit named in your prompt. Never push or deploy, and never run `gh` or `wrangler`.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, and the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
  - `runner/src/main.ts` (it posts `writing` at about line 158, and `saving` with `total` at about line 186) and `runner/src/status.ts`.
  - `runner/test/main.test.ts` and `runner/test/barrier.test.ts`.
- **Acceptance contract:**
  - **Reading with total.**
    - Before any operation, the runner posts `reading` with `total`, the number of admitted items it will read (from the admitted manifest).
    - It then carries that same `total` on `writing`, `saving` and `done`.
    - A resumed attempt whose run already shows `reading` or later posts no `reading`, and keeps `total`. TL-P3-23's ordered status records a backward report without moving the phase, so a repeat is harmless, but don't send one.
  - **Named test, red first** (commit it on its own before the fix): `main reports reading with total before writing`. Run `main` end to end, as `main.test.ts` does, and assert the status sequence `reading(total=n)` → `writing(n)` → `saving(n)` → `done(n)`.
  - **Files in scope:** `runner/src/main.ts`, `runner/src/status.ts` and `runner/test/**`.
    - **Not** `src/data/spine/**`: `dispositions-match-report` owns that, in parallel in `/private/tmp/bower-p3-disp`. If a runner test both entries touch must change, keep your edit minimal and say so in your card.
- **Gates:**
  - the verify, red first on the assertion;
  - `pnpm check` in full.
  - No e2e is needed, since no app code changes.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
