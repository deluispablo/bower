# Bower

[![CI](https://github.com/deluispablo/bower/actions/workflows/ci.yml/badge.svg)](https://github.com/deluispablo/bower/actions/workflows/ci.yml)

A second brain that files itself.

You drop a file into your inbox (or type a request), press **Process**, and a few minutes later it is a note in your own Google Drive: summarised, filed, linked and indexed. Nothing to install, no server to run, 0 € a month on top of a Claude subscription and Google Drive.

## How it works

1. **Your notes live in your Google Drive**, as plain Markdown files in a folder called `Bower/`, organised with PARA (Projects, Areas, Resources, Archives). Obsidian opens the same folder.
2. **The app** (a web app you install on your phone or PC) shows those notes rendered, lets you add files, and has a box to talk to Bower.
3. **The agent** is Claude Code. When you press Process, it downloads your vault to a throwaway runner, follows the rulebook in your vault (`CLAUDE.md`), writes the notes back and tells the app it is done.
4. **You can change the rules by talking**: "From now on, when a receipt arrives, add it to the expenses table." The rule is written into `CLAUDE.md`, in plain English, dated.

## Pieces

| Folder | What | Runs on |
| --- | --- | --- |
| `app/` | Progressive web app: sign in with Google, browse and read the vault, add files, tell Bower, process | Cloudflare Pages (free) |
| `api/` | One Worker: OAuth, encrypted tokens, allowlist, quotas, dispatching the agent, push notifications | Cloudflare Workers + KV (free) |
| `agent/` | A shell script and two workflows: sync the vault, run Claude Code, sync back | GitHub Actions of the operator (free tier) |
| `vault-template/` | An empty vault with the generic, self-improving rulebook every user starts from | Copied into each user's Drive |
| `docs/` | Runbook, architecture, decisions, testing | — |

## Model

Self-hosted. One person (the operator) deploys an instance for their household with their own Claude subscription and their own Google OAuth client; the people they allow sign in with Google and need no setup. The public repository is the recipe; it contains no keys and no personal data.

## Status

In development. The plan lives in the [milestones](../../milestones) and [issues](../../issues). Contributions and implementation notes: see `CONTRIBUTING.md`.

## License

MIT. Named after the bowerbird, which collects things and arranges them with care.
