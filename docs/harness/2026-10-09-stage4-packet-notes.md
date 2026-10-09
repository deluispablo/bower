# Stage 4 packet notes (coordinator, carried into packets when they are written)

- **d-v2-02:** it also builds the Home result card for answer-only runs (TL-P4-21 addendum 2, main 89c6306a).
  - Same component and the same run-words home. The exact copy is in the addendum.
  - Source: c3-state-mark round 3 found that an answer's own run has no Home card, because `hasReplay` needs a full run that filed things.
- **Every V2 packet:**
  - cites its block and its second-way risks from docs/harness/impact/2026-10-09-v2.md;
  - is `ui: true`, with its axe rules named;
  - follows the TL-P4-21 order: c4-focus-return (with d-v2-04) ∥ v2-field first, after the stage 3 smoke.
