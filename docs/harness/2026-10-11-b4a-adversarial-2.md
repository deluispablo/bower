# B4a adversarial pass 2 (Astra xhigh, attempt 9)

1. **Blocking: data safety** — [observations.ts:107](/private/tmp/bower-b4a-contract/src/data/contracts/observations.ts:107): Forget `fact-first`, containing “Alex grows beans.” from `source-one`. Replay that source with new IDs/hash and classify the same sentence as `activity` in `about-working-on`. `parseObservations().live` returns the replayed fact. Changing classification bypasses the tombstone without new remembering authority.

2. **Blocking: hard rule** — [run-manifest.ts:817](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:817): Initialization skips evidence checks. With an empty ledger and no admitted words, append valid About me regions containing an invented preference. Manifest validation returns `ok: true`; admission returns `null`. The same bypass accepts forgotten text when the ledger contains its tombstone and zero live facts.

3. **Blocking: normal use** — [run-manifest.ts:819](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:819): Every rewrite requires consolidation’s archive, budget and frontier. Given one short preference and its Forget tombstone, rebuilding the section to its heading returns `{ok:false, reason:"shape"}`, although the Forget helper permits it. Ordinary single-fact updates also fail; the manifest cannot represent the promised Forget/Undo bypass.

4. **Blocking: normal use** — [note-format.ts:304](/private/tmp/bower-b4a-contract/src/data/contracts/note-format.ts:304): Start with `Alex grows beans.\n`, without front matter, and append valid regions containing “Alex likes peas.” Initialization succeeds, but `parseNote` returns only the personal body and no `bowerNote`. The learned content remains stored but disappears from the note screen. Adding front matter makes the control display it.

No second parser, writer or region mechanism found. Passed 59 read-only production assertions alongside these reproductions.

Not checked: full suites, e2e or B4b/B4c runtime wiring.
verdict: BLOCK

## Gates b4a-g1
- check: tsc app fails: observations.ts:67, :149 (findLastIndex, es2023), run-manifest.ts:771 (TextDecoder options).
- e2e fake: capabilities.spec.ts:210 fails on phone and desktop at the axe check (no elements for include).
