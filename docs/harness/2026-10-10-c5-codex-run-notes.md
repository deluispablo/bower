# c5-codex-run delivery

implementer: codex

Implemented TL-P4-31 ruling 4 in the assigned worktree. The coordinator commits the three file sets below.
No Git command changed this worktree's Git state. All test Git mutations happened in disposable repositories.
No network or real Codex process was used.

## What changed

- `src/codex-run.test.ts`: 47 cases through the real shell entry point and the scanner's pure function/CLI.
  Fixtures create a repository and a linked worktree, provide a fake `CODEX_BIN`, stub `pnpm` on PATH,
  acquire their own heavy-run lock, and remove their directories after each case. There are no timer waits.
- `harness/codex-run.sh`: validates the worktree, main-checkout identity, branch, initial cleanliness and options;
  runs the specified Codex command with the prompt on stdin; preserves JSON and stderr logs; extracts the
  last completed turn's usage and last agent message; appends the usage row outside the delivery tree.
  Defaults are implementer, workspace-write, medium effort and attempt 1. Model is `unknown` if no stream
  event reports it. Input includes cached input; tokens is input plus output; cached input goes in cache_read.
- Workspace-write deliveries use an alternate index to snapshot and scan all changed paths. The complete
  plan is checked for missing, unchanged, duplicate and invalid paths before creating any commit objects.
  Ordered trees come from that scanned snapshot. Each message ends with `implementer: codex`.
  One expected-old-value ref update publishes the completed chain; the real index then takes its final tree.
  A missing plan gives one delivery commit; an empty delivery makes no empty commit.
  The plan remains outside the commits, including when a previous plan was already tracked.
- `scripts/scan-staged.mjs`: the single scanner for guarded paths and added diff lines, exported as
  `scanStaged(paths, diff)` and available as a staged-diff CLI. It covers the packet's private-key, token,
  client-secret, service-origin and address families. Removed lines and diff headers are excluded; content
  beginning with additional plus signs still gets scanned. Diagnostics name the kind of finding, without
  reproducing secret or address bytes. The CLI disables external diff and text-conversion helpers.
- Accepted deliveries run `bash harness/with-lock.sh pnpm check` in their worktree. Optional e2e runs both
  sources, even if the first source fails. E2e argument quoting is parsed without shell execution.
  Each gate keeps its output in a log; only its exit status and last summary line enter the result.
  Read-only deliveries stop after usage/card recording. Failed Codex processes never reach commits/gates.
- Results contain status, branch, commit ids, usage, gate outcomes, log paths and the card. Result-directory
  overrides inside the main checkout or delivery tree are refused before writing there; their refusal
  result uses the standard temporary result directory. Symlink aliases are resolved for checkout checks.
- `harness/README.md`: one line documenting the runner.

## Research

Research came first and stayed offline. Installed Git manuals for commit-tree, update-ref and diff were read;
the captured manuals are `/tmp/c5-commit-tree-man.log`, `/tmp/c5-update-ref-man.log` and `/tmp/c5-diff-man.log`.

- [Git commit-tree](https://git-scm.com/docs/git-commit-tree): construct commits from an explicit tree, parent
  and stdin message. This avoids publishing half of a multi-commit delivery if a later item fails.
- [Git update-ref](https://git-scm.com/docs/git-update-ref): pass the expected old object id when publishing
  the final branch tip, so a concurrent branch update cannot silently be overwritten.
- [Git diff](https://git-scm.com/docs/git-diff): use NUL-separated names, disable rename detection, and scan
  zero-context staged additions. The private index preserves the delivery until every refusal check passes.
- [Gitleaks rule configuration](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml): reference
  for explicit private-key and token-prefix pattern families. The packet supplies this scanner's required
  families and address exceptions. This remote reference was not fetched during the no-network session.

## Red evidence

`/tmp/c5-red.log` records assertion failures before the runner/scanner existed, including all exact verify names:

- `refuses the main checkout, a codex branch and a dirty tree`: expected exit 2, received 127.
- `commits a two-commit plan in order with implementer: codex`: expected exit 0, received 127.
- `refuses guarded paths, secrets and addresses`: expected exit 3, received 127.

Additional tests preceded their fixes: `/tmp/c5-edge-red.log` records unsafe result-directory acceptance
(exit 0 instead of 2) and the missed PGP private-key block (zero findings). `/tmp/c5-plan-red.log` records
the tracked-plan exclusion case (exit 3 instead of 0). No assertion or contract bound was weakened.
The fixture temp path was canonicalized to account for the platform's temporary-directory symlink.
No existing test file changed.

## Green and logs

- `pnpm exec vitest run src/codex-run.test.ts`: exit 0, all 47 cases pass; `/tmp/c5-unit.log`.
- `pnpm exec tsc -p tsconfig.app.json`: exit 0; `/tmp/c5-tsc.log`.
- `pnpm exec eslint src/codex-run.test.ts scripts/scan-staged.mjs`: exit 0; `/tmp/c5-eslint.log`.
  The repository ESLint config excludes scripts and reports one ignored-file warning for the scanner.
- A separate ESLint run with no config lookup, no ignores, no-unused-vars and no-undef rules, and the Node
  process/console globals also exits 0 for the scanner; `/tmp/c5-scanner-eslint.log`.
- Shell parsing and scanner syntax checks exited 0; `/tmp/c5-shell.log`, `/tmp/c5-syntax.log`.
- Read-only `git diff --check` passed. The required unit verify includes all three named tests above.
- `pnpm check` and real e2e were not run, per the assignment. The coordinator runs the integration gate
  under the lock. Tests exercise check/e2e exits, both sources, arguments and the lock with synthetic stubs.

## Commit file sets

1. Red: `src/codex-run.test.ts`.
2. Fix: `harness/codex-run.sh`, `scripts/scan-staged.mjs`, `harness/README.md`.
3. Notes: `docs/harness/2026-10-10-c5-codex-run-notes.md`.

removed: none

Left out: real Codex execution, network access, integration gates and commits in this worktree, as assigned.
