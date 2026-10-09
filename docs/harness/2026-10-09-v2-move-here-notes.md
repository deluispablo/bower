# v2-move-here — d-v2-18

implementer: codex
tests changed: none

## Change

- Kept the current folder in the same filtered destination list and original order, on the same list item and button.
- Marked that row with `aria-disabled="true"` and removed it from Tab and arrow navigation. The current location is already given in the sheet description; skipping the unavailable destination avoids an unnecessary keyboard stop. Its click is guarded, and the field's Enter choices exclude it.
- Dimmed only the name and dot. The full-contrast "Now here" badge imports `folder.module.css` `.new`; there is no new pill style.
- Kept Inbox and its descendants excluded, and preserved the field component and all move action/concurrency logic.
- Raised destination rows from 48 to 52 px minimum height.
- Added the existing `Button`, `variant="ghost"`, `block`, below the list. Cancel calls the same close function as Escape, allowing Sheet's existing focus-return mechanism to handle the opener.

## Tests and evidence

New test files (no existing tests changed):

- `e2e/v2-move-here.spec.ts`: fake source, 375 px phone and 1440 px desktop, through the existing Move to… entry points. Covers the disabled current row, no-op click, unchanged location, filter and Enter exclusion, 52 px rows, axe with `target-size` explicitly enabled, and full-width Cancel returning focus to the opener.
- `src/features/files/MovePicker.test.tsx`: synthetic tree, arrows in both directions skip the current folder, boundary focus, current-only filter, no-op click/Enter, filtering out the current row, and top-level/Inbox items having no current badge. Uses async React act to settle loading, with no real-time wait.

Red: the unit test failed because the `Current … Now here` button was absent before the implementation (`/tmp/v2-move-here-red.log`). The initial fixture setup was corrected before capturing this red.

Green: `pnpm vitest run src/features/files/MovePicker.test.tsx` passed (1 test), log `/tmp/v2-move-here-green.log`.

`pnpm exec tsc -p tsconfig.app.json --noEmit` passed, log `/tmp/v2-move-here-tsc.log`.

ESLint on MovePicker, its unit test, and the new e2e test passed, log `/tmp/v2-move-here-eslint.log`.

Per the assignment, no `pnpm check` or e2e was run. The coordinator still needs the packet's shared-lock gates, including qa5, qa7, app Move to/focus-after-close, and the new e2e tests. No git writes, commits, pushes, server starts, or other worktree changes were made. Tests, implementation, and these notes are in separate files for the coordinator's three commits.

## Sources

- [WAI-ARIA APG: Focusability of disabled controls](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_disabled_controls): disabled buttons are normally skipped by keyboard navigation; retaining focusability is useful when discoverability requires it. Here the sheet description and visible badge explain the current location. ARIA marks the state; the application guards activation and explicitly skips the row.
- [WCAG 2.5.8: Target size (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): pointer targets require 24 by 24 CSS pixels or a listed exception. The packet's 52 px row requirement exceeds that minimum; the e2e also enables axe's target-size rule.

Compatibility: markup and styles only, with "Now here" and "Cancel" added. No stored data, routes, formats, or move protocol changes.
