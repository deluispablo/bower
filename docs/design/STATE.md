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
- **V2 plan (TL-P4-21, main 552b401e):** the lead sent it for the fidelity check. I answered its seven questions by amending the spec (d-v2-02 per-outcome copy, Undo only on `next`/`failed`; -07 engine ranges and preen; -24 0.1 s start and settle-then-hold, `bower-map.md`; -06 one carried glyph; -12 "while opening"; -19 no toast; -21 "Show all <n>" in place, no "Ask Bower"). Verdict: faithful; merged as TL-P4-21 addendum 1 (main e85722cd). V2 opens stage 4 after the stage 3 smoke, with c4-focus-return and v2-field. I check each V2 entry before it closes.
- **c3-pair-ask:** verified at round 3 (049e07d9). The label and the pair name are as ruled (TL-P4-19 addenda 11 and 14). Evidence: scratchpad walk/pairask3/.
- **c3-state-mark:** copy given to the coordinator: one re-ask wording, plus answered rows for a refused write and for nothing to write. Adopted as TL-P4-19 addendum 12 (main 90c4a8f4). The design check comes from the coordinator.
- **Waits on the owner:** nothing.

## How I check builds

- Use a separate worktree at the SHA, or a running dev server; never the main checkout.
- Run Vite from a worktree only inside one script run (`scratchpad/walk/withvite.mjs`).
- Never sign in. The owner signs in to claude.ai and staging.
- Owner's standing permission: made-up piles and Tidy up on staging with test accounts A and B.
