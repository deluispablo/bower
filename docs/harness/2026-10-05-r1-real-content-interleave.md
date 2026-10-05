# R1 real Drive content-interleave observation

Status: **Observed counterexample; the current write strategy is refuted.** Open finding R1-OBS01, Important. No production remedy or dependent contract is accepted by this observation. P2 remains open.

Root coordinator `p2-orchestrator-2026-10-05-01a10bbd` operated the single authorized case at integration `c349099`, product source `1c1e60c0c6dee4b610cd845ee0a3c393f265370f`, planning `2026-10-05-contracts-2` / main `53034a9`. The current three Drive source files matched the immutable loader pins before execution. Frozen instrument manifest `508b06d6d3107bd833e1ba51444e56a89572c6fa74ef64a0a7bfa8dff2750e00`, independently reviewed clean in report `1fe8ef5f60c4507506257f4a90a0b7f428f8ccbd09ebcad22101ed5252dada9c`. The reviewed instrument's prior two Important and one Minor findings were repaired before this operation.

## Actual observation

Started `2026-10-05T19:55:02.034Z`; runtime monotonic elapsed `14040.529333 ms`. Three independent current-equivalent DriveHttp clients A, B and observer O used one existing owner-approved grant. A and B denote adapter actors, not different people or accounts. All content was the independently specified tiny synthetic literals. Only one new marked folder and one Markdown file were created; no personal content lookup occurred.

| Order | Actual upstream operation | Result |
| --- | --- | --- |
| 1 | A independently reads BASE, then completes its final metadata/version precheck | HTTP 200; equality passes; its unchanged media PATCH is held before forwarding |
| 2 | B independently reads and writes literal B | Actual media PATCH HTTP 200 |
| 3 | O independently reads after B | Exact B hash confirmed |
| 4 | A is released with its original queued PATCH, after current authority/token checks | Actual media PATCH HTTP 200 |
| 5 | O independently reads final provider content | Exact A hash confirmed; B's external contribution is gone |

Literal hashes were computed before execution, rather than derived from final output:

- BASE: `7e7ecf43f5d9feb00ff2556e27f41de5b4a5a8d0a935078259329e5d8fed84d4`.
- B: `99fd3b90f0097166980afb537c22fd2d02bf2237ea2102c6dadcf230c8540c03`.
- A: `ea3b57534932f4b1b4e4519bd72fd0cdb867e7673296d1235ee2298569e9c997`.

The source implementation checks modifiedTime with a GET and then performs an unconditional content PATCH. This observation demonstrates a lost-update window between those operations on real Drive. It does not establish that every write races, nor that Google cannot support a different conditional strategy. The existing fake version check cannot certify protection in that interval.

The process returned exit **2**, with `observed-refuted`, not a setup failure. Root separately checked ordered actual upstream records, literal hashes and raw cleanup confirmations from the retained private manifest without printing IDs, tokens, metadata bodies or headers. The final public result hash is `7fd2ceae2085c6a615dbc982aaa6eb69e5af341b1987276d5d7214dafcd13883`.

## Bounds and cleanup

24 actual HTTP attempts: 23 Drive operations and one successful existing-session refresh. Aggregate request/response body accounting: 9134 bytes. Hard limits were 60 attempts including at most two refreshes, 600000 ms and 65536 body bytes, with cleanup reserves; these are accounting limits, not network framing measurements.

After the first counterexample the instrument stopped the strategy and executed only allowed cleanup. It verified owned file metadata, sent the file to Bin and independently read explicit `trashed:true`; verified the synthetic root had no live children, checked its ownership, sent it to Bin and independently read `trashed:true`. All cleanup requests returned HTTP 200. `cleanup.completed:true`, residual aliases `[]`. Nothing was hard-deleted or restored. Root disabled both matching private execution authorities afterward and retained the owner-only manifest. No further provider requests or optional experiments followed.

The unchanged owner client, grant, scope, callback and original OAuth session were reused. No consent repeat, live revocation, client rotation, production runner, model, deployment or product main merge occurred. Public evidence contains aliases, fixed operations, statuses, timings, counters and synthetic hashes only. Private resource identity and credentials were not copied into the repository.

## Decision and next dependency

R1-OBS01 blocks acceptance of dependent O3/O4 preservation/conflict contracts and P2 closure. Independent S02 memory-cleanup work remains permitted because its five paths do not affect Drive writes. Do not patch the product with post-write checks or an app-local lock and call the overwritten external bytes safe.

No ETag or Last-Modified header was observed on this case's successful metadata, media or content-write responses. This is route/sample evidence only. A conditional remedy would require a separately specified and reviewed provider probe with a real matching-validator positive control and stale-validator negative control, plus independent content reads proving refusal without loss. An output version or fabricated header is not an input precondition. This case did not attempt any conditional header.

The technical lead must select and specify the next demonstrably safe remedy: observe a supported conditional operation, or define compatible immutable effects with explicit conflict reconciliation. Keep the Worker small and mechanical rules deterministic. Serialize the DriveApi contract, real/fake producers and consumer compatibility fixtures before implementation; preserve user-owned bytes and truthful recovery. This report supplies evidence and a bounded recommendation, not authority to choose a new architecture or relax the accepted requirement.

Move/rename, conditional updates, lost response, other grants and the remaining R1–R4 cases are untested. The probe explicitly refuses restarted CLI cleanup; inline cleanup succeeded, which is not general browser-independent recovery evidence. The observation closes this one execution disposition, not R1, O3 or P2.

Evidence: [sanitized provider events](evidence/2026-10-05-local-prerequisites/r1-real-content-interleave/events.log), [independently checked result](evidence/2026-10-05-local-prerequisites/r1-real-content-interleave/result.json), [instrument review](evidence/2026-10-05-local-prerequisites/r1-content-probe-v2/independent-review.md). The corresponding source and immutable packet are preserved in the integration records.
