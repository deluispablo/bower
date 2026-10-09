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

## Fix round (P4-44 BLOCK; TL-P4-14 addendum 22)

Merge `6d56157b` (claude/p3; one conflict in the compatibility list, both rows kept). Red `358476d4`, fix `8dd8a5dc`.

- **Two state bounds.** `note-edit.ts` names `STATE_WRITE` (8 x 200, what Bower writes; the reply check and prompt
  import it) and `STATE_READ` (20 x 400, what Bower reads: `previous`, what an undo writes back, every stored manifest).
  `stateLinesOk` judges both `previous` and `lines` by the read bound, since an undo swaps them. Back to the pre-entry
  behaviour: the planner rewrites a 9-20 line state again, and stored v2 manifests over 8 x 200 parse.
  Red: "a stored v2 manifest over the write bound still parses" (note-edit.test.ts; 20x400 previous, 20x400 lines,
  9x201 both admitted; 21 lines or 401 characters refused as shape).
- **`--json-schema` off.** `claudeArgs` passes no schema; `REPLY_JSON_SCHEMA` and the `structured_output` branch of
  `replyOf` are gone, so every refusal kind is retried by Bower as before (I1 resolved). The zod declaration stays.
  Red in "every validation refusal is retried once with its reason": no `--json-schema` in any call, and a
  `structured_output` beside a bad result is not taken (refused `notJson`, asked again).
- **Typed path.** `run-manifest.ts` exports `RunnerWrite` (the three-path union that was the effect's type before the
  entry); `Effect.path`, `parseRunManifest(V2)`'s `writes` and `admit` use it; `layout.ts` declares `RUNNER_WRITES`
  `as const satisfies readonly RunnerWrite[]` with a type-only import (layout already imports contracts). The contracts
  cannot import layout (architecture.test.ts), so the union is the type and `RUNNER_WRITES` the value. The contract
  test now marks the suggestions list `@ts-expect-error`.
- **RUNNER_WRITES on the provider run (TL-P4-17).** The test runs `claudeProvider` on the recorded reply with
  suggestions, last-run, requests and hashes in `.bower`; its own writes are all on the list; each of the five files,
  added as a correctly hashed write, is judged alike by `outsideAdmitted` and `parseRunManifestV2` (three admitted, two
  refused). This test passed at red (the lists already agreed); it is the entry-point strengthening, not a red.
- Production for the whole entry (claude/p3..fix, no tests or lockfile): +288 / -168, net +120: claude.ts +97,
  run-manifest.ts +9, layout.ts +8, note-edit.ts +5, engine.ts +1, runner/package.json +1, admitted.ts -1.
- Logs: red `/tmp/c3-rs-r2-red-runner.log`, `/tmp/c3-rs-r2-red-contracts.log`; verify `/tmp/c3-rs-r2-v1.log`,
  `/tmp/c3-rs-r2-v2.log`; check `/tmp/c3-rs-r2-check2.log`.
