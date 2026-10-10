# c4-sheet-settle

red: none (flaky timing); proof: repeat runs

## Changes

- e2e/v2-move-here.spec.ts:2 imports the existing animation and axe helpers.
- e2e/v2-move-here.spec.ts:34 settles animations before each move-row box read.
- e2e/v2-move-here.spec.ts:54 uses expectAxeClean with the same dialog scope, WCAG tags and target-size rule.
- e2e/v2-move-here.spec.ts:63 and :65 settle before each Cancel/container box read.
- e2e/v2-name-sheet.spec.ts:6 imports animationsEnd; :48, :67, :80 and :112 settle before all geometry reads.
  Its axe scans already use expectAxeClean through axeClean and remain unchanged.
- e2e/qa5.spec.ts:6 imports animationsEnd; :291 settles the tidy-up sheet before the geometry/hit-test read.
  This is the additional sheet-related geometry risk found by the audit, including getBoundingClientRect reads.

Every bound and assertion is preserved, including the shared axe helper's identical violation assertion.
No retries, product changes, commits or writing git commands.

## Tests changed

tests changed: e2e/v2-move-here.spec.ts: the move sheet shows where the thing is now and it cannot be chosen: settle row geometry and use shared axe scan.
tests changed: e2e/v2-move-here.spec.ts: the move sheet has a cancel that returns focus to its opener: settle both box reads.
tests changed: e2e/v2-name-sheet.spec.ts: the rename field spans the sheet and selects the name: settle desktop/phone field and button geometry.
tests changed: e2e/v2-name-sheet.spec.ts: new note from a folder uses the name sheet: settle field geometry.
tests changed: e2e/qa5.spec.ts: one bird on screen when a tidy-up ends: settle the dialog before geometry and hit testing.

## Geometry audit

Searched all e2e specs for boundingBox, getBoundingClientRect, offsetWidth and clientWidth.
Additional changed spec: qa5.spec.ts, listed above.
v2-field.spec.ts already settles sheet fields through checkField; its other reads measure a note checkbox and a sort menu.
c4-segmented-one.spec.ts, v2-boot-states.spec.ts, inbox-first.spec.ts, qa10.spec.ts,
v2-targets.spec.ts and v2-dock.spec.ts measure page, boot, menu, dock or navigation controls,
not geometry after opening an animated sheet. qa10 measures its opener before opening the sheet.
qa5's other geometry test measures the Demo pill on ordinary pages.
No additional unsettled sheet geometry reads found.

## Verification

- pnpm exec tsc -p tsconfig.app.json: pass (exit 0); /tmp/c4-sheet-settle-tsc.log.
- pnpm exec eslint e2e/v2-move-here.spec.ts e2e/v2-name-sheet.spec.ts e2e/qa5.spec.ts: pass (exit 0);
  /tmp/c4-sheet-settle-eslint.log.
- git diff --check: pass.
- Playwright and pnpm check not run: owner restricts this worker to tsc/eslint; ports denied.
  Coordinator runs both primary specs on desktop with --repeat-each=3 under the heavy-run lock,
  and the touched qa5 test as appropriate. Repeat-run proof remains pending.

## Sources

Reused e2e/axe.ts::animationsEnd and expectAxeClean, as ruled in the packet and diagnosis.
The diagnosis cites Playwright visibility versus stability:
https://playwright.dev/docs/actionability#visible
The shared helper documents the standard Animation.finished promise:
https://developer.mozilla.org/docs/Web/API/Animation/finished
No network used; references come from the provided diagnosis and existing helper.
