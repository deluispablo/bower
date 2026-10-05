# Coordination locator on main

This is the main planning registry, not a replacement for the ongoing implementation batch. Live reservations are in `docs/harness/ACTIVE.md` in the checkout of `codex/close-phase-2`; resolve its path with `git worktree list` and read that file directly. Do not copy its historical snapshot over a newer live record.

## Planning assignment

- Owner-appointed role: Codex technical lead for planning and method only.
- Session label: `plan-main-20261005` (Codex thread `01a10b2a-e851-7bc2-b49f-8845262acfdb`).
- Planning checkout: managed `planning-main/bower-app`; branch `codex/phase-plan-and-harness` before local main integration.
- Current planning update base: main `616768a`; plan revision `2026-10-05-contracts-2`.
- Owned scope: adopted product/phase plans, acceptance matrix, Harness/role documentation, shared skill instructions and links, main's planning handoff/progress. No production code, feature status or proof changes.
- Required capabilities: Git/shell/Node/pnpm available; bower-session used; shared skills unchanged in this revision; browsers and external services not needed for this documentation task.
- Browser reservation: none. Existing implementation reservations remain in force.
- Authorization: documentation-only local main integration from the owner. No push or product-phase closure.

## Implementation continuity

The existing coordinator retains `codex/close-phase-2` and its work/evaluation reservations. The observed `4d98eb0` has 201/201 historical entries; check the live record for newer state. It must adopt the current main planning revision at a safe checkpoint before new assignments or phase closure. See [PLANNING_HANDOFF.md](PLANNING_HANDOFF.md). Do not select main's historical first open feature or appoint a second implementation coordinator.

After adoption, the live integration record continues to list actual reservations and evidence. Preserve its newer contents when resolving a docs merge; add the adopted plan revision explicitly. A future implementation merge to main must retain this distinction and the owner-appointed leadership scope.
