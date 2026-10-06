# Independent review ready-review-1: partial-pile-readiness

Reviewer: fresh Claude session `ready-review-1` (implementer `readiness-impl-1`). Target `/private/tmp/bower-p2-readiness`, base `8dcf8de` → tests `3e8f154` → fix `d3a4830` → wiring test `8fd40b9` → wiring fix `7e74934`. **Verdict: BLOCKED — 0 Critical, 3 Important, 5 Minor.** Core fix correct (producer order, validated declarations, fresh-client missing rows, retry without bytes, unready piles untouched with byte/name/place assertions, Bin guard on every folder, wiring fake-on/real-off, no regressions from pile-id change). Reds genuine; existing tests only added to.

## Important

1. `fake-runner.ts:91` with `drive-vault.ts:432–441,556`: a Pile note created by `updatePile` lacks the context key, so it is not captured; run 1 files the members and keeps the folder; afterwards every client shows filed files as "Didn't arrive", Try again asks to choose an already filed file, every run sets the pile aside. Reproduced.
2. `drive-vault.ts:558–561` with `pile-readiness.ts:105`: clearing a declared pile's line Bins the context note; the pile is never ready, retyping does not help, the reason shown is false. Reproduced.
3. `fake-drive.ts:52,274`: pretend snapshots keep only name/size above 256 KB, so after any reload a declared big file is unverifiable and its pile set aside forever while the UI shows it arrived. Reproduced.

## Minor

1. One unreadable declaration fails the whole inbox listing (`pile-readiness.ts:72`) — registered as `declaration-read-isolation` (TL-P2-08 a).
2. Missing link shows a Drive-safe `.url` name on another client and "Choose" wording.
3. All set-aside causes share "Some of its things have not arrived yet."
4. Every `piles()` lists the whole folder and reads each declaration (slow scenario); cache by file id.
5. Unmarked pile with an uncaptured subfolder is re-filed as "Your note" each run (reasoned).

Browser-gate checklist from the reviewer: line added after upload then tidy-up; cleared line then tidy-up; >256 KB file, reload, tidy-up; two tabs mid-send; slow scenario inbox; Undo after removing a declared pile keeps its id; set-aside rows in report screens.
