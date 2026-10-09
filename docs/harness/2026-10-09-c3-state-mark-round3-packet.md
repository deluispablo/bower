# Packet: c3-state-mark round 3 (copy for re-ask and no-effect rows)

- **Entry:** `c3-state-mark` (`ui: true`). Worktree `/private/tmp/bower-c3-state`, branch `c3-state-mark`.
- **Ruling sweep:**
  - TL-P4-16 addendum 2 and TL-P4-19 addendum 7 (write-it-silent);
  - TL-P4-19 addenda 10 and 11 (the answered row and its label);
  - the designer's copy (2026-10-09, below);
  - TL-P4-19 addendum 12 (main 90c4a8f4): a clash re-asks, the same as "the section changed", through one path with one stamp+checksum check. Each re-ask needs a new answer, so it never loops on its own.
- **Starting model:** `bower-escalated`.

## Copy (designer, 2026-10-09; `<note>` is the note's display name)

1. **Re-ask.** It replaces STATE_ASK_AGAIN, so there is one re-ask wording.
   - Text: "The current state of <note> changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?"
   - Buttons: "Write it" / "Keep mine".
2. **Refused write.**
   - A clash is the same fact as (1): it re-asks with (1) and does not close the question.
   - A permanent refusal writes an answered row: "Not written: Drive would not let Bower change <note>. Your current state is as you left it." Fallback: "the note".
3. **Nothing to write.** It writes an answered row: "Nothing to write: <note> already said what Bower would have written." Fallback: "Nothing to write: the note already said it."
4. **Where the rows show.** Rows (2) and (3) show under the Home result and also on that note, through the row's `note` field, as the pair row does. They are not counted as set aside, and they use the same answered-row path, with no new row type.

## Red

- `a clash on write it re-asks with the reason`: today it closes silently.
- `a write it refused for good writes one answered row on Home and on the note`
- `a write it with nothing to write writes one answered row`

## Verify

- The three reds.
- Kept: every c3-state-mark verify.
- An e2e for "Write it" follows the P4-47 reviewer's ruling.
- Goldens never rise.
- `pnpm check` passes, and e2e:fake passes on the touched screens, with axe.

## Commits

Merge claude/p3 first: pair-ask round 3 adds the label. Then commit the red (tests only), then the fix, then the notes in their own commit, with `tests changed:` lines and compatibility rows.

Reviewers are read-only. They never move the main checkout in any form.
