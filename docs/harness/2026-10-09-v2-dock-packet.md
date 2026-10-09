# Packet: v2-dock, d-v2-01 and d-v2-03 (stage 4, second pair)

- **Entry:** `v2-dock` (`ui: true`). Worktree `/private/tmp/bower-v2-dock`, branch `v2-dock` from `claude/p3`, after c4-focus-return merged (a4d092e7), since both touch `ui/toast.tsx`.
- **Ruling sweep:**
  - TL-P4-21, rulings 1 and 2 (order 2);
  - TL-P4-22 (2): "What the person sees" is signed off by the designer before dispatch;
  - spec blocks [d-v2-01](../design/specs/2026-10-09-v2.md#d-v2-01-messages-sit-above-the-tab-bar-full-width-never-over-the-work-3) and [d-v2-03](../design/specs/2026-10-09-v2.md#d-v2-03-keyboard-focus-is-never-hidden-behind-the-tab-bar-3-wcag-2411);
  - impact note, blocks d-v2-01 and d-v2-03 ([impact](impact/2026-10-09-v2.md));
  - TL-P4-18 addenda 2-3.
- **Starting model:** `bower-implementer` (Sonnet).

## Today (impact note, verified)

- There is one toast home, `ui/toast.tsx:86-118`, styled by `ui/ui.module.css:110-125`.
  - `left:50%` on a fixed shrink-to-fit box caps it at about 188 px at 375.
  - `--toast-bottom` is in `styles/base.css:15,117`.
- The run chip is in `features/tidy/RunChip.tsx:21-24` with `tidy.module.css:43-58`. It is a second fixed rule.
- Mounts:
  - `app/Shell.tsx:53` mounts `<Toasts/>` outside both shells, so on desktop it is fixed to the window.
  - `app/PhoneShell.tsx:37` mounts the chip.
  - On desktop, the scroll container is `main.view` (`shell.module.css:65`).
- On the phone the scrolling element is `html`, not `main`. `scroll-padding` is `auto`.
- `useToasts` (zustand) already holds the 3-message cap, the 4 s / 8 s timings and the hold on hover or focus (`toast.tsx:39-52`). Keep all of it.

## Contract

1. **One bottom dock** in `src/ui/`: one `.dock` placement that holds the toast stack and the chip slot.
   - It is mounted once per shell: inside `PhoneShell` above the tab bar, and inside DesktopShell's `.center`.
   - It publishes its measured height (ResizeObserver) as `--dock-h`.
   - The page's bottom padding and `scroll-padding` both read `--dock-h`, never a second height.
   - `--toast-bottom` goes, along with the chip's own fixed rule.
2. **d-v2-03: one rule on `html`** for widths under 900 px:
   - `scroll-padding-bottom: calc(var(--tab-h) + env(safe-area-inset-bottom) + 16px + var(--dock-h, 0px))`.
   - No per-screen or `main` rule (WCAG technique C43).
3. **Second-way risks (impact note):**
   - no second positioning rule for the chip, none for desktop, and no separate padding rule;
   - no `scroll-padding` on `main` or per screen.
4. **Copy:** only the Bin line changes, in its caller: "<name> is in your Drive's Bin." with the action "Undo". Every other message keeps its words.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Screen and state | What shows |
| --- | --- |
| Phone (< 900 px), one message | A box spanning the width minus 16 px each side, sitting 12 px above the tab bar's top. At least 52 px tall, `radius 16px`, `--raised` fill, `--shadow-pop`, a 1 px `--line` inset ring. Text 16 px. Its action is a 44 px text button in `--brand-line`, weight 600, on one line. |
| Phone, the run chip | The same box and place, with `--brand` fill and `--on-brand` text, the text on one line. It sits in the same dock as the messages. |
| Desktop, a message or the chip | At most 520 px wide, centred at the bottom of the main column (not the window), 24 px above the status bar. |
| Several messages | They stack upward with an 8 px gap, three at most. The oldest goes first. |
| Chip and messages together | The chip is lowest in the dock, and messages stack above it with an 8 px gap. The chip does not count toward the three. `--dock-h` is the whole stack. |
| A phone screen with a sticky header | It gets the same scroll-padding at the top. If none exists, nothing changes. |
| While a message or the chip shows | The scrolling page gets bottom space equal to the dock's height plus 12 px, so nothing you can press stays under it. At full scroll in `scenario=back`, the last result row ends above the chip. |
| Motion | The box rises in 0.22 s ease-out (`--ease-out`). It stays 4 s, or 8 s with an action. The timer pauses while the box is pointed at or holds focus (today's rule). With reduced motion it appears in place. |
| Bin message | "Flat 2, 40 Tanners Walk is in your Drive's Bin." with the action "Undo" on one line. The name is the display name, never a file name. |
| Keyboard focus, phone shell (Home, a note, Settings, a pile, Tell Bower; at 375 and 768, and desktop zoomed to 200%) | Every focused control's box ends at least 16 px above the tab bar's top, plus the dock's height while one shows. |

**Signed off** by the designer, 2026-10-09 (9c250864, with the chip-and-messages row added). At the design check the designer measures:
- At 375: left 16, right 359, and at least 12 px above the tab bar. "Undo" sits on one line.
- After "Yes, merge": elementFromPoint at the centre of "Keep both" returns that button.
- At 1440: at most 520 px wide, centred in main.
- In scenario=back: the last row ends above the chip.
- Focus boxes end at least 16 px above the tab bar, at 375 and 768.

## Red

- At 375, the message's left is 94 and its right 282. It must be 16 and 359, and end 12 px or more above the tab bar's top.
- At 375×812, tabbing to "Weeknight curry" on Home puts its box end at 812. It must be at most 740 − 16.

## Verify (exact names)

- e2e, both projects:
  - `a message spans the phone width above the tab bar`
  - `a message is at most 520 wide and centred in main on desktop`
  - `the last result row ends above the run chip at full scroll`
  - `keyboard focus is never hidden behind the tab bar`
- Unit: `the dock stacks three messages at most, oldest first`.
- axe passes on the touched screens, with WCAG 2.2 tags and target-size.
- `pnpm check` must be green.
- Affected tests: `e2e/qa10.spec.ts:149`, `e2e/qa9.spec.ts:18` and `e2e/capabilities.spec.ts:177` (role=status toasts). Each change needs a `tests changed:` line.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-v2-dock-notes.md`). The card carries a `worktree:` line.

Reviewers are read-only. They never move the main checkout in any form.
