# Stage 4 packet notes (coordinator, carried into packets when they are written)

- **d-v2-02:** it also builds the Home result card for answer-only runs (TL-P4-21 addendum 2, main 89c6306a).
  - Same component and the same run-words home. The exact copy is in the addendum.
  - Source: c3-state-mark round 3 found that an answer's own run has no Home card, because `hasReplay` needs a full run that filed things.
- **Every V2 packet:**
  - cites its block and its second-way risks from docs/harness/impact/2026-10-09-v2.md;
  - is `ui: true`, with its axe rules named;
  - follows the TL-P4-21 order: c4-focus-return (with d-v2-04) ∥ v2-field first, after the stage 3 smoke.
- **d-v2-02 also carries the c3-state-mark copy** (designer verified 809ff91b; TL-P4-19 addendum 21 final copy):
  - stateNotWritten, reached: "Not written yet: Bower could not reach Drive to change <note>. Bower tries again in the next tidy-up."
  - stateNotWritten, barred: "Not written yet: Drive would not let Bower change <note>. Bower tries again in the next tidy-up."
  - STATE_RETRY: "Bower tries again in the next tidy-up."
  - The auth and not-found kinds take the same form. A final refusal after the retry that was "unreachable" says "could not reach".
  - Nit: the "Bower's update" label uses the heading colour, while "New notes" is muted. Make them match.
- **For the lead (designer):** if "Let Bower read them now" shows on Home for a kept answer, it must run the retry. Otherwise the row's "next tidy-up" waits for a new inbox thing (P4-47c minor).
- **Next smoke (lead):** add a case where a new q-state is asked and then "Write it" is pressed, so the no-model path (`shown`) is seen live.
