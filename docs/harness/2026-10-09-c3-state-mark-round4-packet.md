# Packet: c3-state-mark round 4 (bounded re-runs, TL-P4-19 addendum 16)

- **Entry:** `c3-state-mark` (ui: true, escalated). Worktree `/private/tmp/bower-c3-state4`, branch `c3-state-mark` from `claude/p3`. The entry was merged at a8ad75f4. This round is a fix round on top of it.
- **Ruling sweep:**
  - TL-P4-19 addendum 16 (main 2f1ab181);
  - addenda 12 and 15;
  - the liveness rule (addendum 8 class test);
  - P4-47b minors (/private/tmp/p4-47b-review-notes.md): person.ts:762 and barrier.ts:281.
- **Starting model:** `bower-escalated`.

## Contract

1. **`answersStayed` only on a clash.** A clash settles into a question waiting for the person, so it cannot loop.
2. **Any other refusal of a granted write** goes through the existing transport failure table, with no second table.
   - A retry kind counts against the existing tries count, which is never reset. At the cap it settles as the "Not written: Drive would not let Bower change <note>. Your current state is as you left it." answered row (fallback "the note").
   - A permanent kind gives that row at once.
3. **No reset.** person.ts no longer resets `tries` on `answersStayed`.

## Red

- `the same non-clash refusal never starts more runs than the cap, then shows the not-written row` (the class test)
- `only a clash keeps an answer for a re-ask`

## Verify

- The two reds, plus every c3-state-mark verify.
- The api runner tests, `pnpm check`, and e2e:fake capabilities on phone and desktop.
- The goldens (C04 78, 25-runs 88).

## Commits

The red (tests only), then the fix, then the notes addendum in its own commit, with `tests changed:` lines and compatibility rows. The card carries a `worktree:` line.

Reviewers are read-only. They never move the main checkout in any form.

## Added: the shown update on the card (TL-P4-19 addendum 17, main 91bdcd8b)

- The q-state question card on Home shows Bower's update: the label "Bower's update", styled like the "New notes" label, then every shown line as a bullet list in the Current state panel's style. Use existing components only: no new component, no copy of one.
- Red: `the write it card shows every line of Bower's update`. Today the card text lacks the shown lines. It is accepted when the card contains each one and axe passes (WCAG 2.2, target-size) in the e2e.
- A yes may apply only text that was shown. Assert this in a test.
- Point (2), the Timeline line written while the ask is open, is by design (TL-P4-10). No change.
