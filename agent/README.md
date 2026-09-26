# Agent

`run.sh`, prompts and workflows that the operator's private instance repo runs via GitHub Actions; see `ARCHITECTURE.md`.

## `run.sh`

```bash
agent/run.sh <vault_id> <ingest|lint>
```

One run over one vault:

1. `GET /runner/vaults/:id` for the folder id, a 1 h Drive token, `maxTurns` and the user's own API key (if any). A 409 `reauth` is reported as `failed`.
2. `rclone sync` the vault down (without `.obsidian/`), using a remote `vault` configured only through `RCLONE_CONFIG_VAULT_*` environment variables. No `rclone.conf`.
3. Refuses to run without `CLAUDE.md` at the top of the folder.
4. Lists pending files in `0-Inbox/` and `Clippings/` (not `0-Inbox/Processed/`, not the `_*.md` folder notes). An ingest with nothing pending reports `done` with `processed: []` and stops.
5. Reports `running`, then runs `claude -p` with `prompts/<mode>.md` inside the vault, with a fixed tool allowlist.
6. On success: `rclone copy` up (never deletes), then `rclone sync` of `0-Inbox/` and `Clippings/` only, so originals moved to `0-Inbox/Processed/` leave the inbox. Reports `done` with the pending list as `processed` and the agent's last five lines as `summary`.
7. On any failure: `rclone copy` up only (if the agent ran), reports `failed` with a short error naming the step, exits 2. Originals stay in the inbox.

Exit codes: `0` done, `2` failed.

The log has timestamps, step names and counts only. File names, paths inside the vault, the agent's output and credentials never reach it; they go only into the API payload. The agent's stdout stays in a temporary work dir that is removed at exit. The agent's stderr (`agent.err`) and rclone's output (`rclone.log`) go to `$RUNNER_TEMP/bower-logs/` when `RUNNER_TEMP` is set (so the workflow can keep them privately on failure), otherwise into the work dir.

### Environment

| Name | Required | Notes |
| --- | --- | --- |
| `BOWER_API_URL` | Yes | The Worker's origin, e.g. `https://api.example.com` |
| `BOWER_API_KEY` | Yes | The runner key, sent as `Authorization: Bearer` |
| `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | Yes, unless the user set their own key | When the API returns `apiKey`, it becomes `ANTHROPIC_API_KEY` for the run and `CLAUDE_CODE_OAUTH_TOKEN` is unset |
| `BOWER_MAX_TURNS` | No | Overrides the API's `maxTurns` |
| `RUNNER_TEMP` | No | Set by GitHub Actions; the work dir and logs go under it |
| `GITHUB_RUN_ID` | No | Set by GitHub Actions; used as `runId`, otherwise a random hex id |

Tools on `PATH`: `bash`, `curl`, `jq` (1.6 or later), `rclone`, `claude`. GitHub's `ubuntu-latest` has `bash`, `curl` and `jq`; the workflow installs the other two.

## Smoke test

```bash
pnpm -C agent test     # or: bash agent/test/smoke.sh
```

Hermetic: `rclone`, `claude` and `curl` are stubs that record their calls, so nothing reaches the network, Google or Claude. `jq` is the real one when installed; otherwise the test supplies a small Node stand-in. Scenarios: ingest happy path, empty inbox, agent failure, missing `CLAUDE.md`, user API key, Google reauth. Every scenario also checks that the script's own output names no file, summary or credential. It runs in root `pnpm test`, so CI runs it on every PR.

## Prompts and the rulebook

`prompts/ingest.md` and `prompts/lint.md` tell Claude only what the runner needs: which folders are inputs, what never gets touched (`.obsidian/`, deletions), where output goes, and the five-line summary contract `run.sh` reads with `tail -n 5` as `SUMMARY`. Everything else, how to file a note, tags, templates, self-learning, lives in the vault's own `CLAUDE.md` (`vault-template/CLAUDE.md`), which takes precedence and changes only through an instruction note (`Bower*.md`), never on the agent's own initiative. Keep the prompts short; a new capability is a rulebook change, not a prompt change.

## Workflows

`workflows/ingest.yml` and `workflows/lint.yml` are GitHub Actions workflows that call `run.sh`. They live here, under `agent/workflows/`, not under `.github/workflows/`: **this public repo never runs them.** `scripts/new-instance.sh` (which `scripts/deploy.sh` runs) copies both files into the instance repo's `.github/workflows/`, with `run.sh` and `prompts/`, when the instance is created, and again on every rerun (`git pull` here, then `scripts/deploy.sh`, as `docs/runbook.md` describes).

- **`ingest.yml`**: triggers on `repository_dispatch` (`types: [ingest]`, sent by the Worker's `POST /process` with `client_payload: { vault_id }`) and on `workflow_dispatch` with a `vault_id` input, for a manual run. `concurrency` is keyed by vault id (`ingest-<vault_id>`, `cancel-in-progress: false`), so two runs for the same vault queue instead of overlapping, and different vaults run in parallel.
- **`lint.yml`**: `workflow_dispatch` only, same `vault_id` input, `concurrency` keyed `lint-<vault_id>`. A scheduled lint is a later milestone (M5); for now it only runs when triggered by hand.

Both jobs, in order: check out the repo; install `rclone` (a pinned version, downloaded from the official GitHub release and checked against the sha256 published in that release's own `SHA256SUMS` — no third-party action needed for a single static binary); install `pandoc` (`apt-get`, Ubuntu's own package); set up Node 22 (`actions/setup-node@v4`); install a pinned `@anthropic-ai/claude-code`; run `agent/run.sh <vault_id> <ingest|lint>` with the secrets and variable below. `timeout-minutes: 20` and `permissions: contents: read` bound each run.

### Caching rclone and the Claude Code CLI

Both the rclone binary and the Claude Code CLI are cached with `actions/cache@v4`, keyed on the pinned version (`rclone-<os>-<version>`, `claude-code-<os>-<version>`) so a version bump invalidates the cache instead of silently reusing a stale build:

- **rclone**: cached at `~/rclone-bin`. On a cache hit the download step (`if: steps.cache-rclone.outputs.cache-hit != 'true'`) is skipped; a separate, always-run step copies the (cached or freshly downloaded) binary into `/usr/local/bin` — the sha256 check still runs on every fresh download, never on a cache hit.
- **Claude Code CLI**: installed with `npm install --prefix "$HOME/claude-cli"` instead of `npm install -g`, so the whole install lives under one cacheable directory (`~/claude-cli`); a global install spreads files across `/usr/local/lib/node_modules` and `/usr/local/bin`, which isn't practical to cache. On a cache hit the install step is skipped and `$HOME/claude-cli/node_modules/.bin` is added to `$GITHUB_PATH` either way.

`BOWER_RCLONE_VERSION`, `BOWER_RCLONE_SHA256` and `CLAUDE_CODE_VERSION` live once, in the job's own `env:`, and both the cache keys and the install steps read them from there — bumping a version is a one-line change.

Pandoc is left uncached: `apt-get install pandoc` on `ubuntu-latest` is a few seconds (the package and its small dependency set are usually already in APT's local cache on the runner image), not worth a cache step of its own.

#### Measuring

Actions cache doesn't emit a step summary of its own; compare two runs by hand:

1. Trigger `Ingest` by hand (`workflow_dispatch`) on a vault whose `0-Inbox/` and `Clippings/` are empty, once with the cache empty (a version bump, or the first run after this change) and once right after, so the cache is warm.
2. Open each run in the Actions tab and expand the job. Sum the wall time of `Cache rclone` + `Download rclone` + `Install rclone` + `Cache Claude Code CLI` + `Install Claude Code` for both runs (GitHub shows each step's duration in the log view).
3. The difference between the two sums is the saving. A cache hit itself (both `actions/cache@v4` restores) takes a few seconds; the steps it lets you skip are the download and the `npm install`.

### Secrets and variable the instance repo needs

Set once, under the instance repo's Settings → Secrets and variables → Actions (`docs/runbook.md` has the exact `gh` commands):

| Name | Kind | Used for |
| --- | --- | --- |
| `BOWER_API_KEY` | Secret | `run.sh`'s calls to the Worker (`Authorization: Bearer`) |
| `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | Secret | The operator's Claude credentials for `claude -p` (a user's own API key, when set, overrides this for their run) |
| `BOWER_API_URL` | Variable | The Worker's deployed origin |

### Logs on failure

Both workflows upload `$RUNNER_TEMP/bower-logs/` (rclone's log and the agent's stderr) as the `bower-logs` artifact, kept 3 days, only `if: failure()`. **This can contain vault content** (file names, error text from `claude`), which is why it only happens in the instance repo, which is private, and never here. The job's own console log stays content-free (see `run.sh`'s comment on what it prints); nothing there needs `::add-mask::` because nothing there is a secret in the first place.
