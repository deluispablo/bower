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
