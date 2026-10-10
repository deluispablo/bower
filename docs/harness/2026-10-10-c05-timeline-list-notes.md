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
