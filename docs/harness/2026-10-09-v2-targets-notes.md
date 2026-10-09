# v2-targets notes (d-v2-05, d-v2-10)

- Red `cbb0e7bf`, fix `a4aaa42c`. Red: Close Home 22 px; Home answers 40; switch row text did not toggle.
- One phone rule in `src/ui/ui.module.css` (`max-width: 899px`): `.small`, `.segment`, `.item` 44 px tall; `.iconBtn` and `.iconBtn.sm` 44 x 44. Sign-in footer links get 44 px in `signin.module.css` (their own markup, not a ui part).
- `src/ui/Segmented.tsx` replaces Settings' `.seg` and Tell Bower's `.kinds` (APG radio group: one tab stop, arrows move and check). Tell Bower's group now draws on `--bg-alt` with the line ring, as Settings does.
- `Row` in Settings takes `asLabel`; the three switch rows use it.
- Tab close: 24 x 24, 16 px icon, no opacity, hover `--hover` and `--heading`; not `IconButton`.
- Compatibility table row added (`src/docs.test.ts` requires one per commit).
- Sources: https://www.w3.org/TR/WCAG22/#target-size-minimum, https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html, https://www.w3.org/WAI/ARIA/apg/patterns/radio/
- tests changed: none (new files `e2e/v2-targets.spec.ts`, `src/ui/segmented.test.tsx`).
- Fake e2e full run: 286 passed, 74 skipped; the two console-guard marks are `test.fail()` passes.
