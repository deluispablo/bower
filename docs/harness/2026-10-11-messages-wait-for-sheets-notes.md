# messages-wait-for-sheets — red handoff

implementer: codex

Scope: TL-P4-55, test-only red ownership. No implementation, network, git writes, ports, or node_modules changes.
Coordinator owns commits and browser execution. All generated test output is outside the repository.

tests changed: src/ui/dock.test.tsx: added seven real Dock/Sheet lifecycle reds; added fake-timer/history cleanup.
tests changed: src/ui/toast.test.ts: added three no-sheet positive controls for expiry and independent holds.
tests changed: e2e/messages-wait-for-sheets.spec.ts: new demo/fake matrix at 375 and 1440, plus phone sign-out.
Existing assertions: unchanged. Existing targeted tests: all five pass.
Contradicting existing assertions: none found in the targeted unit suite or the referenced browser baselines.

## Exact unit names and observed red assertions

- MWS a message on screen disappears while a sheet is open
  - Red: the message remains visible while the real modal is open.
  - Positive: message/action visible before open, same identity/action retained, run chip unaffected, usable on close.
- MWS the sheet closes and the plain message resumes with its remaining time
  - Red: the message expires during the 30,000 ms sheet interval.
  - Positive: visible first; after 1,000 ms used, close must leave exactly 2,999 + 1 ms of its 4,000 ms.
- MWS the sheet closes and the action message resumes with its remaining time
  - Red: the message expires during the 30,000 ms sheet interval.
  - Positive: visible first; after 1,000 ms used, close must leave exactly 6,999 + 1 ms of its 8,000 ms.
- MWS timers resume only when the last sheet closes
  - Red: the message expires with the first modal still open after the second closes.
  - Positive: both real modals open sequentially; first remains; final close restores exactly 2,999 + 1 ms.
- MWS a message raised while a sheet is open waits to show and be announced
  - Red: the message is visually visible immediately inside the open-modal interval.
  - Positive: actual stack id is present; final close exposes polite status and a full 3,999 + 1 ms lifetime.
- MWS messages raised during a sheet keep three at most and drop the oldest
  - Red: the retained three expire during the 30,000 ms sheet interval.
  - Positive: One shows first; Two/Three/Four retained in order before waiting and after close; One stays dropped.
- MWS pointer and keyboard holds released during a sheet cannot restart expiry behind it
  - Red: releasing both holds starts expiry while the real sheet is still open.
  - Positive: initial holds protect the visible action; after close actual mouse/focus events protect it;
    leaving only the pointer keeps the keyboard hold; final release preserves the existing 7,999 + 1 ms restart.

## Exact unit positive controls

- MWS no sheet open keeps the usual four and eight second message lifetimes
- MWS no sheet open keeps the existing pointer hold
- MWS no sheet open keeps the existing keyboard hold

These pass on the current build. They assert initial membership and exact expiry boundaries, not an empty-stack success.
The original two Dock tests and three toast tests also pass. The original hold contract restarts time after release;
that is preserved, rather than replacing it with a new remaining-time rule for pointer or keyboard holds.

## Exact browser names

The first six names run in each explicit source/width cell: demo 375, demo 1440, fake 375, fake 1440.
They inherit existing Playwright projects; there are 26 declarations / 52 project cases, with no skipped cases.

- MWS a message on screen disappears and nothing covers an open sheet
- MWS the sheet closes and the message returns to its usual place
- MWS an answer completing while a sheet is open waits to show
- MWS no sheet open keeps messages exactly in the usual dock
- MWS reduced motion makes the message reappear in place
- MWS axe WCAG 2.2 passes with a sheet open and after it closes
- MWS Sign out now at 375 after adding a pile reads whole (demo)
- MWS Sign out now at 375 after adding a pile reads whole (fake)

Positive controls: Add's actual message and action first show; actual dialog and controls mount; text ranges and
button centres supply nonzero hit-test samples. Raw DOM visibility catches visually painted messages even when
Radix hides the underlying page from accessibility. Three samples across every rendered text line plus controls
must lie in the viewport and hit the sheet. Restoration compares pre/post boxes within the existing 1 px tolerance.
No-sheet placement retains the existing 16/359 px phone edges, 12 px tab gap and 520 px desktop maximum.
Reduced motion checks the existing 0.01 ms global ceiling and no transform. WCAG scans use the existing helper,
whole-page scope, WCAG 2.2 AA and enabled target-size, without exclusions. Browser clock resumes for axe scheduling.

Answer ingress: this frozen worktree has Home's question controls, not Q1b's future tidy-sheet question cards.
The browser test starts the real Home answer and opens the tidy sheet in the same JavaScript task, before the
asynchronous answer completes; disappearance of the actual question proves completion. No app hook or mocked
answer is introduced. Unit coverage also raises the production toast directly while the real Sheet is open.
Sign-out uses c02-upload-reload's existing Web Locks strategy to keep two synthetic PDFs waiting; it only opens
"Sign out now?", reads every body line, and never confirms sign-out or clears the upload queue.

## Verification

Final targeted run: 15 tests, 7 expected assertion failures, 8 passes, no suite/import/timer-gate failures.
Command: pnpm exec vitest run src/ui/dock.test.tsx src/ui/toast.test.ts --maxWorkers=2
         --config /private/tmp/mws-red-2bbfek65/vitest.config.mts --configLoader runner --reporter=default
Log: /private/tmp/mws-red-2bbfek65/vitest.log

The temporary config keeps the repository Vite configuration and both setup behaviours, moves Vite's cache into
OS temp, and uses an OS-temp copy of timer-gate-setup with only import/output paths adjusted. Timer-gate checks
remain active; its CPU reports go to /private/tmp/mws-red-2bbfek65/cpu. No generated reports go into test-results.
An initial temporary setup under the OS's /var alias failed module resolution; the final canonical /private/tmp
config fixes that. A simultaneous two-modal fixture initially hid both from the accessibility tree; opening them
sequentially, as in the app, fixes that fixture issue. Final failures are solely the missing wait/hide rule.

ESLint: pass. Log: /private/tmp/mws-red-2bbfek65/eslint.log
App TypeScript (tsc -p tsconfig.app.json --incremental false): pass. Log: /private/tmp/mws-red-2bbfek65/tsc-app.log
Node/e2e TypeScript (tsc -p tsconfig.node.json --incremental false): pass. Log: /private/tmp/mws-red-2bbfek65/tsc-node.log
E2E: written, not run; this session cannot bind ports. Coordinator runs the matrix and referenced baselines.
pnpm check: not run in this red-only assignment; it writes repository outputs and expects implementation green.

## Standard basis and reused helpers

Offline only. The owner-approved spec cites the WAI-ARIA modal dialog pattern:
https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
That explains why modal-external actions and announcements wait. Existing production Sheet/Radix and Dock are
rendered, not replaced with a second overlay registry. Existing toast lifetimes/holds are reused as controls.
Fake timers use the installed Vitest API; browser clock uses the installed Playwright API and existing clock tests:
https://vitest.dev/api/vi.html#vi-usefaketimers
https://playwright.dev/docs/clock
Existing e2e/fixtures.ts, viewport.ts and axe.ts own source setup, viewport settlement and accessibility scanning.
No external page was fetched, and no app code, CSS, z-index, source data, or harness records changed.
