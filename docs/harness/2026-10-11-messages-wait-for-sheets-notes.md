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

## Implementation

Implemented TL-P4-55 in `src/ui/Dock.tsx`, `src/ui/back.ts` and `src/ui/toast.tsx` only.
The existing `useBackCloses` lifecycle publishes an open-overlay count in back.ts, independently of pending
history backs. Its external-store subscription reports whether any overlay is open, including nested sheets.
There is no second registry, DOM query, per-sheet handler or change to Sheet markup or appearance.
Dock owns the rule: it passes visibility to Toasts and pauses the existing toast expiry mechanism before paint.
The run-chip slot stays rendered. Hidden messages have no action surface or live region; closing the final sheet
restores the retained stack and its existing entrance animation. Existing reduced-motion CSS still governs it.

Expiry records keep each message's remaining time and the start of its active interval. Pausing subtracts only
active time; messages raised or replaced while paused receive their normal lifetime without starting a timeout.
Final close schedules the remaining interval. The existing four/eight-second durations, action promise hold,
identity, replacement, oldest-first ordering and three-message limit remain in the existing toast home.
Pointer and keyboard holds retain their existing restart-on-release contract. Removing their visible surface
releases those holds without returning focus out of the modal; an action hold still waits for its promise.
Dropped or dismissed messages also clear their timer and holder records through the existing dismiss method.

removed: unconditional Toasts presentation in Dock; messages now wait while the overlay home reports open.
removed: timeout-handle-only bookkeeping; remaining time now survives a modal interval.
removed: separate list-only removal in dismissAction and silent oldest eviction; both use dismiss cleanup.
tests changed: none

Standard: WAI-ARIA APG modal dialog, https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/.
The owner-approved spec provides the offline standard basis: content outside a modal is inert.
Dock cites this URL and the reason messages/actions/announcements wait in a code comment. No network was used.

Verification (all logs and generated test artifacts are in OS temp):

- Before implementation: the committed targeted suite reproduced all seven missing-rule assertion failures;
  its eight positive/existing controls passed. Log: `/private/tmp/mws-implementation-red.log`.
- After implementation: all 15 targeted tests passed, including every exact MWS unit name listed above.
  Command: `pnpm exec vitest run src/ui/dock.test.tsx src/ui/toast.test.ts --maxWorkers=2
  --config /private/tmp/mws-red-2bbfek65/vitest.config.mts --configLoader runner --reporter=default`.
  Log: `/private/tmp/mws-implementation-targeted.log`.
- Full src suite: 5,699 passed; one expected failure in `src/e2e-port.test.ts:37` (169 files passed, one failed).
  `a server from another worktree is never reused` times out because its server cannot listen; the associated
  uncaught error is `listen EPERM: operation not permitted 127.0.0.1`. No other tests failed. All UI tests passed,
  including Dock, Sheet, toast focus, Undo and replacement coverage. This matches the assignment's expected EPERM.
  Command: `pnpm exec vitest run src --maxWorkers=2
  --config /private/tmp/mws-red-2bbfek65/vitest.config.mts --configLoader runner --reporter=default`.
  Log: `/private/tmp/mws-implementation-src.log`.
- App TypeScript: pass (`pnpm exec tsc -p tsconfig.app.json --incremental false`).
  Log: `/private/tmp/mws-implementation-tsc-app.log`.
- Node/e2e TypeScript: pass (`pnpm exec tsc -p tsconfig.node.json --incremental false`).
  Log: `/private/tmp/mws-implementation-tsc-node.log`.
- ESLint: pass (`pnpm exec eslint src/ui/Dock.tsx src/ui/toast.tsx src/ui/back.ts`).
  Log: `/private/tmp/mws-implementation-eslint.log`.
- Unused-code gate: pass (`node scripts/check-unused-gate.mjs`), both normal and production baselines unchanged.
  Log: `/private/tmp/mws-implementation-unused.log`.

The pre-existing OS-temp Vitest config from the red handoff is reused unchanged. It retains the repository
configuration and both setup behaviours, relocates Vite's cache and CPU reports to OS temp, and keeps the
timer gate active. No tests, node_modules, CSS, z-index, feature files or shared harness records were changed.
No git-writing command was run; the coordinator owns the fix and notes commits.
`pnpm check` was not run because its generated outputs write into the repository, contrary to this assignment.
E2E was not run: the coordinator owns the new matrix and v2-dock/v2-name-sheet baselines, followed by designer
verification before closure. No contradictions were found in the targeted acceptance assertions.

## E2e repair
Cause: spec mechanics, not the implementation. The installed clock runs in real time, so `pauseAt(Date.now() read from the page)` was already past on arrival ("Cannot fast-forward to the past"); the expectUncovered failures were the same race (a sheet opened under a half-paused clock) and did not recur.
Fix: fixed install time as in v2-boot-states, `pauseClock` pauses 500 ms ahead (nothing is due in it); no src change.
tests changed: e2e/messages-wait-for-sheets.spec.ts: clock pause made deterministic; source and width loops dropped (fixtures add source, phone/desktop projects give width); 375 edges now relative to the project's phone width; sign-out row skips on desktop
removed: the in-spec `for source` and `for width` loops and `resize`; no assertion or positive control removed
Gates: new spec 3x green on demo and fake (13 passed, 1 skipped each); v2-dock and v2-name-sheet 5 passed; vitest src/ui 48 passed. Logs /tmp/mws2.

## Fix round 1 red

Designer finding: P4-115 minor 1. The Dock's polite status region unmounts while a sheet is open,
then remounts already holding the message. This red requires the same DOM node before, during and after
the real Sheet lifecycle. The hidden-role query includes Radix's inaccessible background, so accessibility
tree hiding cannot be mistaken for unmounting. Soft identity assertions check both open and closed states.
Positive controls: the message is visible before opening, hidden during the sheet, and visible after closing.

tests changed: src/ui/dock.test.tsx: added one status-region DOM identity red with message visibility controls.
Existing tests and assertions are unchanged. Only the test file and these notes changed.

Exact test: `MWS the status region stays mounted while a sheet is open`.
Command: `pnpm exec vitest run src/ui/dock.test.tsx src/ui/toast.test.ts --maxWorkers=2
--config /private/tmp/mws-red-2bbfek65/vitest.config.mts --configLoader runner --reporter=default`.
Log: `/private/tmp/mws-fix-round-1-red.log`.
Result: 16 tests, 15 pass, this one fails only on the unmount/remount identity assertions:
open returns null instead of the original status node; close returns a new node instead of that original.
All positive controls pass; no import, setup or timer-gate failures. No contradicting existing tests found.
Reused the existing OS-temp configuration, preserving both setups and the active timer gate;
cache, CPU reports and logs remain outside the repository. No network, git writes or node_modules changes.
No implementation or green gates were run: this assignment authorizes one red only.

Offline standard basis supplied with the finding: MDN ARIA live regions explains that the live region
must exist before its content changes for reliable announcements.
Source: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions

## Fix round 1

Applied review minor 1 in `src/ui/toast.tsx`: the polite status region stays mounted;
only its message children are removed while an overlay is open. Closing the overlay
inserts the retained messages into the existing live region. Hidden messages have
no rendered text or action surface. No CSS or z-index changes.
Applied folded minor 3 in `src/ui/Dock.tsx`: the overlay effect calls pause once per
change; a separate unmount cleanup still releases the pause when Dock goes away.

removed: Toasts' hidden-state null return and consequent status-region remount.
removed: pause(false) cleanup on every overlay-state change; retained unmount cleanup.
tests changed: none

Offline standard basis: the supplied MDN live-region reference above explains that
the region must exist before its content changes. No network was used.

Before the fix, the full requested UI suite reproduced the status-node identity red:
`MWS the status region stays mounted while a sheet is open`, dock.test.tsx:73 and :76.
Result: 48 passed, one failed. Log: `/private/tmp/mws-fix1-before.log`.
After the fix, that identity red passes; the full UI suite has 48 passed, one failed.
Log: `/private/tmp/mws-fix1-ui.log`.
Both runs used `pnpm exec vitest run src/ui --maxWorkers=2` with the existing OS-temp
config and runner config loader, keeping cache and active timer-gate output outside
the repository. No test or setup file was changed.

Contradicting assertion (the whole targeted suite was run; no others found):
`src/ui/dock.test.tsx:133`, `MWS a message raised while a sheet is open waits to show
and be announced`, requires `screen.queryByRole('status')` to return null. The real
Sheet fixture does not hide the newly rendered empty region from that query. The
requested fix keeps this same region mounted and hides only its children, so the
assertion now receives the empty status element. No workaround or test change made.
Per WORKER.md TL-P4-51, delivery is blocked pending a ruling on this assertion.

App TypeScript: pass (`pnpm exec tsc -p tsconfig.app.json --incremental false`).
Log: `/private/tmp/mws-fix1-tsc.log`.
Touched-file ESLint: pass (`pnpm exec eslint src/ui/toast.tsx src/ui/Dock.tsx`).
Log: `/private/tmp/mws-fix1-eslint.log`.
Unused-code gate: pass (`node scripts/check-unused-gate.mjs`).
Log: `/private/tmp/mws-fix1-unused.log`.
No git-writing commands or node_modules changes. Runner owns commits.
pnpm check and e2e were not run under this fix-round assignment; pnpm check writes
repository outputs, contrary to the assignment. All generated output is in OS temp.

## Fix round 1 red repair

tests changed: src/ui/dock.test.tsx: replaced the status-absent assertion at line 133 with a mounted, empty status-region assertion, per P4-115 minor 1 and TL-P4-51.
`getByRole('status', { hidden: true })` requires the region to exist even while the
modal makes the background inaccessible; `toBeEmptyDOMElement()` requires no message
text or children. Every other assertion remains unchanged, including message hiding,
stack retention, polite announcement after close, visibility and exact expiry.

Contradicting assertions searched in all of src/ui and
 e2e/messages-wait-for-sheets.spec.ts:
- src/ui/dock.test.tsx:133, MWS a message raised while a sheet is open waits to show and be announced.
  Repaired as above. No other status-absent assertion while a sheet is open was found.
  The browser helper checks visible message children, not absence of their status parent.

Before repair: full src/ui suite, 48 passed and one failed at dock.test.tsx:133.
Log: /private/tmp/mws-fix1-red-repair-before.log.
After repair: full src/ui suite, 49 passed across 10 files.
Log: /private/tmp/mws-fix1-red-repair-green.log.
Both runs: `pnpm exec vitest run src/ui --maxWorkers=2
--config /private/tmp/mws-red-2bbfek65/vitest.config.mts --configLoader runner --reporter=default`.
Reused the existing OS-temp configuration to retain both setups and the active timer
gate, with cache, CPU reports and logs outside the repository.

Offline standard basis: the supplied MDN live-region reference explains that a region
exists before its content changes:
https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions.
Only this assertion and these notes changed. No network, git writes or node_modules
changes. Runner owns commits. pnpm check and e2e were not run in this assertion-only
repair; repository-writing gates remain outside this assignment.

## Close (coordinator)

done.sh could not take 683d6731 off cleanly: later commits touched the same notes lines. The reds were proved at their tests-only commits.
- The MWS component reds failed on 714b9707 before the fix 372eef51 (notes, red card: 7 expected reds).
- The status-region red failed on 865a221a before 683d6731 (codex-run result messages-wait-for-sheets-2: check failed on it).
After the fix, everything was green on 3d2b1c00: check, plus e2e MWS, v2-dock and v2-name-sheet on demo and fake. Reviews were P4-115 PASS and P4-116 PASS, and the designer verified. Closed with --known-green.
