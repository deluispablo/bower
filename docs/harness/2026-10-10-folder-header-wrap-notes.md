# folder-header-wrap implementation notes

implementer: codex

Entry: folder-header-wrap. Ruling: DECISIONS "DEFECTS folder-table-header-wrap".

Changed:
- Added `e2e/folder-table.spec.ts`, with the exact verify test name
  `folder table headers stay on one line and the table scrolls sideways`.
- The test opens demo Flat hunt through the folder route and boot check used by
  `e2e/v2-targets.spec.ts`, selects Table through the View controls, and uses its
  shared main-scoped WCAG 2.2 axe check.
- Each configured project runs both explicit viewports: 375x812 and 1280x800.
  Every header button must be at most 48 px high. Bedrooms and Commute cells
  must be at least their labels' natural width. A temporary hidden, unwrapped
  span copies the button font and letter spacing; a Range measures its text,
  and the span is removed in a finally block. This avoids measuring an already
  wrapped label as if it were its natural width. At 375, the table wrapper must
  have scrollWidth greater than clientWidth. Fonts and finite animations settle
  before measurement; no fixed waits, skips or exclusive tests were added.
- Added only `white-space: nowrap` to the existing `.table th` CSS rule.
  The existing table wrapper owns horizontal scrolling. No other product change.

Standard references (offline citations; no network requests made):
- CSS white-space: https://developer.mozilla.org/en-US/docs/Web/CSS/white-space
  `nowrap` suppresses text wrapping and is inherited by the header button.
- CSS overflow-wrap: https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap
  `anywhere` provides break opportunities that affect min-content sizing;
  preventing header wrapping preserves the label's unbroken width.
- Automatic table layout: https://www.w3.org/TR/CSS2/tables.html#auto-table-layout
  Column sizing accounts for minimum cell widths. Keeping header labels intact
  lets the existing overflow-x wrapper handle a table wider than its container.

tests changed: e2e/folder-table.spec.ts: new regression test; no existing tests modified.
removed: none

Validation:
- `pnpm exec tsc -p tsconfig.app.json > /tmp/fhw-tsc.log 2>&1`: exit 0.
- `pnpm exec tsc -p tsconfig.node.json > /tmp/fhw-e2e-tsc.log 2>&1`: exit 0.
  This configuration includes e2e and the Playwright configuration.
- `pnpm exec eslint e2e/folder-table.spec.ts > /tmp/fhw-eslint.log 2>&1`: exit 0.
- Red and green e2e execution were not run: this session cannot open ports.
  The coordinator must run the exact named test on demo, in phone and desktop,
  after the red commit and again after the fix commit. No assertion failure or
  passing browser result is claimed here.
- `pnpm check` and full browser gates remain with the coordinator under the
  session's restricted validation instructions. No git write commands were run.

Coordinator commit order (separate file sets):
1. Red: `e2e/folder-table.spec.ts`.
2. Fix: `src/features/files/folder.module.css`.
3. Notes: `docs/harness/2026-10-10-folder-header-wrap-notes.md`.

Left out: none within the implementation contract; runtime evidence is pending.

compatibility: ce1eb3cd
