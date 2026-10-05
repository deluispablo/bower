# Independent current-v1 recovery candidate review

2026-10-05. Reviewer `/root/prerequisites_review`; root coordinator sole integrator/shared-record writer. Plan **2026-10-05-contracts-2**, main **d12c55e**, P2/O3 C12/C14, qa16 entry **last-run-recovery-validation**.

Exact immutable range: **aaf76ff5036d89662ee79d9bfe05e75bf5e2c981 → 17bbee4ab0d4717f708e8f681de7ba22571176a6**. Prepared checkout `/private/tmp/bower-p2-journal-ack`, branch `codex/p2-run-v1-recovery`, clean at inspection. Candidate has exactly the assigned base as sole parent and changes only `src/data/fake/fake-worker.ts` and `src/data/fake/fake-worker.test.ts` (189 insertions/16 deletions). Read-only Git diff/source/test/log review; no execution of tests, builds, modules or providers.

## Verdict

**No actionable Critical, Important or Minor finding in this bounded candidate.** Suitable for serialized coordinator integration and the required unchanged harness proof/gates. The original Important consumer mismatch is repaired by the inspected implementation and supplied assertion-sensitive tests. This report closes no entry, contract package or phase. O3 overall compatibility, O4 execution durability, O8 evaluation and real-provider semantics remain separate.

## Implementation and compatibility

| Requirement | Inspection / exact references |
| --- | --- |
| Validate before accepting durable input | `fake-worker.ts:195–207` parses into unknown then calls existing `isRunnerFile(SYSTEM.lastRun, value)` before copying run or normalizing phases. Invalid syntax/shape cannot set run, write last-run or reach fresh-running auto-start at221. The prior v1-only cast and truthy run check are removed. |
| Shared current contract | Existing layout guard/RunWire/report checks remain unchanged. Same guard used by DriveVault rejects invalid envelope/run/report, while valid minimal terminal files without optional report and additive inert fields stay compatible. No new version, phase, wire or stricter future report barrier is invented. |
| Managed asynchronous failure | Constructor at51–54 attaches catch immediately, logs and stores the actual error in an explicit wrapper, and fulfills loaded. The wrapper does not confuse an undefined thrown value with no failure. Public status at130–134 and process at116–127 await initialization then throw the retained error. Failure is not swallowed into idle; initialization has an immediate rejection handler even if callers arrive later. |
| Readable errors | JSON SyntaxError becomes the existing short BowerError unknown sentence; unsupported shape has a fixed diagnostic plus that same sentence. Non-SyntaxError read/list errors retain original identity/code through the sentinel. Existing offline:true bypass/online refusal remains unchanged. Diagnostics remain console details; this entry introduces no provider/privacy logging guarantee. |
| No refused dispatch | Process checks failure before its option bookkeeping, active-run return, pile/journal lookup or start. Invalid constructor load throws before scenario auto-start. Source inspection and supplied tests with waiting inputs show no FakeWorker dispatch or Drive effect after refusal. This does not certify preceding LiveRuns journal flush effects. |
| Legitimate reload behavior | Valid queued/reading/writing/saving runs still become failed under the existing page-owned fake-runner policy. Saving retains partial-movement wording, other valid phases retain the historical nothing-moved wording. Write/read failures now remain refusals rather than being consumed; no scheduler, lease, rollback or durable accepted-run guarantee is added. |
| Missing/terminal states | No file remains normal null status; pending input can subsequently be processed. Valid done/failed/report-bearing states preserve snapshots. `wire` still strips the optional report and retains additive run fields; no source/device/schema API changed. |
| Explicit recovery | Invalid bytes are kept until deliberate public get/writeText using just-read modifiedTime, followed by a fresh Worker. The original instance's initialization failure remains retained. Fresh read returns repaired terminal data; a separate positive retry dispatches, reaches done, persists a nonempty filed report and changes actual original Inbox membership. No same-instance retry UX, automatic repair or global report-save barrier is claimed. |

The source range changes no layout/type/WorkerHttp/DriveVault/fake-runner/seed/session/store/UI/scheduler file. Existing ten historical FakeWorker tests remain byte-for-byte in the added-test diff, apart from new imports above them. Whitespace diff check is clean.

## Assertion proof reviewed

Unchanged verify:

```sh
pnpm vitest run src/data/fake/fake-worker.test.ts -t "persisted v1 run fixtures agree across current recovery consumers"
```

The new group has **21 cases**: 3 valid literals, 10 invalid literals, invalid fresh-running auto-start, missing-file processing, all4 valid active reload phases, delayed original offline read failure and positive repaired dispatch. Literal expectations are independent test input, not producer helpers or validator-derived expected outcomes. The synthetic pending journal record is the current valid v1 literal used by the prerequisite packet; full FakeDrive snapshot includes content, metadata, parents, Bin and counters.

Invalid cases compare public DriveVault.lastRun with public fresh FakeWorker.status and process. Initialization is allowed to settle before callers. Status/process BowerError type, code/sentence, original file bytes, full snapshot and zero onChange mutations are checked. Soft assertions retain all observed failures rather than hiding later data-loss outcomes. Repair uses current public modifiedTime; fresh readers leave the repaired snapshot exact. The separate recovery-effect check proves at least one actual original Inbox member changed place and a persisted filed report exists; it is not an assertion of complete immutable-ready-set/manifest or source knowledge quality.

I read the raw red log: genuine assertion failures show resolved/null or new queued wires where rejection was expected, original file/snapshot differences and nonzero mutations. **21 selected:13 failed/8 passed**, 10 historical controls excluded by the named filter. The 13 failing cases are the 10 invalid fixtures, fresh-running invalid auto-start, swallowed offline load and initial unknown-phase refusal in the positive repair case. No import/setup/installation failure is represented as this red.

`baseline-red.test.ts` is preserved. Diff to final test changes only the positive repaired-dispatch case to inspect existing Inbox input before dispatch and then assert persisted report/file effect; it does not weaken any refusal expectation. Supplied final selected log has **21 passed/10 filter exclusions**; entire file log has **31 passed**. The immediate handled constructor promise and clean delayed tests are consistent with no new load-init unhandled rejection.

## Full gate observation, preserved honestly

First full check passed549 tests/52 files. The later full check after strengthened recovery-effect assertions reported549 passing assertions/52 passing files **but exited1** due one uncaught `ReferenceError: document is not defined` in the existing `src/ui/focus.ts:7` timer, attributed to `src/data/runner-errors.test.tsx` after teardown. That execution is not green. Isolated unchanged runner-errors test then passed1, and one authorized unchanged full rerun passed **549/52**, build/harness/bundle/landing, exit0. No source/test/config workaround outside the two assigned files appears in the immutable candidate.

This is a **material retained test teardown observation**, not a candidate defect demonstrated by this review, and not a failure proven repaired merely because the unchanged rerun passed. No stronger causation/root-cause inference is made. Root should retain the failed log and distinguish any recurrent harness reliability work from this entry. Candidate acceptance still requires coordinator integration/check/proof; the worker's retry does not replace those obligations.

Supplied init failed on installer DNS/unavailable tarballs after a prepared dependency byte-copy backup; baseline check528/52 was subsequently actually green before owned red. No install failure counts as test-first assertion evidence. No changed package/lock/config or repeated installation is present in the candidate. Browser/provider gates were not executed for this delivery and none are inferred.

## Frozen evidence identity

- Delivery `/private/tmp/bower-run-v1-implementation.md`: **9172 bytes**, SHA-256 **006f907d0bf208f52ae01f5dd0d323e347b04b1c574ebdb11cff291a657461c2**.
- Manifest `/private/tmp/bower-run-v1-implementation/packet-hashes.json`: SHA-256 **5a5930062abcea6494c3bf3a0796b7207969c20f8921110c4c5742797a058d5b**.
- Independently read and hashed all **15 listed packet files**: declared lengths/hashes match, no mismatch. Packet includes exact base source, owned red test/log, final source/test/diff, intermediate failed check, isolated diagnosis and unchanged successful retry.
- Candidate source SHA-256 **205a04dfeac3ea977b490857af32df2544d3a5e1268dcc4a1ea0a7c271c7d504**; candidate test **499ca416953c2e7c5db5377acfea4a2d1e759a9a61a68d3cd827b1d47c7fe5c8**. Base source hash **e5659e4446c97027046ee9b6026173529960f00fd1ebfb9895ff60f556d1456f**, matching original reproduced consumer.
- Original prerequisite report and reproduction remain untouched: `/private/tmp/bower-run-v1-prerequisite-review.md`, `/private/tmp/bower-run-v1-reproduction.md` and its manifest. Their status-only/process-NOT-RUN limitation is now supplemented by these actual owned public process tests, not rewritten historically.

No independent execution/native evaluation/provider proof or phase acceptance. HTTP RunWire validation is distinct from durable envelope/report validation. Shared readiness, content extraction/grammar, report-save failure/replay, browser-independent admitted work, authoritative attempts, other malformed durable consumers, D01/D02 and full capability corpus remain unresolved outside this packet. Only this new scratch report was written by reviewer; no repository/shared records, credentials, delegation or closure action.
