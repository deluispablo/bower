**upload-resume-after-reload — adversarial review, pass 4 (scoped)**

Verdict: **PASS**  
Range: `48ce0fd7..71573ab4`

No Blocking findings.

- `src/data/upload-queue.ts:429,582`: Owner completion supplies the full member identity and reserved ID. The observer retains it before asynchronous read-back or takeover changes the generation.
- `src/data/upload-resume.test.ts:701`: The unseen-reservation regression is pinned. It fails against the baseline and passes at HEAD, including read-back before recovery offers, no picker and no second create. The reserved-ID control also passes.
- `src/data/upload-queue.ts:91–99`: Payload-free messages retain their existing notification behavior; completion payloads pass through the browser adapter.
- `src/data/upload-resume.test.ts:575–582`: Fixture repair only changes callback typing and payload forwarding. Assertions and bounds are unchanged.
- No second mechanism, new store, completion ledger or Drive scan.

Minor / v1 limits:

- No additional defects found within scope.

Validation: five regression/control test bodies and browser-bus probes passed in memory. Full check/e2e were not run. No files edited; no network used.
