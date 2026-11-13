# Bower is archived (parked)

Parked on 2026-11-13. Bower is not finished and not abandoned. This file records what it was, where it stopped and how to pick it up again.

## What Bower was

Bower was a phone-first web app (a PWA) that keeps a person's Google Drive folder tidy as a second brain. The person adds files, links and notes to an Inbox. A tidy-up then files each item, writes source notes, keeps maintained notes and an "About me" profile current, links related notes and leaves a truthful report. The knowledge stays as plain Markdown in Drive, readable without Bower. Bower the bowerbird is the app's animated guide.

- **App** (`src/`): React 19 and Vite. It reads and writes Drive directly from the browser.
- **Worker** (`api/`): a Cloudflare Worker. It handles sign-in, the folder pointer, quotas, the one active run and dispatch.
- **Runner** (`runner/`): Node scripts that call Claude. They run on GitHub Actions in a separate repo per person (`bower-home`), dispatched by the Worker.
- **Contracts and design**: `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` (with the mechanism map), `docs/specs/` and `docs/design/specs/`. The runbook is `docs/runbook.md`.

## State when parked

- **`main` (0b584a37)** was live on staging and production, with health ok. Every check and suite was green in CI on GitHub Actions.
- **Done:** the full capture flow (files, photos, links, words); the tidy-up with live Claude; the run report and replay; Home, Files, search and the activity panel; undo and the Drive Bin; sign-out forgetting the device; and the landing page.
- **Accepted but never merged:** the branch `sdd/replay-polish` (6f6097ff). It stops a flown card staying after the replay, shows desktop filed names whole, and puts the phone count beside its folder.
- **Planned, not started:** the "brain" chain, tasks brain-11 to brain-13 and brain-18 to brain-30. It covers destination rules, collision checks, document revision, synopsis provenance, web research and preparation reuse. Also planned: `corpus-live-*`, real-Claude runs over the test corpus.
- **Known open points:**
  - A report heading counts Bower's own link check as an updated note.
  - Calculations refuse European number formats such as "1.234,56".
  - A full profile stops growing at 400 words.
  - A few end-to-end tests are flaky under CI load.

## Why it was parked

The owner decided to stop active development. The model usage needed to finish the brain chain was high, and the product had reached a working, deployed state.

## How to pick it up again

1. Run `pnpm install`, then `pnpm dev`. The demo opens at http://localhost:5190 with made-up data and no account.
2. Run `pnpm check` and `pnpm e2e`. They are the local gates; CI runs `scripts/ci-gate.sh`.
3. To run it live, follow `docs/runbook.md`:
   - a Cloudflare account with the `bower-staging` and `bower-api` Workers;
   - a Google OAuth client;
   - a GitHub repo for the runner (`scripts/new-instance.sh`);
   - the Worker secrets set again with `wrangler secret put`.
4. Merge `sdd/replay-polish` first, then continue with the brain chain.

### Secrets (names only; values live in Cloudflare and GitHub, never in git)

- **Worker** (`wrangler secret put`, staging and production):
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `SESSION_SECRET`
  - `TOKEN_ENC_KEY`
  - `GITHUB_TOKEN`
  - optional: `SESSION_SECRET_PREVIOUS`
- **Runner repo** (GitHub Actions):
  - secret: `CLAUDE_CODE_OAUTH_TOKEN`
  - variables: `BOWER_API_URL`, `BOWER_PROVIDER`, `BOWER_RUNS_ON`, `BOWER_ALLOW_WEB`
- **Local development:** `api/.dev.vars` and `.env`, made from the `*.example` files when present. No such files existed when the project was parked.

Cloudflare and GitHub secrets cannot be read back once set. If they are lost, create new ones:
- `SESSION_SECRET` and `TOKEN_ENC_KEY`: new random values. People will have to sign in again.
- Google client: the Google Cloud console.
- `GITHUB_TOKEN`: a fine-grained token with Actions write on the runner repo.

## The folders on the owner's machine (`~/Projects`)

| Folder | What it is | On GitHub? |
| --- | --- | --- |
| `bower-app` | The main repo, this one. Remote `backup` points to `github.com/deluispablo/bower`. | Yes for `main`. Not on GitHub: the unmerged local branches (`sdd/replay-polish`, `sdd/test-speed-turbo` reds, `b6b`–`b9`, old failed `sdd/batch-*`) and `_AgentMethod/`, the local working method (task history, specs, rulings, test evidence), is git-excluded and exists only on disk. |
| `bower` | The old checkout of the first repository, now the private, archived `deluispablo/bower-legacy`. Its `origin` URL still says `bower`, which now names the new public repo. | `main` is in `bower-legacy`. Not on GitHub: the branch `design/brand-v10` (one commit, a v10 bird, logo and favicon proposal) and untracked `reports/`, `research_notes/` and `.claude/launch.json`. |
| `bower-backup-2026-10-13` | A backup made before the 2026-10-13 method migration: a bundle of the 46 original branches, two stash patches, the old method's Claude memory and transcripts, and settings. | No. 8 of the 46 bundled branch heads are in `main`; the other 38 (old `codex/*`, `claude/*`, `b6b`–`b9`, `p4-b123-prep`, an archive snapshot) are on no GitHub repo, most of them superseded. The transcripts are private. |
| `bower-mail` | Old notes between agent roles (README and messages to coordinator, designer and lead). A copy is in the backup folder. | No (and not needed). |
| `bower-sdd-trial` | A rehearsal clone for the 2026-10-13 method migration. | Yes: all 5 branches' commits are already in `bower-app`. Duplicate. |
