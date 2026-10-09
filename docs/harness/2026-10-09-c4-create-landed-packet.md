# Packet: c4-create-landed (TL-P4-24 addendum 10; escalated, data safety)

- **Entry:** `c4-create-landed`. Worktree `/private/tmp/bower-c4-create`, branch `c4-create-landed` from `claude/p3`, created **after c4-undo-withdraw merges**, since both edit `spine/write-once.ts`.
- **Ruling sweep:**
  - TL-P4-24 addenda 4 and 6–10;
  - DEFECT_LOG `pile-note-lost-create-moved`, with its diagnosis `docs/harness/defects/2026-10-09-pile-note-lost-create-moved.md`;
  - the Codex review `docs/harness/2026-10-09-codex-c4-app-fence-review.md`, "Round 4 pass" findings 1 and 2;
  - the c4-app-fence notes' site inventory ("Fix round 4").
- **Starting model:** `bower-escalated` (Opus). A Claude review and one Codex pass follow.

## Contract

1. **Two questions with two names in `spine/write-once.ts`:**
   - `happened`: did this write run? The stamp answers it.
   - `landed`: is the file as this write intended? It means `happened` plus `notAsSeen(expectedAfter, now) === null`, with modifiedTime ignored.
   - Both cover creates (case 1: createById, makeFolder, makeText). A create's `expectedAfter` is the name and place it was sent with, plus trashed false.
2. **Who asks which:**
   - the runner engine's `reconcile` (`spine/engine.ts:425` `stampSays`) and the upload use `happened`. If the run resent, it would overwrite the person's later change. An app edit carries a foreign stamp, so it never counts.
   - App creates use `landed`.
3. **A create that happened but has since moved or changed elsewhere** is refused with `CHANGED_ELSEWHERE`, so no new copy is needed. Nothing is sent or made again, the reserved id is let go, and the file stays where the person put it.
4. **The five class sites** from the diagnosis each call one of the two: pile folder `drive-vault.ts:1098`, create `:367`, link `:1542`, `journal.ts:404`, and `write-once.ts:145/149`. The notes inventory names which one each site calls and why. Then add one line to the c4-app-fence inventory for `engine.ts:425`.
5. **There is no third question,** and no call site builds its own expectation.

## Red

- The two reproduced cases from the diagnosis:
  - `a pile note whose create landed and then moved is refused on retry and not written in its new place`;
  - `a pile folder whose create landed and then moved is refused on retry`.
- The reconcile guard: `after a lost answer and an outside move the run reports applied and sends nothing` (runner engine; it may pass today, so label it a guard if it does).
- The fast-check property (seed 20261009) gains the create intents, with the same three timings. It must find a counterexample before the fix.

## Verify

- The reds, the property, and every c4-app-fence verify.
- e2e qa9, qa10 and capabilities on fake, phone and desktop.
- `pnpm check`, run through `bash harness/with-lock.sh`.
- The runner goldens do not rise: C04 78, 25-runs 88.

## Commits

1. The red.
2. The fix.
3. The notes (`docs/harness/2026-10-09-c4-create-landed-notes.md`, with the inventory), compatibility rows and `tests changed:` lines.
