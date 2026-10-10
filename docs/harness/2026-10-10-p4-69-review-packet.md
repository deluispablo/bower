# Packet: P4-69 review (c4-undo-confirm-in-place, written by Codex; defect undo-confirm-not-in-place)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-undo-confirm`.

## What to review

- **Diff:** `git diff claude/p3...c4-undo-confirm-in-place`: red 8938a2e6, fix 20e76dc1, notes b1416b2e.
- **Packet:** `docs/harness/2026-10-10-c4-undo-confirm-in-place-packet.md`. Its "What the person sees" row is contract.
- **Finding it answers:** DEFECT_LOG `undo-confirm-not-in-place`, from the designer.

## Look hardest at

- **toast.replace.** The online confirmation goes through `toast.replace`, the same one home the offline swap uses.
  - There is no second toast path.
  - There is no rise, no fade-in and no blank frame.
  - The focus return is unchanged, and the toast lives 4 s.
- **The copy is unchanged:** "The rule is back.", "<name> is back", "The pile is back in the inbox". The offline swap is unchanged.
- **Product files touched:** src/ui/report.ts, src/ui/toast.tsx, src/features/files/file-actions.ts and src/features/bower/BowerScreen.tsx. Is each change needed?
- **The red** fails before the fix. The e2e addition in c4-undo-compensate.spec.ts checks the box position and axe. Every touched test has its `tests changed:` line, and a compatibility row exists for the src/features commit.

Already run by the coordinator: pnpm check green; e2e c4-undo-compensate, v2-dock, qa8, qa5 and journal-failed on both sources green (64 and 73).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
