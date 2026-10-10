# e2e-resize-helper implementation (2026-10-10)

implementer: codex

Implemented lead ruling (b) from the empty-note-help-flaky diagnosis. Product code is unchanged.

## Mechanism and scope

`e2e/viewport.ts` owns `resize(page, size)`. It imports `DESKTOP` directly from
`src/ui/media.ts` and extracts its minimum pixel width, rejecting an unexpected query format.
There is no separate breakpoint value to drift. At 900px the target is desktop.
After setting the size, about:blank and same-side changes return without shell assertions.
For a loaded page crossing the breakpoint (or an unknown previous viewport), web-first
assertions prove the target shell is visible and the other shell's landmark is absent.
Desktop uses the exact Open tabs navigation. Phone uses the exact Main navigation
containing the exact Files link; Main alone also exists on desktop.
Both locators include accessibility-hidden elements so a modal cannot make the old
shell appear absent. Visibility is still asserted for the target's actual layout.
`animationsEnd` retains its existing purpose.

The grep found 29 direct calls in 15 specs. All now use the helper, including the four
diagnosis sites and additional cross-breakpoint loops in folder-table and no-new-note,
and the c4-segmented-one phone-to-desktop change. Initial and same-side calls also
move mechanically to allow a simple ESLint guard rather than fragile control-flow analysis.
The shell-page-column 900-to-1440 and reverse calls remain same-side; their existing
focus and panel assertions continue to settle the separate docking changes.

The guard uses ESLint's built-in no-restricted-properties on e2e specs. Its fixture
test checks direct and computed property calls, permits viewport.ts, and permits resize.
It never scans the repository inside Vitest. No existing assertion, threshold, timeout,
or skip changed. A read-only comparison against HEAD confirmed that each spec diff
contains only the helper import and viewport-call substitutions.

## Sources (offline)

Standard approach: prove observable shell state with retrying locator assertions before
non-retrying layout reads, as recommended in the diagnosis's Playwright references:

- [Playwright auto-waiting](https://playwright.dev/docs/actionability)
- [Playwright web-first assertions](https://playwright.dev/docs/best-practices#use-web-first-assertions)
- [Playwright assertions](https://playwright.dev/docs/test-assertions)

No network was used. The diagnosis provided the web-first reference; the installed
`node_modules/@playwright/test/README.md` also describes auto-waiting and web-first assertions.
The URLs above are citations, not a claim that their live pages were fetched.

## Tests changed

tests changed: e2e/c4-new-pill-one.spec.ts: route initial viewport setup through the guarded helper.
tests changed: e2e/c4-segmented-one.spec.ts: settle the loaded phone-to-desktop swap and route initial setup through the helper.
tests changed: e2e/empty-note-help.spec.ts: settle the shell swap before boundingBox reads; preserve all layout assertions.
tests changed: e2e/folder-table.spec.ts: settle the cross-breakpoint loop before reopening the folder.
tests changed: e2e/no-new-note.spec.ts: settle the desktop-to-phone loop before reopening files.
tests changed: e2e/qa10.spec.ts: route initial viewport setup through the guarded helper.
tests changed: e2e/qa6.spec.ts: route initial viewport setup through the guarded helper.
tests changed: e2e/qa7.spec.ts: route initial viewport setup through the guarded helper.
tests changed: e2e/qa9.spec.ts: route both initial viewport setups through the guarded helper.
tests changed: e2e/shell-page-column.spec.ts: use the helper at both diagnosis sites and initial setup; retain docking/focus assertions.
tests changed: e2e/v2-dock.spec.ts: route initial and same-side viewport setup through the guarded helper.
tests changed: e2e/v2-move-here.spec.ts: route initial viewport setup through the guarded helper.
tests changed: e2e/v2-name-sheet.spec.ts: settle the phone-to-desktop swap with the name sheet open before measuring; route initial setup.
tests changed: e2e/v2-still-marks.spec.ts: route initial viewport setup through the guarded helper.
tests changed: e2e/v2-targets.spec.ts: route initial viewport setup through the guarded helper.

## Verification and delivery

- Red: `src/e2e-viewport.test.ts` / `e2e viewport changes go through the shell-settling helper`
  failed on `toHaveLength(1)`, receiving zero diagnostics before the ESLint guard.
  Log: `tmp-logs/e2e-resize-helper-red.log`.
- Green: the same fixture test passed after the guard.
  Log: `tmp-logs/e2e-resize-helper-unit.log`.
- `pnpm exec tsc -p tsconfig.node.json`: passed, covering e2e and the shared breakpoint import.
  Log: `tmp-logs/e2e-resize-helper-tsc.log` (empty on success).
- `pnpm exec tsc -p tsconfig.app.json`: passed, including the new guard fixture test.
  Log: `tmp-logs/e2e-resize-helper-app-tsc.log` (empty on success).
- ESLint on all touched TypeScript files and eslint.config.js: passed.
  Log: `tmp-logs/e2e-resize-helper-eslint.log` (empty on success).
- Full check: attempted via `pnpm check`, then interrupted while waiting for the
  shared heavy-run lock held by another session. No check gate ran, and no green
  mark was written. Coordinator must run it when the shared lock is available.
  Log: `tmp-logs/e2e-resize-helper-check.log`.
- E2E and the diagnosis's 20-repeat live red/green probe were not run: the owner
  forbids worker e2e and ports. Coordinator must run the touched specs on demo/fake,
  phone/desktop, plus the fake 1440px empty-note check with `--repeat-each=20`.
  Fixture coverage proves the guard, not the browser shell swap.
- No git command that writes was run. No commit was made; the coordinator commits.
  Keep this notes file in its own commit per WORKER.md; local tmp-logs are evidence,
  not source files to commit.
