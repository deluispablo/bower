# c05-timeline-list red evidence

implementer: codex

Role: red-owning session only. No production changes, network access or git writes. The coordinator commits.
HEAD: `02e495e63899f99b50dc1c3b883462ea8090c1fb`; branch: `c05-timeline-list`.

## Source and method

[CommonMark 0.31.2 list items](https://spec.commonmark.org/0.31.2/#list-items) is the offline reference for bullet markers, child indentation and blank lines between items. The packet limits supported top-level markers to `- ` and `* `. No online source was fetched.

All new cases run through runner `main` using the existing corpus driver and pretend Drive. The fictional target is `Areas/Home/Allotment diary.md`; the existing made-up source and injected Drive clock are reused. No timers were added.

Each new case first runs the existing Bower-owned positive control and an appendable personal-note control. The personal control pins exact text, updated report, archived request and durable record-id completion. Red 1 also has a scripted/no-line control. Each exact-byte case also has an API positive control. The preseed/replay case compares dash and star fixtures differing only in marker, with an older date to pin text-plus-source identity.

Red 1 uses `seedCase` and `runOnDrive(..., {}, 1)` so `main` selects the real scripted provider with no offered line. `runScripted` would auto-load the original corpus replies. Offered-line cases use recorded Claude-shaped replies; no live model is called. The exact-byte cases also call `personalTimelineRefusal` and `applyChanges` with the same fetched ownership and bound consent. Expected byte strings are independent fixtures.

## Reds

Final run: **14 assertion reds, 46 passes, 60 tests**. All 44 pre-existing tests pass, including the authorized fixture replacement. The two additional passing cases are packet items 3 and 4; their existing behavior must remain green. Every failing result contains only `AssertionError` failure messages, with no load failure.

Exact names and observed results at HEAD:

- `C05 timeline list: 1: dated-colon list with no offered line settles as nothing found`
  RED: leftAsWritten says “can't read” instead of NOTHING_FOUND_WHY; bytes stay unchanged and completions are empty.
- `C05 timeline list: 2: plain list with front matter appends once, updates, archives and completes`
  RED: original bytes remain without the offered line, updated is empty and completion is absent. Archive and replay checks pass.
- `C05 timeline list: 2: plain list without front matter appends once, updates, archives and completes`
  RED: original bytes remain without the offered line, updated is empty and completion is absent. Archive and replay checks pass.
- `C05 timeline list: 3: prose stays unreadable even with a sourced line offered`
  PASS: prose refusal preserves bytes and zero completions beside positive controls.
- `C05 timeline list: 4: appendable person and Bower-owned notes remain positive controls`
  PASS: appendable person and existing Bower-owned controls append through main.
- `C05 timeline list: 5: exact bytes preserve CRLF and Unicode byte offsets through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve star marker through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve whole nested subtree at top level through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve last top-level star in mixed markers through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve last top-level dash in mixed markers through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve trailing blanks with final newline through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve no final newline through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve trailing blanks without final newline through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve following heading stays outside the list through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: exact bytes preserve plain CRLF star subtree before a following heading through main and note-edit`
  RED: main leaves the original bytes, records no update/completion; API admission and author return unreadable-timeline instead of the exact append.
- `C05 timeline list: 5: preseeded Bower star line completes once and replay keeps exact bytes`
  RED: star fixture has no completion; API returns unreadable-timeline instead of unchanged. Dash control, exact unchanged bytes and replay checks pass.

## Compatibility

| Behavior | Evidence at HEAD |
| --- | --- |
| Existing assertions | All 44 original test cases pass; no assertions removed or relaxed. |
| Consent, sourced line, modifiedTime, record-id completion | Existing tests preserved; new controls and replay use the same production path. |
| Personal prose | Packet item 3 passes: unchanged bytes, unreadable row and zero completions with a line offered. |
| Existing Bower-owned append | Existing positive control passes before each new case. |
| Existing Bower-shaped dash line | Older-date preseed completes once; API reports unchanged; replay is byte-identical. |
| Dated-colon and plain lists | New reds demonstrate current grammar admission rejects opaque person wording. |
| Star marker | Red pins marker preservation, re-parse support and already-present detection. |
| Nested items and mixed markers | Exact oracle appends at top level after the whole final subtree, using the last top-level marker. |
| CRLF, Unicode, trailing blanks, final newline | Exact API and main byte oracles preserve every existing byte and final-newline state. |
| Following heading | Exact oracles put the line before the next section, including a plain CRLF star subtree. |

## Changed tests

tests changed: runner/test/c05-person-notes.test.ts: row 8 replaces `* September: planted garlic.` with real prose `September: planted garlic.`; the packet makes star lists appendable. Every assertion is preserved.
removed: none

## Verification

Only the touched test file was run, with `--maxWorkers=2`. Final command:

```sh
pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2 > tmp-logs/c05-timeline-list-red.log 2>&1
```

| Check | Result | Log |
| --- | --- | --- |
| Touched runner test file | Expected red: 14 fail, 46 pass | `tmp-logs/c05-timeline-list-red.log` |
| `pnpm exec tsc -p tsconfig.app.json --noEmit` | PASS | `tmp-logs/c05-timeline-list-tsc-app.log` |
| `pnpm exec tsc -p tsconfig.node.json --noEmit` | PASS | `tmp-logs/c05-timeline-list-tsc-node.log` |
| `pnpm -C runner exec tsc --noEmit` | PASS | `tmp-logs/c05-timeline-list-tsc-runner.log` |
| `pnpm -C runner exec eslint test/c05-person-notes.test.ts` | PASS | `tmp-logs/c05-timeline-list-eslint.log` |
| `git diff --check` | PASS | Read-only check |

Only failures and exit statuses were inspected. Typecheck and lint logs are empty on success.

Left out: implementation, full pnpm check and e2e belong to the later implementation session. No commits were made; keep the tests and these notes in separate coordinator commits as the packet requires.


## Implementation

Status: **blocked by a committed assertion that contradicts the packet**. No network or git writes. Production changes are left in the worktree for review; no tests were changed in this session.

The initial exact-name run reproduced 14 assertion failures and 2 passes. After the fix, all 16 `C05 timeline list:` cases pass. The C05 app tests and the complete `src/data` suite pass. App, node and runner TypeScript checks and ESLint on the three touched production files pass.

The full runner suite has **547 passes and 1 failure**. `C05 person notes: round 3 1: unreadable Timeline settles and reports without a model line` still constructs `* September: planted garlic.` at `runner/test/c05-person-notes.test.ts:578`, then expects UNREADABLE at line 586. The packet makes that star list appendable, so the no-line reply produces NOTHING_FOUND_WHY. This is a second copy of the old fixture; the committed red session replaced only the row-8 copy at line 221. No production special case can honestly preserve that assertion alongside the ruling. Per the owner's explicit instruction, implementation stopped when this conflict was found. The lead must correct the conflicting test before the entry can be delivered green.

### Mechanism

`timelineAppendability` replaces the content-format refusal in note-edit. Both `personalTimelineRefusal` and `appendLines` call it. It returns a refusal or the original-text insertion offset, bounded section end and last top-level marker. It admits opaque dash/star item wording, blank lines and indented subtrees, stops before a following heading, and inserts after the last nonblank subtree line. The existing empty-Timeline behavior remains. All original bytes, trailing blanks and final-newline state are retained; UTF-8 ownership spans still convert to original-text offsets before splicing.

`timeline-line.ts` remains the only Bower-line grammar and writer. Its reader accepts dash/star, and its writer accepts an optional typed marker with the historical dash default. note-format extracts both markers for display and re-parse. There is no colon-date parser. Consent, sourced-line bounds, modifiedTime checks and durable record-id completion are unchanged. Existing text-plus-source identity now recognizes stored Bower-shaped star lines.

Source: [CommonMark 0.31.2 list items](https://spec.commonmark.org/0.31.2/#list-items), the packet's offline reference for bullet markers, nesting and blanks. No online document was fetched. Placement reuses note-edit's existing line-offset and byte-splice mechanism, already derived from the original app.

removed: note-edit.ts: timelineRefusal's per-line parseTimelineLine admission requirement and its two call sites.
removed: timeline-line.ts: dash-only stored-line pattern and fixed dash writer prefix.
removed: note-format.ts: dash-only Timeline bullet filters.
tests changed: none

### Compatibility row drafts

| Behavior | Implementation evidence | Draft result |
| --- | --- | --- |
| Dated-colon list with no offered line | Exact-name runner-main red 1 passes | Nothing-found row, unchanged bytes, zero completions. |
| Plain list, with and without front matter | Exact-name runner-main red 2 cases pass | One append, updated report, archived request, durable completion and replay. |
| Personal prose | Exact-name runner-main red 3 passes | Unreadable row, unchanged bytes and zero completions. |
| Personal and Bower-owned controls | Exact-name runner-main red 4 and paired controls pass | Existing author behavior retained. |
| Star marker and mixed top-level markers | Exact-name runner-main red 5 cases pass | Writer uses the last top-level marker; re-parse retains both. |
| Nested subtree and trailing blanks | Exact-name main/API byte fixtures pass | Appends at top level after the subtree, before trailing blanks. |
| CRLF, Unicode and final-newline state | Exact-name main/API byte fixtures pass | Original bytes and ending state preserved. |
| Following heading | Both exact-name main/API fixtures pass | Added line precedes the next section. |
| Stored Bower-shaped star line | Exact-name preseed/replay case passes | Text-plus-source identity prevents duplication; record completion persists. |
| Consent and modifiedTime checks | C05 app tests and full data suite pass | Existing bounds and write rechecks retained. |
| Older unreadable-list assertion | Runner round-3 fixture at line 578 fails | Contradicts the ruling; requires lead-owned test correction. |

### Implementation checks

All command output is under `tmp-logs/`; only failure details and command status were inspected.

| Check | Result | Log |
| --- | --- | --- |
| Exact `C05 timeline list:` reds before fix, maxWorkers=2 | Expected red: 14 fail, 2 pass | `c05-timeline-list-implementation-red.log` |
| Exact `C05 timeline list:` after fix, maxWorkers=2 | PASS: 16 cases | `c05-timeline-list-reds-green.log` |
| C05 app contracts, reports and tidy tests, maxWorkers=2 | PASS | `c05-timeline-list-app.log` |
| Full src/data suite, maxWorkers=2 | PASS | `c05-timeline-list-data.log` |
| Full runner suite including C05, maxWorkers=2 | FAIL: conflicting fixture, 547 pass | `c05-timeline-list-runner.log` |
| App tsc | PASS | `c05-timeline-list-implementation-tsc-app.log` |
| Node tsc | PASS | `c05-timeline-list-implementation-tsc-node.log` |
| Runner tsc | PASS | `c05-timeline-list-implementation-tsc-runner.log` |
| ESLint on touched production files | PASS | `c05-timeline-list-implementation-eslint.log` |
| pnpm check through its heavy-run lock | Started before the contradiction surfaced; status below | `c05-timeline-list-check.log` |
| Demo/fake C05, capabilities and app e2e | Not started: owner instructed stop on contradictory red | None |

No commits were made. The coordinator must keep production changes and these implementation notes in separate commits.


Final gate status: `pnpm check` exited 1 during the app unit suite: 5,485 passed, one failed, one unhandled error. `src/e2e-port.test.ts:37` timed out after `listen EPERM: operation not permitted 127.0.0.1`; the sandbox forbids the local listener. This gate failure is separate from the conflicting runner assertion. No tests or sandbox settings were changed and no gate was rerun after the owner-mandated stop. The check did not reach its downstream API/runner/build gates. The separately requested data/runner suites and three tsc checks have the results above.

## Red repair

tests changed: runner/test/c05-person-notes.test.ts: round 3 unreadable Timeline fixture at line 578 now uses real prose `September: planted garlic.`; preserves the UNREADABLE row and no-model-line assertions under the bullet-list ruling.

Verification: `pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2` passed: 60/60 tests, exit 0. Log: `tmp-logs/c05-timeline-list-red-repair.log`. Read-only `git diff --check` passed. No production files or assertions changed; no network or git writes.
