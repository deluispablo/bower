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

## Fix round 1

Fresh Codex implementer session; P4-75 Important finding and three Minor findings.
Coordinator commits. No git command that writes, network request, server or e2e run was performed.

Findings:
- Sheet applied its still rule to centred and bottom callers, breaking their existing animation.
  Its preference import crossed the UI boundary, and its JS reduced-motion subscription duplicated base.css.
- The shell started at width zero and waited for ResizeObserver before establishing docking.
  With a delayed observer, the page first mounted with both panels folded at every signed width.
- Route dismissal called setOverlay during render.

Changes:
- Sheet accepts a still prop, default false. Only edge placements suppress dialog and scrim animation.
  DesktopShell passes !birdMoves. Sheet no longer reads app preferences or subscribes to reduced motion.
  The existing global base.css reduced-motion duration rule remains the only reduced-motion mechanism.
- The existing shell layout effect immediately measures its own element, then subscribes to ResizeObserver.
  An unmeasured shell mounts only its frame; its page and panels first mount with the signed docking state
  before paint, without waiting for the observer. No viewport-width approximation is used.
  The tab scroll effect also runs when the measured page first mounts.
- Route-key effect cleanup invalidates the previous route's open overlay. The existing derived overlaySide
  closes it immediately on navigation and retains the navigation reason for Sheet's heading-focus hook.
  Back to the original route cannot reopen the dismissed overlay. No render-phase setter remains.
- Added the exact animation regression test, edge-prop tests, and first-page-render tests at all five widths.
  A delayed observer and shell-element rect reproduce real initial measurement ordering; Profiler captures
  every mounted page commit. The initial observer delivery preserves the Explorer's mounted button.
  Added production-shell tests for motion preference wiring and navigation followed by Back.
  Existing assertions, tolerances and table values are unchanged. All timer advances use fake timers.

Research (offline, before the fix):
- Inspected the installed react-dom client implementation's flushLayoutEffects / commitLayoutEffectOnFiber
  path. React's standard solution for measuring layout before paint is useLayoutEffect:
  https://react.dev/reference/react/useLayoutEffect
- Route lifetime cleanup uses the existing effect lifecycle, with immediate visibility derived from the
  location key. React effect cleanup runs for the old dependency value before setup for the new value:
  https://react.dev/reference/react/useEffect
- Reused base.css:104 rather than introducing a second reduced-motion mechanism.
  Official URLs are citations only; no remote documentation was fetched in this offline session.

removed: Sheet's import of @/app/prefs and subscription to birdMoves.
removed: Sheet's useMedia import and duplicate JS prefers-reduced-motion check.
removed: animation suppression for Sheet callers without an edge placement.
removed: the shell's synthetic initial width-zero page render and wait for first observer delivery.
removed: render-phase setOverlay for route dismissal.
removed: no existing assertion, test, component, preference or feature was deleted.

tests changed: src/app/DesktopShell.test.tsx: added regressions and imports; all existing tests and assertions unchanged.

Files per coordinator commit:
1. red: src/app/DesktopShell.test.tsx; src/ui/Sheet.test.tsx.
2. fix: src/app/DesktopShell.tsx; src/ui/Sheet.tsx.
3. notes: docs/harness/2026-10-10-shell-page-column-notes.md.
No src/features files changed; compatibility SHA is not applicable.

Red evidence:
- /tmp/spc-r1-red.log: pnpm exec vitest run src/app/DesktopShell.test.tsx src/ui/Sheet.test.tsx; exit 1.
- a Sheet without placement keeps its animation when Bower moves is off:
  expected the inline animation to be empty (leave the CSS animation in force), received none.
- the first shell page render docks at 1024 / 1100 / 1280 / 1440 px without a fold-then-dock flip:
  expected the signed table, received both panels folded. The 900 px case already passed.
- an edge Sheet at left / right uses only the supplied still prop:
  expected animation to remain enabled with still=false, received none from the internal preference read.
- Seven assertions failed; the existing shell tests remained green.

Green evidence (final code):
- /tmp/spc-r1-unit.log: pnpm exec vitest run src/app src/ui; exit 0.
  Includes the exact reds above, all five first-render cases, production-shell motion wiring and route Back.
- /tmp/spc-r1-tsc.log: pnpm exec tsc -p tsconfig.app.json; exit 0.
- /tmp/spc-r1-eslint.log: pnpm exec eslint src/app src/ui; exit 0.
- Read only failures from command logs. git diff --check passes.
- An intermediate tsc run found an indexed CSS-module class possibly undefined; the new test now guards
  the class before its unchanged assertion. An intermediate eslint run rejected a synchronous effect-body
  setter; route-lifetime cleanup replaced that setter. Final commands above were rerun after these fixes.
- pnpm check was not rerun: its existing listener test opens a port, forbidden in this session
  (the previous implementation notes record its EPERM failure). The requested three targeted gates passed.

Coordinator verification and assertion conflict:
- Rerun e2e/shell-page-column.spec.ts on demo and fake; this session cannot open ports.
- The existing reduced-motion branch at e2e/shell-page-column.spec.ts:141 expects animationName=none
  with birdMoves=true. After the required removal of the JS check, base.css keeps the edge animation name
  and applies animation-duration:0.01ms !important. That existing assertion conflicts with the review's
  direction to use the global reduced-motion mechanism. This is a static finding; e2e was not run.
  No assertion was loosened or changed, and no duplicate CSS/JS reduced-motion mechanism was added.
  The coordinator/lead must resolve that expectation before the e2e gate can be accepted.
