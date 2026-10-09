# Packet: c3-pair-ask fix round 3 (answered label and pair name)

- **Entry:** `c3-pair-ask` (`ui: true`). Third fix round, after the designer's check at 6f7c2ae2. Worktree `/private/tmp/bower-c3-pair3`, branch `c3-pair-ask` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-19 addendum 11 (this round, DECISIONS:194).
  - Addendum 10: the answered row.
  - Addendum 9: the copy.
  - TL-P4-18 addenda 2-3: the designer checks before close.
  - DEFECT_LOG `answered-rows-unlabeled` and `pair-row-always-fallback`.
- **Starting model:** `bower-escalated` (report and Drive read path).

## Contract (addendum 11)

1. **A section label.**
   - The answered rows get their own section label, "Answers Bower could not act on". It shows on the Home result card and on the done sheet, wherever the rows show.
   - It uses the same style and markup as the "New notes" label (one component, not a copy).
   - The rows never sit under "Brought up to date".
   - The label is a real heading or list label (WCAG 1.3.1). The e2e on the touched screens runs axe with WCAG 2.2 tags, with `target-size` enabled.
2. **The pair name.**
   - When the other note is in the Bin, its display name comes from the item that the subject-gone check already read. A trashed file keeps its name.
   - The fallback "the other note" is used only when the file cannot be read at all (404).
   - No extra Drive call. Prove it with the Drive-call goldens (C04 78, 25-runs 88), and a test that counts calls if one fits.
   - A display name never has a file extension.

## Red

- `the answered rows have their own label and never sit under brought up to date`
- `a pair whose other note is in the Bin is named from the item already read`

## Verify (exact names)

- The two reds.
- `a pair whose other note cannot be read uses the fallback`
- Kept: every c3-pair-ask verify.
- e2e:fake `?scenario=gone-answers` on phone and desktop, with axe, plus C11.
- Goldens never rise. `pnpm check` must be green.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-c3-pair-ask-round3-notes.md`), with `tests changed:` lines. Add compatibility rows for non-merge commits under src/features or src/data/contracts.

Reviewers are read-only. They never move the main checkout in any form.
