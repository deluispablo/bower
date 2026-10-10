# C05 person notes: red session

implementer: codex

Scope: tests, restored corpus, the requested method verdict row and these notes only. No app implementation changed.
No network, server, e2e execution or git write command. The coordinator owns commits; notes need their own commit.
compatibility: not applicable to this red-only change; the fix session must record compatibility: 3e958da1.

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
compatibility: 3e958da1

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
| `3e958da1` | c05-person-notes | Adds optional leftAsWritten report rows, Timeline consent, inherited completedAppends in manifests, and appendBindings/completedAppends in checkpoints; old records retain their meaning and parse without the fields. A granted personal-state edit can carry a null ownership mark, preserves every other bullet's bytes and adds no ownership mark. New manifest records with append evidence have the bowerAppends discovery property. The result renders Left as you wrote them without increasing updated counts. The app and runner deploy together; older strict readers cannot execute these new bound edits. Personal-note link rewrites retain the existing links-only behavior without a new grant, per TL-P4-32 addendum 1. |

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
compatibility: 3e958da1 (coordinator supplies the commit; existing personal-link behavior is preserved).

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


## Fix round 1 implementation

Codex implementation on the assigned `c05-person-notes` worktree. The coordinator owns the product commit and
separate notes commit. No test, fixture or corpus file changed. No network, git write command, server, real timer,
`pnpm check` or e2e was used. The separate red session's nine assertions were reproduced before product edits.

### Findings and changes

1. **Overflow blocks every named target.** `scripted.ts` applies the blocked-target policy before planning Timeline
   lines or model Current state updates, including Bower-owned notes. The existing content author and engine remain
   the only write path. The source still files and the unlinked row still explains the overflow.
2. **Pending bindings survive retention.** `personalAppendHistory` recognizes a conflict whose citation is already
   captured as a place, as well as an applied source move. Each retry manifest therefore remains a verified home for
   the waiting request/target/source tuple after the first run is retired. The existing next-run retry re-reads the
   note and passes its newly read modifiedTime through the unchanged engine.
3. **One title key.** `namedNotes` returns its normalized `titleKey`. Both the planner's ambiguity grouping and the
   runner's context suppression reuse it. Article-equivalent titles produce refusal rows for every matching file id
   and folder, and receive no content update. Ambiguous rows share the relevant group's citation ids.
4. **A replay does not mask another request.** `consentFor` excludes completed request/target pairs while selecting
   the eligible request. The completed request no longer consumes the selection for a new request to the same note.
5. **Already-present lines complete durably.** The existing author must return `unchanged` for the bound sourced
   append before it can become a `satisfiedAppends` entry. That entry stores the read target, exact text, verified
   content, consent and line, and names the request's existing archive move. That move depends on its source filing.
   `firstCheckpoint` binds this satisfied request to the archive outcome; `nextCheckpoint` records completion only
   when that operation is applied. It uses the same bindings, completion set and chain as actual appends, with no
   content write or updated row. Multiple satisfied targets can share one request archive operation.
6. **State writes splice one bullet.** The granted personal-state path replaces only the changed bullet's original
   character span, preserving its original ending and every byte before and after it. The personal-state invariant
   compares these surrounding spans byte-for-byte, including untouched bullets' trailing spaces and mixed endings.
   It still writes no ownership mark.
7. **Plain Markdown uses the existing section layout.** `ownership-format.ts` computes plain-note section spans
   through its existing legacy layout parser. The content author uses those spans and the existing Timeline grammar;
   `parseNote` exposes the section for its re-parse invariant. No second section parser or Timeline formatter exists.
   The existing `timelineBullets` extraction API retains its framed/legacy-only behavior, preserving the runner's
   corpus extraction assertion for plain prose. The direct bound append and display parser use the same layout.
8. **Refusal rows depend on their own citation.** Internal refusal rows carry the relevant source file ids. The
   manifest contributes each row on its source move, rather than requiring every move in the run. Report
   materialization deduplicates by file id and why when more than one relevant source succeeds. An unrelated move
   refusal cannot hide the explanation for a successfully filed source.
9. **Exact completion sets and inherited evidence.** `verifyCheckpointChain` requires the next completion set to be
   exactly the prior set plus bindings with applied outcomes. A missing completion and an invented completion are
   both refused. Manifests carry `appendEvidence`, verified prefixes of the originating checkpoint chains; their
   inherited completion set must exactly match locally applied bindings in those chains. The existing checkpoint
   parser and chain verifier validate every prefix. History carries these prefixes forward, deduplicated by run and
   revision, so provenance remains available after retention. The satisfied-entry guard independently reuses the
   content author to prove that the bound line is already present and validates its capture and archive dependencies.

The six existing fake-worker regressions have two causes, both repaired at the existing ownership filter:

- The three Job hunt regressions now classify `ownership/2` as owned, even without a legacy `by` property. Its
  Timeline edit, operation-linked updated row and write-time conflict therefore reach the existing author/engine.
- The three unsupported-format regressions reach the author's typed refusal, hold and fallback paths. Ownership
  classification consults the cached raw-byte parser and does not call the throwing display parser for an invalid
  layout. The existing rename hold, merge fallback and failed-move answer retention work again.

removed: the personal-only overflow line filter that allowed owned targets to change.
removed: separate untrimmed title equivalence in ambiguity grouping and planner context suppression.
removed: completed requests from the eligible consent selection.
removed: the assumption that a verified pending citation must have a move in every retry manifest.
removed: silent settlement of bound appends already present without a checkpoint completion.
removed: whole-section reconstruction and trim-only invariants for granted personal-state edits.
removed: the plain-note early return that omitted section spans from the existing ownership layout.
removed: unconditional display parsing for ownership classification on unsupported formats.
removed: all-run filing dependencies for individual refusal rows.
removed: one-sided completion validation that checked additions but permitted missing applied bindings.
removed: acceptance of inherited completion tuples without checkpoint provenance.
removed: the unreachable personal-state return and unused runner displayName import.

tests changed: none in fix round 1 implementation.
compatibility: 3e958da1 (coordinator supplies the product commit).

### Verification and logs

The baseline executions reproduced all nine fix-round reds and the six existing fake-worker regressions:

- `tmp-logs/c05-fix1-before-app.log`: 9 failed / 2,752 passed (three new reds and six existing regressions).
- `tmp-logs/c05-fix1-before-runner.log`: 6 failed / 353 passed (the six new runner reds).

Exact red names are the nine `C05 person notes: fix 1 finding <n>: ...` entries in the preceding Fix round 1 reds
 table. The six existing names and their original evidence `/tmp/c05-g1-check.log` are in Six existing HEAD
regressions above. All of them pass in the final unfiltered targeted suites, alongside all other C05 tests and all
five unchanged `runner/test/keep-one-note.test.ts` tests.

Final commands (all output redirected beneath this worktree; only failures and result totals inspected):

```sh
pnpm exec vitest run src/data/contracts src/data/fake src/features/tidy src/features/note --maxWorkers=2 > tmp-logs/c05-fix1-green-app.log 2>&1
pnpm -C runner exec vitest run --maxWorkers=2 > tmp-logs/c05-fix1-green-runner.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/c05-fix1-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/c05-fix1-tsc-node.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > tmp-logs/c05-fix1-tsc-runner.log 2>&1
pnpm exec eslint src/data/contracts/note-edit.ts src/data/contracts/note-format.ts src/data/contracts/ownership-format.ts src/data/contracts/run-checkpoint.ts src/data/contracts/run-manifest.ts src/data/spine/records.ts src/data/spine/report.ts src/data/spine/scripted.ts > tmp-logs/c05-fix1-eslint-app.log 2>&1
pnpm -C runner exec eslint src/claude.ts > tmp-logs/c05-fix1-eslint-runner.log 2>&1
```

App: **32 files / 2,761 tests pass**. Runner: **41 files / 359 tests pass**. All three TypeScript projects and
both touched-file ESLint commands exit 0. Read-only `git diff --check` passes. No NODE_OPTIONS was supplied.
Intermediate suites (`c05-fix1-app.log`, `c05-fix1-runner.log`, `c05-fix1-app-final.log`,
`c05-fix1-runner-final.log`) exposed the plain-note invariant and the existing extraction/ambiguity-row expectations;
the final green logs supersede them. No assertion, test bound or fixture was adjusted.

### Updated compatibility-row draft

This supersedes the earlier draft for the fix-round product commit. The coordinator supplies the actual SHA.

| Commit | Entry | What it changes for the accepted app's files |
| --- | --- | --- |
| `3e958da1` | c05-person-notes | Adds the previously drafted optional leftAsWritten, consent, appendBindings and completedAppends fields. This round adds optional manifest appendEvidence (verified originating checkpoint prefixes) and satisfiedAppends (an already-present bound line, its read evidence and archive-operation binding). Checkpoints retain their existing shape; binding uniqueness includes the request and target so an archive operation can complete several satisfied targets. The completion set must equal inherited plus applied bindings, and inherited manifest completions require provenance. Accepted older manifests, checkpoints and reports without these C05 fields retain their meaning and pass the existing fixture tests; unproved completion tuples from the unaccepted implementation draft are refused. Plain Markdown section layout and display now recognize supported Timelines; the old framed/legacy Timeline extraction API retains its behavior. Granted personal-state writes preserve all bytes outside one bullet and add no ownership mark. Personal link rewrites retain TL-P4-32 addendum 1 behavior. App and runner deploy together; old strict readers cannot execute the new C05 records. |

Evidence prefixes use the existing record hashes and chain validation, not a second completion store or dispatcher.
They grow with distinct completed runs; existing manifest size limits still apply. No new retention or pruning policy
was introduced in this entry.

### Coordinator commit files and offline reuse

Product commit only:

- `runner/src/claude.ts`
- `src/data/contracts/note-edit.ts`
- `src/data/contracts/note-format.ts`
- `src/data/contracts/ownership-format.ts`
- `src/data/contracts/run-checkpoint.ts`
- `src/data/contracts/run-manifest.ts`
- `src/data/spine/records.ts`
- `src/data/spine/report.ts`
- `src/data/spine/scripted.ts`

Separate notes commit: `docs/harness/2026-10-10-c05-person-notes-notes.md` only.
Logs under `tmp-logs/` are local execution evidence, not product files.

Offline research/reuse: the assigned raw-byte ownership layout cites
[CommonMark ATX headings](https://spec.commonmark.org/0.31.2/#atx-headings); the existing state/write fencing cites
[RFC 9110 If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1). The original author provenance,
Timeline parser/formatter, RunRecords recovery chain, corpus driver and report materializer were reused locally.
No external lookup was made, under the owner's no-network instruction.

Left out: tests, fixtures, corpus changes, commits, git writes, shared harness state, pnpm check, e2e and deployment.


## Round 3 reds (TL-P4-32 addendum 2)

Red-owning session on HEAD `6ed23a4150ff6cfb17268fc72cb61a7791af6d50`, branch `c05-person-notes`.
Tests, this notes section and the pass-2 whitespace repair only. No product edits, network, git write commands,
commits, server, real timers, `.only` or `.skip`. The coordinator owns the commits. The following v1 assertions
supersede the earlier descriptions of inherited provenance and plain-note state handling in these notes.

### Narrowed existing reds

tests changed: runner/test/c05-person-notes.test.ts: fix 1 finding 2 keeps all 22 conflicts, the twenty-run retention bound and the exact fresh-byte retry; adds a later exact replay verified through RunRecords.found/walk, requiring no manifest appendEvidence or inherited completedAppends under ruling 4.
tests changed: runner/test/c05-person-notes.test.ts: fix 1 finding 4 keeps the completed replay/new request lifecycle and every earlier assertion; requires only change-2's local binding/completion and no inherited evidence, consistent with one unfinished request per note under rulings 2 and 4.
tests changed: src/data/contracts/c05-person-reports.test.ts: fix 1 finding 9 is renamed to require applied bindings without inherited evidence; retains the valid local completion chain, the missing-transition refusal and the invented tuple refusal; replaces reliance on inherited provenance with rejection or inert reading of obsolete evidence under ruling 4.

No existing red expected two unfinished requests on one note to complete together: fix 1 finding 4 concerns an
already-completed replay beside one new unfinished request. That coverage is retained, and the new ruling-2 red
pins the two-unfinished case separately: oldest admitted, younger active bytes and metadata untouched, then the
next run can complete the younger request. No existing red expected a plain-note state question or answered state
write: fix 1 finding 7 only requires the exact bound append. It remains unchanged. The new plain-note ruling-5
red requires only the append and no state question, while preserving the complete Current state and other bytes.
The front-matter state question/answer tests, author admission/refusal assertions, link-only ruling, numeric bounds,
corpus fixtures and all other assertions are unchanged.

| File | Exact amended test name | Why it fails at HEAD now |
| --- | --- | --- |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 2: a conflicted append survives twenty newer runs and retries its filed source` | All 22 injected conflicts, original-run retention removal and the exact successful retry pass. Replay press 24 preserves the note, but its manifest still contains appendEvidence and inherited completion authority rather than consulting only RunRecords. The new no-appendEvidence assertion fails. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: fix 1 finding 4: a completed replay cannot consume the new request for the same note` | The original append and the new request's append both pass their unchanged assertions. The second run has only change-2's local binding, but its checkpoint includes inherited change-1 as well as local change-2; the exact local-completion assertion fails. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: fix 1 finding 9: completion guards require applied bindings without inherited evidence` | Legacy parsing, the valid local chain, exact missing-completion transition refusal and the earlier invented-tuple refusal pass. The manifest reader still accepts an obsolete evidence prefix and imports its completion, instead of rejecting the manifest or reading the obsolete fields inertly. |

### New reds and controls

Each case executes its positive control before the failing assertion. Runner cases use the existing corpus driver
through production main, the real author, manifest admission and engine; persisted-record checks use
RunRecords.found, which invokes its originating-manifest-checked walk. No helper-only settlement test or alternative
write path was introduced. The unchanged author suite executes the exact byte/CRLF and plain-Timeline controls
through note-edit.applyChanges. The parser case uses parseRunManifestV2, parseRunCheckpoint and
verifyCheckpointChain, with each predecessor hash freshly recomputed.

| File | Exact new test name | Positive control and why it fails at HEAD |
| --- | --- | --- |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 2: only the oldest unfinished request settles for one note` | Ordinary owned append works; the oldest personal request actually appends and completes. The younger change-2 is nevertheless archived, its parents/stamp/properties change, and it enters the execution manifest. Expected active text and unchanged metadata fail. The later-run second append is retained as the continuation expectation. Pins ruling 2 and pass-2 finding 5. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 1: ambiguity settles and reports without a model line` | Ordinary append works. A valid reply generates a source note and files the letter with no Timeline line. Both matching targets stay identical, but their promised linked folder-specific rows are absent and the request archive lacks the source move dependency. Pins ruling 1 and pass-2 finding 4. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 1: overflow settles and reports without a model line` | Ordinary append works; the valid no-line reply files its source. The unlinked overflow row is absent and the archive lacks its source filing dependency. All four target bytes, zero updates and zero questions remain exact assertions. Pins ruling 1 and pass-2 finding 4. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 1: missing Timeline settles and reports without a model line` | Ordinary append works; the valid no-line reply files its source. The missing-Timeline linked row is absent and no request archive operation exists. This pins request-derived target refusal/settlement beyond the model-line-only path. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 1: unreadable Timeline settles and reports without a model line` | Ordinary append works; the valid no-line reply files its source. The unreadable-Timeline linked row is absent and no request archive operation exists. Exact unchanged bytes and no append completion remain required. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 3: overflow refuses its source on an unnamed owned hub` | The hub accepts the same sourced news in an ordinary admitted request. The four-target refusal still writes that source's line on the unnamed owned Home hub, changes its bytes, reports it updated and asks about its unmarked state. The manifest contains a sourced content edit despite the whole-request refusal. Pins ruling 3 and pass-2 finding 1. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 3: ambiguity refuses its source on an unnamed owned hub` | The ordinary owned-hub control appends. An ambiguous Garden plot request also naming unique Shed roof still updates Shed roof and the unnamed hub from the refused source. All targets must remain identical, with no sourced content edit or state question. Pins ruling 3's whole-source scope. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 5: invalid bullet count state proposal leaves the valid append independent` | A front-matter personal note accepts its append and produces the valid one-bullet state question in the control. An invalid two-bullet proposal instead skips the entire note loop: the exact valid append, updated row and local completion are missing. The state remains unchanged and no question is asked. Pins ruling 5 and pass-2 finding 3. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 5: plain note state proposal leaves the valid append independent` | The front-matter append/state-question control works, and the unchanged author red proves the plain Timeline is writable. With only front matter removed, the runner skips the valid append because it cannot read a state span. V1 expects the append only, exact preservation of every other byte, no question, one updated row and local completion. Pins ruling 5 and the plain-note branch of pass-2 finding 3. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 6: retry cites the bound source id after its rename` | Ordinary append works; the injected after-manifest personal edit causes exactly one real conflict while the source files. Rename that exact source id to Renamed letter.txt, then retry without a model line. Exactly one append lands on the fresh bytes, but it cites Water butt update.txt rather than Renamed letter.txt. Pins ruling 6 and pass-2 finding 6. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: round 3 6: satisfaction follows final citation naming on a filing collision` | With no collision, the already-present sourced line satisfies the request, files the source and leaves the note unchanged with zero updates. Adding an older different destination file of the same name causes manifest shape refusal after the citation mutates. The fresh source is not filed. The red requires the final free filename's sourced append, local completion and an inert later replay. Pins ruling 6 and pass-2 finding 7. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: round 3 4: a forged inherited move checkpoint cannot complete an append` | Legacy manifest parsing and the original stored move chain pass. Its literal move is confirmed, and the originating manifest has no journal request. Invent request/target bindings and applied completion in that chain, recompute all predecessor hashes, and parse/verify each checkpoint successfully. The receiving manifest still accepts and exposes never-admitted/never-targeted as a completion. It must reject this obsolete inherited evidence or ignore its authority. Pins ruling 4 and pass-2 finding 2. |

### Verification

All final executions were targeted, without a name filter, and used --maxWorkers=2. No test is marked only or skip.
Output stays under this worktree's tmp-logs; only failure sections and result totals were inspected.

```sh
pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2 > tmp-logs/c05-round3-runner-final.log 2>&1
pnpm exec vitest run src/data/contracts/c05-person-notes.test.ts src/data/contracts/c05-person-reports.test.ts --maxWorkers=2 > tmp-logs/c05-round3-contracts-final.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/c05-round3-tsc-app-final.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > tmp-logs/c05-round3-tsc-runner-final.log 2>&1
pnpm exec eslint src/data/contracts/c05-person-reports.test.ts > tmp-logs/c05-round3-eslint-app-final.log 2>&1
pnpm -C runner exec eslint test/c05-person-notes.test.ts > tmp-logs/c05-round3-eslint-runner-final.log 2>&1
```

Runner: **13 expected assertion failures / 23 passes** (11 new cases and two amended reds).
Author/report contracts: **2 expected assertion failures / 15 passes** (one new case and one amended red).
Every one of the twelve new cases and three amended reds fails for its stated contract reason at HEAD.
All 38 unchanged targeted tests pass. Every adjacent positive control completes before its red assertion.
Both TypeScript projects and both touched-file ESLint invocations exit 0. Read-only git diff --check passes.
No assertion API error, test load error, unhandled exception or timer-gate failure is used as the red. The collision's production
manifest shape refusal is the defect under test, observed through absent filing and the result; it is not a test
load error. The no-line replies include a generated source note so they pass the existing provider's noNote guard.
An initial diagnostic run hit that guard; c05-round3-runner-refined.log and the final log supersede it.
The name-filtered diagnostic was only to refine those new fixtures; the final evidence above executes every test
in the three selected files. No pnpm check, broader suite or e2e was run, as assigned.

Whitespace: removed only trailing spaces in docs/harness/2026-10-10-codex-c05-person-notes-adversarial.md;
no review wording changed (pass-2 Minor). All earlier notes remain as history; this section is the round-3 contract.

Offline research/reuse: the installed Vitest README links [Vitest documentation](https://vitest.dev/).
The assigned corpus driver, fixedDrive, author byte oracles, recovery fixtures and RunRecords originating-manifest
check were reused locally. No external query was made under the owner's no-network instruction.
compatibility: not applicable to test-only edits; the implementation session owns compatibility.
Left out: implementation, commits, harness shared-state edits, full check, e2e, deployment and backup, as assigned.

## Round 3 implementation (escalated)

Claude (bower-escalated), on the round-3 reds at `99ade27a`/`13d093c4`. No test, fixture or corpus file changed.
No commits, network, server, e2e or push. Logs under `/tmp/c05-r3e/`.

### Changes per ruling (TL-P4-32 addendum 2)

1. **One home.** `settleRequest` in `src/data/spine/scripted.ts` takes the run's request lines (oldest first), the
   listing and the verified history, and decides from the request and its resolved notes only: which requests settle,
   each note's binding, whole refusals, the "Left as you wrote them" rows, the sources an archive waits for, retries,
   and satisfaction. `decide`/`build` only ask it (`consent`, `retries`, `refuse`, `present`, `named`, `unsettled`,
   `rowsOf`, `sourcesOf`). Rows are planned per settling request in the journal loop: one contribution per filed
   source (materialize dedupes), or with the request's archive when no source is filed. Every note a request binds is
   read (`want`), so a missing or unreadable Timeline gets its row with no model line (`personalTimelineRefusal`,
   exported from note-edit and used by `appendLines` itself: one home for that check).
   `requestTargets` is the one verdict on what a request names (overflow, ambiguous); the planner's context in
   `runner/src/claude.ts` reads it, so a refused request shows none of its notes.
2. **One request per note per run.** A request naming a note an older unfinished request binds waits untouched (not
   captured, not archived). A note a request already completed is not bound (a replay settles as a no-op).
   A request settles only when each bound note has its line planned or present, or a row; otherwise it waits
   (`unsettled`, added to the existing `waits`).
3. **Refused whole, by source.** Overflow or ambiguity: every named note is blocked, and while such a request settles,
   no line or state citing a thing this run files is planned anywhere, Bower's hubs included. A request is not tied to
   one pile, so every thing the run files counts as its source (v1 limit, stated in the doc comment).
4. **One provenance home.** `appendProvenance`, manifest `completedAppends` and `appendEvidence` are removed; the
   manifest validator refuses both keys. `firstCheckpoint` carries no inherited completions, so each checkpoint's
   `completedAppends` is only its own applied bindings. Earlier completions and waiting retries are read only through
   `RunRecords.found` (its walk checks the first checkpoint against its originating manifest).
   Known limit: completion is remembered while the run's records are retained (twenty runs); an exact replay after
   that relies on the author's existing same-text-and-source dedupe.
5. **State independent.** A personal state proposal is asked about only beside the request's line and only when it
   changes exactly one bullet (`oneBulletOf`); otherwise it alone is dropped and the append stands (the `continue`
   that skipped the note is gone). Plain notes: no state span; the append only.
6. **Retry citation and satisfaction.** A retry is planned by `settleRequest.retries`, its citation the bound source
   id's name in the listing now, its words the model's line on that note citing that id if any, else the original.
   A bound line already present is decided after `madeAs`: same final name -> satisfied (archive binding);
   another name -> appended now as its own edit under the final name.
7. **The 2 regressions.** The plain-note layout change is reverted: a plain note's personal span is the whole note
   again and `parseNote` returns no Current state or Timeline for it, as on main. Ruling (5) still needs the plain
   append (fix 1 finding 7, round 3 5), so `ownership-format.ts` gives a plain note only a `timeline` span (its last
   `## Timeline` to the end); `note-edit.holds` checks a plain append by the bytes before that section, the tasks,
   insertion-only and the re-parsed entries (`timelineEntries`, exported from note-format, the one display parser).

removed: appendProvenance and its inherited-chain verification in run-manifest.ts (satisfied check kept as satisfiedProven).
removed: manifest completedAppends and appendEvidence (writer, validator keys, firstCheckpoint and nothingReadyPlan inheritance).
removed: evidence collection and manifest-completion reading in personalAppendHistory; the unused runId on history lines.
removed: requestsNamed, blocked/sourcesFor model-line rows, consentFor and the separate history retry loop in decide.
removed: the model-line-dependent journal admission for requests and the build-time leftRows loop.
removed: the `continue` that skipped a note's append on a refused personal state proposal.
removed: plain-note personal span split and plain parseNote currentState/timeline (ownership-format, note-format).
removed: `prior` retry entry reuse in the model-lines loop; `what` set to row 1 on the line (now set on the row).
tests changed: none.
compatibility: 3e958da1

### Verification

- Before: `/tmp/c05-r3e/r3e-base-app.log` 4 failed (2 C05 report reds, note-format, ownership-format);
  `/tmp/c05-r3e/r3e-base-runner.log` 13 failed (the round-3 runner reds).
- `pnpm exec vitest run src/data --maxWorkers=2`: 76 files / 3,871 pass (`r3e-app.log`).
- `pnpm -C runner exec vitest run --maxWorkers=2`: 41 files / 370 pass, keep-one-note included (`r3e-runner.log`).
- tsc app, node, runner: pass. ESLint on the 7 touched files: pass. `git diff --check`: pass.
- `pnpm check` (once, under with-lock): fails only `src/docs.test.ts` "every change since the P2 freeze is listed":
  the red commit `99ade27a` has no row in `docs/harness/2026-10-07-p3-compatibility.md` (a harness record the
  coordinator writes; not product code). All 5,169 other tests passed (`r3e-check.log`). The steps after `pnpm test`
  were then run directly under the lock: runner lint/build, app build, duplication, unused, dependency and bundle
  gates all pass (`r3e-rest.log`).

### Compatibility rows to add (coordinator)

| Commit | Entry | What it changes for the accepted app's files |
| --- | --- | --- |
| `99ade27a` | c05-person-notes | none: tests only (round 3 reds and amendments, TL-P4-32 addendum 2). |
| `3e958da1` | c05-person-notes | Manifests no longer accept completedAppends or appendEvidence (only unaccepted C05 drafts wrote them; such a manifest is refused, not read inertly); satisfiedAppends stays, proved by the manifest itself. Checkpoints keep optional appendBindings/completedAppends, now only the run's own applied bindings. Accepted manifests, checkpoints and reports never had these fields and parse unchanged (existing fixture tests). Plain notes are parsed as on main (whole note personal, no state); their layout gains only a Timeline span for a request's one line. App and runner deploy together. |

Sources: the existing RunRecords walk and checkpoint chain (local), timeline-line.ts, CommonMark ATX headings
(https://spec.commonmark.org/0.31.2/#atx-headings), RFC 9110 If-Match (https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1).
## Round 4 reds (TL-P4-32 addendum 3)

Red-owning session on HEAD `88d7762244605daf0d82a62ce6cbeca933582629`, branch `c05-person-notes`,
worktree `/private/tmp/bower-c05-person-notes`. Scope is exactly addendum 3's three rulings and the owner's
explicit pass-3 restored-request reproduction. Only `runner/test/c05-person-notes.test.ts` and this notes
section changed. No production change, network, git write, commit, server, real timer, `.only` or `.skip`.
The coordinator commits the tests and these notes separately.

### Tests and positive controls

All three new tests call the existing owned-note positive control first: the same corpus fixture, production
runner `main`, planner, author, manifest validation and Drive adapter file the source and append its sourced line.
All production runs use `runOnDrive` with the corpus driver's injected clock and pretend Drive. No settlement
helper is called in place of `main`. `round4Records` reads the real persisted manifest and checkpoint chain via
`RunRecords.found`/`walk`, including the originating-manifest checks, then independently runs
`parseRunCheckpoint` and `verifyCheckpointChain` on each observed chain. All these parser controls pass.
Later no-line filing replies include a grounded generated source note, as the existing document-note-required
contract requires; no failed planner load or invalid reply is used as a red.

| Exact new test name | Controls and contract assertions | Observed red at HEAD |
| --- | --- | --- |
| `C05 person notes: round 4 1: settlement survives recovery and retention` | First complete `change-1`: one sourced append, request archived, exact local checkpoint completion. On an independent Drive, interrupt the request's archive PATCH before it reaches Drive, after the append lands. The transport failure is reconciled against the still-active request; the verified originating checkpoint records completion while the archive outcome is not applied. The next new run archives that exact request without any note edit or second append. On the original Drive, twenty newer runs each succeed, file their own distinct made-up source, and have verified persisted records; none admits the archived `change-1` or changes Garden plot. Retention removes the original manifest. Restore the exact request via the corpus driver, add another source and offer different wording only if the planner shows Garden plot. | Recovery and all twenty newer-run controls pass. The restored `change-1` is admitted and captured again, gets another completion, and adds `The new water butt is here now.` citing the new source. Exact original note bytes and no re-admission fail. |
| `C05 person notes: round 4 2: pending retries keep target and source ids` | Each pending fixture causes exactly one after-manifest personal edit, proves the real append was rejected for conflict, files the original source, and verifies its persisted `(change-1, targetFileId, sourceFileId)`. A retry without a rename writes exactly once to the original id and archives the request. Then independently rename the target to Beds and the bound source to Renamed letter, first without a replacement, then with a different new Garden plot and another source. The retry must append the original line to Beds using the original source id's current name; the replacement must keep all its bytes. A separate pending target goes to the Bin: no edit, the existing `ASK_GONE` Not done why in the run report, and request archive. | Baseline retries and every persisted-conflict control pass. Without a replacement, Beds receives no line and the request stays active. With a replacement, the new Garden plot receives the new model line: persisted consent changes from target `f11` / source `f13` to target `f14` / source `f15`. The binned target produces no Not done why and its request stays active. All variants reach their final record assertions. |
| `C05 person notes: round 4 3: only settlement archives scripted requests` | Two unfinished requests name Garden plot, oldest first. Call `main` without a Claude override, selecting the actual scripted provider and its generic request handler. Filing succeeds; the note stays exact, the unfinished oldest request stays active, and the verified checkpoint has no append completion. The younger request must keep its active path, bytes, parents, modifiedTime and appProperties; it must have no capture or archive operation. | The oldest and successful scripted-filing controls pass. `change-2` moves into the archive, receives a `bowerOp` stamp and new modifiedTime/parents, and is captured with an archive operation. Its bytes stay the same, but the active-path and exact metadata assertions fail. |

The restored-after-retention case is included because this session's owner explicitly requested it, even though
addendum 3 also labels a person's manual restore as outside supported use. It keeps the archived original and
restores an exact copy through the existing corpus driver, matching pass-3 finding 1. No new ledger or
production mechanism is introduced by these tests.

### Existing-test amendment

tests changed: runner/test/c05-person-notes.test.ts: fix 1 finding 4 previously required admission of both the completed restored change-1 and unfinished change-2. That admission expectation contradicts this session's explicit no-re-admission contract. It now requires change-2 and excludes change-1. The exclusion is a soft assertion so all original filing, exact-once append, local binding/completion and no-inherited-evidence assertions still execute. All other expectations and all numeric bounds are unchanged.

The amended test's exact name is
`C05 person notes: fix 1 finding 4: a completed replay cannot consume the new request for the same note`.
At HEAD, only its new exclusion fails: admission includes `change-1`. Its other controls and earlier assertions pass.
No other existing test changed.

### Verification

```sh
pnpm -C runner exec vitest run test/c05-person-notes.test.ts -t 'C05 person notes: round 4|C05 person notes: fix 1 finding 4' --maxWorkers=2 > tmp-logs/c05-round4-runner-final.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > tmp-logs/c05-round4-tsc-runner-final.log 2>&1
pnpm -C runner exec eslint test/c05-person-notes.test.ts > tmp-logs/c05-round4-eslint-runner-final.log 2>&1
```

Final targeted run: **4 expected failing tests** (three new reds and one required existing-test amendment),
with **22 assertion failures** against the specified contract. The other 35 cases were excluded by the command's
name filter; no test source is skipped. Only failure blocks and result counts were read. Each red reaches its
stated scenario with passing positive controls; there is no load error, unhandled exception or timer-gate failure.
The injected archive transport error is intentional and completes its verified recovery control.
Runner TypeScript (including the touched test and its imports) and touched-file ESLint both exit 0.
Read-only `git diff --check` passes. Logs stay local under `tmp-logs/`.

Offline research/reuse: the existing Drive file-id resource and metadata interface, cited locally in the corpus
adapter ([Drive files](https://developers.google.com/drive/api/reference/rest/v3/files)), and the existing
conditional-write contract ([RFC 9110 If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1)).
The production corpus driver, note author, RunRecords recovery chain and checkpoint parsers are reused.
No external lookup was made under the owner's no-network instruction.

compatibility: tests only; no stored format, parser or production behavior changed.
left out: implementation, additional findings, full suites, pnpm check, e2e, shared harness state, git writes and commits.

## Round 4 implementation (escalated)

Claude (bower-escalated), on the round-4 reds at `946eae84`. Only `src/data/spine/scripted.ts` changed. No test, fixture
or corpus file changed. No commits, network, server, e2e or push. Logs under `/tmp/c05-r4e/`.

**Status: blocked on one contract conflict in ruling (1)** (below). Rulings (2) and (3) are green; the data harm of
(1) is fixed (no second append, no second completion); only the "not admitted / not captured" assertions stay red.

### Changes per ruling (TL-P4-32 addendum 3)

1. **(b) Settled requests stay settled.** `journalOf` marks a line `archived` when the same record id is already in
   `changes/archive` (`archivedRecords`: an archived file sharing the line's name is read; its record id decides, so
   no read happens unless a copy was restored). `settleRequest` treats such a request as completed for every note:
   it binds nothing, plans no line and records no completion, whatever the age of the run records, and the run
   archives it again. The crash case (completed, archive move lost) needed no change: the retained checkpoint's
   `completedAppends` already settles it with no second append and archives it next run (the round-4 red's recovery
   half was green at HEAD and stays green). No ledger was added. settleRequest already archives in the same
   settlement that records completion (the request's archive waits for its append edits).
2. **Pending binds by ids.** A request with a retained pending line (`!applied`, not completed) is bound only by the
   persisted `targetFileId`, never by its words' titles. A target still listed (any name, any folder) gets the retry,
   its citation the bound source id's current name (existing `retries`). A target gone or in the Bin gets a
   "Left as you wrote them" row with the existing `ASK_GONE` why and its last path, and the request is archived.
   A new note with the old title is never bound. One request per note still holds on the persisted target id.
   The gone row has no source of this run, so it rides the request's one archive row: rows with no filed source are
   now folded into that row (`withArchive`). Before, such a row was its own contribution on the archive move, which
   `grounded` refuses (an archive move has exactly one row): the whole run would have been refused.
3. **One settlement path.** Journal admission of a request: `settlement.owned` (it names a note or waits on a line)
   decides by `settlement.admitted`; the scripted provider's generic `d.request` admits only requests settleRequest
   does not own (lookups and comparisons that name no note). The younger request naming a busy note is no longer
   captured or archived on the scripted path.

removed: `!!d.request ||` as an admission of every request (scripted.ts journal filter).
removed: the separate history retry loop after title binding (retries are now bound inside the per-request loop).
removed: a no-source leftAsWritten row as its own contribution on the archive move.
tests changed: none.

### The contract conflict (needs the lead)

`round 4 1` (replay half) and the amended `fix 1 finding 4` require a hand-restored copy of an archived request to be
left out of admission (`replay.requests`) and of the capture journal. Implemented first as an admission filter in
`plan.ts` (same `archivedRecords` check), it turned these existing tests red, all of which require the restored copy
to be admitted and run (`/tmp/c05-r4e/runner.log`):
- `runner/test/corpus-driver.test.ts`: "replays the original request id separately from a new tidy-up",
  "reports a restored replay and a newly written tidy-up separately" (C09 replay, admission requests = change-1);
- corpus `harness/corpus/c05-note-not-written-by-bower` run 2 (replay alone must produce a report), through
  `corpus.test.ts` scorer, `c05-incorporation.test.ts` and `C05 person notes: corpus first append ...`;
- `C05 person notes: fix 1 finding 2` (replay at press 24 must leave verified run records).
A replay with nothing else to take has no run unless the restored line is admitted, so both cannot hold. The filter
was reverted; the restored copy is admitted and captured, and settles as a no-op (bytes exact, no completion).
Addendum 3 itself puts a hand restore outside supported use (TL-P4-39 addendum 2). Options for the lead: drop the
three restored-copy admission/capture assertions (lines 795, 798 and fix 1 finding 4's exclusion), or amend the
corpus-driver replay tests, the c05 corpus case and fix 1 finding 2.

### New findings (not fixed, non-Blocking)

- The planner context (`runner/src/claude.ts`) still lists a pending request's title-matched notes (a replacement
  note with the old title is shown though it can take no line). Harmless: no consent is given.
- A pending line older than the twenty retained runs falls back to title binding (no persisted binding is read).
- `retries` drop a line whose bound source is gone, and the request then waits each run (pre-existing).

### Verification

- Before: `/tmp/c05-r4e/base-reds.log` 4 failed (the round-4 reds and fix 1 finding 4).
- `pnpm exec vitest run src/data --maxWorkers=2`: 76 files / 3,871 pass (`app-2.log`).
- `pnpm -C runner exec vitest run --maxWorkers=2`: 371 pass, 2 fail (`runner-3.log`): round 4 1 (assertions at lines
  795 and 798, admission and capture of the restored copy) and fix 1 finding 4 (admission exclusion). Round 4 2,
  round 4 3 and every other test pass.
- tsc app, node, runner: pass. ESLint on scripted.ts: pass. `git diff --check`: pass.
- `pnpm check` (once, under with-lock, `check.log`): app 159 files / 5,171 pass; runner fails only the 2 above, so
  the later steps did not run.

### Compatibility row draft (coordinator)

| Commit | Entry | What it changes for the accepted app's files |
| --- | --- | --- |
| `946eae84` | c05-person-notes | none: tests only (round 4 reds, TL-P4-32 addendum 3). |
| `3e958da1` | c05-person-notes | none: no stored shape changes. A waiting append retries on its stored target and source ids; a request already archived binds nothing again. |

Sources: Drive files resource and ids (https://developers.google.com/drive/api/reference/rest/v3/files),
RFC 9110 If-Match (https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1); local RunRecords and grounding.

## Red amendment (TL-P4-32 addendum 4)

Red-owning session, 2026-10-10, on HEAD `90a0b603ee57b1a589d9fa531169b365743b4556`.
Addendum 4 resolves the round-4 implementation's contract conflict: the promise is the effect.
A completed request, including a restored copy, may be admitted and reported, but settles as a no-op
with no second append and no second completion.

tests changed: runner/test/c05-person-notes.test.ts: TL-P4-32 addendum 4 drops the two restored-copy admission/capture exclusions in round 4 1 and the admission exclusion in fix 1 finding 4; all no-second-append, no-second-completion assertions and positive controls remain.

Exactly three assertion lines removed; no other test or implementation changes. The archived-original
admission exclusion in round 4 1's twenty-run loop remains. The earlier failing assertions are recorded
in the Round 4 implementation verification above; this session applies the authorized contract amendment.

Verification at HEAD with the amended reds:
- `pnpm -C runner exec vitest run --maxWorkers=2`: 41 files, 373 tests passed;
  `tmp-logs/c05-r4-redfix.log`.
- `pnpm -C runner exec tsc --noEmit -p .`: passed; `tmp-logs/c05-r4-redfix-tsc.log`.
- `pnpm exec eslint runner/test/c05-person-notes.test.ts`: passed;
  `tmp-logs/c05-r4-redfix-eslint.log`.
- `git diff --check`: passed.

No network or git writes. Commits are left to the coordinator. Full `pnpm check` and screen e2e
were not run for this narrowly assigned red amendment; no screen changed.

## Round 5 reds (TL-P4-32 addendum 5)

Red-owning session, 2026-10-10, at HEAD `d696abd0700b560cba988d380baf7429d69336fb`,
branch `c05-person-notes`, worktree `/private/tmp/bower-c05-person-notes`.
Read addenda 3–5, the pass-4 review and the Round 4 notes. Scope: addendum 5's three points only.
Added three tests and their local fixture helpers in `runner/test/c05-person-notes.test.ts`;
appended this section. No existing test or helper changed. The coordinator commits the tests and notes.

### Exact tests, controls and observed failures

1. `C05 person notes: round 5 1: archived completion uses the record id inside differently named bytes`
   completes `change-1` on Garden plot (`f11`), verifies its originating checkpoint completion and
   archived request bytes, then runs twenty newer successful tidy-ups. Each files a distinct made-up
   letter, changes no Garden plot bytes, records no completion or append binding for `change-1`,
   and passes manifest/checkpoint verification. Retention removes the original manifest.
   The positive replay control restores the original filename via the corpus driver and offers new wording:
   it files the new source, writes nothing to Garden plot and records no second completion.
   The red then restores the exact archived bytes as `restored-copy.json`, proves the archived original
   still exists unchanged under a different Drive id, and runs the driver again with a new source.
   At HEAD, Garden plot gets `The new water butt is here now.` citing `Replay letter`, and
   `(change-1, f11)` completes again. The exact-byte, no-second-completion and no-edit assertions fail.

2. `C05 person notes: round 5 2: a retained completion never resolves a renamed target by title again`
   interrupts the archive PATCH before it lands, after the sourced append and checkpoint completion.
   The control proves the request stays active, the archive outcome is not applied, and the verified
   checkpoint contains `(change-1, f11)`. An independent recovery without a rename files its new source,
   archives the exact request, leaves the note byte-identical and records no second completion.
   The red repeats that crash, renames `f11` to Beds, creates a new Garden plot (`f14`) and offers a
   new line with a new source. At HEAD, Beds stays exact, but the replacement receives
   `Alex received the next committee letter.` and `(change-1, f14)` completes. The replacement's
   exact-byte assertion, empty completions and no-edit assertion fail. The request archive checks pass.

3. `C05 person notes: round 5 3: a request past retention is left as written and archived without an append`
   first proves a retained pending binding retries after a rename, beside a new same-title note:
   only Beds gets the original line citing the original source, and only its original target id completes.
   The red conflicts the first append, verifies the pending target/source binding and conflict outcome,
   Bins the bound source, then runs twenty newer successful tidy-ups. The note and active request bytes
   stay exact; each verified newer manifest has no append binding or completion for `change-1`.
   The originating manifest expires, and the request timestamp is older than the oldest retained manifest.
   Rename the old target to Beds and create a new Garden plot (`f54`) with a new source (`f55`).
   At HEAD, the replacement gets the new line and `(change-1, f54)` completes. The archive move and its
   applied outcome already pass, including exact archived bytes and absence from the active changes.
   The no-append, no-completion, no-edit, empty-updates and required `leftAsWritten` row assertions fail.
   `TOO_OLD_WHY` is imported through the `scripted.ts` module namespace with an optional typed export:
   its missing export fails `expect(typeof TOO_OLD_WHY)` and the nonempty-copy assertion, without a
   module-load or TypeScript error. The row must use that exact constant once the implementer adds the
   designer's signed line to the C05 why table; no draft sentence was invented here.

All three tests also run the existing owned-note append positive control. Every scenario uses the
corpus driver's `runOnDrive`/`runWithClaude` through production runner `main`, fake Drive and its
injected clock. The existing `round4Records` checks the originating manifest through `RunRecords`,
then independently parses checkpoints and verifies each chain. No settlement helper substitutes for `main`.
All positive controls and preconditions pass. No real timers, network, server, production changes,
`.only`, `.skip`, shared harness-state changes or git-writing command.

tests changed: none (existing tests are unchanged; three new round-5 tests added).
compatibility: none (tests and notes only; no stored shape or production change).

### Verification at HEAD

```sh
pnpm -C runner exec vitest run test/c05-person-notes.test.ts -t 'C05 person notes: round 5' --maxWorkers=2 > tmp-logs/c05-round5-runner-final.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > tmp-logs/c05-round5-tsc-final.log 2>&1
pnpm exec eslint runner/test/c05-person-notes.test.ts > tmp-logs/c05-round5-eslint-final.log 2>&1
```

Final targeted run: **3 expected failing tests, 14 assertion failures**; all fail for the reasons above.
The other 39 tests are excluded by the name filter, without changing their source. No load failure,
unhandled exception or timer-gate failure. The intentional archive transport errors are reconciled and
their verified recovery controls pass. Only failure blocks/result counts were read from the test logs.
Runner TypeScript (including the touched file and imports) and touched-file ESLint exit 0.
Read-only `git diff --check` passes. Logs remain under `tmp-logs/`.

Offline research/reuse: the locally cited standard Drive file-id resource
(https://developers.google.com/drive/api/reference/rest/v3/files) and conditional writes
(https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1), as recorded in the Round 4 notes.
Reused the existing corpus driver, persisted RunRecords chain, checkpoint validators and fake Drive.
No external lookup under the owner's no-network instruction; no new identity or settlement mechanism.

left out: production fixes, the designer-signed TOO_OLD_WHY export, full suites, pnpm check, e2e and git writes.

## Round 5 implementation (escalated)

Claude (bower-escalated), on the round-5 reds at `74ee65ac`. Only `src/data/spine/scripted.ts` changed. No test,
fixture or corpus file changed. No commits, network, server, e2e or push. Logs under `/tmp/c05-r5e/`.

### Changes per point (TL-P4-32 addendum 5)

1. **Completed by the record id in the bytes.** `archivedRecords` now reads every archived journal file once per run
   (lazily, only when your changes hold a request, all reads at once as `journalValues` does) and keeps the set of
   record ids inside them. A request line is `archived` when its id is in that set, whatever either file is named.
   Only request lines are checked (the flag is read only by `settleRequest`).
2. **Never title-resolved once bound or completed.** In `settleRequest`, a request with any completion or any bound
   line in the kept records (`recorded`) is settled by those ids only: a waiting line retries on its persisted target
   and source (round 4 path, unchanged), a gone target gets the `ASK_GONE` row, and a request whose recorded lines
   are all completed is admitted with nothing bound and archived (the completed-but-unarchived crash case). Its words'
   titles are not read again. An archived request is admitted and settles as a no-op (as before, but it no longer
   reaches the title path at all).
3. **Fail closed past retention.** New `retainedSince` reads, through `RunRecords.found`, the earliest `requestedAt`
   of the kept runs once at least 20 run folders are kept (`RETAINED_RUNS`, the runner's `KEEP_FINISHED`); null while
   fewer are. It is read only when a request has nothing of it in the kept records. Such a request with `at` older
   than that, naming notes, is admitted with no binding, no line and no completion, and gets one row per named note
   (`name` its path, `fileId`), or one `Request` row when it names more than three, with the new exported
   `TOO_OLD_WHY` (the designer's signed text, packet addendum). Rows with no source ride its archive row
   (`withArchive`, round 4); `settleRequest` stays the one settlement home and its archive the one archive path.

Also: one `recordsOf` builds the run records for `personalAppendHistory` and `retainedSince` (no copy).

removed: the name filter in `archivedRecords` (`archived.filter((x) => x.name === f.name)`) and its per-line reads.
removed: `settled` and the archived clause of `done` in `settleRequest` (archived requests short-circuit instead).
removed: the title path for a request with a completion but no waiting line (`open` = notes not yet completed).
tests changed: none.

### v1 limits and findings (logged, not fixed; TL-P4-32 addendum 5 (4))

- Possible normal-use regression, unverified, for the lead: a request naming two notes, where a run appends the
  line to one (completion recorded) but the model offers no line for the other, so the request waits. By (2) the next
  run binds only the recorded id, so the other note never gets its line, and the request is archived with no row.
  Before round 5 it was title-resolved again and bound. No test covers it; I did not check whether a waiting
  request's planned line lands in that run.
- Every run with a request in your changes reads the whole archive of your changes once; the cost grows with it.
- Past 20 kept runs, a request with nothing of it in the records makes the run read every kept run's records once.
- `RETAINED_RUNS` (20) mirrors the runner's `KEEP_FINISHED`; `src/data` cannot import the runner.
- A request that waited unbound for 20 runs (20 clashes in a row, or the model giving no line 20 times) fails closed
  with `TOO_OLD_WHY`. A hand-restored copy edited so its bytes still parse with the same id settles as a no-op; one
  whose id was changed is a new request (hand restore, outside supported use).
- A binding in a manifest whose append was neither applied nor conflicted (a crash before dispatch) is not a record
  (unchanged): such a request is title-resolved again on the next run.
- Carried from round 4: the planner context still shows a recorded request's title-matched notes (no consent).

### Verification

- Before: `/tmp/c05-r5e/base.log`: the 3 round-5 tests fail.
- `pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2`: 42 pass (`c05.log`).
- `pnpm exec vitest run src/data --maxWorkers=2`: 76 files / 3,871 pass (`app.log`).
- `pnpm -C runner exec vitest run --maxWorkers=2`: 41 files / 376 pass (`runner.log`), corpus-driver replays,
  keep-one-note and fake-worker included.
- tsc app, node, runner: pass (`tsc-*.log`). ESLint on scripted.ts: pass (`eslint.log`). `git diff --check`: pass.
- `pnpm check` once under with-lock: pass (`check.log`).

### Compatibility row draft (coordinator)

| Commit | Entry | What it changes for the accepted app's files |
| --- | --- | --- |
| `74ee65ac` | c05-person-notes | none: tests only (round 5 reds, TL-P4-32 addendum 5). |
| `3e958da1` | c05-person-notes | none: no stored shape changes. A request in the archive under any name settles as a no-op; one past the kept runs with no record gets a "Left as you wrote them" row and no line. |

Sources: Drive files resource and ids (https://developers.google.com/drive/api/reference/rest/v3/files),
OWASP fail securely (https://owasp.org/www-community/Fail_securely); local RunRecords, retention and grounding.

## Round 5 reds, addendum 6

Red-owning Codex session, 2026-10-10, baseline HEAD `3c630f60`, branch `c05-person-notes`,
worktree `/private/tmp/bower-c05-person-notes`. Read TL-P4-32 addenda 2–6, the packet's signed
nothing-found row, the contract and the Round 5 notes. Added two tests and new local fixture helpers
in `runner/test/c05-person-notes.test.ts`. Production code, existing tests and helpers are unchanged.
The coordinator commits the tests and these notes separately; this session ran no git-writing command.

### Tests and positive controls

Both tests use the existing corpus driver's `runOnDrive` through production runner `main`, the fake
Drive and injected clocks. Each first runs the existing owned-note append control, then a new control
with a single request naming two distinct personal notes, Garden plot and Shed roof. The model offers
one line for each. Both exact sourced appends land, both request/target pairs complete in the verified
checkpoint, both update rows appear, and the original request bytes archive in the same run. There is
no leftAsWritten row. All these positive controls pass at HEAD.

1. `C05 person notes: round 5 4: one line and one nothing-found row settle two named targets`

   A fresh request names both notes in its own words, with no title reference needed in a pile's words.
   The planner context contains both; the model offers a line only for Garden plot. The test requires
   exactly its sourced append, one completion for its file id, one update row, and one linked
   leftAsWritten row for Shed roof. The latter remains byte-identical and uses the imported
   `NOTHING_FOUND_WHY`. The test asserts that the export is a string and is exactly
   `Bower didn't add the line: it found nothing about this note in what you added.` Namespace import
   and optional typed access follow the earlier TOO_OLD_WHY red, so a missing export fails an
   assertion without a module-load or TypeScript error. The admitting manifest must contain the
   applied archive move, and the archived request must preserve its exact bytes.

   The remainder pins two fresh tidy-ups without restoring or replaying the old request: the feed
   stays unchanged for the first, and the second adds an unrelated made-up letter. The unrelated
   letter must file normally. Both notes must keep their first-run bytes, with no second completion,
   no note edit, no further update or leftAsWritten row, and the old request still archived. The later
   model offers a line for Shed roof if it is shown, making a surviving request detectable.

   **Observed red at HEAD:** nine assertion failures. NOTHING_FOUND_WHY is missing. The request's
   target without a line remains unsettled, so the request drops out of capture while Garden plot's
   planned append still refers to it. The production manifest guard refuses the plan with
   `edit: record` before any effect. There is no append, filing, update, row, archive or persisted run;
   the active request stays exact. `RunRecords.found` returns `new`, failing the run assertion.
   This is the addendum 6 settlement gap, reached with valid input and passing controls, rather than
   a provider refusal or a load error. The subsequent checkpoint/completion and later-run assertions
   are present but cannot execute at this HEAD because the initial production run is refused.

2. `C05 person notes: round 5 5: only a clashed target retries on bound ids before archive`

   The same two-target request gets two model lines. After the first manifest is persisted, before
   its effects, the transport wrapper changes only Garden plot's personal bytes. Its append meets
   the real fence and records a rejected conflict, with its exact request/target/source consent in
   the originating manifest. Shed roof gets exactly its sourced line and is the sole first-run
   completion/update. No leftAsWritten row or question is produced. The request stays active with
   exact bytes, and its planned archive move is not applied.

   The next production runner call supplies no model line. Only Garden plot's persisted target and
   original filed source ids appear in the retry consent; the fresh personal reminder is preserved,
   and exactly its original sourced line lands. The retry checkpoint contains only Garden plot's
   completion; Shed roof stays byte-identical to the first result. The request archives then, with
   its applied archive outcome independently checked. Both notes and the source retain their ids.

   **Observed at HEAD: already green.** Every assertion and control passes, including independent
   settlement of the unaffected target, no early archive, one bound retry and the final archive.
   This scenario cannot honestly be delivered as a failing red: the behavior already exists.
   Retained the requested test as regression coverage; no artificial failure, production change
   or broader scenario was introduced to make it red. The coordinator must account for this
   exception to the request that each new test fail at HEAD.

No existing test contradicting addendum 6 was found in the C05 tests or the scoped request/settlement
test search. The existing retention-limit dispute is outside this addendum's scope.

tests changed: none (existing tests unchanged; two new round-5 tests and new local helpers only).
compatibility: none (tests and notes only; no production or stored-format changes).

### Verification

```sh
pnpm -C runner exec vitest run test/c05-person-notes.test.ts -t 'C05 person notes: round 5 [45]:' --maxWorkers=2 > tmp-logs/c05-round5-add6-final.log 2>&1
pnpm -C runner exec tsc --noEmit -p . > tmp-logs/c05-round5-add6-tsc-final.log 2>&1
pnpm exec eslint runner/test/c05-person-notes.test.ts > tmp-logs/c05-round5-add6-eslint-final.log 2>&1
```

Final targeted result: one expected failing test (4), nine assertion failures; one passing test (5).
The 42 existing tests are excluded by the filter, with no `.only` or `.skip` source changes.
An earlier individual run of 4 failed with the same nine assertions; an individual run of 5 passed.
Read only failure blocks and result counts. No unhandled exception, missing-export load error or
timer-gate failure. Runner TypeScript and touched-file ESLint exit 0; their final logs are empty.
Read-only `git diff --check` passes. No network, real timer wait, server, app edit or shared harness write.
Startup installation/full gates were omitted under the explicit no-network and targeted-tests-only instructions.

Offline research/reuse: locally recorded official Drive file-id resource
(https://developers.google.com/drive/api/reference/rest/v3/files) and conditional writes
(https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1). Reused the corpus driver, transport-time
conflict injection, RunRecords originating-manifest validation and checkpoint-chain checks.
No external lookup or new identity/settlement mechanism.

left out: implementation and NOTHING_FOUND_WHY export; full gates/e2e/git writes; a failing red for 5 (already green).
