# move-sheet-cancel-width-flaky: the cancel and its container are measured during the sheet's open animation

Diagnosis by Codex, read-only (TL-P4-29 ruling 3), on claude/p3, 2026-10-10. Tokens: input 203150 (cached 148096), output 1894.

Diagnosis: a test synchronization defect, with high confidence from code; no browser reproduction or writes performed.

1. **Why do the widths differ?** The test samples Cancel and its parent in separate awaited calls (`e2e/v2-move-here.spec.ts:67–68`). During the desktop sheet’s opening animation, their shared ancestor scales between those samples. Equal layout widths therefore produce different measured widths.
2. **Why does that explain approximately 2.8 px?** Desktop Sheet uses a 200 ms `pop` animation starting at `scale(0.98)` (`src/ui/ui.module.css:80,87`). Its nominal content width is 508 px: 560 minus two 26 px paddings (`:76,79`). A scale change of approximately 0.00544 between reads produces 2.7629 px; the available scale range permits up to approximately 10.16 px. This is a timing inference, not a captured animation trace.
3. **Why only sometimes, and on desktop?** Visibility assertions precede measurement (`e2e/v2-move-here.spec.ts:20,65`) without waiting for animation completion. Scheduling determines whether the two reads cross animation frames or occur after completion. Phone `rise` translates vertically without scaling (`src/ui/ui.module.css:67,86`), so it does not change width. [Playwright distinguishes visibility from stability](https://playwright.dev/docs/actionability#visible).
4. **Why is the settled layout expected to satisfy the contract?** Cancel uses the existing block Button (`src/features/files/MovePicker.tsx:119–120`); `.block` is `width:100%` (`src/ui/ui.module.css:25`). Its parent has no horizontal padding or border (`src/features/files/files.module.css:19`), and global sizing is border-box (`src/styles/base.css:45`). Notes explicitly require full-width Cancel and focus return (`docs/harness/2026-10-09-v2-move-here-notes.md:13,19`). The test’s timing is wrong; the available evidence does not establish a product defect.
5. **Why was the race left exposed?** Animation settlement already has one shared test mechanism, `animationsEnd` (`e2e/axe.ts:21–28`), but this spec never calls it and also scans axe directly (`e2e/v2-move-here.spec.ts:52`). The earlier opacity/contrast race is recorded in `docs/harness/DEFECT_LOG.md:68`; this width recurrence is recorded at `:77`. Geometry checks have not consistently adopted the shared mechanism.

Scrollbar, font loading, or another layout shift is less supported: sheet/list scrolling exists (`src/ui/ui.module.css:62`; `src/features/files/files.module.css:11`), but neither introduces a fixed inset between Cancel and its immediate parent. The explicit desktop scale animation explains the magnitude and intermittency without requiring a layout change. Logs contain no measurements establishing those alternatives.

The source distinction is misleading: this spec explicitly navigates to `source=fake` (`e2e/v2-move-here.spec.ts:7`), and the fixture preserves explicit source parameters (`e2e/fixtures.ts:12–14`). Thus the nominal demo-suite failure also exercises fake here. `/tmp/s4-e2e.log:473` records 2.762908935546875; `/tmp/s4-movehere.log:17` records 3.397705078125, with one Cancel failure among three repetitions.

Owning mechanisms: test settlement belongs to `e2e/axe.ts::animationsEnd`; product animation belongs to shared Sheet CSS. Cancel closes through MovePicker’s existing `close` (`src/features/files/MovePicker.tsx:40–43`), and focus restoration belongs to Sheet (`src/ui/Sheet.tsx:35`).

- **(a) Fix inside the owner:** small, low risk. Reuse `animationsEnd(page)` before geometry reads, retain the exact ≤1 px contract and focus assertions, and route this spec’s axe scan through the existing shared helper. Existing precedent: `e2e/v2-field.spec.ts:53`. Waiting on [Animation.finished](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished) follows the established mechanism.
- **(b) Refactor first:** medium, moderate risk. Extract the generic animation-settlement function into a neutral e2e module, preserve its implementation, and have axe plus affected geometry specs import that one owner. This broadens review and import changes; it is unnecessary for the local fix. No product animation refactor is indicated.

Same class elsewhere, as code risks rather than proven failures:

- `e2e/v2-name-sheet.spec.ts:48–51`: desktop scaled sheet field measured before settlement; the absolute 300 px check can observe the opening scale.
- `e2e/v2-name-sheet.spec.ts:78–82`: separate button bounds compared before `axeClean` at `:83`; parallel requests do not guarantee one frame. On phone, translation particularly affects the y comparison.
- `e2e/v2-name-sheet.spec.ts:105–111`: visibility/focus followed by field-width measurement before axe’s settlement.
