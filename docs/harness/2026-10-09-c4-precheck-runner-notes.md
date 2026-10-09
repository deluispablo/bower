# c4-precheck-runner

Implemented the packet's runner classification ruling with one helper,
`withoutTestNames`. It replaces quoted values of `-t`, `-g`, `--grep` and
`--testNamePattern` with empty quoted arguments before command inspection.
It handles space and equals separators, single and double quotes, and escaped
characters. Keeping the option and its empty argument preserves the existing
file/config/project parser's option consumption. Pattern extraction still reads
the original command and returns the original test name.

The standard approach here is to remove option data before interpreting command
words, using JavaScript's built-in replacement and the existing tokenizer.
Local sources inspected: `scripts/harness-rules.mjs:52` (pattern extraction),
`:80` (quoted command tokenizer), and `:86` (options that consume a value).
No dependency or second runner detector was added. No network was available.

## Sites checked

- `scripts/harness-rules.mjs:45`: the single quoted-name stripping helper.
- `scripts/harness-rules.mjs:48`: `isE2e` now inspects stripped command text.
- `scripts/harness-rules.mjs:54`: package classification now inspects stripped text.
- `scripts/harness-rules.mjs:55`: `patterns` delegates runner detection to `isE2e`;
  existing `-g`/`--grep` classification is preserved.
- `scripts/harness-rules.mjs:80`: `selectedTests` tokenizes stripped text before
  looking for the runner at `:81-82` (packet's original `:78` site).
- `scripts/harness-rules.mjs:159`: `problems` inspects stripped text when deciding
  whether a verify names a runner (packet's original `:156` site).
- `scripts/harness-rules.mjs:161`: delegates to the corrected `patterns`.
- `scripts/precheck-verify.mjs:26`: delegates runner classification to `patterns`;
  no separate detector and no change needed.
- `scripts/e2e-both.sh:8-9`: executes playwright directly; does not classify verify text.

Searched scripts and harness shell/JavaScript files for runner detection and
`patterns` calls; no additional verify-text classification site was found.

## Tests and evidence

tests changed: src/harness.test.ts: added the two packet tests and imported patterns; existing tests unchanged.

Added exactly these test names:

- `a test name that mentions e2e does not make a vitest verify an e2e one`
- `a playwright verify is still e2e`

The guard covers playwright, `e2e-both.sh`, and `pnpm e2e:fake` commands.
No `.only` or `.skip` was added.

- Red: targeted run of both named tests, `/tmp/precheck-red.log`, exit 1.
  First test failed on an assertion: expected `unit`, received `e2e`.
  Guard passed. Other tests were unselected by the command's name filter.
- Green: `pnpm vitest run src/harness.test.ts`, `/tmp/precheck-green.log`, exit 0;
  all 47 tests passed, including both exact named tests.
- Precheck: `node scripts/precheck-verify.mjs`, `/tmp/precheck-verify.log`, exit 1.
  Failed while collecting api tests: ENOENT for temporary `names.json`.
  It did not reach the verify-name assertions.
- Retried precheck with `TMPDIR=/private/tmp`,
  `/tmp/precheck-verify-private-tmp.log`, exit 1; same missing api names report.
- ESLint: `pnpm exec eslint --no-ignore scripts/harness-rules.mjs src/harness.test.ts`,
  `/tmp/precheck-eslint.log`, exit 0, no warnings or errors. `--no-ignore` ensures
  the script is checked despite its normal ignore rule.
- `git diff --check` passed.

## Handoff

Precheck collection remains blocked; no unrelated collector fix was attempted.
The coordinator runs `pnpm check` and e2e under the lock and makes the three
commits: test changes, script fix, then this notes file. No git write command,
`pnpm check`, or separate e2e gate was run in this session.
