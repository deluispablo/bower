# undo-inverse-after-refused: the property counts a kept inverse as done before it lands

Diagnosis by Codex, read-only (TL-P4-29 ruling 3), on c4-undo-compensate at 991d65d5, 2026-10-09. Tokens: input 582483 (cached 519552), output 4234.

Diagnosis: **the property’s model is wrong in this counterexample; the product follows the addenda.**
No inverse was sent after its original was refused. The original landed; its inverse was later refused.

Reproduction: scratch copy `/tmp/bower-undo-diagnosis`, seed `-993178573`, path `"48"`.
Ran the installed Vitest executable directly with the scratch config and `-t 'random batch 1'`.
It reproduced the four commands, `undoAll=false`, and the exact category-11 mismatch.
Trace and failure: `/tmp/bower-undo-diagnosis/trace.log`. Repository files remain unchanged.

Journal sequence (IDs below use their timestamp suffix; random suffixes do not affect the diagnosis):

- A = `.145Z`: add “Keep category 11 together”, from the mandatory coverage spine.
- F = `.172Z`: an earlier refused add of category 19, already on the failed list.
- R = `.196Z`: the random command’s removal of a different baseline rule.
- I = `.200Z`: inverse of A, removing category 11, with `undoes=A`.

Before the four commands: A is confirmed on Drive; outbox empty; failed list `[F]`.
There are 16 model changes; A is index 7 and is not undone.

1. `change(remove, tab=1, api=false)`: outcome is still `landed`.
   R takes the fast path, reserves its file ID and lands on Drive; nothing remains waiting.
   Outbox `[]`; failed `[F]`; A remains sent. R does not remove category 11.
2. `send(permission, tab=0)`: the outbox is empty, so flush sends nothing.
   This sets the fixture’s subsequent transport outcome; it creates no permission-blocked head.
   Outbox `[]`; failed `[F]`; Drive unchanged.
3. `undo(index=24, tab=0, api=false)`: now 17 changes, so `24 % 17 = 7`, selecting A.
   Locked `retract(A)` returns `sent`: A is neither waiting nor failed.
   `record(I)` reserves `r28` and attempts its create; permission refuses this attempt temporarily.
   I is kept with reserved ID and intent, and throws “… Bower kept this and will send it later.”
   Outbox `[I(reserved=r28, waiting)]`; failed `[F]`; Drive still contains A, not I.
   The model sets A’s `undone=true`.
4. `send(refused, tab=1)`: locked FIFO retries I; its create is permanently refused.
   I leaves the outbox and enters the failed list with “Bower couldn't take that rule out.”
   Outbox `[]`; failed `[F,I]`; Drive still contains A, not I.
   The model leaves A’s `undone=true`.

Final landed flushes send nothing. Cleanup skips A because it is already marked undone.
Drive replay therefore includes category 11; the model excludes it.

Five whys:

1. Why the mismatch? The model omits A although its inverse never landed (`property.test.ts:256`).
2. Why omit A? A kept inverse immediately sets the permanent boolean `undone=true` (`:234`).
3. Why does later refusal not reverse that expectation? Send commands update transport only (`:282`);
   they never update the model’s pending Undo outcome.
4. Why was pending treated as completed? The addendum-6 amendment classified the call’s immediate
   kept state correctly, but assumed that every kept inverse would succeed at the final flush.
5. Why can that assumption fail? Random commands can permanently refuse it before that flush.
   One boolean conflates local cancellation, pending compensation and landed compensation.

Contract: addendum 6 distinguishes sent, kept/pending and refused/unresolved; it does not guarantee
that a kept inverse cannot later fail. Addendum 4(5) correctly moves I to failed and unblocks FIFO.
Its “an inverse is never sent for an original on the failed list” rule is not implicated: A is sent.
Addendum 4(3) retract is also correct here; addendum 2(6) permits a refused inverse’s existing sentence.

Owning mechanism: the property’s command/model lifecycle, in `undo-compensate.property.test.ts`.
(a) Fix inside that owner: track pending inverse outcomes through subsequent sends. Size S–M;
risk: repeated/two-tab inverses must not undo a compensation that already landed.
(b) Refactor the model first into explicit change/Undo lifecycle states. Size M;
risk: broader test churn and accidentally coupling expectations to Drive replay. Keep the oracle independent.

Same class: `property.test.ts:220` checks kept only at call return; `:234` also marks ordinary queued
inverses complete; `:269` derives report expectations from that boolean; `:426` skips their recovery.
Production paths sharing this lifecycle include `drive-vault.ts:1357` and `journal.ts:423`;
they expose the later refusal correctly rather than guaranteeing eventual compensation.
