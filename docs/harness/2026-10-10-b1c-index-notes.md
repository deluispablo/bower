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


## Implementation (partial; blocked)

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
