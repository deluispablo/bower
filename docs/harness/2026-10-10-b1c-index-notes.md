# B1c index red-session notes

implementer: codex

Entry: `b1c-index`; worktree: `/private/tmp/bower-b1c-index`; branch: `b1c-index`.
Baseline HEAD: `54f1694ac435774d36356454564a217fb633c116`.
This is the red-owning session only. No production edit, network call, writing git command or commit.
The coordinator owns commits; keep these notes separate from the tests commit.

## Read contract and offline sources

Read WORKER, the packet, TL-P4-41 Q1/Q6/Q7/Q8 and its complete ruling document,
DECISIONS entries TL-P4-41 with addenda 1–6 and TL-P4-45, and the prep's B1c row,
case descriptions and H4/H5 proposals. Existing tests and the corpus driver supplied the real-entry patterns.
Used bower-implement; the user's red-only assignment overrides its implementation/full-gate instructions.

Offline research references, not fetched or independently reverified:

- [ECMAScript Array.prototype.sort](https://tc39.es/ecma262/#sec-array.prototype.sort): stable ordering.
  Reuse the existing index projection and its deterministic sort; do not add another writer.
- [Obsidian internal links](https://help.obsidian.md/links): path-qualified links disambiguate repeated titles.
  The tests require the shortest unique suffix and resolve membership against retrieval state by Drive id.
- Local made-up templates in `harness/corpus/b1-index-no-change/folder/index.md` and
  `harness/corpus/b1-moc-over-40/folder/Resources/Gardening/Gardening.md` provide the MOC/index convention.
  Q8 supersedes their old flat MOC rows with `→ [[MOC]] (N)`; ordinary rows retain `- [[Note]] — summary`.

## Reds

Final run: **12 assertion failures and 2 preserved passing controls**, on unchanged HEAD plus the new test file.
Every failure is an AssertionError; no import, transform, load or unhandled-runtime failure remains.
The two hidden-path promises already pass at HEAD. They are retained as green compatibility controls;
they cannot honestly be claimed as reds without weakening an existing behaviour.

| Exact name | File | HEAD result | Stated reason |
| --- | --- | --- | --- |
| `B1c index: exact PARA order direct notes shortest duplicate paths and recursive folded count` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: expected '- [[Old]] — Old evidence.\n- [[Home]]…' to be '## Projects\n\n- [[Zeta]] — Direct ev…' // Object.is equality |
| `B1c index: 32000 character cut names every omitted folder and preserves whole rows` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: context projection stays inside Q7: expected 32700 to be less than or equal to 32000 |
| `B1c index: unchanged summaries keep index bytes and stamp through a visible version change` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: stamp-only changes cause zero index sends: expected [ { path: '.bower/index.md', …(1) } ] to deeply equal [] |
| `B1c index: existing MOC at 40 direct members folds and rebuilds complete regions by id` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: existing MOC at 41 direct members folds and rebuilds complete regions by id` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: a personal MOC stays byte identical while the Bower MOC refreshes` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: positive counterpart: the owned map really refreshes: expected '---\nsummary: Garden evidence.\ntype:…' not to be '---\nsummary: Garden evidence.\ntype:…' // Object.is equality |
| `B1c index: done replay keeps the folded projection and complete members without another write` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: lost reply for .bower/index.md resumes the same maintain before the report barrier` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: lost reply for Resources/Garden/Garden.md resumes the same maintain before the report barrier` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: fault must hit the declared production maintenance target: expected false to be true // Object.is equality |
| `B1c index: lost reply for .bower/retrieval.json resumes the same maintain before the report barrier` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: corpus b1-index-no-change preserves the derived stamp on the second real instruction press` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: missing derived index is rebuilt on the real instruction path: expected undefined to be defined |
| `B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps` | `runner/test/b1-index.test.ts` | Assertion red | AssertionError: script rebuilt a valid marked MOC: expected 'legacy' to be 'v2' // Object.is equality |
| `B1c index: hidden app settings and dot-folder notes never enter either projection` | `runner/test/b1-index.test.ts` | Preserved green control | Already implemented by B1a at HEAD; no artificial failing assertion added. |
| `B1c index: hidden-only feed changes only the cursor with a visible-feed positive control` | `runner/test/b1-index.test.ts` | Preserved green control | Already implemented by B1a at HEAD; no artificial failing assertion added. |

## Controls and observation boundaries

All 14 tests use runner `main` through `runOnDrive` or `redispatchCase` in the corpus driver.
No production helper is replaced, and no test-only renderer writes a supposed result.
No future production export is imported, so a missing new export cannot cause a load error.
MOC parsing uses the landed ownership parser, with expect checks before accessing framed spans.

- Exact bytes: reverse insertion order; a visible direct-note control and eight durable indexed ids precede the red.
  Exact content bytes below the optional generation header pin PARA order, direct-before-child order,
  alphabetical children, shortest unique title paths, and recursive folded leaf counts.
  The budget case separately pins exact retained-folder bytes and the complete cut-marker line.
- Budget: a small real run is under 32,000 characters and 300 calls, with no cut marker.
  The large run has 150 folders and summaries exactly 200 characters long. Its current projection is 32,700
  characters and has no cut marker. Seeded retrieval lets unchanged versions add zero media re-reads;
  the real production request count is checked separately from direct FakeDrive seeding/snapshot reads.
- Hidden paths: visible evidence is present, hidden bytes survive, and retrieval contains exactly the visible id.
  Hidden-only discovery drains the feed, changes only the cursor, preserves index/hot bytes and sends neither;
  a separate visible-feed edit proves that the same main entry point can actually refresh the projection.
- No-change: the first settled run sends zero index/retrieval/hot writes. A later visible version change with the
  same summary requires a state refresh but no index send, preserving the seeded index date and all its bytes.
- 40/41: real framed Bower MOCs start with a stale duplicate link. Original member notes stay byte identical.
  The existing child map holds a note sharing a direct member's title, so membership cannot use bare-name matching.
  Figures pin 40 or 41 direct notes; membership includes those ids plus the child map; folded counts are recursive
  leaf counts of 41 or 42. No hierarchy creation is requested. Overview and personal prose remain unchanged.
  Downstream assertions pin one maintain effect, one write per changed target, no same-version MOC reread,
  unchanged hierarchy, and the existing Updated row for the written MOC, with no hidden maintenance rows.
- Personal MOC: its exact bytes and zero sends are checked before the owned counterpart's missing refresh/fold.
- Replay: the first real write and a persisted manifest are observed. Done redispatch keeps bytes and makes no
  duplicate derived/MOC sends before the missing rebuilt membership assertion.
- Lost replies: the fault lands a real write, then loses the answer and blocks further reads of that target.
  Index/state loss already resume with the same manifest, no replanning, no duplicate target send and no early
  report; their B1c red is the stale MOC membership. The MOC-loss variant fails because no MOC write occurs.
  After implementation, all required projection sends must precede the report barrier and membership must be exact.
- Corpus cases: reuse the unchanged disk fixtures and exact original instruction requests; both real presses of
  b1-index-no-change run on the same Drive. The missing derived index assertion is after the second press.
  The 41-leaf case keeps every clipping byte identical and requires 21/20 child-map ids, unique reachability,
  parent map links and the 41-member folded line. Its current legacy MOCs lack the new script regions.

Assertions after each first failure are acceptance checks for the green session, not claims of passing evidence.
All clocks are fake and pacing is injected; no real-time waits. All fixture data is made up.

## Compatibility and contradictions preserved

removed: none
Tests changed: none of the pre-existing tests, assertions, corpus files or method verdicts was edited or deleted.
No contract bound was changed: 40/41 direct notes, 32,000 context characters, 300 calls and the existing 4,096 coverage.
The 150-folder input was completed to full 200-character summaries so the existing uncapped renderer really
crosses 32,000; the numerical ceiling was not loosened.

| Existing assertion or format | Ruling / preservation |
| --- | --- |
| `harness/corpus/b1-moc-over-40/expected.json:96` scores the root index and excludes its existing clipping/Soil/Water rows. | TL-P4-45 makes root index an ordinary personal note; these excludes would require rewriting it. Preserved and flagged for the lead. New red inspects `.bower/index.md` instead. |
| Same expected note requires `- [[Gardening]] — summary` as its folded row. | Q8 requires `→ [[Gardening]] (41)` in the derived index. Preserved; no expected.json repair in this session. |
| `harness/corpus/b1-index-no-change/expected.json:14`, :50 and :86 score generated content/exclusions at root index. | Their old derived-location interpretation is superseded by TL-P4-45. Exact root bytes remain protected in the new test; all original assertions remain. Root-exclusion claims are not copied onto the new derived index. |
| `runner/test/b1a-contract.test.ts:821` expects one index send in the shared live-control folder case even though its name/place and projection remain unchanged. | Q8 requires no write when only metadata/date changed. This original assertion is preserved and flagged; the implementation session must not quietly weaken it. |
| Existing framed and legacy MOCs | Framed tests preserve Overview and personal content; legacy corpus stays readable and requires script-region rebuilding through main. No old parser assertion is changed. |
| Existing hidden/no-change/replay behaviour | Kept as controls and extended with B1c folding/membership requirements. No flat-index fixture is silently updated. |
| Method verdicts | Both reused corpus cases already have one agrees row. Each corpus test asserts that exact row exists once. No new corpus case was added, so no new verdict row is needed. |

## Verification

Only the touched test file was run, as requested:

```sh
pnpm -C runner exec vitest run test/b1-index.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=../tmp-logs/b1c-index-red.json > tmp-logs/b1c-index-red.log 2>&1
pnpm exec tsc --noEmit -p tsconfig.app.json > tmp-logs/b1c-index-tsc-app.log 2>&1
pnpm exec tsc --noEmit -p tsconfig.node.json > tmp-logs/b1c-index-tsc-node.log 2>&1
pnpm -C runner exec tsc --noEmit -p tsconfig.json > tmp-logs/b1c-index-tsc-runner.log 2>&1
pnpm -C runner exec eslint test/b1-index.test.ts > tmp-logs/b1c-index-eslint.log 2>&1
```

Vitest exit 1 as intended: 12 assertion reds, 2 preserved green controls, one test file.
App, node and runner tsc and touched-file eslint pass (empty error logs).
Read only failure messages and aggregate counters from the final test report.
No pnpm check, full corpus/method suite or e2e was run: the user explicitly limits this red session to touched tests.
No app/UI change and no golden increase. Git diff --check passed; only read-only git commands were used.

## Handoff

Uncommitted deliverables: `runner/test/b1-index.test.ts` and this notes file.
Logs stay under `tmp-logs/`; final JSON output is there too. Coordinator commits tests and notes separately.
Implement only the packet's single maintain/projection path, preserve existing assertions, and take the listed
contradictions to the lead. No code fix, hierarchy creation, Overview-model rewrite or new corpus admission here.

## Lead-authorized assertion repair (2026-10-10, B1c/B3b red repairs)

This round supersedes only the four preserved-conflict rows above. The earlier session record remains historical.
No implementation, fixture, golden, threshold, method verdict or unrelated assertion changed.
The shared folder helper still requires one send for every changed projection; only live control now requires zero.
Root index bytes remain protected in all no-change expectations; the MOC corpus now also checks unchanged bytes.

Changed assertions (current line numbers; each relocated contains/excludes item is listed):

tests changed: harness/corpus/b1-index-no-change/expected.json:14: TL-P4-45: score the derived index; root index is personal content.
tests changed: harness/corpus/b1-index-no-change/expected.json:16: TL-P4-45: preserve contains "# Index" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:17: TL-P4-45: preserve contains "## Areas" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:18: TL-P4-45: preserve contains "### Home" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:19: TL-P4-45: preserve contains "## Resources" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:20: TL-P4-45: preserve contains "### Gardening" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:21: TL-P4-45: preserve contains "- [[Late summary]] — (no summary)" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:22: TL-P4-45: preserve contains "- [[Plot diary]] — (no summary)" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:25: TL-P4-45: preserve excludes "Late summary sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:26: TL-P4-45: preserve excludes "Hidden exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:27: TL-P4-45: preserve excludes "Inbox exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:28: TL-P4-45: preserve excludes "Root exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:50: TL-P4-45: score the derived index; root index is personal content.
tests changed: harness/corpus/b1-index-no-change/expected.json:52: TL-P4-45: preserve contains "# Index" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:53: TL-P4-45: preserve contains "## Areas" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:54: TL-P4-45: preserve contains "### Home" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:55: TL-P4-45: preserve contains "## Resources" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:56: TL-P4-45: preserve contains "### Gardening" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:57: TL-P4-45: preserve contains "- [[Late summary]] — (no summary)" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:58: TL-P4-45: preserve contains "- [[Plot diary]] — (no summary)" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:61: TL-P4-45: preserve excludes "Late summary sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:62: TL-P4-45: preserve excludes "Hidden exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:63: TL-P4-45: preserve excludes "Inbox exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:64: TL-P4-45: preserve excludes "Root exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:86: TL-P4-45: score the derived index; root index is personal content.
tests changed: harness/corpus/b1-index-no-change/expected.json:88: TL-P4-45: preserve contains "# Index" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:89: TL-P4-45: preserve contains "## Areas" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:90: TL-P4-45: preserve contains "### Home" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:91: TL-P4-45: preserve contains "## Resources" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:92: TL-P4-45: preserve contains "### Gardening" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:93: TL-P4-45: preserve contains "- [[Late summary]] — (no summary)" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:94: TL-P4-45: preserve contains "- [[Plot diary]] — (no summary)" at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:97: TL-P4-45: preserve excludes "Late summary sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:98: TL-P4-45: preserve excludes "Hidden exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:99: TL-P4-45: preserve excludes "Inbox exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-index-no-change/expected.json:100: TL-P4-45: preserve excludes "Root exclusion sentinel." at .bower/index.md.
tests changed: harness/corpus/b1-moc-over-40/expected.json:97: TL-P4-45: score the derived index; root index is personal content.
tests changed: harness/corpus/b1-moc-over-40/expected.json:99: TL-P4-45: preserve contains "# Index" at .bower/index.md.
tests changed: harness/corpus/b1-moc-over-40/expected.json:100: TL-P4-41 Q8: folded MOC row uses arrow and recursive count 41.
tests changed: harness/corpus/b1-moc-over-40/expected.json:103: TL-P4-45: preserve excludes "- [[Garden clipping" at .bower/index.md.
tests changed: harness/corpus/b1-moc-over-40/expected.json:104: TL-P4-45: preserve excludes "- [[Soil]] —" at .bower/index.md.
tests changed: harness/corpus/b1-moc-over-40/expected.json:105: TL-P4-45: preserve excludes "- [[Water]] —" at .bower/index.md.
tests changed: harness/corpus/b1-moc-over-40/expected.json:52: TL-P4-45: require root index.md to remain byte-for-byte unchanged.
tests changed: runner/test/b1a-contract.test.ts:822: TL-P4-41 Q8: live control changes only metadata/date; require zero index sends, retaining one for all other modes.

Touched files:

- `harness/corpus/b1-index-no-change/expected.json`
- `harness/corpus/b1-moc-over-40/expected.json`
- `runner/test/b1a-contract.test.ts`
- `docs/harness/2026-10-10-b1c-index-notes.md`

Repair verification:

```sh
pnpm -C runner exec vitest run test/b1-index.test.ts test/b1a-contract.test.ts --testNamePattern='B1c index:|B1a contract: round 4 [1-4]:' --maxWorkers=2 --reporter=default --reporter=json --outputFile=../tmp-logs/b1c-index-repairs.json > tmp-logs/b1c-index-repairs.log 2>&1
pnpm -C runner exec tsc --noEmit -p tsconfig.json > tmp-logs/b1c-index-repairs-tsc.log 2>&1
pnpm -C runner exec eslint test/b1a-contract.test.ts test/b1-index.test.ts > tmp-logs/b1c-index-repairs-eslint.log 2>&1
```

Results: 12 B1c assertion reds remain, 2 hidden-path controls pass. The 4 touched B1a round-4 tests
now fail on the ruled zero-send live control (actual 1); implementation is pending.
The other 14 B1a tests were excluded by name filter, without adding any skip directive.
Runner tsc and touched-test eslint pass. JSON parsing and a baseline comparison confirm only the authorized
expectation changes; fixture paths have no diff. git diff --check passes.
No network, git writes, production edits, full suites, pnpm check or e2e. Offline sources remain those cited above.

| Exact failing test | First assertion failure |
| --- | --- |
| `B1c index: exact PARA order direct notes shortest duplicate paths and recursive folded count` | AssertionError: expected '- [[Old]] — Old evidence.\n- [[Home]]…' to be '## Projects\n\n- [[Zeta]] — Direct ev…' // Object.is equality |
| `B1c index: 32000 character cut names every omitted folder and preserves whole rows` | AssertionError: context projection stays inside Q7: expected 32700 to be less than or equal to 32000 |
| `B1c index: unchanged summaries keep index bytes and stamp through a visible version change` | AssertionError: stamp-only changes cause zero index sends: expected [ { path: '.bower/index.md', …(1) } ] to deeply equal [] |
| `B1c index: existing MOC at 40 direct members folds and rebuilds complete regions by id` | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: existing MOC at 41 direct members folds and rebuilds complete regions by id` | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: a personal MOC stays byte identical while the Bower MOC refreshes` | AssertionError: positive counterpart: the owned map really refreshes: expected '---\nsummary: Garden evidence.\ntype:…' not to be '---\nsummary: Garden evidence.\ntype:…' // Object.is equality |
| `B1c index: done replay keeps the folded projection and complete members without another write` | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: lost reply for .bower/index.md resumes the same maintain before the report barrier` | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: lost reply for Resources/Garden/Garden.md resumes the same maintain before the report barrier` | AssertionError: fault must hit the declared production maintenance target: expected false to be true // Object.is equality |
| `B1c index: lost reply for .bower/retrieval.json resumes the same maintain before the report barrier` | AssertionError: member link Removed resolves to exactly one stored id: expected [] to have a length of 1 but got +0 |
| `B1c index: corpus b1-index-no-change preserves the derived stamp on the second real instruction press` | AssertionError: missing derived index is rebuilt on the real instruction path: expected undefined to be defined |
| `B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps` | AssertionError: script rebuilt a valid marked MOC: expected 'legacy' to be 'v2' // Object.is equality |
| `B1a contract: round 4 1: a folder binned before planning drops every indexed descendant` | AssertionError: live control: writes only a changed projection: expected [ { path: '.bower/index.md', …(2) } ] to have a length of +0 but got 1 |
| `B1a contract: round 4 2: a folder moved outside drops its indexed subtree and commits the cursor` | AssertionError: live control: writes only a changed projection: expected [ { path: '.bower/index.md', …(2) } ] to have a length of +0 but got 1 |
| `B1a contract: round 4 3: a renamed folder updates descendant paths and index order without media reads` | AssertionError: live control: writes only a changed projection: expected [ { path: '.bower/index.md', …(2) } ] to have a length of +0 but got 1 |
| `B1a contract: round 4 4: an inside folder move updates recursive paths and regroups without media reads` | AssertionError: live control: writes only a changed projection: expected [ { path: '.bower/index.md', …(2) } ] to have a length of +0 but got 1 |
