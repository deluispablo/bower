# Packet: c4-undo-confirm-in-place (defect undo-confirm-not-in-place; Codex, non-escalated, ui: true)

- **Entry:** `c4-undo-confirm-in-place`. Worktree `/private/tmp/bower-c4-undo-confirm`, branch `c4-undo-confirm-in-place` from `claude/p3`.
- **Ruling:** DEFECTS undo-confirm-not-in-place (lead, 2026-10-10, main): as proposed. The designer's finding is in DEFECT_LOG.
- **Starting model:** Codex. Afterwards a fresh Claude review and the designer's re-check. This also closes c4-undo-compensate's design check.

## What the person sees (from the signed c4-undo-compensate table, row 1, and the designer's finding)

| Situation | What shows |
| --- | --- |
| Undo of a change (Bin, rule, restore, move), online | The confirmation takes the Undo toast's own box: the words change to "The rule is back.", "<name> is back" or "The pile is back in the inbox", and the button goes. There is no rise, no fade-in and no blank frame, exactly as in the offline case. Focus goes back to where it was before the toast, as today. The confirmation then lasts the plain 4 s. |

## Contract

1. The online confirmation goes through `toast.replace`, the same one home the offline swap uses. There is no second toast path.
2. The offline swap, its copy and its focus stay unchanged.

## Red

- `an online Undo confirmation replaces its toast in place`. It is a unit test on the toast and dock: after Undo succeeds online, the same toast element holds the confirmation words, with no new toast element and no Undo button. The focus return is unchanged.
- An e2e check in the existing c4-undo-compensate spec (fake source, phone and desktop): the confirmation's box keeps the Undo toast's position, with no rise, and axe through `expectAxeClean`.

## Commits

1. The red.
2. The fix.
3. The notes (`docs/harness/2026-10-10-c4-undo-confirm-in-place-notes.md`), with `tests changed:` lines and compatibility rows if src/features is touched.
