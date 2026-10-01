# Tidy-up benchmark

Measures one tidy-up session, case by case, so a change to the session can be compared with the session before it. It runs the real `agent/run.sh` and the real `claude` CLI against a synthetic Bower folder on your disk: no Drive, no GitHub, no real data.

## Run it

```bash
bash agent/bench/run-bench.sh <label>            # all five cases, one after the other
bash agent/bench/run-bench.sh <label> 2          # only case 2
bash agent/bench/run-bench.sh <label> 1 5        # cases 1 and 5
```

`<label>` names the run (`baseline`, `sonnet-low`, ...): letters, digits, `.`, `_` and `-`.

One case takes several minutes, mostly the agent step. Each case starts from a fresh copy of the folder, so cases never see each other's results.

What it needs on your machine:

- `bash`, `curl`, `rclone`, `timeout` (coreutils), `cksum`, Python 3 (for the local callback stub).
- `claude`, logged in. The benchmark uses your own Claude Code login and spends your own usage. When `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is set, that is used instead.
- `jq`. Without it, the Node stand-in from `agent/test/jq-stand-in.js` is used (needs `node`).
- `pdftotext` (poppler), as on the runner. Without it, PDFs get no text from the runner. `pandoc` and `pdfinfo` are not needed: no case has an Office document, and page counts are optional.

## What it runs

`run-bench.sh` runs `agent/run.sh <vault> ingest` once per case, with:

- a copy of `vault/` with the case's files from `cases/<case>/` put in `0-Inbox/`, and `vault-template/CLAUDE.md` copied in at that moment, so the benchmark always runs the current rulebook;
- `vault:` pointing at that copy on disk instead of Drive (an rclone alias of a local folder);
- `callback-stub.py` on `127.0.0.1` in place of the Worker: it answers the vault info with fixed fake values (60 turns at most, as the API's default) and every status report with 200, and records nothing. It also answers the two Drive metadata calls the runner makes itself (the folder check and the list of notes the app wrote), and treats every `Bower - *.md` in the inbox as written by the app.

The wrappers that make this work live in a temporary folder, first on `PATH`; `run.sh` itself is not changed. See the comment at the top of `run-bench.sh`.

## The cases

| Case | In the inbox | What it exercises |
| --- | --- | --- |
| `1-job-offer-clipping` | A Markdown clipping of a job offer, and a context note asking for a summary | A context note, a listed kind, joining the dots with the other offers |
| `2-text-pdf` | A community garden newsletter (text PDF) | A PDF of no listed kind: filed, with a text copy |
| `3-receipt-pdf` | A hardware shop receipt (text PDF) | A listed kind (receipt) and a rule in `Rules.md` |
| `4-scanned-pdf` | A library letter, scanned (a picture, no text layer) | A scan |
| `5-question-about-filed-pdf` | An instruction note asking about the home insurance policy | A question about a PDF already filed, with no text copy |

The folder in `vault/` holds about 60 notes and files across `1-Projects` to `4-Archives`, hub notes, `index.md`, `log.md`, `Rules.md` with two rules and `About-Me.md` with a fake profile (Alex). Everything in it is made up.

`index.md` keeps the rows of rules version 23 (no tags, no description) and has no `## Tags` section, on purpose: that is what a real folder looks like before the lint backfill (R-SS-17), so the baseline stays realistic.

The PDFs are written by `make-fixtures.py` (Python 3; the scan needs Pillow) and committed, so every run reads the same bytes. Run `python agent/bench/make-fixtures.py` only to change one.

## Results

Everything goes to `agent/bench/results/`, which git ignores.

- `results/<YYYY-MM-DD>-<label>.tsv`: one line per case, appended, with a header line when the file is new.
- `results/<label>/<case>/`: the folder as the case left it, for a quality review.
- `results/<label>/<case>.log`: the runner's own log (steps and counts, no content).

The columns:

| Column | Meaning |
| --- | --- |
| `case` | The case folder's name |
| `agent_seconds` | Wall time of the agent step: from the runner's `agent run` line to its next line |
| `turns` | The session's turns (`num_turns`) |
| `api_ms` | Time spent waiting for the model (`duration_api_ms`) |
| `in` | Input tokens not read from the cache |
| `out` | Output tokens |
| `cache_read` | Input tokens read from the prompt cache |
| `cache_write` | Input tokens written to the prompt cache |
| `tools` | Tool calls per tool name, `Name:n` sorted by name |
| `files_changed` | Files added, removed or changed in the folder by the whole run (agent and runner), `.bower/` and `.claude/` left out |

`turns` to `tools` come from the runner's `agent stats:` line, which every run logs from the session's stream. `-` means the value was missing (for example, a session that was stopped before it ended).
