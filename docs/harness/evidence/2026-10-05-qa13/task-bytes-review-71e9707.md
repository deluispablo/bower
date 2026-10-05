# Independent task-source-byte review

Session/entry: `task-preserves-source-bytes`; adopted revision `2026-10-05-contracts-2`, P2/C03,C14.

Exact immutable range: `7f49572e4412f3a379f0166717d46f4fed8c7e68..71e97077a353aed92a2e0cafe017aad00dfadc25`. Clean frozen worker `/private/tmp/bower-p2-journal-ack`, `codex/p2-task-bytes` per packet. Only `src/data/vault/note-format.ts` and `note-format.test.ts` changed. Read-only diff/source/caller/supplied-log inspection; no reviewer tests/build/install/browser/provider execution, repository/shared-record edits or delegation.

## Verdict

**No correctness findings in the reviewed candidate.** The selected personal checkbox changes in original source while all other supported source characters/encoded fixture bytes remain exact. Supplied genuine assertion red/green evidence targets the original CRLF normalization defect. Suitable for serial coordinator integration/proof within this entry; no ownership grammar, richer protected-content capability, provider atomicity or full C03/C14 acceptance is certified.

## Offset and mutation assessment

`src/data/vault/note-format.ts:185–206` retains the normalized text solely for the existing split/body boundary and task matching. It increments the task counter only on TASK_LINE matches inside the canonical personal body. It maintains a normalized offset by adding each line's UTF-16 length plus its newline; the matched prefix length identifies the single space/x inside the selected checkbox.

The raw mapping (`198–201`) walks source UTF-16 units from the beginning. For every normalized unit it advances one raw unit, except that raw CR followed by LF advances two. This matches exactly the existing global CRLF-to-LF transformation. LF stays one; mixed LF/CRLF works without assuming a single ending convention. JavaScript string indexing, length and slicing all count UTF-16 units, so surrogate pairs/combining marks before a later checkbox do not introduce a code-point/code-unit mismatch.

The returned string (`202`) slices the original raw input around exactly one UTF-16 unit and replaces that ASCII checkbox with x/space. It no longer reconstructs normalized prefix/body/suffix or runs the serializer. List indentation, marker, spacing, label bytes, prose checkboxes, source line endings and final-newline presence are preserved. First/second/third task positions use the existing ordinal task identity rather than searching the label, so identical labels do not select the wrong checkbox. Toggle back restores the original source exactly for the tested fixtures.

Missing/negative indices still throw the existing not-found BowerError. An empty selected label still refuses rather than silently changing source, matching prior behavior. TASK_LINE and screen LIST_MARK/TASK_BOX definitions are unchanged (`src/data/tasks.ts:6–9`; `src/features/note/markdown.tsx:65–78`). Existing numbered and indented task behavior remains covered. No public return shape or task-index convention changed.

## Ownership and caller compatibility

`split`, `parseNote`, `serializeNote`, frontmatter/Current state/Timeline/Bower's note grammar and public Note types are untouched. The mutation respects the existing split's bodyStart/bodyEnd; canonical contiguous Current state bullets and trailing Timeline/Bower sections are never rebuilt or normalized on write. A no-frontmatter note remains all personal body. This fixes supported source-byte preservation, **not** the separately blocked ambiguity of rich protected paragraphs versus canonical unheaded personal prose/tasks.

`DriveVault.toggleTask` remains unchanged (`src/data/vault/drive-vault.ts:304–319`): reads original text, calls this helper, writes with the cached modifiedTime, retains conflict/refetch behavior, updates its parsed cache and journals the selected task's label/done. No new source writes, journal schema, error swallowing or hard deletion. Existing real Drive precondition atomicity remains unproven; this pure mapping does not strengthen it.

## Named proof and honesty

Exact verify: `pnpm vitest run src/data/vault/note-format.test.ts -t "toggling a personal task preserves every other source byte"`.

The six parametrized cases at `note-format.test.ts:45–68` are exact **`toggling a personal task preserves every other source byte (LF|CRLF|mixed, protected|plain)`**. Each independently toggles all three task positions, checks the complete string plus TextEncoder output against a fixture-derived independent expected single-checkbox replacement, checks label/done, and toggles back. Fixtures include tabs, numbered lists, trailing spaces, accented/Japanese text, astral Unicode and combining characters before later task positions; protected prefix/suffix and a plain BOM/no-final-newline note are retained.

Additional actual named assertions:

- `toggling a personal task preserves every other source byte (missing task is refused)` — negative/past-end indices across all fixtures.
- `toggling a personal task preserves every other source byte (protected checkboxes are refused)` — canonical protected-only note offers no personal checkbox.
- `toggling a personal task preserves every other source byte (identical labels select the requested checkbox)` — second repeated label changes; first/prefix/suffix remain exact; toggle back restores source.

The new expected values are generated from original raw fixture lines, not the implementation's normalized-offset traversal. They expose the original defect rather than merely mirroring it. Existing assertions remain, including `round-trips every demo note`, `a note with no frontmatter is all body`, `toggleTaskInText flips only the n-th body task and returns its label`, `toggleTaskInText ignores tasks in Current state and Timeline`, `a task index past the end is refused`, and `ticks a task in a numbered list, as the screen counts it`.

| Supplied evidence | Observed result |
| --- | --- |
| `/private/tmp/bower-task-bytes-red.log` | Genuine five assertion failures/four passes against base;11 other tests excluded by named filter. Both CRLF cases, both mixed cases and repeated-label CRLF case differ because source endings normalized. LF and refusal controls pass. |
| `/private/tmp/bower-task-bytes-green.log` | All nine named cases pass;11 existing cases excluded only by targeted filter. |
| `/private/tmp/bower-task-bytes-check.log` | Complete check succeeds:51 files/448 tests, lint/typecheck/build/harness/bundle/landing. Existing lint/chunk-size warnings and intentional fault logging remain. |

These executions are supplied implementer/coordinator proof, not reviewer reproduction. Git whitespace diff is clean. The earlier coordinator canonical CRLF reproduction is separate from these new actual assertion reds.

## Limits

Evidence covers decoded JavaScript text and its UTF-8 TextEncoder fixture bytes, not arbitrary invalid file encodings or provider-transcoded byte streams. Lone-CR line separation, noncanonical rich ownership syntax, arbitrary Markdown task detection, malformed frontmatter, and newly generated content permissions are not expanded by this change. BOM is tested on a plain note; BOM-prefixed frontmatter recognition remains existing grammar. No new browser UI journey or independent provider write race was executed by the reviewer. Protected-current-prose remains pending a lead ownership decision; this byte fix must not be relabeled as its resolution. Later source changes require renewed immutable review. Integration/closure and shared evidence records remain coordinator-owned.
