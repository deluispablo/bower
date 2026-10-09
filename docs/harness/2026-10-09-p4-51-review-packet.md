# Packet: P4-51 review (v2-move-here, d-v2-18; Codex-written)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-v2-move`.

## What to review

- **Diff:** `git diff e1d20cd012a8f826ced10a5253c8857b18a5f5c4..v2-move-here`.
  - Red 3a16e205, fix 137b59dd, notes d01fe7e5.
  - Test corrections ad087bec and 1c5f9fc6, which fixed the separator and the Cancel width.
  - Round 2: red 72ad0e8f, fix 65425820, notes e55ac326. It covers Enter on the current folder name and comes from the designer's ruling.
- **Packet:** `docs/harness/2026-10-09-d-v2-18-packet.md`, signed off by the designer. It includes the Enter rule.
- **Gates run by the coordinator under the lock:**
  - `pnpm check` is green.
  - e2e on v2-move-here, qa5, qa7, app and focus-after-close, phone and desktop: 103 passed.
  - 1 failed: `focus-after-close.spec.ts:140` (desktop, axe color-contrast on the tidy sheet). This is the known `focus-axe-contrast-flaky` defect, ruled into c4-test-timers; it is not in this entry's files.

## Fixed questions (TL-P4-20)

Check the contract first, then look for a second way: a second list, filter, pill style or button component. Give every finding a severity.

## Look hardest at

- **The current row.** It is the same `li` and `button` as the others, with `aria-disabled="true"` and `tabIndex=-1`. A click is a no-op guarded in `pick`, the arrows skip it, and Enter never picks it.
  - Is `tabIndex=-1` together with `aria-disabled` consistent with the WAI-ARIA APG? The notes cite it.
- **The Enter rule order.** The current folder's exact name comes first, then "Several folders match" when another folder has the same exact name, then the one-match rule.
  - The hint text must be exactly "It is already in <name>. Pick another folder with the arrows, or type another name."
  - Check what happens for a top-level item, where `from` is empty.
- **"Now here" reuses `folder.module.css` `.new`,** with no new style. Only the name and dot are dimmed.
  - A cross-module CSS import inside the same feature is accepted for now; `c4-new-pill-one` will consolidate it.
- **Rows are 52 px.**
- **Cancel** is `Button` ghost block and calls the same `close` as Escape, so focus returns to the opener through the Sheet home.
- **Tests:**
  - the unit tests use no real timers;
  - the e2e asserts the real strings;
  - `tests changed:` lines are present (none expected);
  - no `.only` or `.skip`;
  - the compatibility rows are present for the src commits.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
