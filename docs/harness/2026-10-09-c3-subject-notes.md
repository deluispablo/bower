# c3-subject: implementer notes (2026-10-09)

Branch `c3-subject` from `claude/p3` e48bd296. Red 856cde1e (tests only), fix dc49bbd3.

## What changed

- `src/data/contracts/questions.ts` (new): the one home of a question's subject.
  - `Subject`: a discriminated union `inbox` (pile or thing id, with hash) | `state` (note file id, mark) | `folder`.
    `questions.json` does not say whether an id is a pile's or a thing's, and the planner holds a pile and its things
    as one subject, so they share the `inbox` kind.
  - `subjectOf`, `subjectKey` (the one key), `subjectLeft`, `openQuestions` (the one open-questions function),
    `askId`, `stateQuestionId`, `reportRowOf`, `ReportQuestion` (a `Pick` of `Question`).
- Reader: `DriveVault.questions()` and `answer-loop.ts` use `openQuestions` and `subjectOf`.
- Planner: `scripted.ts` uses `subjectKey`, `subjectLeft` and `openQuestions`. The local `askId`, `STATE_Q` and
  `subjectOf` are gone. `runner/src/claude.ts` drops its `STATE_Q` and prefix parsing.
- One question type: `ReportQuestion` and `CorpusQuestion` are now `Pick<Question, ...>`. `TakenAnswer.question` is a
  `Pick` too.
- P4-17: the questions write now also waits on the Bin of each saved copy whose question it closes (matched by subject
  id, the pile's id or the content hash). When that Bin is refused, the write is rejected and the question stays open.
- P4-15b: an answer that nothing else settles is matched by its question's `subject`, read from `questions.json`. It
  settles when the run took that subject, or when that subject left the inbox. The list is read for this only in a
  model's `all` run that has such an answer waiting. Before, the match used the answer's id prefix.
- `planScripted` reads the inbox (`drive.piles`) earlier, before the settle step. The number of calls is the same, and
  so are the goldens.

## Verify (exact)

- App: "one key and one open-questions function serve the reader and the planner" (new,
  `src/data/one-question-key.test.ts`) and "old questions without a subject still read" (new, `compat-p2.test.ts`).
  The second test passed before the fix. It is a compatibility guard, not a red.
- Runner: "a refused Bin keeps its question open" and "an answer whose subject left is settled" (both new),
  "a binned duplicate's open question closes" (existing).
- Name difference: the packet says "leaving the inbox closes its question". The existing test is named
  "a thing that leaves the inbox closes its question" (`runner/test/ask-one-per-thing.test.ts`), so the verify
  regex must use that name.

## Compatibility rows (commits under src/data/contracts)

| Wire or file | Before | After |
|---|---|---|
| `.bower/questions.json` | `Question` with optional subject, hash and state | unchanged; same validator (`layout.ts`) |
| p2 questions (`q1`, no subject) | read and stay open | read, stay open (`folder` subject); tested |
| older `q-ask-<id>` with no subject | subject taken from the id | the same, now only inside `subjectOf` |
| run report `questions` rows | `{id,text,yes,no,about?,askedAt}` | the same fields, in the same order (`reportRowOf`) |
| corpus `questions` | `CorpusQuestion` interface | `Pick<Question,...>`, the same fields |

## Gates

- `pnpm check`: pass (log /tmp/c3s/check2.log). The 23 lint warnings are in files this change does not touch.
- Verify: pass (/tmp/c3s/verify.log).
- No fixture changed and no screen was touched, so `pnpm e2e:fake` was not run.

## Left out

- The reader passes no content hashes to `openQuestions`, as before. A re-upload that has not been tidied yet hides its
  question until a run moves it to the new file.
- An answer whose question was already closed in an earlier run stays pending, as it did before.
- Duplicate copies of `KEEP_ONE` in `answer-loop.ts` and `claude.ts` are out of scope (pair-ask).

## Sources

- TypeScript handbook, discriminated unions:
  https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

## Fix round (P4-43 minors; TL-P4-17 addendum 4), 2026-10-09

Merge of `claude/p3`: 33963342 (no conflict). Red 7a7895ed (tests only), fix 0378e601.

- The rule "only `contracts/questions.ts` builds or reads a `q-ask-`/`q-state-` id" moved out of vitest into ESLint:
  `scripts/eslint-question-key.mjs` (`no-restricted-syntax`, allowlist: the home alone). It targets the key's
  construction: the prefix in any string or template piece, a bare `q`/`q-` piece, and a template that starts `q-`
  followed by a constant or a literal. Other question ids (`q-${rule.id}-…`, `q-adopt-states`) stay allowed.
- `scripts/eslint-syntax.mjs` joins it with the reservation rule. ESLint keeps only the last options a file gets for
  one rule, so two `no-restricted-syntax` blocks would silence each other; each allowed file gets the other rules'
  selectors. The app's, the Worker's and the runner's configs use `syntaxConfig(pkg)`.
- `src/data/one-question-key.test.ts` is now a fixture test of the configs ESLint runs (app and runner), never a repo
  scan; it proves a copy built from other constants (`const Q = 'q-'`, `'q' + '-' + KIND`, `` `q-${KIND}-` ``) is found,
  that the home is allowed, and that the reservation rule still holds in the home and this rule in `write-once.ts`.
  Same verify name: "one key and one open-questions function serve the reader and the planner".
- The repo-scan checks of imports of `contracts/questions` and `openQuestions(` calls were removed (no repo scan in
  vitest); the key rule and the reader's and planner's behaviour tests cover them.
- `scripted.ts`: the saved-Bin match is `related(subjectKey(q), s.file.id) || sameContent(q, { hash })`. It now also
  skips the empty file's hash and a question whose subject is still in the inbox, as `sameContent` does elsewhere.

Gates: `pnpm check` pass (/tmp/c3s-check.log); verify app /tmp/c3s-verify-app.log, runner /tmp/c3s-verify-runner.log.

Left out: a template that starts `q-` followed by a member expression (`q-${K.ask}-`) has the disagreement ids' shape
and is not caught; nor is a prefix computed at run time.

Sources: ESLint no-restricted-syntax, https://eslint.org/docs/latest/rules/no-restricted-syntax ; flat config rule
merging, https://eslint.org/docs/latest/use/configure/configuration-files#cascading-configuration-objects
