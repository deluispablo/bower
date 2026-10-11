**B1c index — adversarial review, pass 4 (scoped)**

**Verdict: PASS** — `a79d292a..07543a59`

Blocking findings: none.

Verified:

- **runner/test/b1-index.test.ts:965:** Warm runs with one/two changed notes pin **39/40 calls** in both scopes, through maintain and the done report. Each changed note gets one Range request, without metadata.
- **runner/src/index.ts:226:** Cold runs retain the precheck; addendum 11’s count and timing assertions are unchanged.
- **runner/src/drive.ts:215:** Prefix reads still use the single `ReadCache`; no second cache or reader was added.
- **src/data/drive/read-cache.ts:94:** Changed versions use separate keys. An older response finishing late cannot replace the newer cached prefix. Independent in-memory probes passed.
- **src/data/spine/report.ts:306:** Removing `retrievalSummary` leaves no references in `src` or `runner`; `indexedFront` remains used by `refreshed`.

Minor / v1 limits:

- **src/data/contracts/note-format.ts:171:** Front matter beyond 4,096 bytes remains the accepted discovery limit.
- **runner/test/corpus-run.ts:261:** Whole-run tests create temporary files, so they were not rerun under this review’s no-write constraint. Existing logs show all 630 runner tests passing, including warm controls and cold pins.

Review was offline; no files were edited.
