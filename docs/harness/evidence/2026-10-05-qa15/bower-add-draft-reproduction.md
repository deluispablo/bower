# S01 Add draft loss: actual public-render reproduction

Plan2026-10-05-contracts-2/P2, C02/C16, approved D02. Sole assigned implementer/root/google_setup_rework; root coordinator alone owns shared records/closure. Exclusive checkout/private/tmp/bower-p2-journal-ack, branchcodex/p2-add-draft-no-loss, base **f739b5c178c67a1d4dc93ace25a8c595d8cbd27e**, source **44ee162abfeb77ec168d18b5e66cd24a43619915**. Plan revision matches local main d12c55e. Actual shell/Git/Node26.10.0/pnpm12.8.1 available; Claude CLI present at/Users/deluisp/.local/bin/claude but not invoked. No browser/provider/delegation/production change/commit/shared-record/done.sh action.

Only new `src/features/piles/Add.test.tsx` was added. Add.tsx, draft-files.ts and historical qa9 bytes match the exact base, as hashed in the companion JSON. Actual render uses DataProvider, MemoryRouter, Add, real public draft-files keep/get/forget, sessionStorage, route and list/text DOM. Typed Sources addPile fixture records admissions and resolves a synthetic Pile; only toast is mocked. It does not pretend to execute real Drive or durable app admission. No DOM disabled-property mutation, private handler call or forced rerender is used.

## Actual dependency/baseline evidence

- Assigned harness/init.sh attempted frozen install and exited1 on registry DNS failure, log bower-add-draft-init.log. This is a tool/install prerequisite failure, **not** an assertion red.
- Explicit offline install from existing home store failed ERR_PNPM_NO_OFFLINE_TARBALL for @typescript-eslint/eslint-plugin@8.71.0, log bower-add-draft-offline-install.log. No package/lock edit or network escalation was made.
- Root approved independent byte copy of idle prepared integration dependencies, preserving internal relative package symlinks. First copy exposed pnpm12 automatic verification-triggered install due to original workspace path in copied ignored metadata; its installer failed before tests, log bower-add-draft-baseline-check.log. No shared whole-tree runtime symlink/hardlink was introduced. An attempted stop found the identified owned installer had already exited; no process was killed.
- Recovered fresh independent copy, localized ignored workspace-state project path and used `npm_config_verify_deps_before_run=false` to prevent automatic registry installation. Verified no external package symlink targets. Prior incomplete trees archived outside the checkout. Copy/recovery records bower-add-dependency-copy.json and bower-add-dependency-recovery.json.
- Baseline **pnpm check exit0,517 tests/51 files**, harness211/214, build/bundle/landing pass before adding the new test, log bower-add-draft-baseline-check-local.log. Existing warning/expected error diagnostics retained. All outputs are in the isolated checkout; no integration build modified.

## Named assertion red and exact effects

```sh
npm_config_verify_deps_before_run=false pnpm vitest run src/features/piles/Add.test.tsx -t "an Add draft with unavailable bytes keeps every member before saving"
```

Actual exit1: **three tests fail through assertions**, no module-load failure, bower-add-draft-red.log. The root should register this unchanged pattern only after this genuine reproduction. Each fixture saves context `Synthetic papers for review` and typed synthetic rows under existing bower:add-draft/bower:add-items; ready file body is SYNTHETIC_READY_BYTES, optional pre-render scan body SYNTHETIC_SCAN_BYTES.

| Case | Actual addPile invocation | Actual after successful fixture result |
| --- | --- | --- |
| Context + unavailable scan.pdf | Once with context and **items=[]** despite the displayed unresolved member | Draft text/list storage removed; route `/`; no visible rows. |
| Missing scan.pdf beside ready outline.txt and source.example link | Once with only outline bytes and link URL; scan row omitted | All storage/rows removed; ready Blob forgotten; route `/`. |
| All three members initially ready; public forget(scanKey) after render, before click | Button proved enabled; once with scan.pdf **without body or URL**, plus ready outline and link | All storage/rows removed; ready Blob forgotten; route `/`. |

The third case proves a render-time ready snapshot is insufficient and directly exercises save-handler revalidation. The first two additionally show the button remains enabled under a static incomplete draft. All cases demand zero addPile dispatch, unchanged stored context/all rows, preserved ready Blob, visible rows and route/add. Soft assertions intentionally continue after the first error to collect the full effect; they do not mask failure. JSON observation lines and companion bower-add-draft-observations.json preserve actual call/persistence/route/Map state.

The newly added test also passes `pnpm typecheck` (exit0), log bower-add-draft-test-typecheck.log; git diff --check is clean. This confirms the red is a behavior assertion, not a type/load failure.

## Boundary and next assignment

This is **S01 reproduction only**. Production remains unchanged and no candidate commit or green fix is claimed. Root registers one entry/unchanged verify and explicitly authorizes Add.tsx/Add.test.tsx plus exact qa9 policy migration before fixing. Expected smallest scope: refuse save if any displayed file lacks bytes, recheck the whole current set before dispatch and leave storage/rows/context/ready bytes untouched; explicit Remove/reselection can recover, clear only after confirmed success and preserve on rejected addPile.

After authorization, controls should cover explicit removal/current reselection, note/link-only and zero-byte input, no duplicate dispatch and rejected admission preserving draft. Historical qa9 successful omission/toast requirement is contradicted by approved D02; retain its old evidence and document the intentional migration rather than silently deleting a test. Existing partial-pile-readiness, durable byte retention, hash-verified reselection, account binding/device cleanup, upload platform/reopen/readiness contracts and accepted-work durability are distinct obligations, **not solved or certified here**. Full demo/fake/manual evaluation remain root-serialized and NOT RUN by this worker.
