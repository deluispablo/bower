**Diagnosis: `request-run-slow-reads` — C05 expands a small request into historical content scans.**

Read-only inspection of this checkout and git history; no network, edits, tests, or owner-folder access. The inspected production paths are unchanged between staging `2ab7b490` and checkout HEAD `f49ada96`.

The confirmed mechanism is excessive read scope. A fresh request triggers all archived change-file reads and, at 20 kept run folders, all kept manifests and checkpoint chains. The timing attributes **91.4%** of the run to `reads`. The exact division of 757 calls remains an estimate because no archive inventory or per-call trace was supplied.

**Read loops and scaling**

Let `A` be archived JSON files, `J` active journal JSON files, `M` kept run folders, `P` runs marked `bowerAppends`, and `Cᵢ` checkpoint files in run `i`.

| Path | Request-only behaviour and cost | Evidence |
|---|---|---|
| Folder discovery | Lists the whole tree’s metadata, including archives and runs. Calls scale with depth, pages and groups of 40 folders; content is not read by listing. | [drive-http.ts:139](/Users/deluisp/Projects/bower-app/src/data/drive/drive-http.ts:139), [drive-http.ts:479](/Users/deluisp/Projects/bower-app/src/data/drive/drive-http.ts:479) |
| Active journal | Reads every active JSON file **before** filtering to admission’s taken IDs and the 20-request cap. Normally `J` media reads; missing listing checksums add digest metadata reads. | [scripted.ts:2382](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:2382), [scripted.ts:2421](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:2421), [scripted.ts:652](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:652) |
| Archive identity | Any valid active request triggers **all `A` archived JSON reads**, including non-request changes. Parsed record IDs are memoized once per capture. This happens before taken-ID filtering. | [scripted.ts:2346](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:2346), [scripted.ts:2417](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:2417) |
| Append history | Unconditionally walks every marked append run, even without an active request: approximately `Σₚ(1+Cᵢ)` content reads, not filtered by this request’s ID. | [scripted.ts:168](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:168), [scripted.ts:673](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:673) |
| Retention horizon | For any unarchived, unrecorded request, when `M≥20`, walks **every kept run** to obtain the minimum manifest `requestedAt`: approximately `Σₘ(1+Cᵢ)`. Counts unfinished folders too; 20 is a trigger, not a maximum. | [scripted.ts:205](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:205), [scripted.ts:675](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:675) |
| Own bookkeeping | Reads requests and hashes files when present; sizes affect bytes/parsing, not the number of files read. | [scripted.ts:660](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:660) |
| Notes | Title matching scans metadata for all visible notes, with **zero content reads**. Bound targets are then read: one for this request, normally at most three for an accepted request. No piles are read in instructions scope. | [scripted.ts:102](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:102), [scripted.ts:654](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:654), [scripted.ts:1245](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:1245), [scripted.ts:1367](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:1367) |

The older all-note link-rewrite loop requires a rename/move; Current-state history requires an applicable state edit; comparison-source reads require a compare request. Those do not follow from the supplied single “Add to…” request. Evidence: [scripted.ts:1331](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:1331), [scripted.ts:1214](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:1214), [scripted.ts:1780](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:1780). The default scripted reply offers no append lines or states: [script.ts:44](/Users/deluisp/Projects/bower-app/src/data/demo/script.ts:44).

**History: what C05 introduced**

`git log --oneline -- src/data/spine/scripted.ts` and the inspected `git show` diffs establish:

- Before `91dc9e1c`, whole-tree metadata discovery, active-journal reads, bookkeeping reads, and conditional note/state-history reads already existed.
- `91dc9e1c` introduced `personalAppendHistory` and its unconditional capture call; `82cbd08c` changed it to obtain completion exclusively through verified `RunRecords.found` chains.
- `33404e73` introduced archive replay detection, reading archived files whose **names matched** active files, then checking record IDs.
- **`3e958da1` (addendum 5) introduced both broad regressions:** replaced name-candidate reads with every archived JSON file, and added `retainedSince` walking every kept run’s complete chain.
- `2f41450c` (addendum 6) added settlement for targets with no offered line; it did not introduce either broad history scan.

**Estimating 757**

For a fresh request with `M≥20`, the approximate count is:
`B + J + A + Σₘ(1+Cᵢ) + T + D + R`,
where `B` is other discovery/admission/bookkeeping traffic, `T` target-note reads, `D` checksum fallbacks, and `R` additional answered retry calls. Physical duplicate records add reads.

Do **not** add append-history and retention-history costs twice: both use the same versioned byte cache. `recordsOf` supplies the existing listing without network calls; repeated bytes share the ID/version read. Evidence: [scripted.ts:155](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:155), [drive.ts:247](/Users/deluisp/Projects/bower-app/runner/src/drive.ts:247), [read-cache.ts:73](/Users/deluisp/Projects/bower-app/src/data/drive/read-cache.ts:73).

Illustrative reconciliation, **not measured inventory**: 20 earlier runs with four checkpoints each contribute 100 historical media reads. With 640 archived changes, the remaining 17 calls give 757. Longer recovery chains reduce the archive count needed. Thus hundreds of unrelated historical files readily explain the call count.

The supplied `/3817` is bytes, not elapsed time. Taken literally, it averages roughly five bytes per call and does not reconcile with hundreds of valid JSON records; the complete timing line or a scripted transport trace would be needed to resolve that discrepancy.

**What `reads` measures; concurrency**

`reads` wraps the already-done report lookup, current-run discovery, and the complete new-plan callback: admission rechecks, Rules repair, provider capture, decision and build. It includes CPU work, network waits and retry backoff; it can include repair writes. It is not a counter restricted to GETs. Evidence: [main.ts:239](/Users/deluisp/Projects/bower-app/runner/src/main.ts:239), [main.ts:256](/Users/deluisp/Projects/bower-app/runner/src/main.ts:256), [main.ts:273](/Users/deluisp/Projects/bower-app/runner/src/main.ts:273), [admitted.ts:155](/Users/deluisp/Projects/bower-app/runner/src/spine/admitted.ts:155).

Nested phase time is subtracted from its parent. `drive=reads:757/3817` counts answered transport calls and sent/received bytes while that phase was active, including answered retry attempts. Evidence: [timing.ts:97](/Users/deluisp/Projects/bower-app/runner/src/timing.ts:97), [timing.ts:111](/Users/deluisp/Projects/bower-app/runner/src/timing.ts:111).

Archive reads use `Promise.all`, limited by the adapter to eight concurrent reads. Active-journal reads are started ahead at the same limit. **History runs are awaited sequentially, and each checkpoint waits for its predecessor’s hash.** Their latency accumulates serially. Evidence: [read.ts:142](/Users/deluisp/Projects/bower-app/src/data/spine/read.ts:142), [read.ts:186](/Users/deluisp/Projects/bower-app/src/data/spine/read.ts:186), [records.ts:231](/Users/deluisp/Projects/bower-app/src/data/spine/records.ts:231), [records.ts:257](/Users/deluisp/Projects/bower-app/src/data/spine/records.ts:257).

**Fix pattern and options**

Use bulk metadata discovery, indexed selection, then by-ID content reads; memoize selected evidence per run. Official references, cited without fetching under the no-network instruction: [Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), [search queries](https://developers.google.com/workspace/drive/api/guides/search-files), [partial-response fields](https://developers.google.com/workspace/drive/api/guides/fields-parameter). The checkout already implements parent queries, pagination, checksums and caching.

Listing supplies **Drive file IDs**, not journal IDs embedded in JSON. Existing names or `bowerAppends=1` cannot identify one request’s evidence safely; the latter is only a broad discovery hint ([records.ts:23](/Users/deluisp/Projects/bower-app/src/data/spine/records.ts:23)). A reliable request-ID-to-evidence index is necessary.

| Option | Approach | Risk / bound |
|---|---|---|
| **a — mitigation** | Gate history on actual admitted requests; share verified lookup results; avoid walking checkpoints merely to obtain manifest age; warm independent reads. | Reduces latency but still scans unrelated history. **Does not meet the lead’s bound.** Reverting to name matching breaks renamed-copy replay safety. |
| **b — metadata discovery** | Stamp request identity and evidence pointers on relevant records; obtain them in the archive listing, select only this request’s IDs, and verify selected bytes through `RunRecords`. Persist the retention horizon instead of reconstructing it from all runs. | Meets the bound with complete discovery metadata. Legacy records, missing/stale stamps and metadata limits need explicit handling; an absent hint must not silently grant fresh consent. |
| **c — durable pointer index** | Extend the existing records mechanism with request-keyed discovery entries pointing to archive evidence, bound targets and verified run evidence, plus a retention horizon. Read only entries and evidence for admitted request IDs. | Strongest explicit contract; requires crash-safe publication and retention ordering. Index divergence, concurrent updates and legacy initialization are the main risks. Keep it a discovery index, with one verification authority. |

Prefer **c**, potentially using **b** for bulk discovery. The lead’s contract must remain explicit: **archive listing once, then by-ID lookups only for the request’s own IDs; no unrelated archive media or kept-run chains.** Cold legacy discovery cannot recover arbitrary embedded IDs from metadata alone: migration or a bounded fail-closed policy needs a lead ruling.

**Proposed red — not executed**

Extend the existing Drive-call golden through actual runner `main`; the harness already reaches it at [corpus-run.ts:261](/Users/deluisp/Projects/bower-app/runner/test/corpus-run.ts:261), and reads timing’s phase counts at [drive-calls-golden.test.ts:22](/Users/deluisp/Projects/bower-app/runner/test/drive-calls-golden.test.ts:22).

Use made-up data: one fresh request, instructions scope, one target, no piles; vary `N=0,100,650` unrelated archived requests and `M=19,20,39` valid kept runs. Include unrelated marked append runs and valid checkpoint chains. Count transport calls only during `main`, excluding fixture setup and assertion reads.

Pin exact per-fixture phase totals, archive listing pagination, **zero unrelated archive/manifest/checkpoint media reads**, and a fixed budget for this request’s selected evidence. Account explicitly for listing pages and post-report retention calls; neither may hide C05 content growth. The current code should fail at `N>0` and at the `M=20` transition.

Add bounded variants for renamed archived replay, pending append after target rename, completion before a lost archive move, and expired consent after retention. Preserve the existing identity and expiry outcomes ([c05-person-notes.test.ts:956](/Users/deluisp/Projects/bower-app/runner/test/c05-person-notes.test.ts:956), [c05-person-notes.test.ts:1061](/Users/deluisp/Projects/bower-app/runner/test/c05-person-notes.test.ts:1061)); use injected transport and clocks, with no real waits.
