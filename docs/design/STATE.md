# Designer state

Updated 2026-10-09. After a restart, read this file, then the spec and the review.

## Phase

Phase 4/5. The owner approved V2 on 2026-10-09.

- **Spec:** `specs/2026-10-09-v2.md`, 24 blocks with before shots in `specs/2026-10-09-v2/`.
- **Owner's asks:**
  - write the spec together with the lead;
  - make the build match the design exactly, with me supervising it and giving the OK;
  - engineer the code well (DRY, one home per mechanism).

## Design sources

- **Canvas:** the owner's claude.ai artifact "Bower App V2". The link is never stored in the repo; I send it by message.
- **Canvas pages:**
  - Phone;
  - Today and V2: each screen next to how it looks today, plus the missing screens;
  - Bower, your companion: a live demo, the behaviour map and four moments;
  - Desktop;
  - Where Bower lands;
  - What changed;
  - Parts.
- **Boards:** the spec cites boards by file name (`Main.dc.html`). The stylesheet is the asset `bower-v2.css`.
- **Local copies:** the board files, `lib.py` and the build scripts sit in the session scratchpad (`v2/`). The canvas itself is the source of truth.

## Open

- **Review:** `reviews/2026-10-09-current-state.md`.
  - Findings: E1–E8, I1–I2, questions 1–5. All are decided: the owner approved V2, and question 5 is (b).
- **Waits on the lead:**
  - its review of the spec;
  - the `bower-impact` note;
  - the planned entries for my fidelity check (TL-P4-18 addendum 4).
- **Design check in progress:** c3-pair-ask.
  - Round 1 (bdc08775) was "not as specified": the "Not merged" row was counted as set aside and was not shown on any screen.
  - Round 2 is coming from the coordinator; it uses the `answered` row, TL-P4-19 addendum 10.
  - Copy I gave for it:
    - q-ask: "Not done: <thing> had moved or gone to the Bin before Bower got to it." Fallback: "…what the question was about…".
    - q-state: "Not written: <note> had moved or gone to the Bin before Bower got to it."
- **Waits on the owner:** nothing.

## How I check builds

- Use a separate worktree at the SHA, or a running dev server; never the main checkout.
- Run Vite from a worktree only inside one script run (`scratchpad/walk/withvite.mjs`).
- Never sign in. The owner signs in to claude.ai and staging.
- Owner's standing permission: made-up piles and Tidy up on staging with test accounts A and B.
