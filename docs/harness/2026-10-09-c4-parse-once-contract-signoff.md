# Codex contract sign-off: c4-parse-once (TL-P4-28 ruling 1)

Read-only, medium effort, on the packet at d9e9ebca. Tokens: input 282718 (cached 229504), output 2909.

Reviewed HEAD `d9e9ebcacc107e2c0d7dd3d3bc06d90d5645a1b7`. All 13 cited parse-call locations, `ownership-format.ts:163/:222`, and `ARCHITECTURE.md:98` match. No files edited or tests run. The reds are specifications; neither named test exists at HEAD.

1. **Important — Packet:21–24: generated versions contradict “md5 the run read.”**  
   `note-edit.ts:463/:464` and `:697/:698` parse before/after candidates. `:775–783` carries generated text between changes without reading Drive. Reusing the fetched md5 would give the after-text stale spans; excluding candidates leaves repeated parsing outside the promised coverage.  
   **Suggested wording:** “Parse at most once per `(fileId, md5Hex(exactBytes))` within the invocation, including generated intermediate and after versions. Retain the source file id, compute each candidate’s own md5, and validate before and after independently through `parseOwnership`.”

2. **Important — Packet:24: the memo owner and lifetime remain implementation guesses.**  
   Runner planning and effects meet at `runner/src/main.ts:259–277`. Fake planning happens before admission (`fake-worker.ts:276–279`), while application happens later in the service (`fake-run-service.ts:451–473`). An engine-local memo therefore misses fake planning; separate planner/effects memos duplicate the mechanism. Recovery also makes “run” ambiguous between a logical run id and an attempt.  
   **Suggested wording:** “A run means one execution attempt, not all recoveries sharing a run id. Create one context before planning, pass that same context through planning and effects, and discard it on every exit. Name the fake planning-to-service handoff explicitly; recovery creates a fresh context. Standalone app operations share no run context.”

3. **Important — Packet:22–24: bytes/text-only callers lack identity and checksum provenance.**  
   `parseOwnership(bytes)`, `applyChanges(bytes, changes)` and `parseNote(path, raw)` receive no file id. The effects path reads bytes at `engine.ts:462` and checks SHA-256, not md5, at `:467–468`. A listing checksum could describe different bytes.  
   **Suggested wording:** “Thread the actual file id from the caller. Use existing `contracts/hashes.ts::md5Hex` on the exact bytes supplied to the parser, including UTF-8 encoding of unnormalized text. Never infer identity from path, name or bytes, and never fetch metadata solely to obtain a memo key.”

4. **Important — Packet:24: some covered calls have no existing file id.**  
   `scripted.ts:2009` edits a synthetic rule fragment; `:2071–2074` edits a template for missing Rules.md. Both reach the named parser sites but have neither a fetched checksum nor an existing file id. Universal coverage under the stated key is impossible without an exception.  
   **Suggested wording:** “Synthetic fragments and templates without an assigned file id remain uncached and are excluded from the per-file count. They still use `parseOwnership`. Existing-note candidates retain their source file id.”

5. **Important — Packet:34: the spy cannot attribute its calls as specified.**  
   `parseOwnership` receives only bytes (`ownership-format.ts:163`). Identical bytes can belong to different files, and a fetched file’s generated candidates have different hashes. The packet supplies no attribution mechanism or exact expected keys. “At most 1” can also pass with zero observed calls.  
   **Suggested wording:** “Keep the exact test name. Observe actual parser misses with their context key; assert a nonempty, explicit set of expected `(fileId, md5)` keys, exactly one parser invocation for each, and the expected resulting bytes. Exclude fixture setup and assertion-time parsing from observation.”  
   The current code demonstrably repeats parses, but whether this unspecified spy fails today cannot be established.

6. **Important — Packet:35: “parse count is 2” is underspecified and need not be red.**  
   Today’s code already reparses changed bytes. The fixture also needs to distinguish the two fetched versions from generated candidates. A two-version guard alone could pass without any memo. It does not exercise stale reuse after a write made by the run itself.  
   **Suggested wording:** “Keep the exact test name as a correctness guard, not a guaranteed red. Read version A, write version B through the existing fenced path, then read B in the same context. Assert one miss for each fetched-version key, cache reuse on repeated reads, and B’s exact sections/output; count generated candidates separately. Add an external-change variant.”

7. **Important — Packet:34–43: acceptance lacks identity, lifetime and runner coverage.**  
   A fake-only optimization can satisfy the proposed red while the production runner still reparses. Different files sharing bytes are not exercised, nor are subsequent attempts/runs. A long-lived cache or a content-only key could pass both proposed tests. Existing runner tests and Drive goldens do not measure parser reuse.  
   **Suggested wording:** “Run the parse-count assertions through both the fake Worker/service entry point and `runTidy`. Include two file ids with identical bytes, repeated unchanged versions across planning and effects, a second invocation, and recovery. Assert separate entries per id and fresh misses in every new invocation. Review that all misses use the existing parser and one shared context.”

8. **Important — Packet:24, 30, 43: owned files are missing.**  
   `WORKER.md` permits touching only packet-owned files. The packet names parser sites and broad test directories but owns no explicit files for the context, threading, fake handoff, runner adapters, tests or mechanism-map edit. Naming those choices only in delivery notes is too late.  
   **Suggested wording:** “Add an explicit owned-file list covering the memo home, contract signatures, planner/read adapters, runner entry point, fake Worker/service handoff, named test files, `docs/ARCHITECTURE.md`, and notes. Resolve the owner and handoff before implementation.”

9. **Minor — Packet:14–17, 36: historical performance evidence is presented as current.**  
   `fake-worker.test.ts:4325` now tests ten **small** notes and the edit cap. The large-note workload and encoding bound are at `:4359–4395`, named `the size-cap run fits its time bound with no load`, with `encoded < 3_000_000_000`. The diagnosis measured an earlier revision and proposed b1 once per **decision**, whereas the ruling requires once per **run**.  
   **Suggested wording:** “Label the 850 parses and 75% profile as historical diagnosis measurements. Cite the current large-note test at :4359 and preserve its exact encoding bound and convergence assertions. Addendum 18 supersedes diagnosis b1’s per-decision scope.”

10. **Minor — Packet:27, 43: “do not rise” is weaker than the existing goldens.**  
    `runner/test/drive-calls-golden.test.ts` requires exact totals of 78 and 88, plus exact C04 phase counts. A reduction or phase redistribution can satisfy the packet’s words while failing its prescribed verification. The numeric citations themselves are correct.  
    **Suggested wording:** “Keep the existing Drive-call goldens unchanged: C04 exactly 78, the 25-earlier-runs case exactly 88, and the existing phase-count assertions unchanged. Obtain memo hashes locally without adding Drive calls.”

verdict: CHANGES; findings: 10
