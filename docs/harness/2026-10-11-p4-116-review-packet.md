# Packet: P4-116 review (messages-wait-for-sheets, fix round 1)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-messages-wait-for-sheets`.

## What to review

- **Diff:** `git diff ce287892..HEAD -- src e2e`. This is the delta since P4-115 PASS. The red is 865a221a; the fix is 683d6731; the red repair of dock.test.tsx:133 is 3d2b1c00. Notes: "Fix round 1 red", "Fix round 1", "Fix round 1 red repair".
- **Contract:** the designer's finding, which is P4-115 minor 1. While any modal overlay is open, the role=status region stays mounted and only its children are hidden; a message is announced when it shows. Minor 3 is folded in: one pause call per change. Minor 2 is kept by the designer (palette, drawer and replay count as modal overlays).
- **Gates (codex-run):** pnpm check, plus e2e messages-wait-for-sheets, v2-dock and v2-name-sheet on demo and fake, all green on 3d2b1c00.

## Look hardest at

- The same status node is present before, during and after a sheet. No message text is readable, visible or hit-testable over the sheet.
- The red repair only replaced the "status absent" assertion. Nothing else was weakened.
- You may run `pnpm exec vitest run src/ui --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters.
