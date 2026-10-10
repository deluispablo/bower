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


## Implementation (retained first round; historical blocker)

The index work is left in place for review. This entry is not complete: folding and MOC region maintenance remain red.
No test, fixture, verdict, threshold or shared harness record was changed. No writing git command was run.
The harness owns commits; these notes must remain separate from the source commit.

### Offline research and implemented changes

Research preceded the source edits. The references are stable offline references, not fetched in this session:

- [ECMAScript Array.prototype.sort](https://tc39.es/ecma262/#sec-array.prototype.sort): stable traversal ordering.
  The existing projection now uses PARA order, sorted children and direct notes before child folders.
- [Obsidian internal links](https://help.obsidian.md/links): disambiguation by a path-qualified wiki link.
  A suffix-frequency table chooses the shortest unique suffix of each visible note path.
- The packet's existing made-up index and Gardening templates establish `- [[Note]] — summary`.
  Q8 requires `→ [[MOC]] (N)` for folding; this part remains unimplemented, rather than guessing ownership.

`runner/src/index.ts` keeps the existing maintain operation and writer. It renders headings and whole note rows,
limits the projection to 32,000 characters, and names every omitted folder at the cut. It skips an index send
when the existing projection matches after removing only the generation line and insignificant end spacing.
An unchanged old flat projection remains readable and unchanged. Same-version input text uses B1a's read cache.
The existing ownership layout supplies the front-matter byte boundary: a summary beyond 4,096 bytes is excluded,
while a complete summary in a long, valid ownership note remains readable. No second front-matter parser was added.
A missing index bypasses the cursor-only shortcut. Hidden-path eligibility still goes through layout.ts isHidden.

`src/data/spine/scripted.ts` now uses its existing nothingReadyPlan for an already admitted instruction run whose
lines remain held. The pre-admission empty-instruction refusal stays in its existing home. This makes the actual
instruction corpus path reach maintenance instead of failing before it. The no-change instruction red is green.

removed: runner/src/index.ts: old one-line flat index renderer; replaced in the same projection/writer home.
removed: runner/src/index.ts: three old guard/summary expressions; replaced by missing-index and prefix-coverage checks.
removed: src/data/spine/scripted.ts: two comment lines and the unconditional post-admission empty-instruction refusal.
tests changed: none

### Mechanism/ownership blocker

This is a packet scope gap, not a reason to weaken the MOC reds:

1. `src/data/contracts/run-manifest.ts:86` declares maintain targets as RunnerWrite only. Its guard at :555
   rejects any MOC path outside RUNNER_WRITES. Its snapshot grammar at :386 has no ownership, region bytes or MOC
   membership inputs. The optional log string is not an alternative MOC input envelope.
2. `src/data/contracts/note-edit.ts:881–886` authors moc-rewrite only when that exact marked region already exists.
   The committed Gardening/Soil/Water corpus is legacy; its MOCs have by:bower and type:moc but no framed regions.
   The existing author therefore refuses each rewrite as not-bower. It cannot migrate those legacy MOCs to v2.
3. Neither run-manifest.ts nor note-edit.ts is owned by B1c's prep row. A new moc.ts may render a list, but may not
   create a second ownership author or bypass the fenced effect contract. MOC paths cannot be disguised as runner JSON.
   Frozen reportPlan rows also need truthful grounding for actual MOC writes after settled refusals, not every candidate.

A revised packet must allocate the necessary extension in these existing homes and specify the legacy region
migration. The unchanged MOC tests are valid requested behaviour; they expose what the current homes cannot express.
Folding, full MOC recovery, the per-MOC Updated rows, and a general enforced 300-call bootstrap ceiling are not delivered.
The current before-provider planning order is also unchanged; no claim of rebuilding planning context before the model.

The applied [bower-implement skill](../../.agents/skills/bower-implement/SKILL.md) directs the worker to WORKER.md.
[WORKER.md](WORKER.md) explicitly says: "if it cannot do what you need, stop and report `blocked`."
This is why this implementation stops with the edits retained, rather than adding another writer or editing unowned contracts.

### Complete targeted failure audit (TL-P4-51)

The entire B1c/B1a/corpus/method target was run after the source changes: 61 passed, 9 failed.
All remaining B1c failures are missing implementation, not contradictory acceptance assertions:

| Exact test | Assertion location |
| --- | --- |
| `B1c index: exact PARA order direct notes shortest duplicate paths and recursive folded count` | `runner/test/b1-index.test.ts:149` |
| `B1c index: existing MOC at 40 direct members folds and rebuilds complete regions by id` | `runner/test/b1-index.test.ts:285` |
| `B1c index: existing MOC at 41 direct members folds and rebuilds complete regions by id` | `runner/test/b1-index.test.ts:285` |
| `B1c index: a personal MOC stays byte identical while the Bower MOC refreshes` | `runner/test/b1-index.test.ts:320` |
| `B1c index: done replay keeps the folded projection and complete members without another write` | `runner/test/b1-index.test.ts:339` |
| `B1c index: lost reply for .bower/index.md resumes the same maintain before the report barrier` | `runner/test/b1-index.test.ts:364` |
| `B1c index: lost reply for Resources/Garden/Garden.md resumes the same maintain before the report barrier` | `runner/test/b1-index.test.ts:352` |
| `B1c index: lost reply for .bower/retrieval.json resumes the same maintain before the report barrier` | `runner/test/b1-index.test.ts:364` |
| `B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps` | `runner/test/b1-index.test.ts:408` |

The two full-runner test conflicts with this session's no-repository-write rule are both listed:

| Test | File:line | Conflict and disposition |
| --- | --- | --- |
| new-instance copies the built runner and tidy.yml and nothing secret | `runner/test/new-instance.test.ts:103` (assertion :107) | run() at :92 executes the real script with the source ROOT. scripts/new-instance.sh:104 runs a build there. The first full-suite attempt also triggered pnpm's dependency fetching. Retained unchanged; final verification is relocated to an OS-temp copy. |
| new-instance refuses a public repository | `runner/test/new-instance.test.ts:156` (assertion :162) | The same real source-root build precedes its private-repository check. Retained unchanged; final verification is relocated to the same OS-temp copy. |

No further packet/ruling contradiction was identified in the complete targeted or data suites. Earlier red-session
conflicts superseded by red repair 1 were not reintroduced. No test repair is made in this implementation.

### Compatibility row drafts

| Contract / stored format | Draft result |
| --- | --- |
| B1a full and long ownership notes; changes cursor; folder moves/bins | 18/18 B1a contract tests pass; full region framing remains validated. |
| Hidden paths and a hidden-only feed | Both B1c controls pass; no index/hot send, state differs only by cursor. |
| Old flat index and stamped canonical index | Read leniently; unchanged projections keep their exact stored bytes. |
| Q7 cut and unchanged-version cache | Exact bounded-index red passes at 32,000 characters and <=300 production calls; unchanged note media are not reread. |
| Duplicate titles, PARA and nested order | Implemented; exact-byte test remains red solely because folded MOC rendering is missing. |
| Ordinary root index and personal MOCs | Root content is preserved and indexed; personal MOC bytes/sends remain protected. Owned counterpart refresh remains red. |
| Repeated instruction refresh | B1c real instruction corpus test passes; no second index send. |
| Framed Bower MOCs, 40/41 direct notes | Not delivered; no region author or writer bypass. |
| Legacy Gardening/Soil/Water hierarchy | Not delivered; requires the existing ownership author to gain an admitted migration. |
| Replay and lost replies | Existing index/state recovery retained; complete folding/MOC assertions remain red. |
| Corpus/method verdict rows | Unchanged; 33 corpus/driver/PDF and 5 method tests pass. |

### Verification and environment

All requested suite outputs/report files are under the OS temp folder, never tmp-logs/ or test-results/.
The initial pnpm command tried automatic dependency installation. It was interrupted; offline installs failed because
local tarballs were absent. Dependencies were copied from an existing local installation into /private/tmp/b1c-offline-deps.
The worktree's ignored node_modules points there. Later commands invoke the same local Vitest/tsc/ESLint binaries with
Node directly, bypassing pnpm's automatic installation. No successful network access or live service probe occurred.

Commands (equivalent local binaries to the requested pnpm exec commands):

```sh
node ../node_modules/vitest/vitest.mjs run test/b1-index.test.ts test/b1a-contract.test.ts test/corpus test/second-brain-method.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-targeted.json > /tmp/b1c-targeted.log 2>&1
node node_modules/vitest/vitest.mjs run src/data --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-data.json > /tmp/b1c-data.log 2>&1
node ../node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-runner.json > /tmp/b1c-runner.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json > /tmp/b1c-tsc-app.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json > /tmp/b1c-tsc-node.log 2>&1
node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > /tmp/b1c-tsc-runner.log 2>&1
node node_modules/eslint/bin/eslint.js src/data/spine/scripted.ts > /tmp/b1c-eslint-data.log 2>&1
node ../node_modules/eslint/bin/eslint.js src/index.ts > /tmp/b1c-eslint-runner.log 2>&1
```

B1c 5/14 pass; B1a 18/18 pass; corpus/driver/PDF/method 38/38 pass. Data suite: 4,160/4,160 pass.
Node and runner tsc pass; touched-file ESLint passes in each package's own directory.
App tsc has four out-of-scope implicit-any errors at Palette.tsx:119 (two), :123 and :127 with the copied local dependencies.
A preserveSymlinks diagnostic produced broad dependency-type failures and is not a verification result.
No app source or dependency declaration was changed to hide these errors.
The first full runner suite had 602 passes and 11 failures: the nine MOC failures and the two build-environment failures above.
Final full-suite results from the OS-temp copy are recorded below when the run finishes.
No pnpm check mark or app/capabilities e2e is claimed: the entry is blocked, ui:false, and pnpm check's default test reports
write inside the checkout. Test fixtures and tests remain exactly committed. Git diff --check passes.


Final verification of the exact retained source files:

- Full runner suite in `/private/tmp/b1c-verify`: **604 passed, 9 failed**, 613 tests total.
  All nine failures are the MOC failures in the targeted audit above; both new-instance tests pass.
  Log/report: `/tmp/b1c-runner-final.log`, `/tmp/b1c-runner-final.json`.
- The temporary copy contains the unchanged tests and the final source bytes; both touched source SHA-256 digests
  were compared with the worktree. The first temporary run lacked the API package links; those local links were
  restored and the entire suite rerun. Its import failures are discarded as setup failures, not regressions.
- The temporary PATH helper implements exactly runner/package.json's build command with the already installed
  esbuild executable. It neither changes a test nor bypasses the build. Build outputs and fixture repositories
  live under OS temp, and no dependency fetching is needed. The temporary root has no checkout Git metadata.

```sh
# cwd: /private/tmp/b1c-verify/runner
PATH=/private/tmp/b1c-offline-bin:$PATH node ../node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-runner-final.json > /tmp/b1c-runner-final.log 2>&1
```

No golden or time bound was raised. The final Drive-call test reports C04 88 (bound 91) and the 25-earlier-runs case
99 (bound 102): each saves the unchanged index's three verification/fence/send calls. The goldens were not edited.
Final status: blocked, with partial index and instruction-lifecycle edits retained. Baseline HEAD is
`e1b0e3922f2345ab42eccc36c18aed54f4751cb3`; no commit was made by this worker.

## Addendum 7 reds

Red-only assignment under TL-P4-41 addendum 7, lead 2026-10-10; completed across midnight on 2026-10-11.
Unchanged baseline HEAD: `2f151135` (`b1c-index: codex delivery`).
Applied the bower-session and bower-implement instructions within the owner's tests-only scope.
The only edits are the appended tests/imports/helpers and this expressly requested notes section.
No production changes, network, writing git command, commit, dependency installation or shared harness edit.
The coordinator owns the tests commit and the separate notes commit.

Offline research reuses the sources cited above, the existing ownership parser's CommonMark heading/boundary
rules, the B1a contract's production-manifest guard patterns, and the corpus driver's real-main entry point.
The parser's stable reference is [CommonMark 0.31.2 ATX headings](https://spec.commonmark.org/0.31.2/#atx-headings).
No source was fetched. The contract test leaves the new snapshot envelope to the existing production home:
it checks frozen region bytes recursively, without prescribing a second parser or an invented field grammar.

All five new tests fail at HEAD on assertions, after their applicable passing controls:

| Exact name | Location | HEAD assertion failure |
| --- | --- | --- |
| `B1c index: legacy MOC migrates on its first maintain and keeps every other byte` | `runner/test/b1-index.test.ts:481` | The maintained note is still `legacy`, expected `v2`. |
| `B1c index: legacy MOC second maintain is idempotent with no MOC write` | `runner/test/b1-index.test.ts:497` | The second maintained note is still `legacy`, expected `v2`. |
| `B1c index: legacy MOC without Overview and Notes is untouched` | `runner/test/b1-index.test.ts:518` | The admitted-heading positive counterpart is still `legacy`, expected `v2`. |
| `B1c index: legacy MOC belonging to a person with the same headings is untouched` | `runner/test/b1-index.test.ts:539` | The Bower-owned positive counterpart is still `legacy`, expected `v2`. |
| `B1c index: maintain MOC targets pass the fenced-edit guard and personal targets are refused` | `runner/test/b1-index.test.ts:562` | All three frozen region-byte assertions fail; the explicitly declared Bower MOC target is refused as `shape`, expected `ok: true`. |

Controls and acceptance checks:

- First maintain: the made-up stored note is independently confirmed legacy and by:bower; main succeeds,
  writes retrieval once, indexes the member summary and preserves both member notes before the red.
  Acceptance requires exactly one pair of each MOC frame, in overview/figures/members order, exact Overview
  bytes, regenerated unique membership by Drive id, no Removed link, and one MOC send.
  The byte oracle removes only inserted framing/the format declaration/new figures, restores the replaced
  Notes payload, and compares every remaining byte with the original. It covers front matter, personal prose,
  trailing spaces, a task, multibyte café text, and the unrelated appendix after Notes. No whitespace normalization.
- Second maintain: the first retrieval write is observed, then the member version is touched without changing
  its summary or membership. Both real manifests contain maintain; the second state records the new version.
  Exact MOC equality and zero second MOC sends already pass at HEAD, but framed migration is also required,
  preventing an unchanged unimplemented legacy note from satisfying the idempotence test.
  The downstream positive control requires exactly one first migration send, with the byte oracle again.
- Missing headings: neither heading, missing Overview alone, and missing Notes alone each run through main,
  retain the complete MOC bytes, and send no MOC write; retrieval commits once in each protected fixture.
  Only the exact two-heading counterpart's missing migration causes the red. No heading is inferred from prose.
- Person's MOC: the same headings survive byte-for-byte, with no send and a visible Book index control, before
  the Bower-owned counterpart fails. Both notes share the same real maintain; ownership cannot be inferred
  solely from a MOC type, title, or headings.
- Contract: runner main persists a real manifest that passes parseRunManifestV2 before mutation.
  A person-target mutation with real listing metadata, verified original content and a resealed operation id
  is refused. A separate owned-target mutation declares the Bower MOC with its verified original content,
  retains main's actual frozen snapshot, and reseals identities/report references before admission.
  Soft assertions expose all three missing region inputs, and the final assertion exposes the owned-target
  guard refusal independently. No production helper is mocked or replaced and no future export is imported.

tests changed: runner/test/b1-index.test.ts:481: add the first-maintain legacy migration red and byte-preservation control.
tests changed: runner/test/b1-index.test.ts:497: add the forced second-maintain idempotence red and first-send control.
tests changed: runner/test/b1-index.test.ts:518: add three missing-heading protections and an admitted-heading counterpart.
tests changed: runner/test/b1-index.test.ts:539: add personal-MOC protection with a Bower-owned counterpart on the same main run.
tests changed: runner/test/b1-index.test.ts:562: add real-main snapshot and resealed owned/personal target guard checks.
tests changed: runner/test/b1-index.test.ts: imports and appended helpers only; all 14 committed test bodies/assertions preserved.
removed: none

Final verification runs the complete touched file, without a name filter, with `--maxWorkers=2`:

```sh
# cwd: /private/tmp/bower-b1c-index/runner
node ../node_modules/vitest/vitest.mjs run test/b1-index.test.ts --config=/tmp/b1c-addendum7-vitest.config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-addendum7-red.json > /tmp/b1c-addendum7-red.log 2>&1
# cwd: /private/tmp/bower-b1c-index
node node_modules/typescript/bin/tsc --noEmit -p runner/tsconfig.json > /tmp/b1c-addendum7-tsc.log 2>&1
# cwd: /private/tmp/bower-b1c-index/runner
node ../node_modules/eslint/bin/eslint.js test/b1-index.test.ts > /tmp/b1c-addendum7-eslint.log 2>&1
```

Result: **19 tests; 5 pass, 14 fail**. The five new tests are assertion reds; the original nine reds and five
passing tests retain their results. Every failure is an AssertionError; there are no load, import, transform
or runtime failures. Runner tsc and touched-file ESLint pass with empty error logs. Git diff --check passes.
An initial incorrect test import was corrected before the final run; its runtime failure is not red evidence.

The OS-temp config retains the runner's Node environment, timer-gate setup and test include; it redirects
Vite and module caches to OS temp and disables the result cache. The runner config loader avoids bundled
config scratch writes. Reports, logs, driver fixture files and caches stay outside the repository.
Local Node binaries bypass pnpm's automatic installation; no pnpm check, full suites, e2e or build is run.
No bound, assertion, corpus fixture, golden or method verdict was changed. These reds are ready for coordinator commits.


## Implementation (2026-10-11 resumed scope)

Current baseline: `920c3dfcbed32994c3075c499964acba828dd434`. The earlier implementation and addendum-7 reds
are committed. This round changes production and this notes file only; the coordinator owns any later commits.
No writing git command, test edit, fixture edit, golden increase or repository-local test output is made by this worker.
The user additionally assigned run-manifest.ts and note-edit.ts. Existing offline sources above were reused;
none was fetched. The bower-implement skill and WORKER card were read before implementation.

### Implemented in the existing homes

- `run-manifest.ts` widens maintain's declared targets to an owned MOC, requiring its full original text,
  each exact region payload, listing id/version/name/parent, and verified before-content size/hash/version.
  Region authority is derived again by note-edit from the bytes, never from a title or MOC type alone.
  Personal targets are refused even when their listing metadata and operation identities are resealed.
  Old maintain snapshots without the new optional fields still parse unchanged.
- `note-edit.ts` supplies the frozen MOC inputs from the existing ownership parser. The actual changes still
  use applyChanges, recheckEdit, ordinary edit-text, the live modifiedTime/name/place fence and write-once stamps.
  No alternate ownership author or Drive writer was introduced.
- `runner/src/moc.ts` resolves the existing membership links once to unique Drive ids and stores member ids
  with the snapshot. Canonical folder maps collect existing direct members and descendant maps; peer maps reuse
  the existing split's member ids. Removed ids disappear; duplicate member ids are removed. Recursive counts
  count unique leaves, excluding the maps. The renderer creates no hierarchy and never modifies Overview.
- `runner/src/index.ts` uses that membership and the shared shortest unique link suffixes to fold a folder
  into `→ [[MOC]] (N)`. Whole rows and the honest cut stay within 32,000 characters in the named budget red.
  Exact final-newline bytes now pass the PARA-order red. Existing unchanged flat/stamped indexes retain bytes.
- Framed MOCs are maintained through the same manifest operation, before retrieval's final commit and the
  report barrier. Retrieval stores the written map version, region bytes, member ids and listing metadata.
  Recovery reads the existing stamps and ordinary edit evidence; it never sends a landed MOC again.
  Same-version edit checks share B1a's read cache after a fresh metadata read; the write fence remains live.
- Personal maps retain their exact bytes. A done replay performs no further projection/MOC write. All three
  lost-reply targets resume the existing maintain operation without replanning or an early final report.

removed: runner/src/index.ts: duplicate link-suffix renderer; one renderer in moc.ts serves both projections.
removed: runner/src/index.ts: RunnerWrite-only target dispatch restriction; owned maps dispatch as edit-text.
removed: runner/src/index.ts: extra terminal blank line in a complete canonical index.
tests changed: none

### Remaining mechanism/ownership blocker

The two newly allocated contract files remove the first-round target/snapshot blocker. Two further existing
homes are needed; no workaround was added to bypass them. Scope was requested asynchronously while independent
implementation and all requested verification continued; no reply has arrived at this point.

1. `src/data/contracts/ownership-format.ts:228-250` requires current/personal/timeline/bower-note frames first,
   then all three MOC frames, with no other prose outside them. The legacy red preserves the appendix AFTER Notes
   (`runner/test/b1-index.test.ts:433`) byte for byte. Wrapping only Overview/Notes plus inserting Figures therefore
   needs an extension of this one parser. Moving the appendix, putting it inside the regenerated member payload,
   or introducing a second parser would violate the byte oracle/one-home ruling. This parser is not in the B1c row
   or the user's two-file scope extension, so it remains untouched.
2. `src/data/spine/report.ts:56-64` materializes only frozen contributions, and
   `src/data/spine/grounded.ts:90-100` binds Updated rows to a single ordinary create/edit path. Maintain can write
   several maps, and the actual write set depends on settled effects. Candidate rows inserted into a frozen plan
   could claim unchanged/refused maps were updated. Truthful rows need the existing report/grounding homes,
   rather than a new report builder in runner/main or a mutation of the immutable manifest. Both remain untouched.

The worker scope rule is explicit: [WORKER.md](WORKER.md), "Touch only the files the packet owns."
The applied [bower-implement SKILL.md](../../.agents/skills/bower-implement/SKILL.md) uses that worker card.
This is a scope blocker, not a test/ruling contradiction or an assertion-repair request.
The supplied DECISIONS file has TL-P4-41 and addenda 1-6; it has no TL-P4-41 addendum-7 entry.
The entire supplied notes' Addendum 7 reds section was read, including all its migration/byte-preservation controls.

### Complete failure audit (TL-P4-51, resumed run)

The complete targeted B1c/B1a/corpus/method run passes 68/75 tests. All seven remaining failures are required
behaviour not yet implemented in the unallocated homes; none contradicts a ruling. Every failure is listed:

| Exact test | First failing assertion | Remaining home |
| --- | --- | --- |
| B1c index: existing MOC at 40 direct members folds and rebuilds complete regions by id | runner/test/b1-index.test.ts:300 | Actual MOC Updated row; membership/folding/byte assertions already pass. |
| B1c index: existing MOC at 41 direct members folds and rebuilds complete regions by id | runner/test/b1-index.test.ts:300 | Same report row. |
| B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps | runner/test/b1-index.test.ts:411 | Legacy migration. |
| B1c index: legacy MOC migrates on its first maintain and keeps every other byte | runner/test/b1-index.test.ts:492 | Legacy migration and appendix byte preservation. |
| B1c index: legacy MOC second maintain is idempotent with no MOC write | runner/test/b1-index.test.ts:513 | First migration, then second-run equality. |
| B1c index: legacy MOC without Overview and Notes is untouched | runner/test/b1-index.test.ts:535 | Required positive migration counterpart. |
| B1c index: legacy MOC belonging to a person with the same headings is untouched | runner/test/b1-index.test.ts:551 | Required Bower-owned positive counterpart. |

The two unchanged new-instance tests at runner/test/new-instance.test.ts:103/:107 and :156/:162 still build
in the source ROOT and use git only in their disposable OS-temp fixture repositories. Verification therefore
runs in an OS-temp source copy. The initial full suite failed those two at the automatic package-manager setup;
its test bodies were not changed. The offline build helper from the first round invokes the exact installed
esbuild command from runner/package.json, in the temporary copy, for the subsequent full-suite verification.

### Compatibility row drafts (resumed)

| Stored format / behaviour | Result |
| --- | --- |
| v1 manifests; old maintain snapshots without MOC fields | Existing contract tests preserved; the optional MOC envelope is additive. |
| Legacy by:bower MOCs | Still readable; migration pending the one-parser scope extension. No legacy byte is changed. |
| Legacy personal MOCs and framed personal maps | Exact bytes preserved; headings/type alone never admit a target. |
| Framed Bower MOCs at 40/41 | Regions rebuild completely by id; Overview/personal prose preserved; no hierarchy creation. Report row pending. |
| Persisted MOC membership | Ids survive path/version refresh; peer maps retain the existing split rather than guessing a new one. |
| Plain old retrieval rows; unknown optional row metadata | Canonical writes copy only declared fields; no extra metadata grants ownership. |
| Hidden-only feed; root index; old flat/stamped derived index | Existing controls remain green; no hidden index/hot sends; root content untouched. |
| Exact PARA, duplicate paths and bounded cut | Green through runner main; no id/version appears in the index; measured whole run remains <=300 calls. |
| B1a incremental changes, vanished folders and descendant path updates | All 18 B1a reds remain green. |
| Done replay and lost replies for index/MOC/retrieval | All four framed-MOC lifecycle tests green; one manifest/maintain before the barrier. |
| Corpus/method verdicts | All 38 corpus/driver/PDF/method tests green; no verdict/fixture edits. |

### Verification (resumed; OS-temp only)

All tests, copies, config/module caches and reports are under `/private/tmp` or `/tmp`. Tests never run a build
in this worktree. The copied sources/tests are verified against this worktree before final delivery.
Local installed Node binaries are used as the offline equivalents of pnpm exec; the first round documented
why the installed pnpm attempts automatic package-manager/dependency setup. No dependencies were installed here.
The temporary Vitest configs retain Node/jsdom, setup files, include patterns, aliases and CSS module behaviour,
while using the runner config loader and OS-temp module/Vite caches. No test source or committed config was edited.

- Baseline B1c/B1a reds: 23 pass, 14 assertion failures, `/tmp/b1c-resume-red.json`.
- Targeted B1c/B1a/corpus/method: 68 pass, 7 assertion failures, `/tmp/b1c-resume-targeted.{log,json}`.
- App tsc: four unchanged implicit-any dependency-type errors in Palette.tsx:119 (two), :123 and :127.
- Node and runner tsc: pass; `/tmp/b1c-resume-tsc-{node,runner}-final.log`.
- ESLint on both changed contracts and both changed runner source files: pass; `/tmp/b1c-resume-eslint-*.log`.
- Initial data run had 3,494 passes and no assertion failures, but ten load failures from a missing temp-config
  `@` alias. The alias was restored before rerunning the complete data suite; this is setup evidence, not a regression.
- Full runner first pass: 609 pass, 9 fail; seven required MOC features plus the two unchanged build-environment tests.
- Full data and offline full-runner results are appended below after completion.

No pnpm check mark or e2e pass is claimed. The user's specified gates supersede the packet's broader gates;
there is no screen/UI change. No golden, test threshold or numerical contract was raised.


The first complete reruns finished: data **4,160/4,160 pass**; runner **611 pass, 7 fail** (618 tests).
All seven runner failures match the complete audit above. Both unchanged new-instance tests pass when built
with the installed offline esbuild command in the OS-temp copy. No assertion or build command was bypassed.
Reports: `/tmp/b1c-resume-data-final.{log,json}` and `/tmp/b1c-resume-runner-final.{log,json}`.

Afterward, two production refinements were made: canonicalizing optional old retrieval metadata before a strict
manifest write, and reporting an unexpected ownership-author refusal as BowerError instead of silently skipping it.
The map's direct figure counts member-note ids, excluding child maps. Final production bytes were copied and
SHA-256-compared again, and both complete suites plus all requested type/lint checks were restarted on those bytes.
Their delivery reports are `/tmp/b1c-delivery-data.{log,json}` and `/tmp/b1c-delivery-runner.{log,json}`.
All 46 runner test files and all 78 data test files are byte-compared between worktree and temporary copy;
no test is edited or skipped. The earlier first-run conflict fixtures are superseded by the committed red repair.


Final delivery verification of the retained production bytes:

- B1c **12 pass / 7 fail**; B1a **18/18 pass**; corpus/driver/PDF/method **38/38 pass**.
- Data **4,160/4,160 pass**; runner **611 pass / 7 fail**, 618 total. The seven failures are exactly the audit above.
- Node and runner tsc pass. App tsc retains the four Palette.tsx dependency-type errors already listed.
- ESLint on every touched source file passes. Git diff --check passes. All tested production files' SHA-256
  digests still match the worktree; all 46 runner and 78 data test files match the unchanged temporary copies.
- Both unchanged new-instance source-root builds are confined to the OS-temp copy and pass with the installed
  offline build helper. No repository file is written by a test. Test/fixture sources are unchanged.
- No test/ruling contradiction was found. No golden/cap/time bound was changed. No git write was run by the worker.

Final commands (local offline binaries equivalent to the requested pnpm exec, temporary source copy):

```sh
# /private/tmp/b1c-resume-verify
node node_modules/vitest/vitest.mjs run src/data --config=data-config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-delivery-data.json > /tmp/b1c-delivery-data.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json > /tmp/b1c-delivery-tsc-app.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json > /tmp/b1c-delivery-tsc-node.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p runner/tsconfig.json > /tmp/b1c-delivery-tsc-runner.log 2>&1
node node_modules/eslint/bin/eslint.js src/data/contracts/run-manifest.ts src/data/contracts/note-edit.ts > /tmp/b1c-delivery-eslint-contracts.log 2>&1
# /private/tmp/b1c-resume-verify/runner
PATH=/private/tmp/b1c-offline-bin:$PATH node ../node_modules/vitest/vitest.mjs run --config=../runner-config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-delivery-runner.json > /tmp/b1c-delivery-runner.log 2>&1
node ../node_modules/eslint/bin/eslint.js src/index.ts src/moc.ts > /tmp/b1c-delivery-eslint-runner.log 2>&1
```

Status: **blocked on parser/report scope**, with the verified framed-MOC implementation retained and uncommitted.
The scope question remains pending. No claim is made that legacy migration or truthful MOC Updated rows are finished.

## Implementation (addendum 8)

The user supplied TL-P4-41 addendum 8 verbatim and assigned ownership-format.ts, report.ts and grounded.ts
until handoff. The previous scope blocker is resolved. A different, verified test/ruling contradiction now
requires stopping under the user's explicit TL-P4-51 instruction. No further production change was retained.
The existing uncommitted index.ts, moc.ts, run-manifest.ts and note-edit.ts diff is preserved exactly.
Only this notes section was appended in the worktree; the coordinator still owns commits.

### Changes and complete contradiction audit

In `/private/tmp/b1c-add8-audit`, copied production and unchanged tests were run with a minimal parser probe:
the single existing parser accepts outside prose instead of rejecting every nonempty outside line. It still
rejects malformed ownership controls and retains the existing framed payload/task authority. No extra parser,
writer, report builder, stored format, fixture or test was introduced. This is diagnostic scratch code only,
not a delivered implementation of the complete untouchable-span API or migration.

The whole runner suite and the whole data suite completed before stopping. Exactly three tests contradict
addendum 8's general permission for opaque unframed bytes. Every contradiction is listed here:

| Exact test | File:line | Contradiction / observed assertion |
| --- | --- | --- |
| ownership/2 raw byte authority > classifies invalid-outside-content and trusts only the independently authored raw spans | src/data/vault/ownership-format.test.ts:54 | Expects `invalid` solely for outside prose; the one-parser probe correctly returns `v2`. Parameterized case is declared at :50. |
| ownership/2 raw byte authority > refuses damaged framing without publishing any writable range: unclaimed trailing text | src/data/vault/ownership-format.test.ts:126 | Expects damaged-boundary for `Unclaimed` after complete frames; addendum 8 requires keeping those bytes without interpreting them. Input at :123; task-refusal assertion at :127 also contradicts valid framed task authority. |
| protected sections retain prose and tasks outside the personal body > refuses reading and task edits for unclaimed content | src/data/vault/note-format.test.ts:475 | Expects parsing to throw for outside text/task-shaped prose after complete frames; reading now succeeds and outside prose remains outside task authority. Input at :469; parameterized case at :473; task-refusal assertion at :476 has the same contradiction. |

The first case's fixture expectation lives in
`docs/harness/evidence/2026-10-05-local-prerequisites/ownership-fixtures-final/manifest.json:545`
(`expected_status: invalid`, fixture id at :542). Neither this independently pinned bundle nor its tests was changed.
No fourth contradiction appeared in the complete suites. Existing report and grounded tests remain green.
All seven original B1c reds remain exactly those named in the resumed failure audit; they are required
implementation work, not contradictions. Parser migration and settled-outcome report changes stop here pending
the lead's resolution of the three contradictory test contracts. No request to change them is made by this worker.

removed: no retained production mechanism was removed in this round.
removed: the prospective parser change from delivery; it exists only in the OS-temp contradiction audit copy.
tests changed: none

### Compatibility row drafts for the contract homes

These rows distinguish verified retained behaviour from addendum-8 work still blocked by test contracts.

| Contract home / stored behaviour | Compatibility draft |
| --- | --- |
| ownership-format.ts: existing plain/legacy/framed records | Existing authority, raw spans, encoding refusals, fences and framed tasks preserved by the probe; only the three outside-prose expectations conflict. No delivered parser change. |
| ownership-format.ts: opaque bytes outside frames | Addendum 8 admits them byte for byte without parsing meaning; the full data probe confirms the three listed contradictory contracts. General untouchable spans and legacy MOC migration remain undelivered. |
| run-manifest.ts: v1 and old maintain inputs | Retained optional MOC snapshot/target envelope remains additive; existing data contract tests pass with the probe. No schema change in this round. |
| note-edit.ts: framed maps and personal maps | Retained one-author region edits remain fenced; personal maps retain exact bytes. Legacy MOC migration remains pending; no second parser or author added. |
| report.ts: fixed contributions and settled maintain writes | Existing report tests pass unchanged. Addendum 8 requires truthful existing Updated rows materialized from settled maintain outcomes; no speculative candidate row or runner-side report builder retained. |
| grounded.ts: ordinary rows and maintain targets | Existing grounding tests pass unchanged. Acceptance of maintain target paths is authorized but not implemented before the contradiction stop. |

### Verification (OS-temp only)

- Full ruling-probe data: **4,157 pass / 3 fail**, 4,160 total; precisely the three contradictions above.
- Full runner: **611 pass / 7 fail**, 618 total; precisely the seven resumed-audit B1c reds.
- Node and runner tsc: pass. App tsc: the same four Palette.tsx implicit-any dependency-type errors
  at :119 (value/search), :123 (w), :127 (w); no new type failure.
- ESLint: pass on index.ts, moc.ts, run-manifest.ts, note-edit.ts and all three newly assigned homes.
- All 78 data and 46 runner test files were byte-compared with the worktree and are unchanged.
  Every retained production file except the diagnostic scratch parser was likewise byte-compared.
- Existing report and grounded tests pass; ownership-format's only failures are its two listed contradictions.
- The actual requested `pnpm exec vitest run src/data --maxWorkers=2` was attempted in the temp copy with
  temporary config/report options and automatic manager-version selection disabled. The installed pnpm still
  attempted dependency setup and refused the existing node_modules symlink (`workspace hoist directory is not
  a real directory`). The installed local Vitest binary ran the identical suite offline afterward.
- Both unchanged new-instance tests pass using the previous offline esbuild build helper entirely in the
  temporary source copy. Test fixture git writes stay inside their disposable OS-temp repositories.
  This worker ran no writing git command. No test/build/log output was written in this worktree.
- No pnpm check or e2e claim: the user's requested gates supersede them and no screen changed.

Reports: `/tmp/b1c-add8-data.{log,json}`, `/tmp/b1c-add8-runner.{log,json}`,
`/tmp/b1c-add8-tsc-{app,node,runner}.log`, `/tmp/b1c-add8-eslint-{app,runner}.log`.
The diagnostic source copy and its temporary Vitest configs are `/private/tmp/b1c-add8-audit`.

Commands used after the pnpm setup refusal, with output redirected to the listed OS-temp files:

```sh
# /private/tmp/b1c-add8-audit
node node_modules/vitest/vitest.mjs run src/data --config=data-config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-add8-data.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json
node node_modules/typescript/bin/tsc --noEmit -p runner/tsconfig.json
node node_modules/eslint/bin/eslint.js src/data/contracts/run-manifest.ts src/data/contracts/note-edit.ts src/data/contracts/ownership-format.ts src/data/spine/report.ts src/data/spine/grounded.ts
# /private/tmp/b1c-add8-audit/runner
PATH=/private/tmp/b1c-offline-bin:$PATH node ../node_modules/vitest/vitest.mjs run --config=../runner-config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-add8-runner.json
node ../node_modules/eslint/bin/eslint.js src/index.ts src/moc.ts
```

Status: **blocked by the three explicitly listed test/ruling contradictions (TL-P4-51)**.
The retained implementation is unchanged; the seven remaining reds are not claimed green.


## Addendum 8 red repair

The owner authorized this tests-only TL-P4-51 repair against TL-P4-41 addendum 8.
The single ownership parser must admit opaque bytes outside complete frames, retain them exactly,
and grant writes and task authority only inside framed payloads. No production implementation was changed.

tests changed: src/data/vault/ownership-format.test.ts: TL-P4-41 addendum 8: override only invalid-outside-content's local status and personal-task expectations; accept trailing prose, exclude its byte span from payload/task authority, refuse outside task requests and preserve outside bytes through a framed task edit.
tests changed: src/data/vault/note-format.test.ts: TL-P4-41 addendum 8: outside prose reads successfully; the existing task-edit refusal now targets outside task index 1, while framed task index 0 remains editable and preserves the outside bytes.

The pinned evidence bundle, its hashes and all other fixture expectations are unchanged.
Only the outside-prose row was removed from each invalid-case table; all damaged-frame,
malformed-control, unsupported-version and encoding refusal cases and their assertions remain unchanged.
Outside spans are checked through the existing published payload and task authority and exact output bytes;
these tests do not prescribe an additional parser or a new result-property name.

### Remaining-test audit

One final `rg -n -i 'outside|unclaimed|unframed' src/data runner/test --glob '*test*'`
found no further assertion that outside prose is invalid or throws. The other matching refusals concern
changed source versions, folder/admission boundaries or URLs, rather than opaque bytes outside frames.
Existing runner/test/b1a-contract.test.ts:223 and runner/test/b1-index.test.ts:493 already require outside
bytes to survive. The full search output is `/tmp/b1c-add8-red-prose-audit.log`.

### Red verification

Ran both entire files offline with `--maxWorkers=2`: **290 pass / 3 fail**, 293 total.
Only these newly corrected expectations fail:

- src/data/vault/ownership-format.test.ts:56: invalid-outside-content still returns invalid instead of v2.
- src/data/vault/ownership-format.test.ts:149: unclaimed trailing text still returns invalid instead of v2.
- src/data/vault/note-format.test.ts:484: reading outside prose still throws damaged-boundary.

All test execution, Vite caches, timer-gate CPU reports and logs stayed in the OS-temp folder.
An exact source copy at `/tmp/b1c-add8-red-3qai3rgh` uses the installed local Vitest binary and a temporary
config retaining jsdom and both existing setup files; no pnpm setup or network request was made.

```sh
# cwd: /tmp/b1c-add8-red-3qai3rgh
node node_modules/vitest/vitest.mjs run src/data/vault/ownership-format.test.ts src/data/vault/note-format.test.ts --config=red-config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-add8-red-tests.json > /tmp/b1c-add8-red-tests.log 2>&1
```

Logs: `/tmp/b1c-add8-red-tests.log`, `/tmp/b1c-add8-red-tests.json`.
SHA-256 comparison confirms retained runner/src/index.ts, runner/src/moc.ts,
src/data/contracts/note-edit.ts and src/data/contracts/run-manifest.ts are byte-for-byte unchanged.
`git diff --check` passes. No writing git command, production edit or evidence edit was run.
No green implementation, pnpm check or e2e claim: this assignment owns only the corrected reds.
Source: the owner's verbatim TL-P4-41 addendum 8 ruling and the preceding Implementation (addendum 8) audit;
no external research was needed or permitted for this assertion-only repair.

## Implementation (addendum 8, after red repair)

The owner assigned ownership-format.ts, report.ts and grounded.ts until handoff and required production-only
continuation on the retained diff. The committed Addendum 8 red repair was read before this implementation.
No test, fixture, evidence bundle, golden, contract number or committed configuration was changed. The
coordinator still owns commits. No network call or writing git command was run by this worker.

### Changes

- The existing ownership parser admits opaque bytes between and after complete frames. They stay outside every
  published payload and task range; Markdown in these gaps is never interpreted. The existing malformed-control,
  missing-frame, version, encoding and fenced-payload refusals remain. Its existing legacy branch additionally
  publishes exact Overview/Notes byte spans, with an empty Figures insertion point, only for one exact ordered
  heading pair outside code fences. This is a layout observation, not ownership authority.
- note-edit's existing MOC snapshot checks both `by: bower` and `type: moc` before admitting those legacy spans.
  Its existing moc-rewrite author inserts the ownership declaration and frames without moving or changing a
  legacy byte, then rewrites only Figures and Notes. Overview, prefix, suffix, multibyte prose and original
  sections remain exact; missing/near-match headings and personal maps remain untouched. Each rewrite's
  invariant compares its framed before-image with the after-image, protecting all bytes outside that payload.
- The shared member-id projection and MOC edit preparation moved from runner/moc.ts into note-edit.ts; moc.ts
  reexports them. The existing shortest unique links, peer-map membership, recursive leaf count and ordinary
  applyChanges author remain the single mechanism. No new parser, author, hierarchy builder or Drive writer.
- The existing settled-input refresh moved from runner/index.ts into report.ts and is used by both maintenance
  and materialization. An applied maintain outcome proves every shared computed MOC edit settled before the
  retrieval commit. Only then does materialize add one existing Updated row per changed target. Unresolved
  maintain waits; rejected maintain and unchanged MOCs produce no Updated row. Frozen candidate Updated rows
  for maintain are not copied into the report; the actual shared author result selects them. Replay recomputes
  the same rows from the immutable manifest and settled outcomes, without extra Drive reads or a runner builder.
- grounded.ts accepts Updated paths from maintain's declared, verified MOC targets, with that operation id,
  no Timeline ordinal, and no created/filed/set-aside claim. Ordinary edit/create and journal grounding remain.
- The task writer copies ordinary typed byte arrays with their realm intact and normalizes subclasses to an
  independent Uint8Array. Calling the typed-array slice intrinsic avoids a subclass's shared-view override;
  normalization preserves the existing Buffer-copy contract. This also satisfies the repaired byte-exact
  outside-prose test under jsdom without changing any assertion or test environment.

removed: ownership-format.ts: rejection solely for opaque bytes outside complete ownership frames.
removed: note-edit.ts: framed-only MOC snapshot admission; legacy layout still comes from the one parser.
removed: runner/src/moc.ts: runner-local rendering/edit preparation; it reexports the shared contract helpers.
removed: runner/src/index.ts: runner-local settled snapshot refresh; report.ts supplies the shared implementation.
removed: report.ts: frozen-candidate maintain Updated claims; settled shared author results select the rows.
tests changed: none

### Compatibility row drafts for the contract homes

| Contract home / stored behaviour | Compatibility draft |
| --- | --- |
| ownership-format.ts: plain and legacy notes | Existing personal/task/layout semantics remain; optional legacy MOC layout spans are additive and never grant ownership. |
| ownership-format.ts: framed notes, About me and Rules-added outside bytes | Complete framing permits arbitrary outside prose as untouchable gaps. Only framed payloads grant body/task authority. Reserved malformed controls still refuse. |
| ownership-format.ts: raw bytes and subclasses | Source arrays remain unchanged; canonical task edits change one framed checkbox. Buffer/subclass inputs are copied, never shared. |
| note-edit.ts: framed MOCs | Existing exact region payloads and protected-byte invariants remain; no change to ownership or edit ordering. |
| note-edit.ts: legacy Bower MOCs | One exact Overview/Notes pair migrates on first real maintain; all other bytes survive. Second maintain is byte-identical and sends no MOC write. |
| note-edit.ts: personal or incomplete legacy MOCs | Type/title/headings alone grant no write. These maps remain byte-identical and unfolded. |
| run-manifest.ts: old v1/v2 and old maintain snapshots | Existing snapshots without optional MOC fields remain readable; new target envelopes retain exact source bytes, region bytes, listing identity and verified before-content. |
| run-manifest.ts: MOC targets | The existing strict guard derives authority from source bytes and verifies parent/name/version/hash. Personal targets cannot be resealed into authority. |
| report.ts: existing fixed report contributions | Ordinary rows preserve existing contribution/outcome semantics. No report/checkpoint format or row kind changes. |
| report.ts: settled maintain outcomes | Changed MOCs get one existing Updated row after the commit; unchanged/refused/unresolved work cannot become a speculative claim. Lost replies and done replay retain meaning. |
| grounded.ts: existing edits/creates/journal rows | Existing path, operation and Timeline grounding stays unchanged. |
| grounded.ts: maintain targets | Updated rows may name only declared, verified MOC paths for their maintain operation; no new row kind or runner-file report claim. |

### Exact seven-red resolution (TL-P4-51)

The complete earlier failure audit remains the acceptance list, with every name preserved:

| Exact test | Earlier first failure | Implemented home |
| --- | --- | --- |
| B1c index: existing MOC at 40 direct members folds and rebuilds complete regions by id | runner/test/b1-index.test.ts:300 | report.ts settled Updated row |
| B1c index: existing MOC at 41 direct members folds and rebuilds complete regions by id | runner/test/b1-index.test.ts:300 | report.ts settled Updated row |
| B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps | runner/test/b1-index.test.ts:411 | ownership-format.ts layout and note-edit.ts migration |
| B1c index: legacy MOC migrates on its first maintain and keeps every other byte | runner/test/b1-index.test.ts:492 | one parser and exact-byte framed author |
| B1c index: legacy MOC second maintain is idempotent with no MOC write | runner/test/b1-index.test.ts:513 | first migration and shared unchanged-edit refusal |
| B1c index: legacy MOC without Overview and Notes is untouched | runner/test/b1-index.test.ts:535 | exact-heading admission plus migrating positive control |
| B1c index: legacy MOC belonging to a person with the same headings is untouched | runner/test/b1-index.test.ts:551 | by/type authority plus migrating positive control |

Offline research reused the earlier stable-sort and Obsidian-link references in this notes file, without
fetching them. The typed-array copy uses ECMAScript's standard intrinsic slice/species behaviour
(<https://tc39.es/ecma262/#sec-%typedarray%.prototype.slice>), referenced offline, not fetched.

### Verification (final production; OS-temp only)

- All seven named remaining reds pass through runner main. B1c is **19/19**, B1a **18/18**.
- Full runner: **618/618 pass**, 46 files; corpus/driver/PDF/method and all lifecycle controls remain green.
- Full data: **4,160/4,160 pass**, 78 files, including the existing ownership-format, report and grounded tests.
- Repaired ownership/note-format files: **293/293 pass**. The full-suite Buffer-copy regression was corrected
  in production before the final entire data/runner runs; no assertion or environment was changed.
- Node and runner tsc pass. App tsc has only the four previously documented Palette.tsx dependency-type errors:
  :119 (`value`, `search`), :123 (`w`), :127 (`w`). No new type failure; that screen is outside this assignment.
- ESLint passes on all seven touched production files. `git diff --check` passes.
- SHA-256 confirms every touched production source matches the final verification copy. All 78 data and
  46 runner test files match the worktree byte for byte. Audit: `/tmp/b1c-add8-final-source-audit.log`.
- No test/ruling contradiction remains after the committed red repair. No test was changed, skipped or relaxed.
- No pnpm check mark or e2e pass is claimed: the user specified these narrower gates and no screen was touched.

The requested pnpm data command was attempted with offline mode and automatic package-manager selection
explicitly disabled. It refused the installed node_modules symlink during setup (`workspace hoist directory
is not a real directory`), before Vitest. Log: `/tmp/b1c-add8-impl-pnpm-data.log`. The same full data suite then
ran with the installed local Vitest binary, offline. No dependency installation or network request was needed.
Temporary configs preserve the existing environments, setup files, includes, alias and CSS-module behaviour;
Vite/module caches, CPU reports, builds and all logs stay under OS temp. The two unchanged new-instance tests
build only in the OS-temp copy, using the existing installed esbuild helper; their git fixture writes are
confined to disposable OS-temp repositories. This worker directly ran no writing git command.

Final commands (source copy `/private/tmp/b1c-add8-implementation`):

```sh
# source-copy root
node node_modules/vitest/vitest.mjs run src/data --config=data-config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-add8-final-data.json > /tmp/b1c-add8-final-data.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json > /tmp/b1c-add8-final-tsc-app.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json > /tmp/b1c-add8-final-tsc-node.log 2>&1
node node_modules/eslint/bin/eslint.js src/data/contracts/run-manifest.ts src/data/contracts/note-edit.ts src/data/contracts/ownership-format.ts src/data/spine/report.ts src/data/spine/grounded.ts > /tmp/b1c-add8-final-eslint-app.log 2>&1
# source-copy runner/
PATH=/private/tmp/b1c-offline-bin:$PATH node ../node_modules/vitest/vitest.mjs run --config=../runner-config.mjs --configLoader=runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-add8-final-runner.json > /tmp/b1c-add8-final-runner.log 2>&1
node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > /tmp/b1c-add8-final-tsc-runner.log 2>&1
node ../node_modules/eslint/bin/eslint.js src/index.ts src/moc.ts > /tmp/b1c-add8-final-eslint-runner.log 2>&1
```

Production files for handoff: `runner/src/index.ts`, `runner/src/moc.ts`,
`src/data/contracts/run-manifest.ts`, `src/data/contracts/note-edit.ts`,
`src/data/contracts/ownership-format.ts`, `src/data/spine/report.ts`, `src/data/spine/grounded.ts`.
Notes: `docs/harness/2026-10-10-b1c-index-notes.md`, separately committed by the coordinator.

Status: **done**, retained and uncommitted for coordinator handoff. All seven remaining reds and every other
runner/data test are green. The only requested gate still failing is the documented baseline app typecheck.


## Fix round 1 reds

Red-owning session for adversarial pass 1 (BLOCK), 2026-10-11. Tests and notes only;
no production change, network access, dependency replacement, writing git command or commit.
The coordinator owns commits. Applied bower-implement within the user's red-only scope.

Offline research: reused the real corpus driver, versioned FakeDrive and ordinary fenced edits.
[Vitest assertions](https://vitest.dev/api/expect.html) and
[Vitest setup files](https://vitest.dev/config/setupfiles) are reference URLs, not fetched.
The production runner main is the entry point for every added case; no alternate MOC writer or parser.

tests changed: runner/test/b1-index.test.ts: added four numbered regression contracts (six parameterized cases).
tests changed: docs/harness/2026-10-10-b1c-index-notes.md: appended fix-round red evidence and handoff only.
No pre-existing assertion was changed, removed, skipped or weakened.

| Exact test name | Assertion evidence |
| --- | --- |
| B1c fix 1: 1 settled link rewrite supplies maintenance its new MOC text and version | Exit 1 instead of 0; one MOC write instead of two; stale figures survive; retrieval never commits. |
| B1c fix 1: 2 B1a unchanged legacy MOC is discovered migrated once and folded | Legacy ownership instead of v2; zero migration writes instead of one; missing folded Garden line. |
| B1c fix 1: 3 figures count 1 direct notes without a child map | Figures report 2 direct notes instead of 1 direct note, with 2 notes in all. |
| B1c fix 1: 3 figures count 40 direct notes without a child map | Figures report 41 direct notes instead of 40, with 41 notes in all. |
| B1c fix 1: 4 bootstrap projections are visible before the provider runs | Index and retrieval state are absent at provider entry, although the index exists after the run. |
| B1c fix 1: 4 missing-index projections are visible before the provider runs | Index is absent at provider entry, although the index exists after the run. |

Positive controls: (1) the settled rewrite changes Overview to [[Seed]] while retaining stale figures;
(2) B1a state contains no MOC metadata, the MOC version is unchanged and the other note's version updates;
(3) direct and descendant members remain reachable by id, the recursive folded count is unchanged,
and no child map is created; (4) main calls the provider exactly once and eventually rebuilds the index.
The success-side assertions also require final MOC text/version in retrieval, the report barrier,
legacy-byte preservation and no second migration on a later forced maintain.

Verification: the entire touched file ran with --maxWorkers=2: **6 assertion reds; 19 existing tests pass**.
No import, transform, timer, unhandled-runtime or fixture failure. Contradicting existing assertions: **none**.
The red-only task deliberately leaves production fixes and full check/e2e gates to the implementation session.

Command, run with cwd in the OS-temp directory below:

```sh
node /private/tmp/bower-b1c-index/node_modules/vitest/vitest.mjs run --config=vitest.config.mjs --configLoader=runner --maxWorkers=2 > run.log 2>&1
```

The temporary config preserves the runner's Node environment and timer-gate setup, uses absolute
paths to the unchanged source tree and touched test file, and routes its root, cache, CPU reports,
JSON results and log into OS temp. No node_modules directory was replaced or symlinked.
Temp directory: `/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b1c-fix1-reds-c2t7_w19`.
Handoff logs: `/tmp/b1c-fix1-reds.log`, `/tmp/b1c-fix1-reds.json`.


## Fix round 1

Implementation session, 2026-10-11. **Blocked on finding 4; findings 1–3 are fixed.**
The edits are retained for coordinator review. No commit or writing git command was run.
Read WORKER, the B1c packet, adversarial pass 1 and the notes' Fix round 1 reds;
applied bower-implement within the user's narrower fix scope.

### Changes and existing mechanisms

- Finding 1: maintenance gets a MOC's before metadata from the shared settled listing and hashes
  the shared settled source text. The ordinary edit-text guard still checks live bytes and the
  settled modifiedTime. The immutable original manifest remains unchanged. No guard bypass,
  alternate edit author, extra MOC read or runner report builder was added.
- Finding 2: Bower-marked files in B1a state without MOC metadata are read through B1a's existing
  versioned read cache during a triggered maintain. The existing ownership parser alone decides
  whether the bytes are an editable MOC. An optional per-version `mocChecked: true` remembers
  discovery, including a negative result, in the same retrieval entry. It is not ownership authority.
  Changed versions are read again; cached MOC bytes are reparsed. Hidden-only/no-change cursor
  paths remain unchanged. The regression proves one migration and no second migration.
- Finding 3: direct figures count only leaf members whose parent path equals the MOC's parent
  path. Membership and recursive leaf counts still include descendants, using the existing
  membership mechanism by id. One direct note uses singular copy.
- Minor ownership control: the outside-frame refusal trims leading whitespace before checking
  an ownership control. This is one line in the existing parser. Ordinary outside prose stays opaque.
  An OS-temp probe keeps a valid framed positive control and refuses an indented malformed control.

removed: original before-text/version as the edit guard input after the run's own settled MOC edit.
removed: unconditional same-version skip of undiscovered Bower-marked entries in B1a retrieval state.
removed: descendant leaves from the direct-note figures count.
removed: acceptance of indented malformed ownership controls outside complete frames.
tests changed: none

Production homes changed: `runner/src/index.ts`, `src/data/contracts/note-edit.ts`,
`src/data/contracts/ownership-format.ts`, `src/data/contracts/run-manifest.ts`,
`src/data/spine/report.ts`. `main.ts`, `moc.ts` and `grounded.ts` are unchanged.
No test, fixture, golden, numerical bound or method verdict changed.

### Finding 4: mechanism/scope blocker, not a test repair

Q8's before-planning behaviour is valid and is still missing. The existing engine calls the
provider to obtain the complete immutable manifest, then writes that manifest and its first
checkpoint, then dispatches maintenance after the other effects (Q5). See
`src/data/spine/engine.ts:133`, :142 and :149, and `src/data/contracts/run-manifest.ts:564`.
Moving `withMaintenance` ahead of the provider only freezes inputs; it does not dispatch writes.
The current index/state targets therefore cannot be visible on Drive when the provider starts.

Within the assigned homes, dispatching them early would either write before the frozen manifest
and checkpoint, or add a separate preparation manifest/lifecycle. The former abandons the existing
spine safety mechanism; the latter is another path and changes the pinned call lifecycle. Neither
was added. WORKER's instruction is explicit: "if it cannot do what you need, stop and report
`blocked`." The lead needs to rule on a preparation lifecycle and expand the engine scope, or
specify another way to reconcile Q5 with Q8 through the one existing mechanism.

The whole targeted runner and data suites were run before stopping. No existing test/ruling
contradiction was found; these two cases correctly expose the unresolved Q8 requirement:

| Exact remaining failing case | File:line | Assertion |
| --- | --- | --- |
| `B1c fix 1: 4 bootstrap projections are visible before the provider runs` | `runner/test/b1-index.test.ts:701`, :728, :729 | Index and retrieval are missing at provider entry. |
| `B1c fix 1: 4 missing-index projections are visible before the provider runs` | `runner/test/b1-index.test.ts:701`, :728 | Index is missing at provider entry. |

These are not declared invalid tests or requests to weaken them. The unchanged constraints to
preserve in a lifecycle ruling include `runner/test/drive-calls-golden.test.ts:25`, :31, :80–83,
`runner/test/overhead.test.ts:66` and the maintenance-last guard named above.

### Compatibility row drafts

| Contract / stored format | Read compatibility | Strict write / current behaviour |
| --- | --- | --- |
| `MaintenanceNote` / maintain snapshot | Old snapshots without `mocChecked` still parse; existing contract tests pass. | Optional `mocChecked` is only literal `true`; other values are rejected by the manifest guard. |
| B1a retrieval entries | Existing v1 entries without MOC discovery metadata remain readable in the same retrieval file. | A triggered maintain discovers Bower-marked entries once per version and upgrades them in place; no alternate state file. |
| Cached MOC metadata | Existing `moc` and `members` remain readable and ownership is reparsed from exact bytes. | `mocChecked` grants no edit authority; all actual MOC writes still use the one parser/author and live edit guard. |
| Settled MOC before-content | Frozen manifests keep their original before-content and remain valid. | Dispatch derives before-content from the run's own applied source text and version; foreign changes still face the ordinary guard. |
| Ownership/2 outside bytes | Existing ordinary outside prose and complete frames remain readable. | Indented ownership controls outside frames refuse as damaged framing. |
| MOC figures | Existing MOC regions remain readable; membership and recursive counts retain their meaning. | Direct figures exclude descendant leaves and use `1 direct note`. |

### v1 limits retained

- `src/data/contracts/note-edit.ts:914`: legacy Notes without a final newline still fail migration.
  Correct framing needs a separator plus matching previous-region normalization, not a one-line change.
  No bytes are silently discarded and no test was changed to admit this case.
- `src/data/contracts/ownership-format.ts:203`: legacy Sources between Overview and Notes remains unsupported.
- `runner/src/index.ts:170`: no enforced ceiling for bootstrap reads / many MOC writes;
  the existing seeded 300-call and 32,000-character contracts still pass.
- Missing projections before planning remain a blocking finding, not a v1 limit.

### Verification and offline sources

- Committed red evidence: six assertion reds in the Fix round 1 reds section, with 19 earlier controls green.
- Final `runner/test/b1-index.test.ts`: 23 pass, 2 fail (only the two finding-4 cases above).
  All four finding-1/2/3 regression cases pass, including the 1/40 direct-count boundary.
- Full runner suite: **622 pass, 2 fail, 624 total; 46 files, one failing file**.
- Full data suite: **4,178 pass, zero fail; 79 files**.
- All five Drive-call goldens pass unchanged, including the 88/99 call counts and phase counts.
- App, node and runner tsc: **pass**. Touched app/runner ESLint: **pass**.
- Indented-control probe: **pass**. `git diff --check`: **pass** (read-only git).
- Byte audit: all five production files and all 125 runner/data test files match the final
  verification copy. Tests were never modified. Audit: `/tmp/b1c-fix1-final-source-audit.log`.
- No `pnpm check` or e2e claim: the user specified the narrower gates, no screen was touched,
  and the repository-writing check mark / test outputs would violate this session's constraints.

Final verification source copy: `/private/tmp/b1c-fix1-final-mnh7nzx5`.
Source and installed dependency directories were copied into OS temp; no worktree node_modules
was replaced or symlinked. Tests, builds, module caches, CPU reports, fixture repositories and logs
stay in OS temp. Temporary configs preserve each environment, setup files, aliases and CSS behaviour.
The unchanged new-instance tests build only the temporary copy via the installed esbuild binary;
their own git fixtures are disposable temp repositories. This worker directly ran no writing git command.

Verification exception: the requested `pnpm exec` invocation was attempted in an earlier temp copy
with `npm_config_offline=true`, `COREPACK_ENABLE_NETWORK=0` and package-manager selection disabled.
Despite those flags, pnpm started automatic dependency setup and attempted registry access; the
log showed DNS failures. Both invocations were interrupted as soon as this was observed. No download
succeeded. Only that disposable dependency copy was affected; worktree dependencies stayed untouched.
No further pnpm setup was allowed. Final gates used the already installed local binaries instead.
Attempt logs: `/tmp/b1c-fix1-data.log`, `/tmp/b1c-fix1-runner.log`.
Initial incomplete-copy verification had missing api dependencies and an incorrect temporary build
wrapper path; those setup failures were repaired only in OS temp and the full suites were rerun.
Final counts above supersede those attempts and contain no setup/import failures.

Final commands (cwd in the OS-temp source copy, runner commands in its `runner/`):

```sh
node node_modules/vitest/vitest.mjs run src/data --maxWorkers=2 --config=data-config.mjs --configLoader=runner --reporter=default --reporter=json --outputFile=/tmp/b1c-fix1-final-data.json > /tmp/b1c-fix1-final-data.log 2>&1
PATH=/private/tmp/b1c-fix1-final-mnh7nzx5/bin:$PATH node ../node_modules/vitest/vitest.mjs run --maxWorkers=2 --config=../runner-config.mjs --configLoader=runner --reporter=default --reporter=json --outputFile=/tmp/b1c-fix1-final-runner.json > /tmp/b1c-fix1-final-runner.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json > /tmp/b1c-fix1-final-tsc-app.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json > /tmp/b1c-fix1-final-tsc-node.log 2>&1
node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > /tmp/b1c-fix1-final-tsc-runner.log 2>&1
node node_modules/eslint/bin/eslint.js src/data/contracts/note-edit.ts src/data/contracts/ownership-format.ts src/data/contracts/run-manifest.ts src/data/spine/report.ts > /tmp/b1c-fix1-final-eslint-app.log 2>&1
node ../node_modules/eslint/bin/eslint.js src/index.ts > /tmp/b1c-fix1-final-eslint-runner.log 2>&1
```

Offline references reused, not fetched: the ordinary guard in `src/data/spine/engine.ts:483`,
B1a's `ReadCache`, the shared `refreshed` projection and the one ownership parser.
[ECMAScript stable sort](https://tc39.es/ecma262/#sec-array.prototype.sort),
[Obsidian internal links](https://help.obsidian.md/links) and
[Vitest setup files](https://vitest.dev/config/setupfiles) remain the packet's reference sources.
No new library, parser, author, report builder or alternate projection write path was added.

## Addendum 9 red repair

Red-owning session, 2026-10-11, TL-P4-41 addendum 9 / TL-P4-51 sweep.
This ruling supersedes Fix round 1's Finding 4 Drive-visibility expectations: bootstrap and
missing-index planning receive an in-memory index; maintain persists the two projections last.
No production code, lifecycle, golden, numerical bound or dependency directory changed.
No network access or writing git command was run; the coordinator owns commits.

tests changed: runner/test/b1-index.test.ts: renamed and rewrote both Finding 4 cases for the in-memory planning projection, manifest-first writes, maintenance-last persistence and shared cached reads, per addendum 9.

Exact red names (table declaration at `runner/test/b1-index.test.ts:701`):
- `B1c fix 1: 4 bootstrap plans with the in-memory index`
- `B1c fix 1: 4 missing-index plans with the in-memory index`

The real `main` / Claude-provider input is parsed and its string values must include the exact
Resources index rows, with the Visible link and summary. This avoids prescribing a new context
field name while requiring the actual projection, rather than merely the note or its path.
Both fixtures begin without index.md; only missing-index has existing retrieval.json. That
fixture touches the note's version so it must read fresh source bytes, rather than accepting
its old durable summary. Record folders are seeded before the run to isolate manifest-first
Drive writes from the existing manifest namespace creation lifecycle.

The production-fetch observer counts every Drive mutation, verifies there are none at provider
entry, and checks that all mutations are accounted for by the path/text trace and the first is
the immutable manifest. Maintain must be the final manifest operation. Exactly one index write
and one retrieval write follow the manifest and opening checkpoint, match the final stored
bytes, and precede last-run.json. The note must be read once before planning and only once over
the entire run, proving maintain reuses that cached read.

### Final TL-P4-51 sweep

Remaining tests expecting projections on Drive before the provider: **none**.
A repository-wide search of test/spec TS and TSX files checked projection/index/retrieval
references paired with before/provider/planning; the matching behaviours were inspected.
The following timing matches are consistent with addendum 9, not contradictions:
- `runner/test/b1a-contract.test.ts:230`: retrieval/cursor commit before the report barrier.
- `runner/test/b1a-contract.test.ts:830`: a folder binned before planning drops indexed descendants.
- `runner/test/b1-index.test.ts:347`, :357: maintain must settle before the report barrier after a lost reply.
- `runner/test/b1-index.test.ts:701`, :748, :750: repaired in-memory planning/read expectations.
- `runner/test/b1-index.test.ts:710`, :711: initial fixture state, not provider-entry Drive visibility.
- `runner/test/b1-index.test.ts:765`: projection persistence before the final report barrier.
Search evidence: `/tmp/b1c-addendum9-sweep.log`.

### Verification

Ran the entire requested file with `--maxWorkers=2`: **23 pass, 2 assertion reds, 25 total**.
Both repaired cases fail only these expected unimplemented behaviours:
- `runner/test/b1-index.test.ts:748`: provider receives no in-memory index projection.
- `runner/test/b1-index.test.ts:750`: zero note reads at provider entry, expected one.
The manifest-first, no-planning-write, final-maintain, durable projections and one-total-read
assertions pass. Earlier controls remain green. Read-only `git diff --check` passes.

Sources/tests were copied into the existing OS-temp verification tree before running. Installed
dependencies were reused there; repository node_modules was neither replaced nor symlinked.
Config, module cache, JSON report, logs and corpus event/provider scratch files stay in OS temp.
No pnpm check/e2e was run: this is the requested red repair only, with no screen changes, and
pnpm check's repository-writing mark conflicts with the user's test-write restriction.

Command (cwd `/private/tmp/b1c-fix1-final-mnh7nzx5/runner`):
```sh
node ../node_modules/vitest/vitest.mjs run test/b1-index.test.ts --maxWorkers=2 --config=../runner-config.mjs --configLoader=runner --reporter=default --reporter=json --outputFile=/tmp/b1c-addendum9-runner.json > /tmp/b1c-addendum9-runner.log 2>&1
```

Offline reference reused: [Vitest setup files](https://vitest.dev/config/setupfiles), already
recorded above; the existing real-main corpus helper, mutation observer and snapshot-string
inspection were reused. No external source was fetched.


## Addendum 9

Implementation session, 2026-10-11, TL-P4-41 addendum 9 / finding 4.
**Finding 4 is implemented in the worktree; delivery is blocked by seven unchanged test contracts below.**
No test, fixture, golden, numerical bound or method verdict was edited. No writing git command or commit was run.
The coordinator owns commits. This section supersedes Fix round 1's lifecycle blocker, not its earlier evidence.

### Changes and reused mechanisms

- `runner/src/index.ts` now exposes `planningIndex`: bootstrap or missing-index plans project the canonical
  index in memory before invoking the provider. It uses the current listing, existing retrieval entries,
  shared snapshot discovery, `projectIndex`, `mocMembership` and B1a's versioned read cache.
- The same snapshot helper supplies maintain. Ordinary cold summaries use `readPrefix`; MOC discovery and
  ownership frames cut by the prefix still require complete cached bytes through the existing parser.
  A prefix never becomes full-content evidence. Missing reads use the existing not-found/drop handling.
- Cold snapshot reads use the existing `READ_AHEAD` limiter (8), retaining listing order in the assembled
  snapshot. Warm maintenance preserves serial snapshot reads and its original discovery phase:
  when both stored projections exist, planning does not consume retrieval's maintenance read.
- `runner/src/main.ts` calls the projection before constructing/invoking the planning provider.
  `ScriptedRun.index` is optional in-memory context; `runner/src/claude.ts` includes it in the real provider's
  JSON input. There is no fabricated Drive file, new durable format, alternate parser or preparation manifest.
- `withMaintenance` still freezes inputs in the one immutable manifest. The existing final maintain effect
  persists index.md and retrieval.json, followed by the existing report barrier. Both finding-4 cases prove
  no Drive mutation at provider entry, manifest-first writes, final-maintain placement, one persistence of
  each projection, and one total ordinary-note read shared by planning and maintain.

removed: cold provider invocation before the canonical in-memory index is computed.
removed: the separate inline snapshot loop in withMaintenance; both projections share snapshotNotes.
removed: ordinary cold projection full downloads where a cached prefix is sufficient.
tests changed: none

### Compatibility

| Contract | Compatibility / resulting behaviour |
| --- | --- |
| Retrieval v1, index bytes and immutable maintain manifests | Same existing formats and guards; no new preparation record or lifecycle. |
| Provider run context | Optional index text only for bootstrap/missing-index plans; existing callers can omit it. |
| B1a warm discovery and MOC discovery | Existing two/three-call discovery contracts and all B1a tests pass. |
| Long ownership notes and MOCs | Full framing is still validated; a cut prefix is never mistaken for complete ownership bytes. |
| Read cache | The original id/modifiedTime cache and prefix/text kinds remain unchanged; live fences remain fresh. |

### TL-P4-51: every remaining contradicting test

The entire runner suite ran after the final source change. These are all seven failures; there are no
other assertion, import, runtime or setup failures. None was changed or bypassed. The two model-input
fixtures are bootstrap runs without stored projections. Their exact old JSON lacks the index required
by addendum 9. The five count failures pin the pre-addendum cold-run counts: two genuine prefix reads
now precede planning, while maintain reuses them. Full provider text reads remain separate from prefix
reads as B1a's cache contract requires. Warm discovery, recovery, hidden-path and report-barrier tests pass.

| Test | File:line | Contradiction / final evidence |
| --- | --- | --- |
| `C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media` | `runner/test/c05-bounded-reads.test.ts:268`; shared assertion `:262` | Bootstrap baseline pins 20 reads; required cold projection makes 22. |
| `C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence` | `runner/test/c05-bounded-reads.test.ts:302`; baseline call `:305`, shared assertion `:262` | Same bootstrap baseline pins 20 reads; actual 22. |
| `the C04 run makes the golden number of Drive calls per step` | `runner/test/drive-calls-golden.test.ts:25` | Exact total 88; actual 90 with the two cold source-prefix reads. |
| `with 25 earlier runs a run makes 99 Drive calls` | `runner/test/drive-calls-golden.test.ts:80` | Its first C04-control assertion pins 88; actual 90. Later assertions are not reached. |
| `the model input on the C04 fixture equals its golden copy` | `runner/test/model-input-fingerprint.test.ts:81` | Exact normalized provider input excludes the required bootstrap index. |
| `the raw model input on the C04 fixture equals its golden copy` | `runner/test/model-input-fingerprint.test.ts:92` | Exact raw provider input excludes the required bootstrap index. |
| `the timing line counts calls and bytes per phase and names the region` | `runner/test/timing-counts.test.ts:13` | Exact sum 88; actual 90 with the required cold reads. |

Stopped under TL-P4-51 after listing the complete sweep. The lead owns reconciliation of these frozen
expectations with the permitted cold-read delta and required provider context; this worker cannot edit tests.
No weakened number, omitted index context, cache-evidence promotion or fixture-specific branch was added.

### Verification

- Pre-fix committed red reproduced: **23 pass, 2 assertion reds**, in `/tmp/b1c-a9-red.json`.
  Exact cases: `B1c fix 1: 4 bootstrap plans with the in-memory index` and
  `B1c fix 1: 4 missing-index plans with the in-memory index`.
  Both failed at `runner/test/b1-index.test.ts:748` (index absent in provider input) and `:750` (no pre-plan note read).
- Final `runner/test/b1-index.test.ts`: **25/25 pass**, including both exact finding-4 cases and all earlier controls.
- Final full runner: **617 pass, 7 fail, 624 total; 46 files**. Final report/log:
  `/tmp/b1c-a9-verified-runner.json`, `/tmp/b1c-a9-verified-runner.log`.
- Both `reads-report.test.ts` timing bounds pass unchanged after using B1a's bounded cold read concurrency.
- Requested `pnpm exec vitest run src/data --maxWorkers=2`: **4,178 pass, zero fail; 79 files**.
  `/tmp/b1c-a9-data.json`, `/tmp/b1c-a9-data.log`.
- App, node and runner tsc: **pass**. ESLint on all four touched production files: **pass**.
  Logs: `/tmp/b1c-a9-tsc-app.log`, `/tmp/b1c-a9-tsc-node.log`, `/tmp/b1c-a9-verified-tsc-runner.log`,
  `/tmp/b1c-a9-eslint-app.log`, `/tmp/b1c-a9-verified-eslint-runner.log`.
- Read-only `git diff --check`: **pass**. Source/test/fixture byte audit has zero mismatches:
  `/tmp/b1c-a9-source-audit.log`. No test changes appear in the worktree diff.
- No pnpm check/e2e claim: the user specified narrower gates, no screen changed, and pnpm check's repository
  mark would violate the session's test-write restriction.

All final checks ran against exact source copies in `/private/tmp/b1c-a9-verify-fqucn31r`.
The real installed dependency directories were copied into that fresh OS-temp tree, never replacing or
symlinking a worktree node_modules directory. Configs, caches, runner builds, corpus scratch files, test
fixture repositories, reports and logs stay in OS temp. The runner's new-instance test uses an OS-temp
build wrapper over the installed esbuild binary; its git fixtures are disposable OS-temp repositories.

Launcher incident: a pnpm probe in the earlier disposable verification tree ignored temporary `.npmrc`
offline/verification settings and began automatic dependency setup, producing failed registry DNS requests.
It was interrupted immediately on inspection; no download succeeded. This did affect that old temporary
dependency copy, so it was not reused. The original worktree dependencies were untouched. The installed
pnpm 11 binary reads these settings from `pnpm-workspace.yaml`: the final temp tree sets
`verifyDepsBeforeRun: false`, `offline: true`, and `managePackageManagerVersions: false` there.
Its installed-command probe and the requested real pnpm exec data invocation then completed without
setup or registry access. Evidence: `/tmp/b1c-a9-pnpm-probe.log`, `/tmp/b1c-a9-pnpm-probe2.log`.
No external research page was fetched.

Final commands (cwd in the final OS-temp tree; runner commands in its `runner/`):

```sh
PATH=/private/tmp/b1c-a9-verify-fqucn31r/bin:$PATH node ../node_modules/vitest/vitest.mjs run --maxWorkers=2 --config=../runner-config.mjs --configLoader=runner --reporter=json --outputFile=/tmp/b1c-a9-verified-runner.json > /tmp/b1c-a9-verified-runner.log 2>&1
/opt/homebrew/bin/pnpm exec vitest run src/data --maxWorkers=2 --config=data-config.mjs --configLoader=runner --reporter=json --outputFile=/tmp/b1c-a9-data.json > /tmp/b1c-a9-data.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json > /tmp/b1c-a9-tsc-app.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json > /tmp/b1c-a9-tsc-node.log 2>&1
node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > /tmp/b1c-a9-verified-tsc-runner.log 2>&1
node node_modules/eslint/bin/eslint.js src/data/spine/scripted.ts > /tmp/b1c-a9-eslint-app.log 2>&1
node ../node_modules/eslint/bin/eslint.js src/index.ts src/main.ts src/claude.ts > /tmp/b1c-a9-verified-eslint-runner.log 2>&1
```

Offline research reused the existing ReadCache's versioned/prefix evidence contract and the established
`READ_AHEAD` limiter, canonical index builder, MOC projection and ownership parser. Packet reference URLs
were reused, not fetched: [ECMAScript stable sort](https://tc39.es/ecma262/#sec-array.prototype.sort),
[Obsidian internal links](https://help.obsidian.md/links), and
[Vitest setup files](https://vitest.dev/config/setupfiles).

## Addendum 9 red repair 2

Red-owning session, 2026-10-11. TL-P4-51 sweep repair for TL-P4-41 addendum 9.
Source HEAD: `b972996d14a4667613427ff3481a0a730ac5913b`. No production edits or repository-writing git commands.
The coordinator owns commits. This section supersedes Addendum 9's seven-test reconciliation blocker.

### Authorized changes

The lifecycle and goldens are unchanged except a cold run's real reads and bootstrap index context.
The five count cases listed in Addendum 9 retain exact equality: only the measured two prefix reads
before planning are added. No warm count, timing bound, cut budget, lifecycle assertion or other test changes.

- `c05-bounded-reads.test.ts`: the shared bootstrap baseline is 22, previously 20; both named cases pass it.
- `drive-calls-golden.test.ts`: C04 total and timing total are 90, previously 88; reads phase 22, previously 20.
  The later 25-earlier-runs assertion was reached in the capture run and measured 101, previously 99.
  This is also a cold bootstrap: `modelled` seeds a fresh C04 folder and `finishedBefore` seeds only
  historical run records and stamps, without index/retrieval projections. Its reads phase is 25, previously 23.
  The historical run count does not make this fixture warm. All other phase counts and timing bounds stay exact.
- `timing-counts.test.ts`: total 90, previously 88; reads phase 22, previously 20; all other fields unchanged.
- Both model-input goldens were regenerated from the real C04 provider call in an OS-temp capture copy.
  `model-input-fingerprint.test.ts` itself is byte-identical to HEAD; both exact equality assertions remain.

Tests changed: recorded below using the required machine-readable prefix.

tests changed: runner/test/c05-bounded-reads.test.ts: TL-P4-41 addendum 9: two real cold planning prefix reads; baseline 20 to 22.
tests changed: runner/test/drive-calls-golden.test.ts: TL-P4-41 addendum 9: both fresh fixtures are cold; exact totals/read phases gain only two.
tests changed: runner/test/timing-counts.test.ts: TL-P4-41 addendum 9: cold timing includes two prefix reads before planning; other phases unchanged.
tests changed: runner/test/fixtures/model-input-c04.golden.txt: TL-P4-41 addendum 9: normalized bootstrap input gains only the canonical index field.
tests changed: runner/test/fixtures/model-input-c04.raw.golden.txt: TL-P4-41 addendum 9: raw bootstrap input gains only the canonical index field.

### Exact golden diff

Both files have the same single JSON-field insertion on their final line. Expanded field diff:

```diff
+ "index": "# Index\n\n## Areas\n\n### Home\n\n- [[Garden plot]] — Alex's plot at the Larkspur Lane community garden.\n"
```

Decoded added context:

```markdown
# Index

## Areas

### Home

- [[Garden plot]] — Alex's plot at the Larkspur Lane community garden.
```

Byte audit removes exactly `,"index":<JSON-encoded string>` once from each regenerated file and obtains
its original HEAD bytes. Prompt bytes, every existing JSON field/value, ordering and all remaining bytes
are identical. Audit: `/tmp/b1c-a9-repair2-audit.log`.

### Method and verification

Reused the existing exact `readFileSync` golden comparison and the real runner's `modelled`/`countsOf`
measurement, rather than changing normalization or acceptance assertions. Local method references:
`runner/test/model-input-fingerprint.test.ts:79`, `runner/test/modelled.ts:118`.
No network or external research was used under the session's explicit no-network constraint.

The full pre-edit runner sweep reproduced **617 pass, 7 assertion reds, 624 total; 46 files**:
`/tmp/b1c-a9-repair2-red.json`, `/tmp/b1c-a9-repair2-red.log`.
The seven exact cases are the complete table in Addendum 9's TL-P4-51 section above.
The intermediate four-file capture verified later assertions: **21 pass, 3 fail** (the later cold count
101 versus 99, and the two unchanged goldens). Logs: `/tmp/b1c-a9-repair2-capture.json`,
`/tmp/b1c-a9-repair2-capture.log`. Capture writes occurred only in OS temp, and instrumentation was removed
before the final full run.

Verification tree: `/private/tmp/b1c-a9-repair2-8__6ogb7`, populated from the worktree's tracked files.
Installed dependency directories were copied into this fresh tree; no existing node_modules was replaced
or symlinked. Test scratch repositories, bundles, caches, reports and logs stay in OS temp. The build-only
pnpm stand-in executes the installed esbuild binary; no package-manager setup or network is invoked.
Source/test/corpus/script byte audit verifies the tested copy against the worktree and unchanged production
against HEAD. Disposable git fixtures belong to the existing runner suite; no session git write touches
this worktree or its git metadata.

Final command, cwd in the temp tree's `runner/`:

```sh
PATH=/private/tmp/b1c-a9-repair2-8__6ogb7/bin:$PATH node ../node_modules/vitest/vitest.mjs run --maxWorkers=2 --config=../runner-config.mjs --configLoader=runner --reporter=json --outputFile=/tmp/b1c-a9-repair2-green.json > /tmp/b1c-a9-repair2-green.log 2>&1
```

No pnpm check/e2e claim: this session is limited to the full runner suite, no screen changed, and pnpm check's
repository mark violates the session's test-write restriction. Nothing else was repaired or left out.

Final full runner suite at the pinned source HEAD with only the authorized test/golden repairs:
**624 pass, zero fail, 624 total; all 46 files pass**. Reports:
`/tmp/b1c-a9-repair2-green.json`, `/tmp/b1c-a9-repair2-green.log`.
Read-only `git diff --check`: pass. Owned-file and exact-copy/HEAD byte audits: pass.
No remaining contradiction, import, setup or runtime failure. All warm-run controls pass unchanged.


## Fix round 2 reds

Red-owning session, 2026-10-11. Packet: `2026-10-11-codex-b1c-index-adversarial-2.md`, pass 2, BLOCK 2.
Only the test file and these notes changed. No production edit, network access, writing git command,
commit, dependency replacement or node_modules symlink. The coordinator owns commits.

tests changed: runner/test/b1-index.test.ts: added one legacy discovery red and a two-scope warm-call red; existing assertions unchanged.
tests changed: docs/harness/2026-10-10-b1c-index-notes.md: recorded Fix round 2 red contracts, observations and OS-temp evidence.

### Blocking finding 1 — legacy discovery

Exact test: `B1c fix 2: unchanged legacy MOC without Drive ownership is discovered migrated once and folded`.
The sibling fixture uses the existing corpus seed; the MOC itself is created directly with FakeDrive.createText,
with no appProperties argument. The fixture therefore never supplies the Drive ownership property.
It proves valid `by: bower` bytes, absent Drive `appProperties.by`, and an unchanged MOC version in seeded
B1a retrieval state with no MOC metadata. A sibling version changes before real runner main runs.
The contract requires one migration, complete folded membership, preservation of unowned bytes, and no
second migration on a later sibling change. Existing ownership parsing and migration helpers are reused.

Observed assertion reds at `runner/test/b1-index.test.ts:798-800`: ownership remains `legacy`, not `v2`;
zero MOC writes instead of one; index lacks `→ [[Garden]] (2)`. The later idempotence checks remain in
this test and will execute after discovery is repaired.

### Blocking finding 2 — warm scoped calls

Exact tests:
- `B1c fix 2: warm instructions planning preserves calls without Inbox or declaration reads for the index`
- `B1c fix 2: warm all planning preserves calls without Inbox or declaration reads for the index`

Both fixtures contain persisted index/retrieval projections, an unrelated Inbox pile note, and a declaration
referenced by that pile. Neither pile nor declaration is admitted. FakeDrive ids and seed order are identical.
The production scripted provider runs through real runner main; no provider or read helper is replaced.
An observing withMaintenance spy delegates to the real function and captures every prior Drive request.
The planningIndex spy delegates to the real function for the subject run and records its request interval.

The positive control bypasses only the added planningIndex step (returns undefined), reproducing the
pre-addendum main path on an independent identical fixture. It retains scope aiming, real provider reads,
maintenance, and all later effects. Exact ordered pre-maintenance request triples from this control are
compared with the real subject, without a tolerance, filtered total, or permitted count delta.
The control also proves instructions reads neither Inbox file, while all reads both once through its provider.

Observed: planningIndex makes three requests in each scope: one listing plus the unrelated pile-note and
declaration media reads. Its frozen contract permits exactly the shared listing. Instructions has eight
pre-maintenance calls versus the control's six; all has eight versus eight (its provider would read both
anyway), but fails the separate zero-unrelated-index-reads assertion. Thus default all is covered even
when the total happens to hide the premature eager reads.

### Verification and contradictions

Whole targeted file: **25 existing tests pass, 3 new assertion reds, 28 total**. No setup/import/runtime
failure and no contradictory existing assertion found; no existing test body or assertion changed.

Reports: `/tmp/b1c-fix2-reds.json`, `/tmp/b1c-fix2-reds.log`.
Scratch cwd/config/cache/CPU reports:
`/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b1c-fix2-reds-enshatb2`.
Vitest reads source from the worktree, with its config, module cache, transform cache and reporter outputs
in OS temp. The timer-gate CPU report uses the OS-temp cwd. Corpus event files use the existing os.tmpdir
helper. Tests write nothing into the repository. No pnpm check or e2e ran: this is the requested red-only
file run, and pnpm check writes a repository mark.

Command, from that scratch cwd:

```sh
node /private/tmp/bower-b1c-index/node_modules/vitest/vitest.mjs run test/b1-index.test.ts --maxWorkers=2 --config=config.mjs --configLoader=runner --reporter=json --outputFile=/tmp/b1c-fix2-reds.json > /tmp/b1c-fix2-reds.log 2>&1
```

Read-only `git diff --check`: pass. Only added tests/imports and notes appear in the diff.
Offline reference reused: [Vitest setup files](https://vitest.dev/config/setupfiles), the existing real-main
corpus helper, direct FakeDrive seed and B1a's delegating maintenance-spy observation pattern.
No external research was fetched under the explicit no-network constraint.


## Fix round 2

Implementation session, 2026-10-11. The committed reds and every existing test/golden are unchanged.
No network, session git write, commit, dependency replacement or node_modules symlink.
The coordinator owns commits. The five production files retained for review are:
`runner/src/index.ts`, `runner/src/drive.ts`, `runner/src/main.ts`,
`src/data/spine/read.ts`, and `src/data/contracts/note-edit.ts`.

### Changes

- Old B1a summaries are not ownership evidence. Removed the Drive `appProperties.by` predicate from
  first-version discovery. Every unchecked note is examined through B1a's existing versioned read cache,
  and the existing ownership parser and `mocSnapshot` determine whether its bytes grant MOC authority.
  The existing `mocChecked` marker prevents later same-version discovery reads. The no-Drive-property
  legacy fixture now migrates once, folds complete membership and preserves all unowned bytes;
  its second sibling-change run remains idempotent.
- The planning index first obtains the existing shared metadata listing with read-ahead deferred.
  With both projections present it returns without content reads or constructing a projection.
  The provider then warms that same listing under its admitted scope. `warmListing` is the extracted
  original read-ahead block in `admissionRead`, with the same selection, limiter, cache and budget;
  there is no second listing, read-ahead policy or maintenance lifecycle.
- Main aims the reader before the cold check. On a bootstrap/missing-index run, the normal cached
  listing starts existing provider read-ahead before the canonical snapshot is built, preserving
  overlap with cold prefix reads. The final maintain remains the only projection persistence effect.
- `note-edit.ts` imports BowerError directly from the existing `contracts/types.ts` home.
  `src/data/types.ts` already re-exports that exact class and stays unchanged. No new error type,
  class move, wire format, error code or constructor behaviour.

removed: Drive appProperties.by as a prerequisite for unchecked legacy ownership discovery.
removed: eager provider read-ahead from warm planning-index discovery.
removed: the contract's import through the adapter-facing types re-export.
tests changed: none

### Compatibility row drafts

| Contract home | Compatibility draft |
| --- | --- |
| contracts/note-edit.ts and contracts/types.ts | Same BowerError class, code, constructor, cause and identity. Only the local import changes; the old path's existing re-export remains. |
| Retrieval v1 and maintain snapshot | Existing optional mocChecked and MOC fields only; no schema change. Old unchecked entries remain readable and gain the existing ownership-check marker after their bytes are examined. |
| Ownership and MOC author | Existing parser and region author remain authoritative; Drive metadata cannot grant or suppress byte-derived ownership. Personal notes are never made writable by discovery. |
| Admission/runner read interfaces | Existing one-argument listAll still warms by default. The additive readAhead:false option defers only that existing warming policy over the same cached listing. |
| Cold planning and maintain lifecycle | Same canonical index, immutable manifest, final maintain and report barrier. No durable preparation record or second writer. |

### TL-P4-51 contradiction audit

The complete final runner sweep has **620 pass, 7 fail, 627 total; 46 files**.
These are every remaining contradictory runner test. No test, fixture, golden, bound or assertion changed.

| Exact test | File:line | Contradiction / final evidence |
| --- | --- | --- |
| B1c index: 32000 character cut names every omitted folder and preserves whole rows | runner/test/b1-index.test.ts:166; failing assertion :191 | Seeds 150 old summaries with no ownership metadata or mocChecked. Requires zero media reads for 149 unchanged versions. Discovering an unmarked legacy MOC from bytes requires examining unchecked versions; 149 one-time reads occur, and the existing marker is then recorded. The test's 300-call and 32000-character assertions pass unchanged. |
| B1c fix 2: warm instructions planning preserves calls without Inbox or declaration reads for the index | runner/test/b1-index.test.ts:813; failing assertion :883 | Requires one physical files.list request. The unchanged DriveHttp.listAll traversal for this three-level fixture needs three metadata requests. There are zero media reads inside planningIndex; exact ordered pre-maintenance requests equal its positive control at :885. |
| B1c fix 2: warm all planning preserves calls without Inbox or declaration reads for the index | runner/test/b1-index.test.ts:813; failing assertion :883 | Same one-physical-request expectation versus the same three-level traversal. Zero index media reads and exact positive-control requests pass; the provider reads Inbox only in its normal all scope. |
| B1a contract: round 4 1: a folder binned before planning drops every indexed descendant | runner/test/b1a-contract.test.ts:830; shared failing assertion :812, call :831 | Its live control pins an unchecked old Book entry to exact equality. Byte discovery retains its id/path/version/summary/coverage and adds the existing mocChecked:true. Its old state supplies no evidence permitting discovery to be skipped. |
| B1a contract: round 4 2: a folder moved outside drops its indexed subtree and commits the cursor | runner/test/b1a-contract.test.ts:848; shared failing assertion :812, call :849 | Same live-control exact-entry conflict with the required one-time ownership-check marker. |
| B1a contract: round 4 3: a renamed folder updates descendant paths and index order without media reads | runner/test/b1a-contract.test.ts:865; shared failing assertion :812, call :866 | Same live-control exact-entry conflict; its no-media assertion also presumes old summaries already establish ownership. Later mode assertions are not reached after the hard live-control equality. |
| B1a contract: round 4 4: an inside folder move updates recursive paths and regroups without media reads | runner/test/b1a-contract.test.ts:884; shared failing assertion :812, call :885 | Same live-control exact-entry conflict with the existing ownership-check marker; later mode assertions are not reached. |

The warm reds' earlier note described one listing plus two media requests. The actual final interval
is exactly three GET /drive/v3/files requests and no media request. A single logical shared listing
is not a single HTTP request: DriveHttp.listAll at src/data/drive/drive-http.ts:139 traverses levels.
Changing that established traversal or supplying a fixture-specific discovery heuristic would change
other contracts. No path/name/summary heuristic substitutes for reading ownership bytes.

The legacy fix-2 red passes, including its second-run idempotence assertions. All cold index planning,
manifest ordering, ownership preservation, hidden-path, replay and recovery controls pass.
The source suite has no ownership, contract, architecture or application assertion conflict.
It has a separate sandbox failure at src/e2e-port.test.ts:37: listen on 127.0.0.1 is denied (EPERM),
so the unchanged test times out waiting for its server. An independent unchanged identity-helper probe
reproduced the EPERM before any request; evidence /tmp/b1c-fix2-port-probe.log. No timeout was raised.

Stop under the user's TL-P4-51 instruction after the complete suites and this full list.
The lead owns reconciliation; the worker may neither edit these tests nor falsify ownership evidence.

### Verification method

Verification tree: `/private/tmp/b1c-fix2-verify-pkl1em9q`. Tracked files were copied there and
installed dependency directories cloned into fresh destinations with macOS cp -cR. No existing
node_modules was replaced or symlinked. Source/test/corpus/script byte audit has no mismatches.
All configs, transform/module caches, CPU reports, reports, bundles and logs are in OS temp.
The existing suites' disposable git fixtures remain in OS temp; the session invokes no writing git command.
The runner's new-instance build uses an OS-temp pnpm stand-in executing the installed esbuild binary.
The actual pnpm exec source-suite invocation has offline:true and verifyDepsBeforeRun:false in the
scratch workspace config, so it does not set up dependencies or contact a registry.

The committed reds were reproduced before source edits: b1-index 25 pass/3 assertion reds;
architecture 6 pass/1 assertion red at src/architecture.test.ts:154 (outside data/types.ts).
Reports: `/tmp/b1c-fix2-before-runner.{json,log}` and `/tmp/b1c-fix2-before-architecture.{json,log}`.

Final runner report: `/tmp/b1c-fix2-runner-final.{json,log}`. The initial complete sweep had
618 pass/9 fail; its two additional latency failures were implementation issues from delaying cold
read-ahead too long. Restoring overlap fixes both original bounds without changing a call, golden or test.
Final reads-report.test.ts 5/5, c05-bounded-reads.test.ts 8/8, drive-calls-golden.test.ts 5/5,
model-input-fingerprint.test.ts 9/9 and timing-counts.test.ts 2/2 all pass unchanged.
Final full source sweep: **5574 pass, 1 fail, 5575 total; 167 files**.
Only src/e2e-port.test.ts:37 fails (the independently reproduced sandbox listen EPERM).
Architecture passes all seven tests; every contract/data/application assertion passes.
Reports: `/tmp/b1c-fix2-src-final.{json,log}`.
App, node and runner tsc all pass; touched-file eslint passes in the separate app and runner configs.
Logs: `/tmp/b1c-fix2-tsc-{app,node,runner}-final.log`, `/tmp/b1c-fix2-eslint-app.log`,
`/tmp/b1c-fix2-eslint-runner-final.log` (all exit 0 and empty).

The first source sweep (5,561 pass/14 fail) exposed missing git metadata in the verification copy.
Copied objects/refs/config and the worktree's HEAD/index into an isolated scratch .git using file copies,
without copying linked-worktree pointers or hooks, and without any writing git command. The docs and
harness tests then pass unchanged; the four-file retry is 88 pass/1 sandbox timeout. The final full
source sweep ran against that corrected verification environment and leaves only the sandbox listener failure.
Reports: `/tmp/b1c-fix2-src.{json,log}`, `/tmp/b1c-fix2-src-retry.{json,log}`.

Final exact-copy audit and read-only git diff --check are recorded below. No pnpm check mark or e2e pass is claimed:
check writes a repository mark, and this session's requested gates are the full runner/source suites,
app/node/runner tsc and touched-file eslint. No UI screen changed.

Offline research reused the existing versioned ReadCache, admissionRead's read-ahead policy,
canonical index and ownership parser. Reference URLs were cited, never fetched:
[HTTP conditional/versioned caching](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3),
[Drive modifiedTime](https://developers.google.com/workspace/drive/api/reference/rest/v3/files),
[Vitest setup files](https://vitest.dev/config/setupfiles),
[ECMAScript stable sort](https://tc39.es/ecma262/#sec-array.prototype.sort).


Exact final verification commands (OS-temp cwd, runner commands in its runner directory):

```sh
PATH=/private/tmp/b1c-fix2-verify-pkl1em9q/bin:$PATH node ../node_modules/vitest/vitest.mjs run --maxWorkers=2 --config=../runner-config.mjs --configLoader=runner --reporter=json --outputFile=/tmp/b1c-fix2-runner-final.json > /tmp/b1c-fix2-runner-final.log 2>&1
/opt/homebrew/bin/pnpm exec vitest run src --maxWorkers=2 --config=src-config.mjs --configLoader=runner --reporter=json --outputFile=/tmp/b1c-fix2-src-final.json > /tmp/b1c-fix2-src-final.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json > /tmp/b1c-fix2-tsc-app-final.log 2>&1
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json > /tmp/b1c-fix2-tsc-node-final.log 2>&1
node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > /tmp/b1c-fix2-tsc-runner-final.log 2>&1
node node_modules/eslint/bin/eslint.js src/data/spine/read.ts src/data/contracts/note-edit.ts > /tmp/b1c-fix2-eslint-app.log 2>&1
node ../node_modules/eslint/bin/eslint.js src/drive.ts src/index.ts src/main.ts > /tmp/b1c-fix2-eslint-runner-final.log 2>&1
```

Final byte audit: 1,644 source/test/corpus/script files, zero mismatches between worktree and tested tree;
`/tmp/b1c-fix2-audit-final.log`. Read-only git diff --check passes. Diff over all runner tests and
source tests is empty. Goldens and test sources are byte-identical; only five production files and
this notes section are changed. No commit was made.


## Addendum 10 red repair

Red-owning session, round 3, 2026-10-11. Scope: the two runner test files and these notes only.
Read WORKER.md, the packet, Fix round 2 and its seven-test TL-P4-51 contradiction audit.
The user-supplied addendum 10 supersedes the audit's proposed one-time mocChecked discovery reads.
No network, writing git command, production edit, dependency replacement or node_modules symlink.
The coordinator owns commits. Production diff before/after is byte-identical:
`/tmp/b1c-round3-production-{before,after}.diff` (cmp passes).

### Test contracts

- B1a's shared folder-refresh assertion retains every prior field by partial object matching;
  additive per-version owner/type metadata may be persisted. The live-control descendants and
  renamed/moved path comparisons use the same matching rule. Id, path, version, summary and coverage
  remain pinned, as do the exact discovery-call count and zero descendant media reads.
- The cut test's assertion at b1-index.test.ts:191 is still exactly zero same-version media reads.
  It has no exact state-shape assertion to loosen. Its old B1a seed remains unchanged; the 300-call,
  32000-character, membership and cut-marker requirements are unchanged.
- Both warm scope cases compare the planning-index request sequence to the actual listAll traversal
  captured by the positive control, rather than one physical HTTP request. The positive control calls
  the existing shared listing with readAhead:false and returns no projection. Main's real provider
  still performs its normal warming under the selected scope. The separate equality of the entire
  pre-maintenance request sequence remains, and the planning-index interval must contain metadata
  listing requests only: no Inbox pile-note, declaration or other media reads.
- Added exact red: `B1c fix 3: legacy MOC ownership comes from the index prefix with zero extra reads`.
  Both controls seed the exact old B1a state and create the legacy MOC without appProperties.by.
  Only the index is removed, exercising main's normal missing-projection prefix reads while every
  indexed version remains unchanged. Each indexed id gets exactly one 4096-byte prefix read during
  planning. The personal MOC gets no full read or mutation. The by:bower MOC gets exactly one full
  read inside maintain, migrates once, folds both members and preserves the unowned original bytes.
  No additional note media request or mocChecked state is accepted. Front matter fits in the prefix;
  this does not promise discovery beyond addendum 10's v1 prefix limit.

Research reused locally (no network): DriveHttp.listAll's established per-level traversal in
`src/data/drive/drive-http.ts:139`, its Range prefix reader at :177, and Vitest's existing object
matching conventions in the two test files. No second discovery implementation is introduced.

tests changed: runner/test/b1-index.test.ts: replaced the warm one-HTTP-request pin with the real traversal control; kept :191 zero reads; added the fix-3 legacy prefix red.
tests changed: runner/test/b1a-contract.test.ts: allowed additive per-version metadata in the shared live-control and rename/move comparisons; kept every old field and zero-extra-read bound.
tests changed: docs/harness/2026-10-10-b1c-index-notes.md: recorded addendum 10 scope, contracts, full targeted results and OS-temp evidence.

### Verification

Fresh verification copy (including the unchanged production diff):
`/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b1c-fix3-verify-9n5mp9__`.
Tracked input files were copied and installed dependency directories cloned with cp -cR into fresh
OS-temp destinations. No existing node_modules was replaced or symlinked. Transform caches,
module caches, reports and logs are all in OS temp; the repository receives no test output.

Ran both complete files with installed Vitest, `--maxWorkers=2`, offline fake Drive through main:
`node <temp>/node_modules/vitest/vitest.mjs run --config <temp>/runner-config.mjs test/b1-index.test.ts test/b1a-contract.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1c-fix3-targeted.json`.
Final result: **41 pass, 6 assertion reds, 47 total**. Both warm repair cases pass.
Reports: `/tmp/b1c-fix3-targeted.{json,log}`. Touched-test ESLint passes:
`/tmp/b1c-fix3-lint.log`. `git diff --check` passes (read-only).
No pnpm check or e2e was run: this is the authorized tests-only red repair, with production fixed
by another session; repository-writing gates are outside this session's constraints.

Every remaining red from the complete targeted run is listed below. These reproduce implementation
violations of the accepted addendum; no call count, tolerance or media-read prohibition is relaxed.

| Exact test | Assertion | Evidence |
| --- | --- | --- |
| B1c index: 32000 character cut names every omitted folder and preserves whole rows | runner/test/b1-index.test.ts:191 | 149 unchanged notes still receive extra media reads. |
| B1c fix 3: legacy MOC ownership comes from the index prefix with zero extra reads | runner/test/b1-index.test.ts:859–860 | Personal MOC is read fully; owned MOC full read occurs before maintain; owned state includes mocChecked. |
| B1a contract: round 4 1: a folder binned before planning drops every indexed descendant | runner/test/b1a-contract.test.ts:814 | Live control makes 7 discovery calls rather than the unchanged bound of 3; four ownership-discovery media reads remain. |
| B1a contract: round 4 2: a folder moved outside drops its indexed subtree and commits the cursor | runner/test/b1a-contract.test.ts:814 | Live control makes 7 discovery calls rather than the unchanged bound of 3; four ownership-discovery media reads remain. |
| B1a contract: round 4 3: a renamed folder updates descendant paths and index order without media reads | runner/test/b1a-contract.test.ts:814 | Live control makes 7 discovery calls rather than the unchanged bound of 3; four ownership-discovery media reads remain. |
| B1a contract: round 4 4: an inside folder move updates recursive paths and regroups without media reads | runner/test/b1a-contract.test.ts:814 | Live control makes 7 discovery calls rather than the unchanged bound of 3; four ownership-discovery media reads remain. |
