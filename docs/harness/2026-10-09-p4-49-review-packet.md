# Packet: P4-49 review (c4-segmented-one, implementer: Codex)

Read-only, fresh, two passes (TL-P4-23: the other provider reviews). Unit and contract tests only: never start a server, run e2e or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-seg`.

- **Diff:** `git diff 51f2522e..0566dff4`.
  - Red: 8456c48e.
  - Fix: 04a74af6.
  - Notes and compatibility row: e510d92e.
  - Test correction: e3b7d900 (the phone folder heading's name includes its "More for …" button).
  - Notes: 0566dff4.
  - The coordinator committed for Codex, because its sandbox cannot write the git index.
- **Packet:** docs/harness/2026-10-09-c4-segmented-one-packet.md. Its "What the person sees" table was signed off by the designer.
- **Coordinator's gates, under the lock:** `pnpm check` is green at 0566dff4. The e2e passes 4/4. The red at 8456c48e failed on the control height.
- **Fixed questions (TL-P4-20).** Pass 1 is the contract. Pass 2 is code quality and "second way?" (a second segmented control or a per-screen 44 px rule). Give every finding a severity.
- **Look hardest at:**
  - `.views` is gone, and the toggle uses `src/ui/Segmented.tsx` with its keyboard behaviour. VIEW_KEY and the toggle behaviour are kept.
  - The chips reach 44 px through the src/ui rule, not a per-screen min-height.
  - Desktop sizes are unchanged.
  - The change to Segmented.tsx and ui.module.css does not alter Settings or Tell Bower.
  - The test correction in e3b7d900 does not weaken what the test proves.
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details go in `/private/tmp/p4-49-review-notes.md`.
