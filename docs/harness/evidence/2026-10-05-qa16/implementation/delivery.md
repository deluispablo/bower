# last-run-recovery-validation — immutable candidate

2026-10-05; plan **2026-10-05-contracts-2**, main d12c55e; P2/O3 C12/C14, qa16. Sole assigned implementer `/root/google_setup_rework`; root alone owns shared records/integration/closure. Prepared checkout `/private/tmp/bower-p2-journal-ack`, branch `codex/p2-run-v1-recovery`, clean after commit.

Base: **aaf76ff5036d89662ee79d9bfe05e75bf5e2c981**.
Candidate: **17bbee4ab0d4717f708e8f681de7ba22571176a6**.
Exactly two assigned files: `src/data/fake/fake-worker.ts`, `src/data/fake/fake-worker.test.ts`; one local entry commit,189insertions/16deletions. Prior Add candidate/branches and Google packets preserved. No helper, schema, HTTP, DriveVault/layout/runner production, report-save barrier, readiness, grammar, store, scheduler or shared-record change.

## Result and mechanism

Fresh fake recovery now agrees with the existing durable app reader on invalid saved updates. Parse as unknown, then apply **existing** `isRunnerFile(SYSTEM.lastRun, value)` before copying run or applying reload normalization. JSON syntax and unsupported shape yield logged details and short BowerError unknown: `Bower could not read its latest update. Try again.`

The constructor handles initialization rejection immediately into a retained error sentinel; its promise fulfills, so initialization can finish before any caller without an unhandled rejection. Public status/process await initialization then rethrow that retained error. Process sets lastAllowWeb only after successful initialization. Existing transport errors retain their identity/code. Invalid bytes do not fall through into fresh running scenario dispatch, do not normalize into a synthetic failed run and do not rewrite the file/folder. Missing-file and valid terminal behavior remain. Already valid queued/reading/writing/saving still follow the historical reload-failure policy; saving keeps its truthful partial-movement wording. This bounded compatibility repair does not adopt O4 service recovery.

## Actual test-first proof

Assigned unchanged verify:

```sh
pnpm vitest run src/data/fake/fake-worker.test.ts -t "persisted v1 run fixtures agree across current recovery consumers"
```

Commands used environment `npm_config_verify_deps_before_run=false` only to avoid pnpm's unrelated automatic dependency reverification; no test selector/gate substitution.

Before production edits, owned literal public tests at exact base: `bower-run-v1-owned-red.log` exit1, **21selected:13failed/8passed**,10 historical cases outside pattern skipped. Genuine assertion failures, not setup/import/install failures: status/process resolved instead of readable refusal, last-run/full snapshot changed, nonzero actual Drive mutations, malformed fresh:true running auto-dispatch, swallowed original offline initialization failure, and unknown-phase refusal required before explicit repair. Raw differences include actual queued/new-run responses, rewritten durable bytes and mutation counts. Baseline production file hash was **e5659e4446c97027046ee9b6026173529960f00fd1ebfb9895ff60f556d1456f**; baseline failing test bytes retained as `baseline-red.test.ts`. This original red test is preserved; final test adds only actual positive inbox/report-effect assertions to repaired dispatch after the fix, without changing refusal expectations.

After fix:

| Check | Actual result | Retained log |
| --- | --- | --- |
| Unchanged named verify, final candidate | exit0,21passed/10outside-pattern skipped; no unhandled error | bower-run-v1-owned-green-final.log |
| Entire fake-worker.test.ts including10 original controls | exit0,31passed | bower-run-v1-owned-full-file.log |
| First complete check before extra recovery-effect assertion | exit0,549tests/52files, build/harness212216/bundle/landing | bower-run-v1-owned-check.log |
| Required final full check after that assertion | exit1 despite549assertions/52files passing; one unrelated uncaught focus teardown | bower-run-v1-owned-check-final.log |
| Isolated existing runner-errors test | exit0,1passed | bower-run-v1-unrelated-focus-recheck.log |
| One authorized unchanged final full check rerun | **exit0**,549tests/52files, build/harness212216/bundle/landing | bower-run-v1-owned-check-retry.log |

The retained intermediate gate error is `ReferenceError: document is not defined` in `src/ui/focus.ts` timer, reported from `src/data/runner-errors.test.tsx` after teardown. No source/test/config workaround there. Root explicitly authorized the targeted diagnosis and one full rerun; no repeated loop. Final tree and assertions were unchanged between exit1 and final exit0. That existing timer flake remains a material gate observation, not a finding repaired by this candidate. It is unrelated by stack/source reservation and was not reproduced in its isolated run; no stronger causation claim.

## Compatibility and actual failure/recovery coverage

All fixture bytes are independent inline literals inside the assigned test file, not imported producer output or an expected validator answer. Valid minimal done without report, failed, and valid one-effect report with known optional requests/rulesWorded plus inert additive envelope/run/report metadata match both public consumers and preserve the full snapshot. Optional report absence is parser compatibility only, not useful completion/report-save acceptance.

Ten invalid literal cases match the prior immutable reproduction: malformed JSON, array container, unsupported version, missing/empty id, unknown phase, negative requestedAt, fractional total, malformed report question and nested report array. Public DriveVault.lastRun and fresh FakeWorker.status both refuse. Attempted **FakeWorker.process('all')** also refuses before any Worker admission. Tests wait initialization before status and then attempt process; exact original file bytes, complete FakeDrive snapshot and mutation count0 are asserted after calls. The real synthetic world contains existing pending inbox data and a literal valid current-v1 change record. This proves no **Worker dispatch** on refusal, not that preceding LiveRuns journal flush/app operations cannot write.

Each invalid case repairs deliberately through public get/writeText using just-read modifiedTime, reconstructs a fresh Worker, checks valid RUN_A/done and the app envelope, and preserves the repaired full snapshot during reading. Same-instance initialization failure remains retained: no implicit cached-error clearing, automatic correction or new recovery UX is claimed. A separate repaired-world positive calls process, waits public done, checks persisted report.filed and an actual original Inbox member's changed membership. Existing10 controls retain normal first run/report, fail-once retry, no-work refusals, run capture and reload history. New controls cover allfour valid active phases, missing-file/no-previous-run processing, delayed handled initialization and original offline read error; invalid fresh:true running input cannot auto-start.

## Startup/dependency evidence

Exact base/branch clean before work; adopted plan equals main. bower-session/bower-implement/implementer brief, live ACTIVE and independent prerequisite review read. Git/shell/Node/pnpm/Vitest available; local prepared TypeScript/runtime available. No provider/browser capability needed/used. Assigned exclusive `bash harness/init.sh` ran once after preserving an **independent byte copy** of prepared node_modules. Installer naturally exited1 because registry DNS/tarballs were unavailable; no actual assertion or failed baseline is inferred from installation. No owned process was killed. No duplicate install/network escalation or shared whole-tree link.

Preserved failed installation tree separately, restored prepared independent local runtime, then actual baseline pnpm check passed **528tests/52files**, build and harness212216, before test/production edits. Raw init/baseline logs retained. No package/lock/source workaround. All tracked changes remain the two assigned files; generated outputs/dependency restoration ignored.

## Identity, limits and next handoff

Candidate FakeWorker SHA-256: **205a04dfeac3ea977b490857af32df2544d3a5e1268dcc4a1ea0a7c271c7d504**.
Candidate test SHA-256: **499ca416953c2e7c5db5377acfea4a2d1e759a9a61a68d3cd827b1d47c7fe5c8**.
Exact source/test/diff and raw logs in `/private/tmp/bower-run-v1-implementation/`; manifest `packet-hashes.json` includes this report identity. Scratch reproduction/proposed prerequisite evidence remains unchanged elsewhere; actual owned proof supersedes its status-only limitation.

No browser/preview/provider/credential access, push/deploy, shared registry/progress/ACTIVE/proof mutation, done.sh, phase acceptance or delegation. No screen change or browser gate run/claim. Entry remains open212216 in worker registry. Worker is read-only after this immutable candidate delivery.

Root next: independent original-base→candidate review; then serialized integration and required proof using unchanged verify. Full O3/O4/P2 acceptance, report publication failure guarantees and real provider/runtime premises remain separate. No next-phase implementation.
