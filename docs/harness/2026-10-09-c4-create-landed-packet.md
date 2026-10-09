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

## Fix round 1 (TL-P4-24 addenda 15 and 16, main b9c98173)

- **Why:** the Codex pass (`2026-10-09-codex-c4-create-landed-review.md`, 1 Important) came after the P4-61 PASS. On a retry, `landed` is judged against the name the retry recomputes (`write-once.ts:201`, `drive-vault.ts:368`), not against the name that was first sent.
  - Scenario: the answer and the recovery read are both lost. Then refresh() runs, the retry picks the next free name, the recovered file is refused CHANGED_ELSEWHERE, the id is let go, and a second copy is made.
- **Model:** a fresh `bower-escalated` (Opus) session, on the same branch and worktree. Then a delta review and a Codex pass.

1. **Store the intent with the id.** When an id is reserved, the keeper stores the intent it was first sent with: name, place and content hash.
   - The field is additive across all four keepers.
   - An old keeper entry without an intent keeps today's behaviour, with a fixture test.
2. **Retries resend the stored intent and never recompute the name.** `drive-vault.ts:368` picks a free name only for a first send. `landed` is judged against the stored intent, in write-once.ts, its one home.
3. **Addendum 15:**
   - (1) A not-as-seen refusal of a change line is permanent. This is accepted as it is; change nothing.
   - (2) Retitle the c2 Bin test so its title says what it now asserts (refused first, then made), with a `tests changed:` line.

**Red:** `a create whose answer and recovery read were lost is made once after a refresh and a retry`. It covers the answer and the recovery read both being lost, then refresh() and a retry, and expects one file, not two. Add it to the property's timings if it fits there. A worker may not loosen a red (TL-P4-22 addendum 22).

**Verify:** as above. **Commits:** the red, the fix, then a notes section "Fix round 1" with `tests changed:` lines and compatibility rows.
