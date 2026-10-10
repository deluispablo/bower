# c4-e2e-sync implementation

- e2e/qa7.spec.ts:69 waits for the new-folder name textbox in the tree to be focused before keyboard typing.
- e2e/capabilities.spec.ts:254 opens Car through the existing Recent link, preserving the active answer handler.
  The reload-only boot check is removed; the exact answered-row assertion at :257 and its 20_000 timeout are unchanged.

tests changed: e2e/qa7.spec.ts:63 "New note in an empty folder asks for a name, then opens the note": wait for focus before typing the folder name.
tests changed: e2e/capabilities.spec.ts:210 "write it shows the state written, re-asks on a clash and settles as an answered row": use in-app navigation to Car instead of full navigation.

red: none (flaky timing); proof: repeat runs

Validation:
- `pnpm exec tsc -p tsconfig.app.json`: pass; /tmp/c4-e2e-sync-tsc.log.
- `pnpm exec eslint e2e/qa7.spec.ts e2e/capabilities.spec.ts`: pass; /tmp/c4-e2e-sync-eslint.log.
- `git diff --check`: pass.
- Playwright and pnpm check were not run here: ports are denied; the coordinator owns locked repeat runs.
- Pending proof: qa7:63 fake desktop --repeat-each=12 and capabilities:210 fake desktop --repeat-each=8.

Source: the supplied diagnosis cites Playwright's official actionability guidance:
https://playwright.dev/docs/actionability. No network access was used.
The existing in-app Recent navigation is reused. No retry, bound change, or product change.
No git writes or commits were made; the coordinator commits specs and notes separately.

tests changed: e2e/qa7.spec.ts: "New note in an empty folder asks for a name, then opens the note" waits for the name box to be focused before typing (defect qa7-63-flaky); no bound changed.
tests changed: e2e/capabilities.spec.ts: "write it shows the state written, re-asks on a clash and settles as an answered row" navigates to Car in the app instead of page.goto (defect capabilities-210-flaky); the assertion and its timeout are unchanged.
