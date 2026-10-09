# Packet: v2-targets, d-v2-05 with d-v2-10 (stage 4, order 3)

- **Entry:** `v2-targets` (`ui: true`). Worktree `/private/tmp/bower-v2-targets`, branch `v2-targets` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-21 order 3;
  - TL-P4-22 (2): "What the person sees" is signed off before dispatch;
  - spec blocks [d-v2-05](../design/specs/2026-10-09-v2.md#d-v2-05-the-desktop-tab-close-button-is-24--24-2-wcag-258) and [d-v2-10](../design/specs/2026-10-09-v2.md#d-v2-10-every-phone-control-is-at-least-44-px-1);
  - impact note blocks d-v2-05 and d-v2-10 ([impact](impact/2026-10-09-v2.md)).
- **Starting model:** `bower-implementer` (Sonnet).

## Today (impact note)

- **d-v2-05:** `app/DesktopShell.tsx:147-157` is already a `<button>` with a 13 px icon. `app/shell.module.css:63-64` sets `.tabX` to 22×22 at `opacity:0.6`.
- **d-v2-10:**
  - `ui/ui.module.css`: `:24` `.small` is 40; `:40` `.iconBtn.sm` is 32×30; `:92` menu `.item` is 34.
  - Settings: `settings.module.css:13-14` `.seg` is 34, and `Settings.tsx:15-25` is the `Row`.
  - Tell Bower: `bower.module.css:6-8` `.kinds` is 34.
  - Sign-in links: `signin.module.css:17`.
  - A rule's Remove (`BowerScreen.tsx:210`) and Home's answers (`Home.tsx:322-327`) use `Button size="sm"`.

## Contract

1. **d-v2-05.** The tab close button is 24 × 24, `radius 6px`, with a 16 px icon in `--text-muted`.
   - Hover: `--hover` fill and a `--heading` icon.
   - Focus: the standard ring.
   - It does not use `IconButton small`.
2. **d-v2-10.** On the phone shell (under 900 px), one rule in `src/ui/` makes `.small` and `.iconBtn.sm` at least 44 px. Icon buttons are 44 × 44.
3. **One `Segmented`.** A single segmented control in `src/ui/` replaces Settings' `.seg` and Tell Bower's `.kinds`. Each segment is at least 44 px tall on the phone.
4. **Switch row as a label.** `Row` takes a label mode once, so the whole row is the switch's `<label>` and a tap anywhere on it toggles the switch.
5. **Sign-in footer links** are at least 44 px tall on the phone.
6. **Desktop** keeps its sizes, all at least 24 px.
7. **Second-way risks:**
   - no per-screen `min-height` overrides;
   - no second segmented control;
   - no per-row label wiring.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Place | Phone (375) | Desktop (1440) |
| --- | --- | --- |
| Desktop tab close "×" | — | A 24 × 24 button, radius 6, 16 px icon in `--text-muted`. On hover, `--hover` fill and a `--heading` icon. Standard focus ring. |
| Home question answers and suggestion buttons | At least 44 px tall | Unchanged |
| Files toolbar icons | 44 × 44 buttons | Unchanged |
| Tell Bower's "A request / A rule" | A segmented control, each segment at least 44 px tall | Same control, desktop size |
| Settings' segments | The same segmented control, at least 44 px | Same control |
| Settings switch rows | The whole row toggles the switch; the row is at least 44 px | The same row-as-label behaviour |
| A rule's "Remove" | At least 44 px tall | Unchanged |
| Sign-in footer links | At least 44 px tall | Unchanged |

No strings change.

## Red

- At 1440, the `Close Home` box is 22×22; it must be at least 24×24.
- At 375, the listed controls measure 40, 32×30, 34 and 23; each must be at least 44.
- A tap on a switch row's text does not toggle the switch; it must.

## Verify (exact names)

- e2e, both projects:
  - `the desktop tab close button is at least 24 square`
  - `every listed phone control is at least 44 px`
  - `a tap on a switch row toggles it`
  - `desktop control sizes stay at least 24`
- axe with `target-size` enabled explicitly on Home, a note and a folder at 1440, and on the listed screens at 375.
- Unit: `one segmented control serves settings and tell bower`.
- `pnpm check` must be green.

## Commits

Commit in this order: the red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-v2-targets-notes.md`), with `tests changed:` lines. The card carries `worktree:`.

Reviewers are read-only. They never move the main checkout in any form.
