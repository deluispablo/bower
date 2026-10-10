# shell-page-column implementation

implementer: codex

Entry: shell-page-column; DEFECTS shell-page-column-squeeze.
Worktree: /private/tmp/bower-shell-page-column; coordinator commits, in red / fix / notes order.

What changed:
- DesktopShell owns `docked(shellWidth, prefs)`. Its ResizeObserver measures the shell, not the window.
  The right panel folds first, then the side panel; the grid reserves a 560 px page column.
  Defaults match the signed table: 900 → 848, 1024 → 672, 1100 → 748, 1280 → 608, 1440 → 768 px.
- Dragging and arrow keys share the docking rule's remaining space and the existing 220–480 px limits.
  Each docked separator exposes its current maximum; a folded panel has no separator.
- Existing toggles open folded panels in the existing Sheet. Edge placements reuse Radix's modal,
  Escape, outside dismissal, back handling and focus logic. Panel content is shared with the docked view.
  Titles are hidden, close buttons are first and have 44 px targets, and overlays have no grab handle.
- Edge panels use their stored width, capped at shell width minus 52 px, and the shell's bounds.
  They slide from their own edge. Sheet disables animation with reduced motion or Bower moves off.
- Folding and reopening never call the prefs setter. Widening dismisses an open overlay and docks it.
  Closing or docking returns focus to the opener; folding a focused panel focuses its existing toggle.
  Navigation dismisses the sheet to the new heading, including navigation to the same pathname.
  Dismissed overlays cannot reopen when browser Back returns to their previous location key.
- IconButton accepts React 19's ref prop, matching Button's existing ref support.

Research and citation:
- The packet's Material 3 canonical list-detail guidance is the responsive multi-pane reference:
  https://m3.material.io/foundations/layout/canonical-layouts/list-detail
  Retain useful page space and adapt secondary panes when available width cannot accommodate them.
  The exact 560 px rule, folding order and overlay geometry come from the signed packet.
- Before adding reds, inspected the installed `@radix-ui/react-dialog` README and implementation
  (`dist/index.mjs`, DialogContentModal / DialogContentImpl), together with Sheet and `ui/focus.ts`.
  The standard overlay implementation already provides focus trapping, Escape and outside dismissal.
  Reused it rather than creating another overlay mechanism:
  https://www.radix-ui.com/primitives/docs/components/dialog
- Focus restoration follows WAI-ARIA APG modal-dialog guidance, already cited by `ui/focus.ts`:
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  Close returns focus to the invoking control; navigation may move it to the logical next destination.
- Research was offline, using the installed library and existing implementation; no network access,
  remote documentation fetch or dependency installation was performed. No server was started;
  the broad check's existing listener test was rejected by the sandbox (see below).

removed: unconditional docking from leftOpen/rightOpen and their stored widths.
removed: the desktop grid's zero-minimum page track.
removed: fixed 480 px resizer maxima when the page has less remaining room.
removed: the grab handle for Sheet edge placements only.
removed: no existing tests, components, preferences or features were deleted.

Commit file sets (no git writes or commits by the implementer):
1. red: src/app/DesktopShell.test.tsx; e2e/shell-page-column.spec.ts.
2. fix: src/app/DesktopShell.tsx; src/app/shell.module.css; src/ui/Button.tsx;
   src/ui/Sheet.tsx; src/ui/ui.module.css.
3. notes: docs/harness/2026-10-10-shell-page-column-notes.md.
No src/features files changed; compatibility SHA is not applicable.
All existing test files are untouched. New tests use fake timers; no fixed waits, only or skip markers.

Red evidence:
- `/tmp/spc-red.log`: `pnpm exec vitest run src/app/DesktopShell.test.tsx`, exit 1 before the fix.
- `docked keeps the page column at least 560 px`: expected a function, received undefined.
  Its unchanged signed table checks all five docking results and exact column widths, plus the 560 px floor.
- `dragging and keyboard resizing stop with a 560 px page column`: expected 348, received 480.
  Reproduces the production drag handler overrun with both default panels at 1280 px.
- The focused-panel folding test also failed because the original shell had no ResizeObserver callback.
- `/tmp/spc-loading-red.log`: the added loading-heading test failed before the focus refinement:
  focus stayed on `main`, rather than the heading that arrived later. Sheet now calls the existing
  `focusRouteHeading` rule after modal removal, avoiding a competing route-focus implementation.

Green evidence:
- `/tmp/spc-unit.log`: `pnpm exec vitest run src/app src/ui`, exit 0.
  Includes the exact docking-table and drag/keyboard tests above, focus when folding and docking,
  and navigation from the folded panel to both immediate and asynchronously available page headings.
- `/tmp/spc-tsc.log`: `pnpm exec tsc -p tsconfig.app.json`, exit 0.
- `/tmp/spc-eslint.log`: `pnpm exec eslint src/app src/ui e2e/shell-page-column.spec.ts`, exit 0.
  Component-export warnings remain, including the required docked export; no errors.
- `/tmp/spc-check.log`: `pnpm check` (the package script uses the shared heavy-run lock), exit 1.
  The existing `src/e2e-port.test.ts` test `a server from another worktree is never reused` timed out
  after `listen EPERM: operation not permitted 127.0.0.1`. 139 files / 4229 tests passed in that run.
  The gate stopped at root unit tests; downstream API/runner/build gates and the green mark did not run.
  This broad run preceded the loading-heading refinement. The three requested targeted commands
  were rerun successfully afterward. The port-dependent broad gate was not retried or weakened.
- Read only failures from gate output; git diff --check passes.

Coordinator verification still required:
- `pnpm exec playwright test e2e/shell-page-column.spec.ts --project=desktop` through the heavy-run lock.
  E2E was not run because this worker cannot open ports.
- The demo spec covers the signed widths; one-line List/Table labels; toggle labels and aria-expanded;
  both edge sheets; first close-button focus and 44 px target; Escape, close button and scrim focus return;
  redocking with unchanged saved prefs; folding focused panels; navigation to a folder and linked note;
  current aria-valuemax and pointer/keyboard clamping; Bower moves and reduced motion independently.
  Axe uses ./axe with WCAG 2.2 and target-size enabled for main and the open dialogs, as existing specs do.
  The existing shell's unrelated tab-strip targets are outside this axe scope.
- Fresh review and designer UI verification remain coordinator work.
