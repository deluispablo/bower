# c3-planner-split: coordinator map (claude/p3 b036afc0)

Read-only mapping for the worker. Paths are relative to the repo root.

## planScripted today

`src/data/spine/scripted.ts:220-1537` is 1,318 lines of a 1,946-line file.

- **Capture, :221-575.** Journal and taken lines :225-226; answer settling :251-277; own files :283-290; piles :325-534 (`capturePiles` :327); `askedPiles` :362. It is assembled late, at :1195-1214, because the decisions keep adding to `places` (:587, 757, 942, 1019, 1045, 1204, 1209).
- **Decisions, :577-1194.** Script and model run in one pass. The switch is `demo = !opts.filing` (:232), with branches at :237, 264, 277, 304, 311-317, 320, 349, 391, 533, 615, 627, 641, 665, 1088 and 1110.
- **Re-planning by recursion:** :539, :749, :964, :976, :1532.
- **Building operations, :1216-1520.** Manifest and `grounded` :1522-1536.
- **Callers:** `scriptedProvider` (:1937-1943; `runner/src/provider.ts:45-47`), `runner/src/claude.ts:1193`, and the app's fake only (`src/data/fake/fake-runner.ts:33`).

## Demo fixture on the live path

`scripted.ts:18` imports 15 symbols from `demo/fixture`. It is allowlisted at `scripts/dependency-exceptions.cjs:11`; delete that line together with the import, because `dependency-rules` fails on stale lines.

- `PLAN_BY_NAME` builds when the module loads (:48-55).
- Used on the model path with no demo gate: `wordRule` :1645, `DISAGREEMENTS` / `disagreementAnswer` :717-723, the `PLAN_BY_NAME` lookups :1034-1035 and :1864, `NOT_LOOKED_UP` :1405, and `scriptedRequest` :704, :1130, :1402.

## Answers

- **App:** Home.tsx:295 → `answer-loop.ts:71-87` → `worker-http.ts:83` → `api/src/process.ts:119-125,239` → `plan.ts:397-407`.
- **Model path:** `answersTaken` (claude.ts:442-483) → the prompt (:1112, :299-300, :323); `mergesOf` :1161 → `filing.keep`.
- **In the planner:** `keeps` :237 and the "Write it" grants :641-662. Only settled answers are taken (:256-276).
- **Tests:** `runner/test/ask-answer-loop.test.ts:195-388`.

## The five "waits for the next run" filters

All five filter `journal` at :993-1009:

1. `holdRenames` (:737/810/826/914/928 → :994)
2. `heldSaid` :996
3. `heldLookups` :1002
4. `heldAnswers` (:308, :396, :1007)
5. `rules.left` :1009 (`RulesPlan` :1689)

The parameter `held` is separate. The maps that already exist: `editsFrom` :1255, `fromAnswer` :1258, `derived` :1477, `rules.held` :1714/1729.

## Report rows

- **Written by hand:** `reportPlan.push` at :1279, 1289-90, 1297-98, 1301-02, 1316-17, 1354, 1372-73, 1386-87, 1420, 1458 and 1482-87.
- **Tied by name or text:**
  - :936 takes the first line's `what`, and :1354 makes one row per edit (report-misses-hub-line);
  - :968 and :888 match lines by text;
  - `report.ts:58-61` ties a set-aside row to its move by `before.name === row.name`;
  - report.ts:231/235/244 match rows by name and fields;
  - `NoteScreen.tsx:219` matches `what` against the line text.
- **`grounded()`** (grounded.ts:58-424) re-derives every row: `updatedRow` :162-183, name matches throughout, and the coverage check at :419-423.
- **Readers of `updated.length`:** Home.tsx:98, Replay.tsx:40, run-words.ts:105.

## Tests and goldens

- **Planner:** `scripted.test.ts:23,35`, `report.test.ts:28,55,80`, `fake-runner.test.ts:216-224`, `world.test.ts:412-416` (pins one Job hunt row: update it to the rule).
- **`grounded()`:** `fake-worker.test.ts:2055, 2439, 2478, 3844, 3864, 3973`, and the set-aside tests at :1263, 4587, 4955, 5018.
- **Goldens:** `runner/test/drive-calls-golden.test.ts:101` (C04 78) and `:156` (25 runs 88).
