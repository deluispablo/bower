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
- **c3-state-mark:** verified at round 4 (809ff91b). The final retry copy I gave replaces the provisional text: "Not written yet: Bower could not reach Drive to change <note>." or "Not written yet: Drive would not let Bower change <note>.", each followed by "Bower tries again in the next tidy-up." It rides with d-v2-02, as does my note on "Let Bower read them now". Nit for d-v2-02: the "Bower's update" label is in heading colour, not muted. Evidence: scratchpad walk/writeit4/.
- **Now:** stage 3 is closed. Stage 4 runs in the TL-P4-21 order: c4-focus-return ∥ v2-field, then v2-dock ∥ v2-perched-bower, then the V2 blocks. I wait for a design-check request for each ui: true entry. I sign off each packet's "What the person sees" before dispatch (TL-P4-22). Signed off: c4-focus-return; v2-field (with two rows added); v2-dock (with a row added: the chip lowest, messages above it, the chip not counted in the three); v2-targets as written; v2-name-sheet (with rows added: the links line says note or file, none for a folder; the name is selected without its extension); c4-segmented-one as written; c4-new-pill-one (one pill: 22 px tall, padding 0 9px, as the canvas .newtag); d-v2-24a (with a row added: a sleep-pose bird wakes only for error and offline; values pinned from Companion.dc.html: yes 18° ×2 in 0.48 s, no −14→+10→0 in 0.42 s, point-tidy tuft 16 and lean 10, drag-over lean 6, tuft 8 and jaw 14); d-v2-12 boot as written (a still read pose before JS, with the copied blink kept; no third keyframe copy); d-v2-13 CSS (v2-still-marks) as written, with the loading copy word for word in c4-resource; d-v2-18 (with a row added: the badge is the existing New-style pill at full contrast, only the name and icon dimmed; Cancel is a ghost, the outline look; Enter on the current folder's exact name shows the hint "It is already in <folder>. Pick another folder with the arrows, or type another name."); d-v2-07 (with rows added: no blink asleep; the chip bird still with moves off or reduced motion; a tap is pointer-only, Bower aria-hidden); v2-perched-bower, on hold (with a row added: no less alive than today's loop and pose motion until d-v2-07). Consult answered: the engine reproduces the loops, with the check at a period within ±10%, amplitude within ±20% or 2 px, and the rest frame within 1 px. A minor bird hides under an overlay that has its own Bower. Only the RunChip bird is minor; the tidy-sheet and stopped birds are the sheet's own. Recorded as TL-P4-22 addendum 7 (main 3e37376d). Addendum 8: the criteria cover all nine poses, and the engine's random blink is expected at the check; no objection.
- **Design checks, stage 4:** v2-field: verified after its fix round (fa1d6258). c4-focus-return: verified after its fix round (75db570f). v2-dock: verified (75db570f), with every measurement listed in the sign-off. v2-name-sheet: verified (a764e350); nit: the slash notice is drawn as an error. v2-targets: verified (189cc311); c4-segmented-one: verified (21c97eba); v2-move-here (d-v2-18): verified (bee8a889); c4-new-pill-one: verified (e9af106f), nothing looks different; v2-still-marks: verified (3f073a43); v2-boot-states (d-v2-12): verified (d1477d72), closed 7b80bd15; d-v2-07 (7860f261): not as specified on the wake startle only (tuft springs to 30.9° and undershoots to −5.5°, against 18° for 0.6 s); everything else is verified (scripts walk/mind*.cjs and mind-lib.js); v2-perched-bower: verified at 9816dfe1. All nine poses were re-recorded against 21648ecc and every criterion passes (TL-P4-22 addenda 7, 14, 15 and 17). Method: a harness page `.designer-harness/` in throwaway worktrees, and scratchpad walk/poses-all.cjs and poses-judge.cjs. I re-check proud against the baseline worktree /private/tmp/bower-dcheck-old (21648ecc). Method: a harness page (`.designer-harness/` in throwaway worktrees) and scratchpad walk/poses.cjs, poses-cmp.cjs. c4-undo-withdraw packet signed off. leftovers for the lead: List/Table is a second segmented control at 36 px, and the bookmark chips are 36 px. Chrome draws a 1.5 px border as 1 px, which is not a gap. Evidence: scratchpad walk/field/ and walk/focusret/.
- **Copy consult TL-P4-24 #3 (refused Undo):** "Not undone yet: Bower could not reach Drive to check. Try again when you are back online." In a dock message it replaces the message in place, with "Try again". For an inline Undo it shows under the row, muted, in role=status, with Undo as the retry. Never --danger. Recorded as TL-P4-24 addendum 1 (main 7a3eca46): the dock case comes in entry #3, which I will check, and the inline case rides with d-v2-02. Pile removal refused: "Not removed yet: Bower could not reach Drive to check. Try again when you are back online.", inline in the pile confirm box in place of its line, with "Remove the pile" as the retry and no toast.
- **d-v2-07 contract (lead consult):** answered. The chip bird is still with no blink (spec amended). A sleep-pose bird stays asleep on input. A tap cuts at the next frame; during a flight only the latest tap is kept, played on landing. A preen dip is 4°. Act weights 40/20/12/10/8, plus a 10% pause. Pass 2 (TL-P4-25 addendum 2) takes its values from CSS: in working poses the gaze moves only the iris; no objection. Table with pose scopes re-signed (6087798f). Addendum 3 (wait keeps its 8° tuft and gains a look act; the gaze overrides the iris; a tap on a carry keeps what it holds): no objection.
- **d-v2-24a consult (A–E):** answered with values. nod 18° ×2 in 0.48 s; no −14→+10→0 in 0.42 s; dup tilt −14° held 0.6 s; leans (tidy 10\/16\/0, drag 6\/8\/14); shake ±4° ×4 in 0.4 s; wave wing −38° in 0.5 s; show-off = one proud cycle; rule carry ≤1.2 s; startle tuft 18 and head −10, held 0.6 s; look at the action for 1.5 s. Eyes close only in the Settings moves-off reaction. Recorded as TL-P4-26 addendum 1 (main 2f1ae3bb); one startle step, which the wake-startle fix uses too. The 24a table is re-signed; BirdLab (/_bird) gains a reactions row for my check. TL-P4-25 addendum 4: a step owns the head while it plays, and the gaze moves only the iris; no objection. Jump rule: returns are ease-in-out, the speed changes by at most 1.5°/frame between frames and stays at most 6°/frame; snaps and the startle rise are exempt from the ramp but keep the 6° ceiling and no overshoot (TL-P4-25 addendum 5, main 8a6a8d56; in the startle round).
- **Waits on the owner:** nothing.

## How I check builds

- Use a separate worktree at the SHA, or a running dev server; never the main checkout.
- Run Vite from a worktree only inside one script run (`scratchpad/walk/withvite.mjs`).
- Never sign in. The owner signs in to claude.ai and staging.
- Owner's standing permission: made-up piles and Tidy up on staging with test accounts A and B.
