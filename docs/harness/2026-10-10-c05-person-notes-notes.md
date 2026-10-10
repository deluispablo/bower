# C05 person notes: red session

implementer: codex

Scope: tests, restored corpus, the requested method verdict row and these notes only. No app implementation changed.
No network, server, e2e execution or git write command. The coordinator owns commits; notes need their own commit.
compatibility: not applicable to this red-only change; the fix session must record compatibility: FIXSHA.

## Reds

All 33 new unit/runner tests below were executed and failed for the listed assertions or missing rendered element.
All files loaded. No unhandled/import errors, real-timer failures, .only or .skip. Existing controls passed.
Lifecycle reds state their missing prerequisite honestly: on this build personal notes are absent from planner context.
Once the prerequisite is built, the tests proceed through main, the existing checkpoint and the real answer entry point.

| File | Exact test name | Why it fails now |
| --- | --- | --- |
| `src/features/tidy/c05-person-notes.test.tsx` | `C05 person notes: result links row 5, leaves row 7 unlinked and counts neither as updated` | The existing New notes control renders; RunLinks omits Left as you wrote them, so its labelled list is missing. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: one bound sourced append preserves every other byte and CRLF` | The owned-note control passes; the bound personal append returns not-bower rather than the exact CRLF output. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: no binding is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: wrong target is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: wrong request is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: two lines is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: no source is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: unanswered state is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: adoption is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: link rewrite is refused not-bower beside the admitted append` | The bound positive append is refused; additionally the unrelated personal link rewrite succeeds instead of not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: rule wording is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: old reports remain readable and leftAsWritten survives report validation` | The legacy fixture passes; the additive collection is rejected with shape by the closed validator. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: leftAsWritten survives a pending checkpoint with older checkpoints still readable` | The legacy fixture passes; the additive collection is rejected with shape by the closed validator. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: leftAsWritten survives the manifest report plan without becoming an update` | The legacy fixture passes; the additive collection is rejected with shape by the closed validator. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar case and punctuation shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar the article shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar my article shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar Unicode NFC shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: longest whole title wins and source-only or partial mentions grant nothing` | The requested longest personal title is not shown and its line is missing; source-only and partial-title refusals execute. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 6 files the source and lists 2 same-title notes by id and folder without asking` | The personal-note proposal is refused lineNote; the source is not filed and the per-id, per-folder collection is absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 6 files the source and lists 3 same-title notes by id and folder without asking` | The personal-note proposal is refused lineNote; the source is not filed and the per-id, per-folder collection is absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 7 files the source but four named notes produce one unlinked row and zero updates` | Three valid named targets cannot append; four targets yield no overflow row or filing because personal notes are unshown. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: consent refuses unrelated request id through main beside a legitimate append` | The legitimate personal append is missing and no runner-derived tuple reaches the author to corrupt (counter 0). |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: consent refuses unrelated target id through main beside a legitimate append` | The legitimate personal append is missing and no runner-derived tuple reaches the author to corrupt (counter 0). |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: consent refuses citation not filed in this run through main beside a legitimate append` | The legitimate personal append is missing and no runner-derived tuple reaches the author to corrupt (counter 0). |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 5 missing Timeline is byte-identical, linked in leftAsWritten and never counted updated` | The proposal is refused lineNote before the new refusal-report path; filing and the linked leftAsWritten row are absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 8 unparseable Timeline is byte-identical, linked in leftAsWritten and never counted updated` | The proposal is refused lineNote before the new refusal-report path; filing and the linked leftAsWritten row are absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: corpus first append, protected ranges, state question, replay and later non-adoption score per run` | scoreCase reports missing first-run filing, Timeline append and typed state question, plus missing history on later presses. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: state answer true changes only the shown bullet or writes nothing and is never re-asked` | No personal append or Write it / Keep mine state question is produced. The real answer lifecycle begins once that assertion holds. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: state answer false changes only the shown bullet or writes nothing and is never re-asked` | No personal append or Write it / Keep mine state question is produced. The real answer lifecycle begins once that assertion holds. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: state changed before Write it re-asks and preserves the new personal bullet` | The initial typed state question is missing. The guarded real edit/answer path cannot begin on this build. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: append clash retries on the next main call with the fresh personal text and original citation` | No append plan is persisted, so the after-manifest clash injection is not reached; the fresh-text retry append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: landed append with lost answer and failed read-back resumes then replays exactly once` | The first append never lands (0), so read-back fault count is 0; resume replans and the exactly-one-line assertion fails. |

## Verify

Copy the 33 exact names above into the entry verify. The shared selection pattern is `-t "C05 person notes:"`
(unanchored, because Vitest matches the suite name too). The restored case id is `c05-note-not-written-by-bower`.
Also retain the existing driver-scored checks `the C05 corpus cases score green with scripted proposals` and
`the corpus scorer passes on the scripted provider outputs`, and the method check
`the C04 to C15 rubrics agree with the method`.

Executed commands (output redirected; only failure details inspected):

```sh
pnpm exec vitest run src/data/contracts/c05-person-notes.test.ts src/data/contracts/c05-person-reports.test.ts src/features/tidy/c05-person-notes.test.tsx --maxWorkers=2
pnpm -C runner exec vitest run test/c05-person-notes.test.ts test/c05-incorporation.test.ts test/corpus test/second-brain-method.test.ts --maxWorkers=2
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm -C runner exec tsc --noEmit -p .
pnpm exec eslint src/data/contracts/c05-person-notes.test.ts src/data/contracts/c05-person-reports.test.ts src/features/tidy/c05-person-notes.test.tsx e2e/c05-person-notes.spec.ts
pnpm -C runner exec eslint test/c05-person-notes.test.ts test/c05-incorporation.test.ts
```

Results: app 14/14 expected reds; runner 21 failed, 38 passed (19 new reds and 2 existing corpus loops now include the restored case).
All three TypeScript projects and ESLint on every touched TypeScript file pass. No pnpm check or broader suite was run.

Logs: `/tmp/c05-person-notes-unit.log`, `/tmp/c05-person-notes-runner.log`,
`/tmp/c05-person-notes-tsc-app.log`, `/tmp/c05-person-notes-tsc-node.log`, `/tmp/c05-person-notes-tsc-runner.log`,
`/tmp/c05-person-notes-eslint-app.log`, `/tmp/c05-person-notes-eslint-runner.log`,
`/tmp/c05-person-notes-eslint-e2e.log`, `/tmp/c05-person-notes-eslint-screen.log`.

## Screen coverage (written, not executed)

File: `e2e/c05-person-notes.spec.ts`. Exact names:

- `C05 person notes: designer row 1 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 2 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 5 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 6 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 1 on Home and the result with working links and WCAG 2.2 (fake)`
- `C05 person notes: designer row 2 on Home and the result with working links and WCAG 2.2 (fake)`
- `C05 person notes: designer row 5 on Home and the result with working links and WCAG 2.2 (fake)`
- `C05 person notes: designer row 6 on Home and the result with working links and WCAG 2.2 (fake)`

These are screen-port fixtures over each initialized demo/fake source. They render production Home, TidySheet,
RunLinks and NoteScreen; the production runner behavior is covered independently by the runner/corpus tests.
The source wrapper changes only the served module in the test browser. No production test hook or scenario was added.
A test-controlled phase notification replaces timers. Each test first proves the existing tidy-up and New notes control.
Each checks the exact designer copy, working result/Home note links, the state proposal and existing answer labels
where relevant, and uses the shared expectAxeClean helper with wcag22 (including target-size) on both surfaces.
Rows 1 and 2 exercise the existing rendering parts; rows 5 and 6 require the new collection. E2e failure status is unclaimed.

## Corpus and boundary choices

The preserved note, letter, explicit sentence and sourced news are retained. The request is now the single admitted
`change-1` journal line (rather than duplicating it in pile words), so the driver can replay that exact identity.
The source is a single loose file. The additional My words section makes the prose byte range explicit.
Every press checks the first-run append or its preservation, protected front matter/Current state/My plans/My words,
and absence of by, bower_state and bowerMd5 appProperties. Markdown ownership marks are also forbidden.
Press 2 replays change-1; press 3 is a new generic tidy-up. The first press checks the typed state subject separately.
The answer tests use corpus presses to submit Write it / Keep mine through answerQuestion and DriveVault.answer;
yes preserves the other bullet including its trailing spaces, no adds no result, and later presses adopt nothing.
Changed-before-answer reuses the existing stable state-question id and exact re-ask copy.

The additive test wire convention for the author boundary is `timeline-append.consent` with
`{ requestId, targetFileId, sourceFileId }`; recordIds retains the original request id. The runner must derive this
from admitted words and exact ids. The model replies contain no permission field. Consent fault injection only
corrupts a runner-created tuple before delegating to the unchanged real author; its counter forbids a vacuous refusal.
The corruptions use another admitted request (change-2), a real unrelated note id, and a real older filed source id.
No binding author calls exist on the current build. The negative checks are retained beside a legitimate positive append.

Append-clash injection changes personal prose immediately after the production manifest is saved, preserving Timeline grammar.
The next main call must retain the original filed citation and append exactly once to those fresh bytes without asking.
Lost-answer injection lets the real PATCH land, then loses its answer and refuses its note read-back. Same-run resume
must not call the planner again; a later exact request replay offering different wording must add nothing.
Neither fault is reached until personal append admission exists; no effect is fabricated by the tests.

## Files

- `src/data/contracts/c05-person-notes.test.ts`
- `src/data/contracts/c05-person-reports.test.ts`
- `src/features/tidy/c05-person-notes.test.tsx`
- `runner/test/c05-person-notes.test.ts`
- `runner/test/c05-incorporation.test.ts`
- `e2e/c05-person-notes.spec.ts`
- `harness/corpus/c05-note-not-written-by-bower/` (case, expected, replies, rubric, note, letter)
- `docs/harness/2026-10-08-p4-method-rubric-changes.md`
- `docs/harness/2026-10-10-c05-person-notes-notes.md`

tests changed: runner/test/c05-incorporation.test.ts: P4-74b uses scoreCase so per-run, protected-range, property and subject checks count; no expectation was weakened.

## Sources

Offline reuse: installed Vitest and Playwright READMEs link their official documentation
([Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/)).
The established corpus driver and its README supply the real runner/answer/replay pattern;
existing note-edit tests supply the byte oracle pattern, and e2e/axe.ts supplies WCAG 2.2 and target-size scanning.
No external query was made.

Left out: implementation, commits, pnpm check and e2e execution, as assigned.

## Implementation

Implementation session: Codex, on the committed reds at `0871c4f0`, branch `c05-person-notes`.
No test, fixture or corpus file was changed. No network, server, e2e, pnpm check or git write command was run.
No commits were made: the coordinator owns the fix and notes commits. Delivery is blocked by the conflicts below.

### Changes per mechanism

- Planner context and title resolution: `namedNotes` in `src/data/spine/scripted.ts` is the shared title matcher.
  It uses NFC, case-insensitive whole-word references, punctuation/articles and longest overlapping titles.
  `runner/src/claude.ts` reads admitted request records, prioritizes up to three resolved notes before hubs,
  and suppresses writes for duplicate names and overflow while retaining ordinary source filing.
  Stale state proposals for known, unshown personal notes are ignored, allowing Keep mine to settle.
  Explicit personal-note incorporation keeps its admitted citation available even when the source bytes are a copy.
- Consent and author: the planner derives the request/target/source tuple from admitted journal words, exact file ids
  and source filing. It carries that tuple in the existing Timeline change and supplies independently derived tuples
  beside the fetched bytes. The author compares them, admits one sourced line and refuses mismatched tuples,
  extra lines, adoption, unanswered state writes, rule wording and concrete personal-note link rewrites.
  `timeline-line.ts` remains unchanged and is the only line parser/formatter. CRLF and protected bytes are preserved.
  Missing and unsupported Timelines use the designer's exact left-as-written sentences.
- State answers: `currentStateOf` explicitly permits reading personal states for planning; the default read remains
  compatible. The existing grant accepts a null ownership mark for a personal note, replaces exactly one changed
  bullet, preserves untouched bullets including trailing spaces, and writes no ownership mark.
  The existing question identity, shown update, answer loop, write fence and re-ask are reused. Initial questions
  depend on the append and its final stamp, so an append rejected at the fence asks nothing prematurely.
- Recovery and replay: `RunRecords.found` and its verified checkpoint chain supply completed request/target pairs
  and pending append bindings. A pending append uses fresh note bytes and its original filed citation; it can use
  the retry's proposed wording because the previous edit was proven refused before its effect.
  Same-run resume uses the existing immutable manifest and write-once observation rather than replanning.
  Additive `appendBindings` and `completedAppends` checkpoint fields carry completions forward; chain validation
  permits a new completion only for an applied bound operation, and never drops a prior completion.
  The manifest carries inherited completions so replay evidence survives the existing twenty-run retention.
  `bowerAppends: 1` on those manifest records is only a discovery hint; authority still requires the verified chain.
  It avoids reading unrelated historic manifests and preserves the existing 88-call retention golden.
  Completion carry-forward after actual retention has not received an additional test; the frozen tests were unchanged.
- Reports: `leftAsWritten` is optional in the public report, immutable manifest, pending checkpoint and saved result.
  Its validator is shared between the manifest and checkpoint; old stored records still parse.
  Materialization and the report barrier retain the rows. RunLinks uses the existing labelled-list and note-route
  parts, links rows with file ids, leaves overflow unlinked, and never adds these rows to the updated count.

removed: unconditional personal-note Timeline refusal, replaced by the single bound sourced admission.
removed: concrete fetched personal-note link rewrites, which are now refused not-bower.
removed: the blanket personal-state read refusal within the existing state-section reader.
removed: ownership marking for the newly granted personal-state branch; owned-note state marking remains.
removed: consent-free recordIds for bound personal-note append changes.
removed: omission of leftAsWritten from report materialization and the saved-result projection.
removed: request replay dependence on identical model wording or the note's most recent write stamp.
removed: unrelated historical-manifest reads from append-history discovery.

tests changed: none in the implementation session.
compatibility: FIXSHA

### Verification and blockers

Final commands, with every output redirected and only failure details or result totals inspected:

```sh
pnpm exec vitest run src/data/contracts src/features/tidy src/features/note --maxWorkers=2 > /tmp/c05-impl-unit.log 2>&1
pnpm -C runner exec vitest run --maxWorkers=2 > /tmp/c05-impl-runner.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > /tmp/c05-impl-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > /tmp/c05-impl-tsc-node.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > /tmp/c05-impl-tsc-runner.log 2>&1
```

App: **27 files / 2,478 tests pass**, including all 14 C05 app reds.
Runner, exact requested command: **345 pass / 8 fail**. The 16 non-answer C05 runner reds pass.
All three TypeScript projects pass. ESLint on all ten touched product files passes, with app and runner run separately.
`git diff --check` passes. No e2e or pnpm check result is claimed.

1. **Runner environment prerequisite.** Node v26.10.0 has no usable localStorage without a storage file.
   The three C05 state-answer tests reach the unchanged real answer entry point, then fail in
   `src/data/vault/journal.ts:144` with `Bower cannot read your waiting changes; keep this page open.`
   Their new test file does not install the storage port that the existing answer-loop tests install.
   Changing the tests or adding a Node-specific storage path to app product code is outside the assigned contract.
   A diagnostic run of the same targeted runner suite with
   `NODE_OPTIONS='--localstorage-file=/tmp/c05-impl-storage'` is in `/tmp/c05-impl-runner-storage.log`:
   **348 pass / 5 fail**, with **all 19 C05 runner reds passing** (all 33 C05 unit/runner reds combined).
   This runtime setup was temporary and no configuration, fixture or corpus file was edited.
2. **Contract conflict requiring the lead's ruling.** C05 says every other personal-note edit is refused not-bower,
   and its new author red explicitly requires refusal of a personal link rewrite. The existing
   `runner/test/keep-one-note.test.ts` requires rewriting the person's plain `Viewing plan.md` before merging
   and binning the other note. The existing planner correctly keeps that answer waiting when its link rewrite
   is refused. Permitting this fetched personal-note rewrite would violate the binding; bypassing the planner's
   refusal would leave links pointing to a binned note. No second write path or test weakening was added.
   These five existing tests fail in both runner executions:
   - `keep one note carries the facts and bins the other`
   - `undo of keep one note restores both notes and links`
   - `the other note changed after the read is not binned`
   - `keep-one says what happened when the other note moved or was binned`
   - `a line that only starts like a kept line is carried`

Additional lint logs: `/tmp/c05-impl-eslint-app.log`, `/tmp/c05-impl-eslint-runner.log`.
The early combined app/runner ESLint invocation in `/tmp/c05-impl-eslint.log` failed on tsconfig-root discovery;
separate invocations of the respective existing configurations pass. No lint configuration was changed.

### Draft compatibility row

The coordinator supplies the fix SHA and moves this row to the compatibility ledger only after resolving the blockers.

| Commit | Entry | What it changes for the accepted app's files |
| --- | --- | --- |
| `FIXSHA` | c05-person-notes | Adds optional leftAsWritten report rows, Timeline consent, inherited completedAppends in manifests, and appendBindings/completedAppends in checkpoints; old records retain their meaning and parse without the fields. A granted personal-state edit can carry a null ownership mark, preserves every other bullet's bytes and adds no ownership mark. New manifest records with append evidence have the bowerAppends discovery property. The result renders Left as you wrote them without increasing updated counts. The app and runner deploy together; older strict readers cannot execute these new bound edits. Personal-note link rewrites retain the existing links-only behavior without a new grant, per TL-P4-32 addendum 1. |

### Files per coordinator commit

Fix (product code only):

- `runner/src/claude.ts`
- `src/data/contracts/note-edit.ts`
- `src/data/contracts/run-checkpoint.ts`
- `src/data/contracts/run-manifest.ts`
- `src/data/contracts/types.ts`
- `src/data/spine/barrier.ts`
- `src/data/spine/records.ts`
- `src/data/spine/report.ts`
- `src/data/spine/scripted.ts`
- `src/features/tidy/RunLinks.tsx`

Notes: `docs/harness/2026-10-10-c05-person-notes-notes.md` only.

Offline research/reuse: the existing author documents the original Bower appendHistoryLine provenance;
its state grant cites [RFC 9110 If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1).
The existing record and retention mechanisms cite
[Drive app properties](https://developers.google.com/workspace/drive/api/guides/properties).
RunLinks already uses the [WAI-ARIA link pattern](https://www.w3.org/WAI/ARIA/apg/patterns/link/).
These references came from the assigned mechanisms; no network lookup was made.

Left out: commits, shared harness records, test/fixture/corpus changes, e2e, pnpm check and any deployment.

### Red repair

Red-owner repair against implementation HEAD `87d61c421fc4d4b227a8237f314f73748b58f296`.
The baseline reproduced exactly three state-answer failures at `src/data/vault/journal.ts:144`:
state answer true, state answer false, and state changed before Write it re-asks.
The other 16 tests passed. Baseline log: `/tmp/c05-redfix-before.log`.

Installed fresh per-test localStorage with the existing Map-backed `vi.stubGlobal` pattern from
`runner/test/corpus-driver.test.ts`, and removed the stub after each test with `vi.unstubAllGlobals`.
`runner/test/ask-answer-loop.test.ts` uses the same storage installation and cleanup approach.
These local tests are the offline research/reuse sources; no second storage mechanism was added.

tests changed: runner/test/c05-person-notes.test.ts: install the existing browser-storage test pattern for real answers.

Verification (output redirected; only failure details and test totals inspected):

- `pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2 > /tmp/c05-redfix-runner.log 2>&1`: all 19 tests pass.
- `pnpm -C runner exec tsc --noEmit -p . > /tmp/c05-redfix-tsc.log 2>&1`: pass.
- `pnpm -C runner exec eslint test/c05-person-notes.test.ts > /tmp/c05-redfix-eslint.log 2>&1`: pass.
- `git diff --check`: pass.

No NODE_OPTIONS was supplied. No assertions, names, fixtures, corpus or product code changed.
No network or git write command was used. No commits, pnpm check or e2e were requested or run.

### Red correction (TL-P4-32 addendum 1)

Corrected blocker 2's personal-link contract under the lead's ruling. The existing link-rewrite mechanism
remains admitted on personal notes without a new grant. The red now requires the exact output bytes with
only `[[Old]]` changed to `[[New]]`; plain `Old` in prose, protected sections and CRLF stay identical.
The owned-note positive control and adjacent bound Timeline append remain. All other refusal cases remain
unchanged. A search of the other C05 author, runner, screen and e2e reds found no other personal-link refusal.
No product code, fixture, keep-one test or other red was changed.

tests changed: src/data/contracts/c05-person-notes.test.ts: replace personal-link refusal with exact link-only acceptance per TL-P4-32 addendum 1.

New exact test name: `C05 person notes: link rewrite changes only links beside the admitted append`.

Verification against HEAD's implementation (output redirected; only failures and their result totals read):

- `pnpm exec vitest run src/data/contracts/c05-person-notes.test.ts --maxWorkers=2 > /tmp/c05-redfix2-unit.log 2>&1`:
  1 failed, 9 passed. Only the corrected test above fails: expected accepted link-only bytes, received
  `{ ok: false, reason: 'not-bower' }`. Its positive control and adjacent admitted append pass.
- `pnpm -C runner exec vitest run test/keep-one-note.test.ts --maxWorkers=2 > /tmp/c05-redfix2-keep.log 2>&1`:
  all 5 tests fail, unchanged from blocker 2:
  - `keep one note carries the facts and bins the other`: the other note remains.
  - `undo of keep one note restores both notes and links`: no Bin operation is present.
  - `the other note changed after the read is not binned`: the injected changed line is absent.
  - `keep-one says what happened when the other note moved or was binned`: the moved note is absent.
  - `a line that only starts like a kept line is carried`: the other note remains.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > /tmp/c05-redfix2-tsc-app.log 2>&1`: pass.
- `pnpm exec eslint src/data/contracts/c05-person-notes.test.ts > /tmp/c05-redfix2-eslint.log 2>&1`: pass.
- `git diff --check`: pass.

Offline reuse/source: the assigned `note-edit.ts` link-only invariant and TL-P4-32 addendum 1;
the existing C05 byte oracle and positive control. No network or git write command was used.
Left out: product repair, commits, pnpm check and e2e, as assigned. The expected implementation reds remain.

## Implementation round 2

Codex implementation under TL-P4-32 addendum 1, branch `c05-person-notes`.
Removed exactly the round-1 fetched personal-note ownership refusal from `relink` in
`src/data/contracts/note-edit.ts`. The existing link-rewrite path and its links-only invariant are
reused unchanged; personal renames, moves and keep-one answers need no new grant. Timeline,
rule-wording and Current state admission remain governed by their existing checks.
No second edit path was added. The round-1 removal and blocker 2 above are superseded by this ruling.
The draft compatibility row now records the preserved personal-note link-rewrite behavior.

removed: round-1 not-bower refusal for fetched personal-note link rewrites in the existing relink function.
removed: the draft compatibility row's resolved personal-link ruling blocker.

tests changed: none in implementation round 2.
compatibility: FIXSHA (coordinator supplies the commit; existing personal-link behavior is preserved).

Before the fix, the corrected author test
`C05 person notes: link rewrite changes only links beside the admitted append` failed with
`{ ok: false, reason: 'not-bower' }` instead of the exact accepted link-only bytes.
All five unchanged `runner/test/keep-one-note.test.ts` tests failed on their recorded assertions.
Baseline logs: `/tmp/c05-impl2-red-unit.log`, `/tmp/c05-impl2-red-keep.log`.

Verification, with output redirected to files and only failures inspected (totals extracted separately):

```sh
pnpm exec vitest run src/data/contracts src/features/tidy src/features/note --maxWorkers=2 > /tmp/c05-impl2-unit.log 2>&1
pnpm -C runner exec vitest run --maxWorkers=2 > /tmp/c05-impl2-runner.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > /tmp/c05-impl2-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > /tmp/c05-impl2-tsc-node.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > /tmp/c05-impl2-tsc-runner.log 2>&1
pnpm exec eslint src/data/contracts/note-edit.ts > /tmp/c05-impl2-eslint.log 2>&1
```

App: 27 files / 2,478 tests pass, including all C05 author/report/result tests.
Runner: 41 files / 353 tests pass, including all 19 C05 runner tests and all 5 keep-one tests.
The corrected author link test passes; every other C05 red remains green.
All three TypeScript projects and ESLint on the touched product file pass. No NODE_OPTIONS was supplied.
`git diff --check` passes. The coordinator owns the product and separate notes commits.

Offline research/reuse sources: the assigned `note-edit.ts` relink function and its links-only invariant,
plus TL-P4-32 addendum 1 in `docs/harness/DECISIONS.md`. No network was used.
Left out: test changes, commits, git write commands, shared harness records, pnpm check, e2e and deployment.


## Fix round 1 reds

Red session on implementation HEAD; tests and Minor whitespace repair only. No implementation, existing assertions,
shared harness records, fake-worker tests or git state were changed. The coordinator owns commits.
No network, server, real timers, .only or .skip was used. These are nine tests, one per adversarial finding.
Each runs a positive control before its failing contract assertion. The runner cases use runOnDrive/runWithClaude
from the existing corpus driver, through production main; author cases use applyChanges; finding 9 uses the
checkpoint parser/chain verifier and manifest parser. All data is made up.

| File | Exact test name | Why it fails now |
| --- | --- | --- |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 1: overflow blocks owned and personal note writes` | The three-note control (including the owned Shed roof) appends successfully. With four named notes, row 7 and filing succeed, but Shed roof still gets a line and an updated row; its bytes change. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 2: a conflicted append survives twenty newer runs and retries its filed source` | The first conflict files the source; the second manifest carries its bound append. Twenty newer runs retire the original manifest, after 22 injected conflicts. The next main call refuses the now-filed citation (lineCites) and adds no line, rather than retrying on fresh personal bytes. The red is the final exact-text assertion, not a thrown/load error. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 3: article-equivalent titles stay ambiguous in context and writes` | The single-note append control succeeds. Garden plot and The Garden plot both enter context and receive a line; neither gets the promised folder-specific refusal row. The article-equivalent ambiguity is not suppressed. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 4: a completed replay cannot consume the new request for the same note` | The original personal append lands. Main then admits completed change-1 and new change-2 together and files the new source, but does not append the new requested line. Completed change-1 masks the eligible request. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 5: an already-present bound append completes the request before replay` | An ordinary append succeeds in the control. The fresh request with an already-present sourced line leaves the note unchanged and files the source. Replaying that exact request with a different admitted source/wording appends again; the satisfied request was not persisted as completed. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 6: a granted state change preserves untouched mixed-ending bullet bytes` | Owned append and uniform-CRLF personal-state controls succeed. A null-mark answered state rewrite with CRLF front matter and LF bullets is accepted, but rebuilds untouched bullet endings as CRLF. Exact output text/bytes differ from the one-bullet splice oracle, including the untouched bullet with trailing spaces. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 7: a valid Timeline in plain Markdown admits the bound append` | Owned and front-matter personal append controls succeed. The same valid Timeline without YAML is refused no-timeline, instead of accepting the exact sourced append and preserving all other bytes. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 8: an unrelated filing failure preserves the filed source refusal row` | The one-source no-Timeline control files its source and shows its linked refusal row. After the dual-source manifest lands, only unrelated source B is renamed; its real move fence refuses it. Source A is filed, the note is unchanged and updated is empty, but its leftAsWritten row is missing. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: fix 1 finding 9: completion guards require applied bindings and inherited provenance` | The legacy manifest and a correctly rehashed, parsed checkpoint chain with the applied binding completed pass. Removing that completion still makes verifyCheckpointChain return ok:true, instead of transition at revision 2. An unrelated invented inherited tuple also makes parseRunManifestV2 return ok:true. Both negative assertions run in the one test. |

The retention red uses the real twenty-run policy, injected Drive edits and the corpus driver's fixed clock.
Its 30-second test timeout is only a failure deadline: it does not wait or advance a real timer.
Finding 9 recomputes every previous hash after adding bindings and parses each checkpoint before chain validation;
there is no stale-digest or load failure. The valid completion chain is the adjacent positive control.

### Verification

Final targeted files, without a name filter, so all their existing tests also execute:

```sh
pnpm exec vitest run src/data/contracts/c05-person-notes.test.ts src/data/contracts/c05-person-reports.test.ts --maxWorkers=2 > tmp-logs/c05-fix1-author-reports.log 2>&1
pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2 > tmp-logs/c05-fix1-runner.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/c05-fix1-tsc-app.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > tmp-logs/c05-fix1-tsc-runner.log 2>&1
pnpm exec eslint src/data/contracts/c05-person-notes.test.ts src/data/contracts/c05-person-reports.test.ts > tmp-logs/c05-fix1-eslint-app.log 2>&1
pnpm -C runner exec eslint test/c05-person-notes.test.ts > tmp-logs/c05-fix1-eslint-runner.log 2>&1
```

App contracts: **3 failed / 13 passed**. Runner: **6 failed / 19 passed**.
All nine new tests fail on assertions for the findings above; all existing tests in these files pass.
No load errors, unhandled errors or timer-gate failures. Both TypeScript projects and both touched-file ESLint
invocations pass. Read-only `git diff --check` passes. Output is under this worktree's `tmp-logs/`;
only failures and result totals were read. An intermediate finding-8 diagnostic log is
`tmp-logs/c05-fix1-finding8.log`; final evidence is the complete runner log above.
No pnpm check, broader test suite or e2e was run in this session, as requested.

### Six existing HEAD regressions

Evidence already supplied: `/tmp/c05-g1-check.log` (6 failed / 5,157 passed).
These tests are already red at HEAD; none was edited or rerun. The following diagnosis is from that log and the
fixture/implementation code. The new unconditional ownership classification at scripted.ts:1186 and personal
line filter at :1187 are the common regression site. Finding 1 exercises that filter's overflow policy; these
failures have different triggers. No fix to these tests or implementation was made.

| Existing fake-worker test (exact leaf name) | Cause and relation to findings 1–9 |
| --- | --- |
| `adds the line inside each Timeline byte for byte, marks the note new, reports it, and never adds it again` | The ownership/2 Job hunt fixture has owned section markers but no legacy by property. parseNote.byBower is false, so the new personal filter drops its unbound line. No identical root cause among 1–9; shares the new filter site with finding 1. |
| `each updated row carries its edit's op id and its line` | The same ownership/2 misclassification drops the Job hunt edit and therefore its updated row. No identical root cause among 1–9; shares the new filter site with finding 1. |
| `rejects the edit as a conflict when the note changed after planning, keeping the person's words` | The same ownership/2 misclassification drops the otherwise valid Job hunt edit before the conflict scenario can report it. No identical root cause among 1–9; shares the new filter site with finding 1. |
| `leaves the line unarchived when a linking note cannot be rewritten at plan time` | The ownership/9 fixture now throws from the unconditional parseNote classification, bypassing the existing refusal/hold path. No shared root cause with 1–9: finding 7 is a valid plain layout missing a section span, not unsupported-format exception handling. |
| `files the thing on its own when the merge line cannot be planned, says so, and settles the answer` | Its unknown-format iteration throws at the same parseNote classification before the existing fallback filing path. No shared root cause with 1–9; distinct unsupported-format exception handling, adjacent to the ownership checks. |
| `keeps the answer and the question when a thing filed on its own is not moved after all` | The same unsupported-format parseNote throw stops the fallback before its failed-move scenario. No shared root cause with 1–9; distinct unsupported-format exception handling, adjacent to the ownership checks. |

### Minor and existing-test accounting

tests changed: runner/test/c05-person-notes.test.ts: remove the extra blank line at EOF; append six fix-round reds without changing existing tests.
tests changed: harness/corpus/c05-note-not-written-by-bower/folder/Areas/Home/Garden plot.md: remove only the extra blank line at EOF (Minor).
tests changed: harness/corpus/c05-note-not-written-by-bower/inbox/Water butt update.txt: remove only the extra blank line at EOF (Minor).

Existing assertions, controls, test names and corpus text content are unchanged. The two other test files only add
new tests and the verifier import. The earlier TL-P4-32 addendum 1 link-only acceptance red remains intact and passes.

Offline research/reuse: the assigned tests' byte oracles and real entry points, the established corpus driver,
and the recovery-contract fixture pattern in run-checkpoint.test.ts. Official library source reference already
provided by the installed Vitest documentation: https://vitest.dev/. No external query was made.
compatibility: not applicable to these tests; implementation compatibility remains the fix session's responsibility.
Left out: implementation, commits, fake-worker test changes, full check, e2e and deployment, as assigned.
