# Packet: c3-reply-schema (stage 3)

- **Entry:** `c3-reply-schema`. Rulings: the TL-P4-14 stage 3 row and addendum 20 (DECISIONS, main debd33f6). Defects: `state-line-limits-disagree`, `runner-paths-disagree`. Worktree `/private/tmp/bower-c3-rs`, branch `c3-reply-schema` from `claude/p3`.
- **Starting model:** `bower-escalated` (it touches the contract).

## Today (coordinator mapping, claude/p3)

- **Reply checks.** `runner/src/claude.ts` holds the 37 `REFUSALS` (:562-605) and `intentOf` (:760-892), a hand-written closed-keys check through `exactly()`. `replyOf` is at :945-964 and the retry loop at :1068-1092.
- **Limits.** `AUTHORED` at :156 holds `stateLines: 8`, bare `lines: 20` and `summary: 200`. `note-edit.ts:88-89` says `STATE_LINES_MAX = 20` and `STATE_LINE_MAX = 400`; `:288` has `AUTHORED_LINE_MAX = 200`. The prompt prints the limits at :243-267.
- **Writable lists.**
  - `run-manifest.ts:191` `runnerPaths` lists questions, requests and hashes (the type at :36, `.bower` at :482, `Rules.md` at :488).
  - `runner/src/spine/admitted.ts:127` adds suggestions and last-run, and spells `RULES_PATH` again at :29.
  - `src/data/vault/layout.ts:21-34` has `SYSTEM`.

## Contract (addendum 20)

1. **Limits.** `note-edit.ts` is the one home, set to 8 × 200 for state lines. `claude.ts` imports the values and drops its own copy, and the prompt prints the imported values.
2. **Writable list.** `layout.ts` exports `RUNNER_WRITES` (questions, requests, hashes), and `run-manifest.ts` and `admitted.ts` both import it. suggestions and last-run leave `admitted.ts`.
   - First check how the runner writes `last-run.json` and `suggestions.json` today. If either goes through the admitted check, stop and report, because removing it would break a run.
   - `parseRunManifestV2` takes the list as a parameter, and every caller passes it.
3. **Schema.** Adopt zod 4, in the runner only, as one declaration of the reply.
   - Each rule is a named issue whose id is its refusal kind. The retry text does not change; `per-thing-ask.test.ts:153` must still cover exactly the `REFUSALS` keys.
   - If the claude CLI takes an output JSON schema, generate it from the same declaration with `z.toJSONSchema`. Cite the CLI docs either way.
   - The dependency must pass `scripts/check-dependencies.mjs` and knip.
- **Unchanged otherwise:** behaviour, goldens, and the timing line. The card reports `removed: <lines>`. A compatibility row is needed for any commit under `src/data/contracts`.

## Red

- The two disagreements: the state limits, and a write that one list admits and the other refuses.
- A reply that passes one list and fails the other.

## Verify (exact, from features.json)

- `pnpm -C runner exec vitest run -t` with:
  - "every validation refusal is retried once with its reason"
  - "the reply schema takes its state limits from note-edit"
  - "a write the two runner lists judged differently is judged once by RUNNER_WRITES"
  - "a Claude reply that targets a thing not admitted is refused and writes nothing"
- `pnpm vitest run src/data/contracts -t "the manifest takes the runner-writable files as a parameter"`

Real entry point (TL-P4-17): the claude provider's run path, not `intentOf` alone. Then `pnpm check` must be green.

## Checklist

- Match by id.
- Every sentence is backed by a test.
- Commits: red, then fix, then notes in their own commit.
- Research first: cite the zod 4 docs (issues and `toJSONSchema`) and the Claude Code CLI output-format docs.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
