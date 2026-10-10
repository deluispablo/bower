`undo-fifo-seed`: test/model defect; the reported failure does not demonstrate a product FIFO break.

Evidence: supplied isolated replay, seed `-1937975690`, path `"40"`, `undoAll=false`, checked against source. I could not rerun it: the read-only sandbox rejected the `/tmp` log write before execution. No files were edited; no network was used.

The exact sequence follows the mandatory coverage spine:
permission/tab1 → offline/tab1 → signin/tab0 → permission/tab1 → landed/tab1 → signin/tab0 → Bin/tab0/API → Undo(16)/tab1/no-API → refused/tab0 → move/tab1/API.

The Bin records original X while sign-in blocks its journal send; X retains a reserved id. Undo(16) targets X. `retract` therefore returns `sent`, and the test appends inverse U, stamped `.164Z`, behind X (`undo-compensate.property.test.ts:233–239`; `journal.ts:553`).

The refused/tab0 flush permanently refuses X. The same drain then retires U **without sending it**, because U’s original failed (`journal.ts:393–396`), and removes both outbox entries at `:421`. This is explicitly required by TL-P4-27 addendum 9(2).

The final move records M, stamped `.168Z`. Its journal create is attempted under the still-active `refused` outcome, so M is also refused. There is no landed `.168Z` line preceding a landed `.164Z` line: U is never sent.

The transport observer nevertheless reports “M passed U”: it treats every earlier observed record absent from `confirmed`, `dropped`, and `refused` as blocking (`undo-compensate.property.test.ts:461–463`). U remains in `observed`, but none of those sets records its valid retirement. Assertion `:128` exposes this stale model state.

The five whys are:

1. Why does M appear to pass U? The observer still considers U unresolved.
2. Why unresolved? U received no transport confirmation, refusal, or explicit retract/drop.
3. Why none? The owner drain intentionally discards inverses of refused originals.
4. Why does the model miss that? It models transport outcomes but omits “settled without sending.”
5. Why that omission? It equates historical observation with outstanding queue membership; internally, `Sent = 'sent'` also means this valid no-send completion.

Owner mechanism: `docs/ARCHITECTURE.md:91`, “Undo = the inverse forward change, decided under the outbox lock”; its outbox admission/drain and decision home is `src/data/vault/journal.ts`. TL-P4-28(2) makes property changes the red owner’s responsibility.

This seed is not a wall-clock or timer flake. The fixture shares incrementing clocks (`property.test.ts:425–427`), and FakeDrive defaults to zero latency (`fake-drive.ts:82`). Timestamp comparison identifies U as older; the false assumption is that U still waits. Separately, production’s per-instance `lastAt` (`journal.ts:184`, `:320`) does not guarantee global timestamp ordering across tabs or clock rollback.

The same missing terminal state affects the second FIFO check (`property.test.ts:146–148`) and inverse tracking (`:89–95`). `refusedDuringInverse` updates only the original’s cancellation (`:331`). Existing coverage already requires this no-send behavior (`undo-compensate.test.ts:444–470`).

Options:

- **(a) Extend the owner mechanism’s observable result** to distinguish actual delivery from settlement without sending. Preserve the single drain and add no second store. Cost: API/type and caller changes for observability; unnecessary to correct this replay.
- **(b) Repair the independent model, recommended.** Recognize a retired inverse from its refused original plus verified outbox absence and no transport attempt. Add a distinct terminal disposition; do not call it delivered. Cost: property-only changes approved through the red owner.

Regression: retain this seed/path as a named `undo-fifo-seed` replay. Add a class table covering refusal during inverse admission and later flush, same-tab and cross-tab: original fails, inverse is never attempted and leaves the outbox, then an unrelated line may proceed. Keep controls proving a genuinely unresolved head still blocks later attempts.