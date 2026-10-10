# C05 person-notes — adversarial review, pass 4

**Verdict: BLOCK**  
Range: `87ef51bf..206fe38c`

Ranked findings, all reproduced through production runner `main`:

1. **Important — `src/data/spine/scripted.ts:2287`: restored-copy detection depends on filename.**  
   Complete `change-1`, run twenty newer successful runs, then restore its exact archived bytes as
   `restored-copy.json`. The archived original remains, but the filename filter misses its record id.
   Replay appends different wording to the original target and records a second completion.

2. **Important — `src/data/spine/scripted.ts:207`: an unarchived completion can bind another target.**  
   Interrupt the request’s archive move after its append and checkpoint completion land.
   Rename Garden plot (`f11`) to Beds, create another Garden plot (`f14`), and retry with a new source.
   The same `change-1` appends to `f14` and records another completion. Completion is checked against
   the newly title-resolved target instead of settling the completed request as a no-op.

3. **Important — `src/data/spine/scripted.ts:221,237`: pending bindings expire into title matching.**  
   Conflict the first append, Bin its bound source, then run twenty successful newer tidy-ups.
   Each leaves the original request pending and its note unchanged; retention removes its manifest.
   Rename the target and create another note with its old title. The next run appends to that replacement
   using a new source, changing consent from target/source `f11/f13` to `f54/f55`.
   This makes the builder’s logged retention limitation Blocking: it grants an unrelated note and source.

**Ruling (3) passes:** the younger scripted request stays active with unchanged bytes and metadata,
and receives no capture or archive operation. Round 4 adds no second settlement or archive-writing path.
Retained pending retries also pass the rename/replacement control.

Validation used fake Drive and virtual temporary files entirely in memory. No files were edited and
no network was used. Vitest was not run because its log destination is read-only.
