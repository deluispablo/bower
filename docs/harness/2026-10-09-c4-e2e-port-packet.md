# Packet: c4-e2e-port (stage 4, gate integrity, priority)

- **Entry:** `c4-e2e-port` (harness). Worktree `/private/tmp/bower-c4-port`, branch `c4-e2e-port` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 10 (c) (main 3d6bcfec);
  - DEFECT_LOG `e2e-port-shared-across-worktrees` and `vite-outdated-optimize-dep` (same class; say on your card whether this fix covers it);
  - c3-flaky-policy (`e2e/batch.ts`, `E2E_BATCH`).
- **Starting model:** `bower-implementer` (Sonnet).

## Today

- `playwright.config.ts:15-16` sets `baseURL` to `http://localhost:5191` and `webServer` to `vite --port 5191 --strictPort` with `reuseExistingServer: true`.
- Every worktree uses the same port. An e2e run in one worktree can test another worktree's server, or lose it mid-run. Workers have worked around this with throwaway configs on other ports.
- `e2e/pwa.config.ts` and `e2e/explore.config.ts` may have the same pattern. Check them and cover them.

## Contract

1. **A port per worktree.** Each worktree gets its own port by default, derived deterministically from the worktree path (for example, a hash of the absolute root into a fixed range). One helper, in `e2e/`, is used by every Playwright config: one home, no copy per config. An explicit env override stays possible, and the worker names it.
2. **Reuse only your own server.** A server already listening on that port is reused only if it serves this worktree. The check must be one the docs support: for example, a small endpoint or header that the Vite config adds in dev only (the worktree root, or a hash of it), checked before reuse. If the check fails, the run fails with one plain line naming the other root. It never silently tests someone else's code.
3. **Dev-only.** No production code, build output or route changes. The dev server's identity marker is dev-only.
4. **Docs.** Update the one line in `docs/harness/WORKER.md` or `COORDINATION.md` that tells workers how e2e picks its port, and remove the "use a throwaway config" workaround.

## Red

`two worktrees run e2e at once, each on its own server`. A test in check-harness or `src/harness*.test.ts` stands up two scratch worktrees (or two fake roots), resolves their ports through the helper, and shows that the ports differ. It also shows that a server whose identity is another root is refused for reuse. This fails today, because both resolve to 5191 and reuse is unconditional.

## Verify (exact names)

- `two worktrees run e2e at once, each on its own server`
- `a server from another worktree is never reused`
- `pnpm check` is green, plus one e2e spec run on fake from this worktree on its own port. Name both on your card.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-c4-e2e-port-notes.md`), with `tests changed:` lines. The card carries `worktree:`.

After the merge, the coordinator reruns the e2e of the closed stage 4 entries once on claude/p3, under the lock.
