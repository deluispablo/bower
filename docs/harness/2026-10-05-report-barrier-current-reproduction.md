# Current terminal-report barrier reproduction

Root coordinator, 2026-10-05. contracts-2/P2 C12/C14, existing open `run-report-save-barrier` / qa13. Exact clean documentation checkpoint `58142863052f3f9e3ebd0d5b64caa374962a1faa`, product `1dc7f64`, adopted main3136adc. Isolated public-API runtime observation, no production/test/interface/phase change, browser/provider/private credentials, install or new harness entry.

One current FakeDrive is seeded with existing made-up default fixtures and a current FakeWorker. A wrapper rejects only a terminal done-with-report last-run write **before that write's effect**, using DriveApi-conforming BowerError offline. Every prior phase/file operation uses unchanged production methods. Six independent controls pass: initial stored input exists, exactly one terminal report refusal, actual source-file identities moved outside Inbox, durable phase remains saving, durable run identity matches admission, and durable report absent.

Actual counts:17 initial input files,15 of those same IDs actually moved to other visible places,0 remaining Inbox files,1 refused final report write. Public status is **done**, while persisted state is **saving with no report** for the same logical run. The final assertion genuinely fails: `completion must not be published before the actual report is durably recoverable`. No setup/load/TypeError red. The expected BowerError is logged by current FakeWorker's catch.

```sh
node /private/tmp/bower-report-barrier-1dc7f64.cjs /Users/deluisp/Projects/bower-app /Users/deluisp/Projects/bower-app/node_modules/typescript/lib/typescript.js
```

Actual exit1 is the final AssertionError; source/Git tree stayed unchanged. Exact script/log are archived under `evidence/2026-10-05-o1/current-report-barrier-1dc7f64/`. This corroborates the historical143ae2b producer fault after the current-v1 recovery-loader repair, using a conforming fault and actual effects rather than only result messages. It is an observed **fake producer** persistence barrier and plausible shared storage boundary, not a claim a deployed real Worker/runner performed this behavior.

No storage recovery, same-run retry or second-client reopen was executed. The existing named Vitest verify remains planned, not green. Full closure requires lead-adopted O3/O4 effect/report intent and retry authority: recover the same effects/report without blind filing replay or premature done. Merely returning failed and discarding the report is insufficient. Existing valid v1 done-without-report fixtures remain compatible; this semantic barrier does not authorize rejecting that legacy schema. No new wire enum/scheduler/P3 service is implemented.

Current-v1 and S02/Add closures remain valid; registered count214/217 unchanged. Later coordinator supplement does not rewrite frozen O1 audit/report evidence. No future fake script labels can replace actual stored effect checks. R1 provider operations are stopped/authority disabled after the one inconclusive R1-D02 case; this isolated reproduction makes no real calls.

## Hashes

- `probe.cjs.txt`: `0d834bda003f30f82ab624ec276bccabfb0fa1089aeef918d0c0613a2bd5180f`
- `result.log`: `c048184499049f32dae535f98da42e706b17903641e95c233259c97299815177`
- `src/data/fake/fake-worker.ts`: `205a04dfeac3ea977b490857af32df2544d3a5e1268dcc4a1ea0a7c271c7d504`
- `src/data/fake/fake-runner.ts`: `80c86052a376705620431ff333017ce4cff65a2266605da7431ec7924c3dd396`
- `src/data/drive/fake-drive.ts`: `0438820862bc60c464c790a42fe541736f1575c397197fef60f2a9499ad655c7`
- `src/data/fake/seed.ts`: `6992d62064e24964adc9b18f18ef44716964cdc28394315135ab77bca14c4651`
- `src/data/vault/layout.ts`: `9487e04defe7444bf596fef63d1485100db81ff309af2589e244972bedcf5376`
