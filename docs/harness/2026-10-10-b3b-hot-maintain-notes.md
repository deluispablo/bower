# B3b hot maintain — red-session delivery

implementer: codex

Role: red-owning session only, TL-P4-29. Worktree `/private/tmp/bower-b3b-hot-maintain`,
branch `b3b-hot-maintain`, unchanged HEAD `54f1694ac435774d36356454564a217fb633c116`.
No production edits, network, writing git commands, commits, or real data. The coordinator commits.

## Reds

Every exact test name below fails at the unchanged HEAD on an assertion. The shared observer records
only production `main` traffic through the existing corpus driver and pretend Drive v3. It does not
count fixture seeding, admission, or post-run inspection. Existing driver exports and renderHot are
checked with requiredFunction; missing exports produce failed expects rather than undefined calls.

| Exact name | File | HEAD assertion and positive control |
| --- | --- | --- |
| B3b hot: filing writes hot once and the next prompt puts it at position 6 | runner/test/b23-hot-context.test.ts | Zero hot sends, no hot target in maintain, and no persisted hot read/prompt text. Control: the actual source files successfully; retrieval and barrier each send once; the next production planner is called with a new inbox item. Pins preceding instructions/types, Rules, About me and index, following item text, and the read before semantic context. |
| B3b hot: date-only refresh keeps the old bytes without another write | runner/test/b23-hot-context.test.ts | Changed-content control sends zero hot writes and leaves an unsupported thread. Control: ordinary retrieval commits on bootstrap and on a visible feed change the next day. The date-only guard already passes at HEAD, including unchanged bytes and modifiedTime; a changed-content hot send must pass too. |
| B3b hot: hidden-only feed drains its cursor and leaves hot untouched | runner/test/b23-hot-context.test.ts | Visible bootstrap's positive hot control sends zero writes. Control: real feed discovery advances the retrieval cursor after made-up .obsidian changes. Hidden-only hot immutability already passes at HEAD. |
| B3b hot: a Home answer removes only its settled Open thread | runner/test/b23-hot-context.test.ts | Both actual runs lack hot/Open threads. Control: answerQuestion files the actual letter and removes its authoritative question by file id; an unrelated folder question remains. Both hot snapshots must retain the unrelated thread and only the answered thread disappears. |
| B3b hot: unused-baseline.json no longer exempts hot.ts | runner/test/b23-hot-context.test.ts | Hot remains in both the actual baseline's findings and reasons. Control: the detector recognizes an exact hot.ts token and rejects index.ts. |
| B3b hot: unused-production-baseline.json no longer exempts hot.ts | runner/test/b23-hot-context.test.ts | Hot remains in both the actual baseline's findings and reasons. Same positive and negative detector controls. |
| B3b hot: pre-plan failure and done redispatch send no hot writes | runner/test/b23-hot-recovery.test.ts | Settled instruction-only positive control sends zero hot writes. Control: Rules really changes and retrieval commits; an injected provider failure reaches the Worker's failed status before a manifest exists. Pre-plan derived-write and done zero-write/zero-hot-read guards already pass at HEAD. |
| B3b hot: a lost maintain reply resumes the same manifest and writes hot once | runner/test/b23-hot-recovery.test.ts | No hot send reaches the lost-reply fault; HEAD completes instead of remaining resumable. Control: actual filing and companion creation settle, one immutable manifest persists, and its existing checkpoint chain validates. The fault stores hot through the real adapter before losing its reply, then blocks hot reconciliation until redispatch. Recovery must reuse the manifest, avoid replanning/repeating filing or companion changes, validate ordinary checkpoints, and send hot once before the barrier. |
| B3b hot: evidence-only method verdict covers hidden unarchived refresh | runner/test/second-brain-method.test.ts | Scorer still finds Evergreen launch, Lost letter, and Filed the Lost letter in .bower/hot.md; HEAD also has no last-run report. Control: the actual corpus case, preserved unsupported seed, method verdict and production provider call are observed. Expected score requires hidden hot rebuilt from evidence with no hot archive or knowledge/report rows. |

Negative lifecycle guards intentionally use soft hot-positive assertions so they execute even while hot
is absent at HEAD. A no-op implementation cannot satisfy these controls. No test is skipped or isolated.
Nine red tests fail; the five pre-existing tests in the touched method file pass. There are no module-load,
missing-global, timer, TypeError, or other non-assertion test failures in the final run.

The evidence-only fixture remains `covers: model`: offline scripted execution is lifecycle evidence,
not a model-quality claim. No new corpus case was added. Its existing method verdict row was strengthened
for Q5 (no archive) and TL-P4-45 (.bower/hot.md). The seed moved byte-for-byte into .bower.
The original expected.json stays byte-for-byte unchanged under the owner's preservation instruction;
the new red supplies the ruled location and no-archive guards as additive test-local expectations,
retaining all content and report requirements. The original root-hot assertions need a lead-owned repair.
At this pre-B1c HEAD its empty execution reply also leaves no last-run report; this dependency is exposed,
not hidden by relaxing the fixture. Failure-before-plan protections remain in the separate lifecycle red.

## Compatibility rows and preserved conflicts

| Existing contract | Disposition |
| --- | --- |
| Every existing TypeScript test assertion, including the five method assertions | Preserved; only new tests were appended/created. |
| b23-hot-evidence-only expected.json | Every assertion preserved, including conflicting root hot paths. The new red pins .bower/hot.md separately, retaining every heading/exclusion/report requirement and adding absent-root/archive guards. |
| runner/test/b1a-contract.test.ts:219, bounded maintain write-set test | Preserved conflict: permits only retrieval/index or framed MOC writes, so new hot sends fail it. TL-P4-42 Q5 explicitly adds hot to that same bounded set. Red-owner repair requires lead/coordinator allocation; implementation must not weaken it. |
| harness/corpus/b23-hot-question-answer/expected.json | Preserved conflict: root hot.md paths contradict TL-P4-45. Its q-ask-p-1 assertion also differs from the file-subject question generated by its $file reply at HEAD. The new test resolves the actual file id and preserves the old fixture assertions. |
| Both unused baselines | Preserved until implementation wires hot; the new assertions require removing the finding and its reason from each baseline. |
| Existing goldens and thresholds | Preserved. No numbers, timeouts, fixture tolerance, or timer budget changed. |
| B3a date validation and same-day focus ordering minors | No existing assertions changed; passed to the implementation via this note, as the packet requests. |

tests changed: none of the existing assertions. The appended B3b method red uses Q5/TL-P4-45 expectations
without editing the legacy evidence-only expected.json. Both legacy hot fixtures' root-path conflicts are preserved.
removed: harness/corpus/b23-hot-evidence-only/folder/hot.md: identical bytes moved to folder/.bower/hot.md.
removed: no existing test, assertion, production code, baseline exemption, or gate was removed by this session.

## Research and mechanism verdict

Offline research used the packet's prep and TL-P4-39 cache-order section, plus the landed maintain and
corpus-driver code. The prep cites [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching):
the stable prefix precedes hot, neighbourhood and items. This is an offline reference, not newly fetched documentation.
Idempotent derived-file rebuilds reuse runner/src/index.ts's deterministic reduction and src/data/spine/write-once.ts's
operation identity/readback through the existing checkpoint engine. The standard controller reconciliation model is an
offline reference at [Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/).
No second production write path, checkpoint protocol, pending-question store, parser, or model call was introduced.
The new observer is test instrumentation around the existing driver, never a fixture-authored successful output.

## Validation

Final command, exit 1 as intended:

`pnpm -C runner exec vitest run test/b23-hot-context.test.ts test/b23-hot-recovery.test.ts test/second-brain-method.test.ts --maxWorkers=2`

Output: tmp-logs/b3b-reds.log. Only failures were read. Exact final assertion verdicts are in
tmp-logs/b3b-verdicts.txt, checked from Vitest's JSON report: 9 assertion reds, 5 existing tests passed.

| Check | Result | Log |
| --- | --- | --- |
| tsc --noEmit -p tsconfig.app.json | Pass, exit 0 | tmp-logs/b3b-tsc-app.log |
| tsc --noEmit -p tsconfig.node.json | Pass, exit 0 | tmp-logs/b3b-tsc-node.log |
| runner tsc --noEmit -p . | Pass, exit 0 | tmp-logs/b3b-tsc-runner.log |
| runner eslint on the four touched TypeScript files | Pass, exit 0 | tmp-logs/b3b-eslint.log |
| git diff --check | Pass; read-only command | No output |

No pnpm check, unrelated corpus tests, e2e, server, or live model was run: this red-only session was explicitly
limited to touched test files and the three tsc projects plus touched-file eslint. Full gates belong to later
implementation/coordinator work. Logs are local artifacts, not committed by this session.

## Files

- runner/test/b23-hot-context.test.ts
- runner/test/b23-hot-recovery.test.ts
- runner/test/b23-hot-observe.ts
- runner/test/second-brain-method.test.ts (new test appended; existing assertions unchanged)
- harness/corpus/b23-hot-evidence-only/case.json
- harness/corpus/b23-hot-evidence-only/rubric.md
- harness/corpus/b23-hot-evidence-only/folder/.bower/hot.md (moved unchanged from folder/hot.md)
- docs/harness/2026-10-08-p4-method-rubric-changes.md (existing verdict strengthened)
- docs/harness/2026-10-10-b3b-hot-maintain-notes.md

Coordinator handoff: commit the red tests/fixture/verdict separately from these notes; no commits were created here.

## Lead-authorized assertion repairs (2026-10-10, B1c/B3b red repairs)

tests changed: runner/test/b1a-contract.test.ts:217: TL-P4-42 Q5: permit .bower/hot.md in the existing bounded maintain write set; the existing at-most-one count and all MOC guards remain unchanged.
tests changed: harness/corpus/b23-hot-question-answer/expected.json:6: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.
tests changed: harness/corpus/b23-hot-question-answer/expected.json:18: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.
tests changed: harness/corpus/b23-hot-question-answer/expected.json:52: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.
tests changed: harness/corpus/b23-hot-question-answer/expected.json:64: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.
tests changed: harness/corpus/b23-hot-question-answer/expected.json:94: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.
tests changed: harness/corpus/b23-hot-question-answer/expected.json:106: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.
tests changed: harness/corpus/b23-hot-evidence-only/expected.json:4: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.
tests changed: harness/corpus/b23-hot-evidence-only/expected.json:13: TL-P4-45: locate this hot assertion at .bower/hot.md; preserve every content and report expectation.

Preserved: harness/corpus/b23-hot-question-answer/expected.json:79 q-ask-p-1 contradicts no supplied ruling; unchanged and reported. Its known file-subject identity conflict remains for the lead. All numbers, goldens, thresholds, fixture bytes and other assertions remain unchanged. Prior preserved-conflict rows describe the original red delivery; the root-hot and bounded-set conflicts alone are repaired by this round. No production edits or git writes.

### Repair-round verification

- `pnpm -C runner exec vitest run test/b1a-contract.test.ts test/b23-hot-context.test.ts test/b23-hot-recovery.test.ts test/second-brain-method.test.ts --maxWorkers=2 --outputFile=../tmp-logs/b3b-repairs-verdicts.json`: 23 pass, 9 assertion reds; all 18 B1a tests pass, including the repaired bounded-write test. All nine B3b reds listed above remain red (hot implementation/baseline work pending). Log: tmp-logs/b3b-repairs-tests.log; exact verdicts: tmp-logs/b3b-repairs-verdicts.json and tmp-logs/b3b-repairs-summary.txt.
- Only the two changed fixtures were additionally exercised with a temporary Vitest probe/config in tmp-logs, through the existing runScripted driver, fake time and `--maxWorkers=2`. Both remain assertion-red; exact scorer failures: tmp-logs/b3b-repairs-fixtures.json, readable summary: tmp-logs/b3b-repairs-summary.txt. The question-answer fixture still reports its preserved q-ask-p-1 identity conflict; evidence-only still retains unsupported evidence and lacks a report. No unrelated corpus cases ran. Initial temporary probe setup had a config import failure, then a missing localStorage stub; both were corrected. The final probe uses the existing B3b storage stub pattern and has only assertion failures.
- App, node and runner `tsc --noEmit` pass (exit 0): tmp-logs/b3b-repairs-tsc-app.log, tmp-logs/b3b-repairs-tsc-node.log, tmp-logs/b3b-repairs-tsc-runner.log. ESLint for test/b1a-contract.test.ts passes (exit 0): tmp-logs/b3b-repairs-eslint.log.
- Read-only HEAD comparisons confirm both expected.json files differ solely in the eight hot paths, and the TypeScript file solely in the ruled bounded-set allowance and its citation. No fixture content bytes, other assertions, numbers, goldens or thresholds changed. No full gates, e2e, network or writing git command ran. Coordinator owns commits.

## Implementation

Status: blocked before production edits. This session read the worker card, packet contracts 1–5,
TL-P4-42, the B3b prep row and the prior notes. No network, test edits, node_modules replacement,
or writing git commands were issued directly. The requested src suite includes harness tests
that change throwaway git repositories in OS temp; this worktree's git state was not mutated. No implementation or commit is claimed.

### Offline research

[Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
is the stable-prefix reference already cited in the prep: keep instructions/types, Rules, About me
and index before hot at fixed position 6, and volatile neighbourhood/items after it. This is an
offline citation, not newly fetched documentation. Hot remains derived context, never authority.

[Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/) is the
offline reference for idempotent reconciliation of derived state from primary evidence. The local
proven mechanism is maintain's persisted declaration plus the engine's checkpoints and write-once
stamps: runner/src/index.ts:278, src/data/spine/engine.ts and src/data/spine/write-once.ts.
Rebuilding hot must extend that mechanism, compare with sameExceptDate and commit retrieval last.
No hot archive, independent checkpoint protocol or alternate writer is warranted.

### Blocking interface and exact scope rule

The packet names docs/harness/2026-10-10-b23-prep.md. Its line 94 says:
“No change to `runner/src/index.ts` ... is assigned here. If B3 needs an interface those B1 homes
lack, the lead returns that interface to its B1 owner; do not silently add those paths.”
The worker skill (.agents/skills/bower-implement/SKILL.md) likewise requires the smallest fix in
packet-owned files, and WORKER.md requires returning a missing mechanism to its owner.

That missing interface is present on the supplied branch:

- runner/src/index.ts:249 fixes the target list to index and retrieval; it reserves ids and freezes
  target versions in the maintain declaration at lines 250–275. There is no extra-target argument.
- runner/src/index.ts:324 renders only MOCs, index and retrieval. An added hot target reaches
  undefined text and throws at line 325. maintenanceEffects accepts only the Drive adapter.
- runner/src/main.ts:416 calls withMaintenance, and line 420 uses maintenanceEffects. Wrapping
  these with a separate hot writer would bypass the existing per-target fence/reconciliation loop.

The required owner handoff is a scoped extension of this same maintain home for hot's declared
primary inputs, reserved target, rendering and sameExceptDate guard, or an explicit allocation of
runner/src/index.ts to this entry. The current prep explicitly returns this gap to B1's owner.
No production or baseline change was made while this allocation is unresolved. The P4-88 date
validation/day-then-path ordering minors are still pending, along with lifecycle and prompt wiring.

### Contract contradictions and full targeted inventory (TL-P4-51)

The complete runner suite was executed, not just its first failure: 638 passed, 9 failed, 647 total.
The nine failures are the expected unimplemented B3b assertions, not contradictory requirements:

| Test entry point | Exact name |
| --- | --- |
| runner/test/b23-hot-context.test.ts:29 | B3b hot: filing writes hot once and the next prompt puts it at position 6 |
| runner/test/b23-hot-context.test.ts:85 | B3b hot: date-only refresh keeps the old bytes without another write |
| runner/test/b23-hot-context.test.ts:115 | B3b hot: hidden-only feed drains its cursor and leaves hot untouched |
| runner/test/b23-hot-context.test.ts:139 | B3b hot: a Home answer removes only its settled Open thread |
| runner/test/b23-hot-context.test.ts:162 | B3b hot: unused-baseline.json no longer exempts hot.ts |
| runner/test/b23-hot-context.test.ts:162 | B3b hot: unused-production-baseline.json no longer exempts hot.ts |
| runner/test/b23-hot-recovery.test.ts:16 | B3b hot: pre-plan failure and done redispatch send no hot writes |
| runner/test/b23-hot-recovery.test.ts:56 | B3b hot: a lost maintain reply resumes the same manifest and writes hot once |
| runner/test/second-brain-method.test.ts:175 | B3b hot: evidence-only method verdict covers hidden unarchived refresh |

Both supplied hot fixtures were additionally exercised unchanged through runScripted/main from a
probe in /tmp, using fake time and pretend Drive. Every scorer failure is captured in
/tmp/b3b-hot-maintain-fixtures.log. The evidence-only fixture has only its three unsupported hot
claims left; both runs deliver reports successfully on this branch.

The sole observed fixture incompatibility beyond unimplemented hot is:

- harness/corpus/b23-hot-question-answer/expected.json:79 requires q-ask-p-1. Its committed
  file-subject reply produces q-ask-f18; the existing authoritative-identity control at
  runner/test/b23-hot-context.test.ts:150 requires askId(letterId). Changing the authoritative
  question id to satisfy the old fixture would violate contract 3/Q6's existing-question source.
  The prior repair notes preserved this conflict; it remains unchanged here. The other six scorer
  failures in that fixture are missing hot files/sections, which are ordinary implementation reds.

The repaired root-hot paths and bounded write-set assertion no longer conflict. All B1a tests,
B3a tests, corpus tests and existing method tests pass. No assertion was weakened or repaired.

### Drive-call goldens

No golden moved: production is unchanged. These are measured baseline results, not estimated
post-implementation hot costs. The full runner run includes the production-main modelled fixtures.

| Golden assertion | Measured baseline | Measured delta |
| --- | --- | --- |
| runner/test/drive-calls-golden.test.ts:26 | Cold C04 92 Drive calls | 0 |
| runner/test/drive-calls-golden.test.ts:28 | Timing ledger 92 Drive calls | 0 |
| runner/test/drive-calls-golden.test.ts:32 | reads 24, apply 52, checkpoints 4, report 10, runner 2 | 0 per phase |
| runner/test/drive-calls-golden.test.ts:82 | Retention test's cold C04 control 92 | 0 |
| runner/test/drive-calls-golden.test.ts:84 | With 25 earlier runs 103 | 0 |
| runner/test/drive-calls-golden.test.ts:86 | reads 27, apply 51, checkpoints 4, report 10, runner 11 | 0 per phase |

Exact pre-hot goldens are retained. Their authorized fixture-specific hot deltas cannot be measured
until the maintain interface is available; no test number or bound was changed.

### Validation and artifact handling

All command logs are in the OS temporary folder. The runner command overrode the configured JSON
report path with --outputFile.json=/tmp/b3b-hot-maintain-runner.json. The shared timer setup also
emits CPU reports into test-results/cpu. That side effect was discovered after the first invocation;
this session's newly generated reports were moved to /tmp/b3b-hot-maintain-artifacts, preserving
older reports. Subsequent diagnostics use a /tmp Node preload redirecting artifact writes, and a
/tmp Vitest config directing the cache into /tmp. No test or repository config was edited.

| Check | Result | Log |
| --- | --- | --- |
| runner vitest run --maxWorkers=2 | 638 pass; 9 expected B3b reds | /tmp/b3b-hot-maintain-runner.log |
| src vitest run --maxWorkers=2, with /tmp output/cache routing | 5614 pass; 3 environment/setup failures; 1 listen error | /tmp/b3b-hot-maintain-src.log |
| Both unchanged hot corpus fixtures via main | 2 assertion reds; full scorer failures retained | /tmp/b3b-hot-maintain-fixtures.log |
| tsc --noEmit -p tsconfig.app.json | Pass | /tmp/b3b-hot-maintain-tsc-app.log |
| tsc --noEmit -p tsconfig.node.json | Pass | /tmp/b3b-hot-maintain-tsc-node.log |
| runner tsc --noEmit -p . | Pass | /tmp/b3b-hot-maintain-tsc-runner.log |
| eslint on the four inspected runner integration files | Pass; no touched TypeScript files | /tmp/b3b-hot-maintain-eslint.log |
| node scripts/check-unused-gate.mjs | Fail: boundHot/sameExceptDate unused; regular hot file baseline stale | /tmp/b3b-hot-maintain-unused.log |

The unused-production pass has 28 known findings and passes with the unmodified baseline. Its hot
exemption still must be removed when hot is wired. Removing it while hot is unconnected would
create a new unused-production failure rather than complete this entry.

pnpm check and e2e were not run: this is a blocked pre-implementation delivery with no UI change.
The standard pnpm check scripts also write test/build artifacts and a checkout mark into the repo;
the session's explicit temporary-output constraint takes precedence over the skill's default gate.
The direct requested checks above preserve their exit results rather than claiming a green mark.

removed: none; no production code or baseline exemption removed before the required B1 interface handoff.
removed: current-run generated CPU reports and scratch directories relocated to /tmp/b3b-hot-maintain-artifacts; older reports preserved.
tests changed: none

### Compatibility row drafts

| Existing contract | Draft disposition |
| --- | --- |
| B1a single maintain effect and retrieval-last reconciliation | Preserved; hot extension blocked on its owner-held interface. |
| B1c cold in-memory index and warm one-Range prefixes | Preserved; no edits to index, MOC, retrieval, feed or read cache. |
| Q1c authoritative live questions | Preserved; no new question store or changed asking identity. |
| Old maintain declarations/checkpoints | Unchanged; no persisted-schema change or second recovery protocol. |
| TL-P4-45 runner writes at .bower/hot.md | Existing allowlist already includes hot; target integration pending. |
| Q5 no archive and semantic-only replacement | Pending in the existing maintain home; no alternate writer added. |
| Prompt position 6 and boundHot | Pending; B1d's builder remains the required home. |
| P4-88 validated dates and focus day/path order | Pending; no unsupported modifiedTime inference introduced. |
| Golden counts and threshold numbers | Preserved; all observed deltas zero before implementation. |
| Test ownership and node_modules | Preserved; no committed test/config edits or node_modules replacement. |

### App-suite failures and final verification

The complete src run finished: 165 files passed, 2 failed; 5614 tests passed, 3 failed.
These failures are outside B3b's production contract:

- src/e2e-port.test.ts:37, “a server from another worktree is never reused”: localhost listen
  is denied with EPERM in this sandbox, followed by its 5000 ms timeout and one unhandled error.
- src/harness.test.ts:627, “a test that passes only on retry fails a batch run”, and
  src/harness.test.ts:641, “a quarantined test that passes on retry is reported, not failed”:
  their shared setup at lines 599–603 creates test fixtures under repository test-results/fx-.
  This conflicts with the session's temporary-only test-output instruction. The initial /tmp
  routing covered writes but missed mkdtempSync, so those two setups first failed with ENOENT.
  The newly created empty fixture directories were relocated to OS temp as well.

Only those two tests were re-exercised after correcting mkdtempSync and asynchronous artifact
routing in the /tmp preload. Both still fail before their fixture runs: moving the fixture outside
its original package ancestry makes Playwright load its .ts config as CommonJS, and the imported
batch module then rejects import.meta. Log: /tmp/b3b-hot-maintain-src-recheck.log. This is a
relocation/setup limitation, not an application regression. No committed test was changed,
skipped or relaxed; the targeted rerun used -t and the full suite above ran every test.

Final read-only git diff --check passes. Only this notes file is modified. A modification-time
inventory confirms no current-session report files remain under either repository test-results
folder. TypeScript, runner ESLint and the production baseline checks were not needlessly rerun.

## Fixture repair

tests changed: harness/corpus/b23-hot-question-answer/expected.json: authoritative question id (TL-P4-42 addendum 4)

Changed only q-ask-p-1 to q-ask-f18, matching askId(letterId) and the authoritative control
at runner/test/b23-hot-context.test.ts:150. The rubric names neither id and needs no change.
This resolves the question-id contradiction recorded under Implementation / Contract contradictions.

Validation: the existing /tmp corpus probe ran b23-hot-question-answer through runScripted/main:
`NODE_OPTIONS='--import=/tmp/b3b-hot-maintain-output.mjs' pnpm -C runner exec vitest run --config /tmp/b3b-hot-maintain-fixtures.config.mjs -t b23-hot-question-answer --maxWorkers=2`
Exit 1: only six missing .bower/hot.md file/note expectations remain (final and both runs).
No question-id failure remains. Log: /tmp/b3b-hot-maintain-fixture-repair.log.
The unrelated evidence-only probe was filtered out. Reports, CPU artifacts and cache stayed in /tmp.
No network, production edits, node_modules changes or writing git commands; coordinator commits.


## Implementation

2026-10-11, escalated implementation under TL-P4-42 addendum 4. This section supersedes the earlier
allocation block: the owner explicitly assigned runner/src/index.ts and main.ts until handoff.
Status: blocked at the frozen acceptance assertions listed below (TL-P4-51), with production changes
left reviewable in this worktree. No network, writing git command, commit, test edit, installation,
node_modules replacement or node_modules symlink was performed by this session.

### Offline research applied

[Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
is the stable-prefix reference: reusable instructions/types, Rules, About me and index precede
bounded hot at fixed position 6; per-run ids, answers, neighbourhood and items follow that prefix.
This is an offline citation, not freshly retrieved documentation. The existing prepared builder
serializes those fields in that order, and the production prompt/read-order red verifies it.

[Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/) is the
standard reconciliation reference for rebuilding a derived view from primary evidence and making
repeated reconciliation idempotent. The local implementation reuses maintain's immutable manifest,
per-target fences, operation stamp, readback and existing checkpoint engine. Retrieval remains its
last commit target; there is no second writer, checkpoint protocol or hot archive.

### Changes and boundaries

- Maintain has a generic DeclaredTarget slot: kind/path, declaration, renderer and an optional
  unchanged guard. Index is its first kind and hot its second. Both declaration and renderer join
  the existing target loop; future B8 health, B4 and B11 can supply the same slots.
- Targets persist their kind and primary source bytes, paths, SeenFile versions and VerifiedContent
  hashes inside maintain. The manifest reader validates source dates/versions and hashes. Existing
  targets without kind/declaration still render by their original path. The ordinary checkpoints
  continue to bind this one persisted declaration through the manifest hash.
- Hot reads the authoritative questions, Bower project/area hubs through the existing hub and
  Timeline parsers, and archived/captured journal evidence. Uncaptured pending journal files are
  excluded. Applied outcomes update the frozen inputs; rejected writes add no proposed evidence.
  The current run's settled report supplies its Bower filing/creation/update rows.
- Main reads hot after recovery/done controls and before semantic read-ahead. It uses the run's
  versioned read cache and boundHot. Claude's existing prepared builder receives the text, plus
  cached Rules/About me/index context in the fixed prefix order.
- Hot writes only when !sameExceptDate, with the original content version, the ordinary op stamp
  and the existing lost-reply reconciliation. Instruction-only, answer-only, no-item evidence
  refresh, date-only, hidden-only, pre-plan failure and done redispatch controls pass.
- P4-88: renderHot rejects an invalid today, excludes malformed/impossible evidence dates, and
  sorts Current focus by calendar day then path. No modifiedTime supplies an evidence date.
- Thread labels use the authoritative subject identity and frozen file name. The unchanged repaired
  q-ask-f18 fixture passes, including its exact Inbox label and removal after Home's answer.

removed: harness/unused-baseline.json: files runner/src/hot.ts runner/src/hot.ts finding.
removed: harness/unused-baseline.json: corresponding hot.ts reason.
removed: harness/unused-production-baseline.json: files runner/src/hot.ts runner/src/hot.ts finding.
removed: harness/unused-production-baseline.json: corresponding hot.ts reason.
removed: no test, assertion, threshold, fixture content, archive or alternate production writer.
tests changed: none

### Every observed contract conflict before stopping (TL-P4-51)

The complete runner suite ran: 632 passed, 15 failed, 647 total, across all 49 files. All 15 failing
tests are listed here, including the four soft cells of the warm golden. Assertions remain frozen.
The new B3b assertions, B3a reduction, corpus and method controls pass; both hot fixtures pass.

| Exact test (runner/test/) | Entry/assertion | Measured conflict with the added hot target/prefix |
| --- | --- | --- |
| B1c fix 4: a warm run with changed notes counted through maintain equals the pre-addendum-9 count | b1-index.test.ts:965 / :1009 | instructions/1 and all/1: 39 → 45 (+6); instructions/2 and all/2: 40 → 46 (+6). |
| B1a contract: round 4 1: a folder binned before planning drops every indexed descendant | b1a-contract.test.ts:846 / :825 | Declared-input discovery 3 → 4 (+1 questions media for hot). |
| B1a contract: round 4 2: a folder moved outside drops its indexed subtree and commits the cursor | b1a-contract.test.ts:864 / :825 | Same +1 declared questions media. |
| B1a contract: round 4 3: a renamed folder updates descendant paths and index order without media reads | b1a-contract.test.ts:881 / :825 | Same +1 declared questions media. |
| B1a contract: round 4 4: an inside folder move updates recursive paths and regroups without media reads | b1a-contract.test.ts:900 / :825 | Same +1 declared questions media. |
| C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media | c05-bounded-reads.test.ts:267 / :262 | Shared cold planning golden 24 → 25 (+1 questions media for hot). Historical assertions at :288 and :290 also prohibit hot's journal inputs; these are masked by the first failed baseline assertion. |
| C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence | c05-bounded-reads.test.ts:302 / :262 | Shared cold planning golden 24 → 25 (+1 questions media for hot); later assertions do not run after this failure. |
| C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk | c05-bounded-reads.test.ts:639 / :670 | Requires zero archive media; hot reads the 50 archived journal files as primary evidence. No historical run manifests/checkpoints are read by hot. |
| the C04 run makes the golden number of Drive calls per step | drive-calls-golden.test.ts:7 / :26 | Total 92 → 96 (+4); identical timing golden at :28 and phase golden at :32 are masked by :26. |
| the C04 cut keeps its budget plus the 13 authorized maintenance calls | drive-calls-golden.test.ts:45 / :50 | Measured 96 against frozen ceiling 95; total delta +4 from its 92-call control. |
| with 25 earlier runs a run makes 99 Drive calls | drive-calls-golden.test.ts:71 / :82 | Cold control 92 → 96 (+4); retained fixture at :84 measures 103 → 107 (+4). |
| the raw model input on the C04 fixture equals its golden copy | model-input-fingerprint.test.ts:84 / :92 | Frozen wire has runId/admission before index; stable-prefix contract places index before volatile ids. |
| plan reads finish under the budget with modelled Drive latency | reads-report.test.ts:33 / :40 | 2,730 → 2,880 ms (+150); frozen strict bound is 2,825 ms. |
| with 25 earlier runs plan reads stay within their measured maintenance delta | reads-report.test.ts:43 / :47 | 3,180 → 3,330 ms (+150); frozen bound is 3,180 ms. |
| the timing line counts calls and bytes per phase and names the region | timing-counts.test.ts:6 / :14 | Total 92 → 96 (+4); per-phase assertion at :20 is masked by :14. |

These assertions require the pre-hot traffic/wire while packet contracts 1–5 require hot's primary
reads, single fenced write and stable prompt slot. WORKER.md's TL-P4-51 says to list every
contradicting test before stopping; the owner also expressly forbids this session from changing
any test. No golden, threshold or fingerprint was repaired. Lead/coordinator allocation is needed
for the frozen assertions and the journal-history budget ruling. This is not the earlier q-id or
index.ts ownership block; those are resolved.

### Drive-call golden measurements, pinned per fixture

| Frozen golden | Measured value/delta | Named hot calls |
| --- | --- | --- |
| runner/test/drive-calls-golden.test.ts:26, :28; runner/test/timing-counts.test.ts:14 | Cold C04 92 → 96 (+4) | questions.json media (+1 reads); hot create's name-check child listing, live .bower parent fence and create (+3 apply). |
| runner/test/drive-calls-golden.test.ts:32; runner/test/timing-counts.test.ts:20 | reads 24 → 25 (+1), apply 52 → 55 (+3); other phases unchanged | The same four named calls; measured from timing's own meter. |
| runner/test/drive-calls-golden.test.ts:84–85 | C04 with 25 earlier runs 103 → 107 (+4); reads 27 → 28, apply 51 → 54 | The same four named calls; no run-history media for hot. |
| runner/test/b1-index.test.ts:1009 | instructions/1 = 45 (+6); all/1 = 45 (+6); instructions/2 = 46 (+6); all/2 = 46 (+6) | Existing hot media + questions media + hot reconciliation metadata + ordinary write precheck metadata + live target fence + hot PATCH. Ordinary note Range assertions still pass. |
| runner/test/b1a-contract.test.ts:825, four fixtures at :846, :864, :881, :900 | discovery 3 → 4 (+1), each independently | Declared questions media for hot. |
| runner/test/c05-bounded-reads.test.ts:262 (shared by :267, :302) | cold C05 planning reads 24 → 25 (+1) | Declared questions media for hot. |
| runner/test/c05-bounded-reads.test.ts:670 | 0 → 50 archive media (+50), horizon fixture | Archived journal primary input media; no new checkpoint walk. |

No golden moved on disk. The measurements above are drafts for an owner of the assertions, not
permission to loosen their values. The full existing call dump is in
/tmp/b3b-implementation-call-trace.log. Hot is written at the same maintain op stamp as retrieval;
there is no hidden independent send and no hot archive call.

### Compatibility row drafts

| Contract/home | Draft disposition |
| --- | --- |
| B1a immutable manifest + checkpoints + fences | Same single maintain operation and engine; additive typed target declarations; opening/closing chain verifies in the lost-reply red. |
| Legacy maintain declarations | Optional kind/declaration; index/path fallback retained; existing parser/contract fixtures pass. |
| B1c cold in-memory index and warm Range | Existing projection and prefix home retained; source-note Range controls pass; only named hot traffic changes the frozen counts. |
| B1d prompt builder | Existing prepared serializer receives bounded hot; position/read-order red passes; old raw fingerprint needs an assigned repair. |
| Q1c authoritative live questions | No new question store or consent; settled questions JSON supplies hot; q-ask-f18 and Home answer fixture pass unchanged. |
| TL-P4-45 runner ownership | Existing RUNNER_WRITES already names .bower/hot.md; app write permissions untouched. |
| Q5 date guard/no archive/hidden reporting | One target, sameExceptDate, no archive and no created/updated report row for hot; production lifecycle controls pass. |
| B8 health, B4, B11 | Join by kind/path + declaration + renderer + optional unchanged guard in the same maintain home; no new writer here. |
| Current Bower recent changes | Current settled report rows plus archived/captured journal records are projected. Past Bower report rows are not scanned or retained in a second store. Historical log completeness remains for the journal-home ruling; no claim of a new historical-log mechanism. |
| Frozen call/prompt/budget assertions | Not changed; all conflicts and each measured fixture delta are above. |

### Validation and constraints

- Initial red: exact B3b context/recovery/method command, 9 assertion failures and 5 existing passes,
  /tmp/b3b-implementation-red.log. One initial invocation inherited runner's repository-output
  defaults before they were noticed; later invocations redirect both JSON and CPU/fixture artifacts
  to OS temp. Those initial artifacts were moved to /tmp/b3b-initial-red-artifacts; the reporting mistake is recorded rather than claimed absent.
- Complete runner suite: 632 pass / 15 fail; /tmp/b3b-implementation-runner.log and .json.
  The failures are the complete inventory above. No assertion was weakened.
- Final hot/context/recovery/reduction/method targeted run: 149/149 pass;
  /tmp/b3b-implementation-hot.log and .json. Includes every nine original B3b reds.
- Both unchanged hot fixtures: 2/2 pass through the pre-existing OS-temp probe and production main;
  /tmp/b3b-implementation-fixtures.log. q-ask-f18 requires no further fixture repair.
- pnpm exec vitest run src --maxWorkers=2: 5,614 pass / 3 fail / one unhandled EPERM in 167 files;
  /tmp/b3b-implementation-src.log. src/e2e-port.test.ts:37 cannot listen on 127.0.0.1 in this sandbox.
  src/harness.test.ts:627/:641 (assertions :631/:643) depend on relocating their generated Playwright
  fixture outside the repository; initial relocation broke module/package resolution. These are
  environment constraints, not hot-contract contradictions. Recheck details are in the validation
  artifact referenced below. Final harness recheck: 47/47 pass after an OS-temp loader preserved the existing
  @playwright/test ESM resolution for relocated fixtures. No module was replaced, and no
  node_modules replacement or symlink was used. The one port-listening failure remains sandbox-bound.
- Final touched src contracts/scripted tests: 1,420/1,420 pass; /tmp/b3b-implementation-src-final.log.
- App, node and runner tsc --noEmit: pass; separate /tmp/b3b-implementation-tsc-{app,node,runner}.log.
- ESLint on every touched TypeScript file: pass, run separately from runner/root with their existing
  configs; /tmp/b3b-implementation-eslint-{runner,app}.log. The first combined-root invocation could
  not choose tsconfigRootDir; the separate invocations resolve that tool setup error.
- node scripts/check-unused-gate.mjs: both passes green (2 ordinary and 27 production known findings),
  /tmp/b3b-implementation-unused.log.
- No pnpm check/green mark or e2e suite: stopped on TL-P4-51's frozen assertions; ui:false, no screen
  changed. The requested component gates ran individually with artifacts in OS temp.
- No git-writing command or commit. The src suite's harness tests operate on throwaway repositories
  as designed; none of this session's git commands mutate this worktree. Read-only diff checks pass.

Files: runner/src/index.ts, runner/src/main.ts, runner/src/hot.ts, runner/src/claude.ts,
src/data/contracts/run-manifest.ts, src/data/spine/scripted.ts, harness/unused-baseline.json,
harness/unused-production-baseline.json, and this notes file. No test/fixture source file differs.

Validation index: /tmp/b3b-validation.md. Final read-only diff check passes; the changed-file inventory
contains only the eight production/baseline files and these notes. All tests and corpus fixtures are unchanged.

## Addendum 5

2026-10-11, TL-P4-42 addendum 5. The first implementation is committed at `9e23ad6e`;
this continuation leaves the three owned production files and these notes uncommitted for the coordinator.
The owner authorizes per-fixture cold golden re-pins and the raw fingerprint reorder, and reserves every
assertion edit to the red owner. Implementation is complete; the frozen assertions remain unchanged.

### Implementation and existing homes

- `runner/src/hot.ts` now prepends this run's validated settled rows to the prior hot's dated
  Recent changes rows, keeps their prior order and exact row bytes, and trims the combined window
  to ten. With no prior hot, only this run contributes. Undated/malformed prior claims are excluded.
  Open threads and Current focus are still rebuilt from authoritative questions and hub Timelines.
  The 300-word reduction and date-only guard remain. Provenance names only this run's primary ids;
  carried prose does not invent journal ids.
- `runner/src/index.ts` persists the already-read previous hot as a versioned declaration source.
  Only this run's captured, unarchived journal files can join the declaration; their archive moves
  must have settled into the archive before they contribute. These current inputs share the
  planner's read cache. No archived journal file is listed as a hot input or read for hot.
  Successful report rows join those settled current changes; rejected proposals never do.
- The existing declared-target slot has a `cachedCheck` option. Hot's first content precheck uses
  its declared bytes/hash/version, then the ordinary writer performs the live name/place/version
  fence immediately before the send. Fresh hot refreshes no longer fetch reconciliation evidence
  and precheck evidence separately. Replay still fetches live stamped evidence. The cached evidence
  is consumed once before sending and cleared in `finally`, so lost-reply readback is live.
  This extends the same maintain target loop, ordinary effects and checkpoint engine; no second
  writer, write protocol, read cache or persisted store was added. Retrieval still commits last.
- `runner/src/main.ts` loads prior hot through `planReads().readText` after recovery/done checks
  and before semantic read-ahead. Declare, unchanged comparison and prompt share that exact version.
  The existing question reader's small-empty-list shortcut is reused on warm hot declarations;
  nonempty questions use the same versioned cache as the provider. Applied question writes update
  the frozen hot inputs before rendering, including Home's settled answer.

Offline sources remain [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
[Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/) and the repository's
ReadCache/SeenFiles/ordinary-effects implementation. ReadCache cites RFC 9110's versioned-response model.
No network request was made for research, models, Drive or documentation.

### Frozen measurements, per fixture and assertion

Values below are measured through production `main`, including maintain. The full runner suite ran all
647 tests. A separate OS-temp observer wraps timing's existing meter without changing any frozen test,
assertion, fixture or production result. It records named requests and their actual phases. Numbers are
measurements for the red owner, not edited goldens.

| Frozen test and assertion (runner/test/) | New value; pre-hot control | Named calls and disposition |
| --- | --- | --- |
| `drive-calls-golden.test.ts:7`, total :26 and timing total :28 | **96**; 92 (+4) | questions.json media in reads (+1); hot create name-check child listing, live .bower parent fence, multipart create in apply (+3). |
| Same test, phases :32 | **token 0, reads 25, model 0, apply 55, checkpoints 4, report 10, status 0, runner 2** | reads was 24 and apply 52; all four calls named above. Other phases unchanged. |
| `drive-calls-golden.test.ts:45`, ceiling :50 | **96** against frozen 95 | Same four cold hot calls. Apply-time control at :53 passes: **6,230 ms**, against 8,025 ms. |
| `drive-calls-golden.test.ts:71`, cold :82 / retained :84 / phases :85 | Cold **96**; retained **107** (controls 92 / 103, both +4) | Same questions media and three hot-create calls per fixture. Retained phases: **token 0, reads 28, model 0, apply 54, checkpoints 4, report 10, status 0, runner 11** (reads was 27, apply 51). No hot history media. |
| `b1a-contract.test.ts:846`, discovery :825, binned folder (trashed and removed cells) | **3**, was 3; first implementation 4 | retrieval media, changes feed, old index media. Hot was already loaded into cache; empty questions require no new declaration media. Both cells pass. |
| `b1a-contract.test.ts:864`, discovery :825, outside folder | **3**, was 3; first implementation 4 | Same retrieval media, feed and index media; passes. |
| `b1a-contract.test.ts:881`, discovery :825, renamed folder | **3**, was 3; first implementation 4 | Same three calls; passes with zero descendant media. |
| `b1a-contract.test.ts:900`, discovery :825, inside folder move | **3**, was 3; first implementation 4 | Same three calls; passes with zero descendant media. |
| `c05-bounded-reads.test.ts:267`, shared planning golden :262 | **25**, was 24 (+1) | Cold declared questions.json media. No hot journal-archive input/media. The shared hard assertion still stops this test before its later history cells. |
| `c05-bounded-reads.test.ts:302`, shared planning golden :262 | **25**, was 24 (+1) | Same cold questions media. Its preceding append/recovery controls execute; later pending cells remain masked by the shared frozen assertion. |
| `c05-bounded-reads.test.ts:639`, horizon archive media :670 | **0**, frozen 0; first implementation 50 | Zero historical archive media and zero manifest/checkpoint media. Positive append and all three horizon-age cells pass; four independently traced runs each have zero archive media at request time. |
| `b1-index.test.ts:965`, warm count :1009, instructions/1 | **42**, was 39; first implementation 45 | +1 hot media before semantic reads, +1 live target metadata fence, +1 hot PATCH. **One** additional fenced write. Zero hot reconciliation/precheck metadata calls and zero additional questions media. |
| Same warm test, instructions/2 | **43**, was 40; first implementation 46 | Same three named calls; one additional fenced hot PATCH. |
| Same warm test, all/1 | **42**, was 39; first implementation 45 | Same three named calls; one additional fenced hot PATCH. |
| Same warm test, all/2 | **43**, was 40; first implementation 46 | Same three named calls; one additional fenced hot PATCH. |
| `reads-report.test.ts:33`, plan reads :40 | **2,880 ms**, was 2,730 (+150); frozen bound <2,825 | One sequential cold questions media at modelled 150 ms. Pre-first-write read count **26**, including the runner-phase read; timing's reads-phase count is 25. |
| `reads-report.test.ts:43`, retained plan reads :47 | **3,330 ms**, was 3,180 (+150); frozen bound <=3,180 | Same additional cold questions media; retained timing reads-phase count 28. |
| `reads-report.test.ts:50`, report control | **2,280 ms, 22 calls**, within its 31-call bound | Report/barrier order passes; no hot reporting row or archive call. Hot settles earlier, in maintain. |
| `timing-counts.test.ts:6`, total :14 and phases :20 | **96** and the cold phase map above | Same questions media plus three hot-create calls, observed by timing's own meter. Raw formatting/region controls still pass in the complete suite. |
| `model-input-fingerprint.test.ts:84`, raw golden :92 | JSON key order **index, runId, admission, piles, notes, folders**; prior **runId, admission, index, piles, notes, folders** | Accepted stable-prefix reorder only. All field values and the preceding instructions are identical. No hot exists in this cold fingerprint fixture. |

Warm whole-run requests are 25 GET + 13 POST + 4 PATCH for one changed note, and
26 GET + 13 POST + 4 PATCH for two. Each fixture adds exactly one write over the pre-hot
control (16 -> 17 write-classified requests). The +3 total is +2 reads and +1 write: the single
prior-hot media load and the mandatory live fence read remain explicit. Maintain performs no
second hot media read and no additional questions media in these fixtures. The ordinary changed
notes retain exactly one `bytes=0-4095` Range read each, with no metadata precheck.

Fingerprint measurements: normalized golden and actual SHA-256 are both
`5b7a9ded44476b2f6cd611187597ed56cdc1b97ba74757b63c4963cf9673cc6f`
(fingerprint `5b7a9ded4447`); the normalized golden test passes. Raw SHA-256 changes from
`349ea35f8d0bbebad489a2a9d8e0d4a1dbbf8b4795c59c043ef27981f4bb3946` to
`e1e7c6c36b37d7d361a8cac042ea21bbe3fa4296d8a894c65560fc4f28200f2a`.
Exact raw bytes and unified diff: `/tmp/b3b-a5-fingerprint.actual.txt` and
`/tmp/b3b-a5-fingerprint.diff`; hash measurements: `/tmp/b3b-a5-fingerprint.json`.

Rolling-window measurement through main: a prior ten-row hot plus the C04 run's nine settled
changes produces exactly ten rows, all nine current rows followed by the first prior row.
A date-only reduction preserves all prior row bytes. The unchanged bootstrap/context/recovery
controls pass. Artifact: `/tmp/b3b-a5-rolling.json`; no historical journal is needed to retain rows.

### Validation and remaining frozen assertions

- Test-first frozen red: B1c's four cells measured 45/46 and C05's horizon measured 50 archive
  media before edits. The targeted suite had 35 passes / 4 failing tests, with seven assertion
  failures; `/tmp/b3b-a5-red.log`.
- Complete runner command: `pnpm -C runner exec vitest run --maxWorkers=2` with an OS-temp config
  importing the unchanged runner config and relocating cache/JSON output. **637 pass / 10 fail,
  647 total, 49 files**. Logs: `/tmp/b3b-a5-runner-final.log`, `/tmp/b3b-a5-runner.json`.
  All ten failures are the unchanged goldens in the table: B1c warm (four soft cells), the two
  shared C05 planning goldens, three Drive-count goldens, raw fingerprint, two reads budgets,
  and timing total. There are no new hot behaviour failures or non-assertion runner errors.
- Final B3a/B3b/context/recovery/method: **149/149 pass**, `/tmp/b3b-a5-hot.log` and `.json`.
  Includes all nine original B3b reds, date-only, hidden-only, authoritative Home answers,
  failure/done protection, lost reply and unchanged production-baseline controls.
- Both unchanged hot corpus fixtures: **2/2 pass**, `/tmp/b3b-a5-fixtures.log`.
  OS-temp rolling/fingerprint measurement probe: 2/2 executions complete, `/tmp/b3b-a5-probe.log`.
- Exact requested app command `pnpm exec vitest run src --maxWorkers=2`, with OS-temp cache config
  and output preload: **5,615 pass / 2 fail**, 167 files; `/tmp/b3b-a5-src.log`.
  `src/e2e-port.test.ts:37` times out following sandbox `listen EPERM` on 127.0.0.1 (one unhandled
  error). `src/docs.test.ts:134`, “every change since the P2 freeze is listed”, reports the already
  committed `9e23ad6e` missing from the shared change list. Both are outside this entry's files;
  no shared record or test was changed. The earlier relocated harness-fixture failures are absent.
- App, node and runner `tsc --noEmit`: pass, logs `/tmp/b3b-a5-tsc-{app,node,runner}.log`.
  Runner ESLint on `src/hot.ts src/index.ts src/main.ts`: pass, `/tmp/b3b-a5-eslint.log`.
- Per-fixture request observer: `/tmp/b3b-a5-trace.jsonl`, `/tmp/b3b-a5-measure-summary.txt` and
  `/tmp/b3b-a5-measure.log`. The final horizon-only measurement, `/tmp/b3b-a5-horizon.log`,
  verifies zero archive media in all four executions using paths recorded at request time.
  The original observer's final-path labels misclassified a run's own pre-move request media as
  archive media; that observer label was corrected in OS temp, without changing a frozen test.
- No `pnpm check` mark or screen e2e: this owner-directed round requests the component gates
  above, reserves golden changes to the red owner, forbids repository test outputs, and touches
  no screen (`ui:false`). Read-only `git diff --check` passes.

removed: runner/src/index.ts: hot's journal-archive discovery and archived-record media inputs.
removed: runner/src/index.ts: fresh hot reconciliation metadata read and duplicate live content-precheck metadata read.
removed: runner/src/index.ts: warm empty-questions declaration media read via the existing small-list shortcut.
removed: no test, assertion, fixture, threshold, live fence, checkpoint, node_modules entry or alternate writer.
tests changed: none

No network, direct git-writing command, commit, node_modules replacement or symlink. Test logs,
reports, cache, fixture scratch and measurement files are in OS temp. The src harness tests retain
their own throwaway git operations in OS-temp repositories; no git command issued by this session
writes to this worktree. Only `runner/src/hot.ts`, `runner/src/index.ts`, `runner/src/main.ts` and
this notes file differ from the first implementation. The red owner owns the frozen re-pins;
the coordinator owns commits and the shared change-list record.

### Addendum 5 re-pins

2026-10-11, red-owning session, TL-P4-51 sweep on production HEAD `9cad8b47`.
Only the authorized runner assertions, raw golden and these notes are changed.
Offline source: Addendum 5's Frozen measurements table and the existing Vitest exact
request assertions; no network research or request was made.

tests changed: runner/test/drive-calls-golden.test.ts: cold totals 96/107, reads 25/28, apply 55/54; ceiling 96. Each cold fixture adds questions media and hot name-check listing, live .bower fence and multipart create. Apply time and whole-run bounds stay unchanged.
tests changed: runner/test/timing-counts.test.ts: cold total 96, reads 25 and apply 55 for the same four named calls; formatting, region and byte controls unchanged.
tests changed: runner/test/c05-bounded-reads.test.ts: shared cold planning golden 25 for one questions.json media read; archive/history assertions, including the former :670, unchanged.
tests changed: runner/test/reads-report.test.ts: measured cold 2,880 ms and retained 3,330 ms; add only the 150 ms questions media delta to existing strict < and inclusive <= bounds. Cold bound remains 2,975 ms (95 ms headroom); retained bound is 3,330 ms.
tests changed: runner/test/fixtures/model-input-c04.raw.golden.txt: only reorder top-level keys to index, runId, admission, piles, notes, folders; all field bytes and preceding instructions preserved.
tests changed: runner/test/model-input-fingerprint.test.ts: comment cites TL-P4-42 addendum 5's accepted key reorder; assertions unchanged.
tests changed: runner/test/b1-index.test.ts: warm totals 42/43 are pre-hot 39/40 plus hot prompt media, live metadata fence and one PATCH. Assert those exact three requests and the single existing baseline questions media read (no duplicate); ordinary-note Range and no-metadata controls unchanged.

The b1a-contract discovery assertion formerly at :825 is unchanged. Production and
node_modules are untouched. No init, git-writing command, commit, install, symlink,
pnpm check or screen e2e was run: this round authorizes runner-only tests and forbids
repository outputs. The coordinator owns commits.

Red: the six targeted runner files reproduced all ten frozen failing tests (50 pass),
including B1c's four soft count cells; `/tmp/b3b-a5-repin-red.log`.
Green command: `pnpm -C runner exec vitest run --config /tmp/b3b-a5-runner.config.mjs --maxWorkers=2`.
The OS-temp config imports the unchanged runner config and moves cache and JSON
report output to OS temp. Log: `/tmp/b3b-a5-repin-green.log`.

Final full runner result: **646 pass / 1 fail, 647 total, 49 files**.
Log: `/tmp/b3b-a5-repin-final.log`; JSON: `/tmp/b3b-a5-runner.json`.
All authorized cold and warm count assertions, timing phase maps, raw fingerprint,
reads bounds, B1a discovery and C05 archive controls pass. Raw golden SHA-256 is
`e1e7c6c36b37d7d361a8cac042ea21bbe3fa4296d8a894c65560fc4f28200f2a`;
read-only comparison to HEAD verifies identical instructions and JSON field values.

TL-P4-51 contradiction (complete suite run before stopping):
- `runner/test/drive-calls-golden.test.ts:94` (former :90), retained-history test's
  cold C04 whole-run bound: actual **12,770 ms**, expected **<12,624 ms**
  (`10520 * 1.2`). This unchanged assertion is outside the authorized re-pins.
  Its following retained whole-run assertion at :95 is masked by this failure.
  No bound, production implementation or unrelated assertion was changed.

The first post-edit full run had 645 pass / 2 fail. Its extra failure was an overly
strict new questions assertion: the warm fixture already has one baseline questions
media request during maintain. The final assertion pins that exact single request
(no duplicate), alongside the prompt hot media, live hot fence and single hot PATCH.
Thus "no additional questions media" means no increment over the pre-hot baseline,
not zero total baseline requests. The warm 42/43 counts pass in all four cells.

Status: blocked on the unchanged whole-run timing contract; lead ruling required
before any further assertion edit. `git diff --check` passes. No changes beyond the
seven listed runner test/fixture files and this notes file.
