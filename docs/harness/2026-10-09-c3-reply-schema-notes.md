# c3-reply-schema: implementer notes

Branch `c3-reply-schema` from `claude/p3` f20c4d3c. Commits: red `592b1b41`, fix `0b32ddce`, then these notes.

## What changed

- **Limits (state-line-limits-disagree).** `src/data/contracts/note-edit.ts` holds `STATE_LINES_MAX = 8`, `STATE_LINE_MAX = 200`.
  `runner/src/claude.ts` drops `AUTHORED.stateLines`, checks state lines with the imported values and prints them in the
  prompt (same text as before, numbers unchanged). `REFUSALS.stateText` is built from `STATE_LINES_MAX` (same words).
- **Writable list (runner-paths-disagree).** `src/data/vault/layout.ts` exports `RUNNER_WRITES` (questions, requests, hashes).
  `parseRunManifest` and `parseRunManifestV2` take it as a third parameter; every caller passes it (engine.ts, records.ts x2,
  scripted.ts x2, claude.ts, the contract tests). `runner/src/spine/admitted.ts` judges `write-runner-json` by it;
  suggestions and last-run left the list.
  - Checked first: `last-run.json` and `suggestions.json` are written by `src/data/spine/barrier.ts` (`REPORT_FILES`, then
    `last-run.json`) after the run, never as a manifest operation, so `outsideAdmitted` never saw them. Removal is safe.
  - `src/architecture.test.ts` forbids contracts importing outside `src/data/contracts` (type imports too), so
    `run-manifest.ts` does not import `RUNNER_WRITES`; the `write-runner-json` path type is `string`, judged by the list
    the reader is given (refused as `shape`, right after the shape guard, the same place and reason as before).
- **Schema.** zod 4.6.5 (already in the lockfile through other packages) added to `runner/package.json` only.
  `replySchema` in `claude.ts` declares the reply: an envelope (`notIntent`) piped into the body; each part is a strict
  object whose field issues are named by their refusal kind, then its rules in today's order (`rule(kind, ok)`, run by
  `inOrder`, first broken one only). An issue's message is its kind, `params.why` the closer wording. `intentOf` keeps its
  signature and returns the first issue's kind and reason; `REFUSALS` unchanged, `per-thing-ask.test.ts` still covers
  exactly its keys. `exactly()` and `authoredOf()` are gone.
- **CLI.** `claude -p` takes `--json-schema` (cli-reference; `claude --help` on this machine lists it). `claudeArgs`
  passes `REPLY_JSON_SCHEMA` (`z.toJSONSchema(..., { target: 'draft-7' })`, 2.9 KB, since the SDK validates draft-07);
  `replyOf` reads `structured_output` when present, else the `result` text as before.

## Sources

- zod 4: https://zod.dev , https://zod.dev/error-customization , https://zod.dev/api#refinements , https://zod.dev/json-schema
- Claude Code CLI `--json-schema`: https://code.claude.com/docs/en/cli-reference
- Structured outputs (`structured_output`, draft-07, `error_max_structured_output_retries`):
  https://code.claude.com/docs/en/agent-sdk/structured-outputs

## For the lead (not decided here)

- **Ordering with several faults.** One fault in a reply gives the same kind and words as before (every refusal kind is
  tested). With several faults, zod reports field type issues before a part's rules, unknown keys after the fields, the
  array limits (`tooManyLines`, state line count) after the elements, and `noNote` after asks and keep: the first kind
  can differ from the hand check's on such replies.
- **8 x 200 also bounds `previous`.** A person's Current state of 9 to 20 lines (or lines of 201 to 400 characters) is no
  longer rewritten (the planner logs the refusal and plans none, as it did past 20 x 400). A stored v2 manifest whose
  state-rewrite exceeds 8 x 200 no longer parses (undo or history reading it); only staging folders can hold one.
- **`--json-schema` on the live CLI** is untested here (no live call): with `--tools ""` the structured-output path should be
  confirmed on staging, and a run the CLI ends with `error_max_structured_output_retries` ends failed without our retry.
- Left out: `Rules.md` is still spelled in `admitted.ts` (RULES_PATH), `run-manifest.ts`, `grounded.ts` and `scripted.ts`.

## Gates

- Verify: the five named tests pass (logs `/tmp/c3-rs-v1.log`, `/tmp/c3-rs-v2.log`, `/tmp/c3-rs-v3.log`).
- Red logs: `/tmp/c3-rs-red-runner.log`, `/tmp/c3-rs-red-runner2.log`, `/tmp/c3-rs-red-contracts.log`.
- `pnpm check`: `/tmp/c3-rs-check3.log`. No e2e: no screen touched.
- Production diff (no tests, lockfile): +286 / -165; removed 165 lines (claude.ts -141).
