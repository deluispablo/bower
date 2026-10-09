# Packet: P4-61 review (c4-create-landed, escalated data safety; TL-P4-24 addendum 10)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-create`.

## What to review

- **Diff:** `git diff b2b815a89ed7bf2a3c0b6c69577a1bc9949808a4..c4-create-landed`. Red f0511826, fix fe7a2161, notes cbf9be5f.
- **Packet:** `docs/harness/2026-10-09-c4-create-landed-packet.md`.
- **Defect:** `pile-note-lost-create-moved`. The diagnosis is `docs/harness/defects/2026-10-09-pile-note-lost-create-moved.md`.
- **Fixed questions (TL-P4-20):** check the contract first, then any second way. Give every finding a severity. A worker may not loosen its own red (TL-P4-22 addendum 22).

## Look hardest at

- **write-once names `happened` and `landed`.** Both cover creates. A create's `expectedAfter` is the name and place it was sent with, plus trashed false. No third question, and no call site builds its own expectation.
- **Who asks which.**
  - The runner engine's `reconcile` and the upload use `happened`.
  - App creates use `landed`.
  - The transport and `resumable-upload` also changed: why?
- **A create that happened but has since moved** is refused with CHANGED_ELSEWHERE. Nothing is sent or made again, the id is let go, and the file stays where the person put it.
- **The 5 class sites,** with the inventory in the notes.
- **Left for the lead, judge each:**
  - `failureKind` now makes a not-as-seen refusal permanent, so a change line is never re-made. Is that a behaviour change a person would see?
  - The c2-create-by-id Bin test keeps its old title but now refuses first.
- **The reds.** The reconcile guard passed before the fix, so it is a guard. The property (seed 20261009) gained create intents.
- **The runner goldens** (C04 78, 25-runs 88) do not rise.
- **Housekeeping:** `tests changed:` lines, compatibility rows, no `.only` or `.skip`, and no real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
