# qa10-toast-flake: Delete pressed right after a menu closes goes nowhere; the toast is never shown

Diagnoser note (TL-P4-15), 2026-10-09, on `claude/p3` f7062df3. Read-only. The only test run was the named e2e test (desktop project), with its output in `/tmp/qa10-*.log` and traces in `/tmp/qa10-results-*`.

## What failed

`e2e/qa10.spec.ts:162`: `getByRole('status').getByText(/Main folders stay/)` reported "element(s) not found" for the full 5000 ms (`/tmp/c2r2-e2efake2.log:573-590`).

- **Reproduced, and it does not need a full suite.** With `--repeat-each`: 12 of 20 failed with 5 workers (`/tmp/qa10-base.log`), 5 of 15 failed with 1 worker (`/tmp/qa10-w1.log`), and 0 of 10 failed with 1 worker under 10 busy CPU loops (`/tmp/qa10-load.log`). CPU load is not the trigger. What matters is the frame timing (see below). "3 of 3 alone" was luck: at about 1/3 failure, three passes in a row happen about 30% of the time.
- **The toast is never created.** It was not shown and then dismissed. A plain toast lives 4 s (`src/ui/toast.tsx:23,40`), and only `dismiss`/the timer remove it. The list keeps the last 3 (`:39`), and nothing else toasts in this test. A toast that had shown would have been seen at the first poll. The trace snapshot after `Delete` has no toast text in any of the 17 failing traces, but has it in all 20 passing ones.
- **Timing (traces).** The second `Escape` (`qa10.spec.ts:160`) is followed by `Delete` 0-2 ms after Escape returns, in every run (37/37). The menu's focus return is a timer of **30 ms** (`src/features/files/Explorer.tsx:538-542`). The first half of the test waits for it (`:155 toBeFocused`). Each of those waits took 24-42 ms, so right after Escape the tree did not have the keyboard, and the timer gave it back. The second half does not wait.
- **Exact split, 37/37.** A run fails if and only if, in the snapshot right after the second Escape, the Radix menu content is still mounted (`role=menu data-state=closed hidden`, empty). It passes when the content has already gone. *Unverified:* which element holds focus at `Delete` in each branch (no probe was run). The passing branch still delivers `Delete` to the tree before the 30 ms timer, and the code does not explain how.

## Why (5 whys)

1. **Why no toast?** The tree's `onKeyDown` (`Explorer.tsx:249-255`) never ran: the keydown landed outside the tree.
2. **Why outside?** Closing the context menu does not give the keyboard back when it closes. `onCloseAutoFocus` is always prevented (`:547`), and a `setTimeout(…, 30)` refocuses the tree later, only if focus has "fallen to nothing" at that moment (`:538-542`).
3. **Why a timer?** The menu's close has to leave alone a name box or dialog that a menu item opened (`:536-541`, checks `renaming/moveFor/confirmBin`). Radix's own return-to-trigger was turned off wholesale and replaced by a delayed guess.
4. **Why does it depend on frames?** Whether Radix unmounts the content at once or keeps it hidden until its `fade` animation event (`src/ui/ui.module.css:86`; Presence `node_modules/.pnpm/@radix-ui+react-presence@1.1.10*/…/index.mjs:61-74,99-102`) decides where focus sits during the first milliseconds. Parallel browsers move that edge. CPU loops do not.
5. **Design cause.** No mechanism owns "give the keyboard back when a layer closes". Each layer does it with its own timer and its own "fallen to nothing" test. The 30 ms window in Explorer is one such copy, and the test steps into it.

**Is it a product defect?** Partly. A key pressed within the window after Escape closes the tree menu is dropped. The window is ≥30 ms, and longer on a busy main thread, since timers run late. This is rare for a person and has no data effect. Focus always came back (37/37 first-half waits). The toast itself is not at fault. *Observation, not this defect:* plain toasts last 4 s (`toast.tsx:23`), with no way to read them again. They wait while hovered or focused (`:42-52`).

## Owner mechanism

**None in the mechanism map.** The toast (`src/ui/toast.tsx`) and focus return have no rows. The map has no toast or status entry, and "Run status words" is unrelated. The de facto home for focus return is `src/ui/focus.ts` (`focusMain`, `focusHeading`, `returnFocusTo`, `focusRouteHeading`). The faulty copy is `Explorer.tsx:532-547`.

## Same class elsewhere (7 product sites, 0 more test sites)

Focus is returned by a deferred timer or a "fallen to nothing" check outside one helper:

1. `Explorer.tsx:130-139`: dialog close, `setTimeout 0`, only if on the body.
2. `Explorer.tsx:125-127`: Undo restored, only if on the body.
3. `src/ui/focus.ts:5-10` `focusMain` (`setTimeout 0`), used as `onCloseAutoFocus` in `src/ui/Sheet.tsx:30`.
4. `src/ui/toast.tsx:73-85`: own fallen test, then `returnFocusTo`.
5. `src/features/palette/Palette.tsx:107-113`: prevents Radix, then `focusMain`/`returnFocusTo`.
6. `src/features/tidy/Replay.tsx:146`: `returnFocusTo` from its own handler.
7. `src/ui/focus.ts:80-148`: route heading, 50 ms polling, 12 tries.

Test side: only `qa10.spec.ts:160-161` presses a key right after closing a layer without a focus wait. `screens.spec.ts:66-67` is immune, since Ctrl+K is a window listener (`src/app/Shell.tsx:30-41`). `qa6.spec.ts:77-78` and `qa10.spec.ts:154-155` wait.

## Options

- **(a) Fix inside Explorer and the test.** In the context menu's `onCloseAutoFocus` (`:547`), focus the tree unless the `renaming/moveFor/confirmBin` check says a box or dialog took it. Drop the 30 ms timer. At `qa10.spec.ts:160`, add `await expect(tree).toBeFocused()`, as at `:155`. Size S (2 files). Risk low. *Unverified:* Radix calls `onCloseAutoFocus` in a `setTimeout 0` at unmount (focus-scope `index.mjs:94-103`), so the window shrinks but does not close. Focusing synchronously in `onOpenChange(false)` would close it, but that is unverified under Radix's non-modal menu. A test-only variant (just the `toBeFocused` line) is size XS, but it leaves the product window.
- **(b) Refactor first, then fix.** Make `src/ui/focus.ts` the one home: a single "layer closed → back to its opener unless something else took the keyboard" helper, called from each Radix `onCloseAutoFocus`. Move the 7 sites above onto it and add a mechanism-map row. Then apply (a). Size M (about 7 files). Risk medium: it touches the `focus-after-close.spec.ts`, `qa6` and `qa10` focus suites.
- **(c) New mechanism.** Not needed: `focus.ts` exists. A key buffer or replay would be a second input path. Reject it.

## Regression test (class)

One e2e test per layer: the tree menu, the Bin dialog, Move to…, a sheet and the palette. Each one opens the layer, presses Escape, and at once (no focus wait) presses a key with a visible effect on the opener, then asserts the effect. Run it with `--repeat-each=20 --workers=5`; the bug fails about 60% of runs at that setting today. Add a check that no `.focus()` inside a `setTimeout` exists outside `src/ui/focus.ts`.
