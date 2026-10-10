# empty-note-help-flaky: diagnosis (2026-10-10)

Defect: [DEFECT_LOG.md](DEFECT_LOG.md) `empty-note-help-flaky`. Diagnoser: read-only, on `claude/p3` 4fa5f6b7. **Test-only defect; the product is right.**

## What failed

`e2e/empty-note-help.spec.ts:29` ("at 1440px") throws `Empty-note help or action has no box.`: `help.boundingBox()` or `action.boundingBox()` returned `null` after both `toBeVisible()` checks passed.

Reproduced (output in `/tmp/enh-diag*.log`, load 5-10):

| Run | Result |
| --- | --- |
| demo, phone, 1440 only, `--repeat-each=20` | 0/20 failed |
| fake, phone and desktop, 1440 only, `--repeat-each=20` | phone **3/20** failed (all "has no box"), desktop 0/20 |

Probe: a scratch copy of the spec, not committed, run 20 times on phone (demo). It marks the phone shell's help `<p>` and records when it leaves the DOM:

- Right after `setViewportSize` returned, `matchMedia('(min-width: 900px)').matches` was already true in 20/20 runs, but the phone copy was still attached in 15/20.
- The phone copy was still attached after `await expect(help).toBeVisible()` in **11/20** runs, and after `animationsEnd` in **1/20**.
- The swap came 30-45 ms after `setViewportSize` returned.

## Why (5 whys)

1. **Why null?** `Locator.boundingBox` first resolves the element (`waitForSelector`, state `attached`). Then it asks Chromium for `DOM.getBoxModel` through `_sendMayFail`, which returns `null` when the node is detached or has no layout box. Verified in `node_modules/.pnpm/playwright-core@1.63.0/.../lib/coreBundle.js` (`_withElement`, `_getBoundingBox`). The docs say the same: [locator.boundingBox](https://playwright.dev/docs/api/class-locator#locator-bounding-box), "null if the element is not visible".
2. **Why was it detached?** The element resolved was the **phone shell's** copy. When the width crosses 900 px, `Shell` swaps `PhoneShell` for `DesktopShell` (`src/app/Shell.tsx:45`). That unmounts the whole `<Outlet/>`, `NoteView` included, and mounts a new tree. A handle taken before the swap goes stale.
3. **Why was the phone copy still there after the waits?** `page.setViewportSize` returns once Chromium accepts the metrics override (coreBundle `_updateViewport`). The `change` event that `useMedia` subscribes to (`src/ui/media.ts:7-15`) fires only at the next rendering step ([HTML, update the rendering, "evaluate media queries and report changes"](https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering)): 30-45 ms later in the probe, and later under load.
4. **Why did the test not wait for it?** Every wait between the resize and the measurement is also satisfied by the phone copy: `toBeVisible` on the help and on `main`'s button, and `animationsEnd` (`e2e/axe.ts:21`, which waits for animations only). Nothing in the test asserts that the desktop shell has taken over. So the one-shot read (`boundingBox`) races the swap.
5. **Design cause:** the e2e suite has no single way to change the viewport mid-test that waits until the app's breakpoint has taken effect. Each spec calls `page.setViewportSize` directly and has to know that crossing 900 px remounts the page. Playwright's standard is to prove a state with a web-first, auto-retrying assertion before taking a non-retrying read ([best practices, web-first assertions](https://playwright.dev/docs/best-practices#use-web-first-assertions)). Here the state to prove is "the desktop shell is mounted", and nothing proves it.

Why only phone, and more often on fake: **unverified**. It is likely that the Pixel 7 emulation (`isMobile`, scale 2.625) and the fake's heavier render make the frame after the resize slower, which widens the window.

## Owner mechanism

None in the [mechanism map](../ARCHITECTURE.md#mechanism-map). The cause is the spec's own sequence. The nearest homes:

- `src/ui/media.ts` `DESKTOP`: the one home of the 900 px breakpoint. It is correct.
- `e2e/axe.ts` `animationsEnd`: the one e2e settle helper. Its job is animations, not breakpoints, so it should not grow a breakpoint wait.

## Same class elsewhere

There are 29 `setViewportSize` calls in `e2e/`. Almost all come before the first `goto` or `open`, so no page is mounted yet and there is no race. Mid-test switches:

- `e2e/shell-page-column.spec.ts:93-96, 101-103`: already correct. After the resize, a web-first assertion on a control that only the target layout has (`toBeFocused` on "Hide the side panel"). This is the pattern to copy.
- `e2e/v2-name-sheet.spec.ts:28-34` (desktop project, 375 → 1440 with the sheet open): `toBeFocused`, then a one-shot `evaluate` of widths. `NameSheet` is mounted outside the swap (`Shell.tsx:50`), and `Sheet` switches layout by CSS (`src/ui/Sheet.tsx:26`), which applies at once. So there is probably no detach. **Unverified, low risk.**

Class count at risk: this spec, plus 1 low-risk site.

## Options

- **(a) Fix in the spec (test-only).** After `setViewportSize` at line 21, when `width >= 900`, assert the desktop shell first: `await expect(page.getByRole('navigation', { name: 'Open tabs', exact: true })).toBeVisible()`. That nav exists only in `DesktopShell.tsx:205`. This is the same move as `shell-page-column.spec.ts:94`. Size: 1-2 lines. Risk: very low. It leaves the class unguarded.
- **(b) Refactor first, then fix.** Extract the inline pattern into one e2e helper: `e2e/viewport.ts` `resize(page, size)` sets the size and, when a page is loaded, waits with a web-first assertion for the target shell. Desktop: "Open tabs" visible. Phone: "Open tabs" count 0, because both shells label their nav "Main". Then move `empty-note-help.spec.ts:21`, `v2-name-sheet.spec.ts:28` and `shell-page-column.spec.ts:93,101` to it. Size: a ~15-line helper and 4 call sites. Risk: low. **Recommended.** It makes the existing pattern the one way to do this, not a second way.
- **(c) New mechanism (product).** Keep one page tree across the breakpoint: render `<Outlet/>` once and let the shells wrap it. Size: large (Shell, DesktopShell, PhoneShell, focus and overlay rules). Risk: high. **Not recommended.** Resizing across 900 px is rare in normal use, and the remount loses nothing that was saved.

Rejected: wrapping the reads in `expect(...).toPass()` or adding a retry. Either would hide the race instead of proving the state.

## Regression test and red

- **Red:** the probe's assertion, "right after `toBeVisible(help)` the phone shell's copy is gone", fails 11/20 on phone before the fix and must pass 20/20 after. The live symptom: `E2E_SOURCE=fake ... -g 1440 --repeat-each=20` fails 3/20 on phone today and must pass 0 failed after.
- **Class test (for b):** a check-harness grep that allows `page.setViewportSize(` only in `e2e/viewport.ts`, so every mid-test resize goes through the helper that waits for the shell. The pre-`goto` calls also move to the helper, which skips the wait on `about:blank`. That adds about 25 mechanical call sites. Otherwise the rule can be scoped to calls after the first `goto` or `open`, which is harder to grep.
