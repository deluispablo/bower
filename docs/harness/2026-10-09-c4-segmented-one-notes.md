# c4-segmented-one implementation

implementer: codex
review: skipped (TL-P4-22)
tests changed: none

Replaced the folder's separate List / Table radiogroup with `src/ui/Segmented.tsx`.
Removed `.views` and its markup. The existing `VIEW_KEY`, initial choice, view
rendering and storage callback are unchanged. Labels and 18 px icons are preserved.
Segmented option labels now accept React content, and its shared segment style
aligns icons and text. Its existing desktop minimum remains 34 px; its existing
phone minimum remains 44 px. Other shared desktop size rules are unchanged.

Files bookmark buttons now use `.small` from `src/ui/ui.module.css`. Removed their
screen-specific minimum height so the existing shared rule supplies 44 px below
900 px. Their labels, fill, typography, spacing and open action are unchanged.
Bookmarks remain phone-only; the desktop Files overview is unchanged.

## Validation

- The supplied red tests in `e2e/c4-segmented-one.spec.ts` were already committed;
  they were neither edited nor run in this session.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: passed.
  Log: `/tmp/c4-segmented-one-tsc.log`.
- `pnpm exec eslint src/features/files/FolderScreen.tsx src/ui/Segmented.tsx`: passed.
  Log: `/tmp/c4-segmented-one-eslint.log`.
- `pnpm check` and e2e remain for the coordinator under the lock, as instructed.
- No git writes, commits, push or compatibility documentation changes.

## Sources

- [WAI-ARIA APG radio group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/):
  reuse Segmented's checked-radio tab stop and arrow-key selection with wrapping.
- [WCAG 2.5.5, Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html):
  targets are at least 44 by 44 CSS pixels, subject to the criterion's exceptions;
  this entry reuses the existing shared phone height rule.

## Bookmark assertion follow-up

Coordinator: corrected this entry's new bookmark test to check the folder URL,
its level-one heading and a seeded child; the phone heading includes the
"More for Flat hunt" button's accessible name, so exact "Flat hunt" cannot match.
The click still calls `act.open(node)`, which navigates to the folder route;
fake seeding preserves `Projects/Flat hunt` from the demo fixture. Existing
bookmark specs check chip presence; folder-opening specs also check folder
content. No app code changed, and this is not a tests-changed case.

The coordinator reported the size and axe assertions passed on both projects;
the exact heading assertion failed after clicking. No e2e or `pnpm check` was
run for this follow-up, as instructed.
ESLint passed for `e2e/c4-segmented-one.spec.ts`; log:
`/tmp/c4-segmented-one-followup-eslint.log`.
