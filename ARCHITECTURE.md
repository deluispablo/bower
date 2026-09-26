# Architecture

Bower is a **self-hosted personal knowledge agent**. An operator deploys one instance for their household; the people they allow sign in with Google and get a folder of Markdown notes in their own Drive that a Claude agent keeps organised. This file is the single source for the module map, the data flows and the policies. `CLAUDE.md` points here; do not duplicate it there.

## Layout

```
bower/
├── app/                        # Progressive web app (Vite + Preact + TypeScript)
│   ├── src/
│   │   ├── main.tsx, app.tsx   # bootstrap, routes
│   │   ├── api.ts              # typed client for the Worker (cookie session)
│   │   ├── drive.ts            # typed client for Google Drive (1 h token from the Worker)
│   │   ├── markdown/           # marked + wikilinks + frontmatter + sanitizer
│   │   ├── components/, routes/, styles/tokens.css
│   │   └── sw.ts               # service worker: shell cache, share target, push
│   ├── public/                 # icons, logo, manifest assets
│   └── .env.example            # VITE_API_URL
├── api/                        # Cloudflare Worker (Hono, KV, Web Crypto)
│   ├── src/
│   │   ├── index.ts            # routes
│   │   ├── env.ts              # Env contract + validation
│   │   ├── crypto.ts, session.ts, security.ts, store.ts, google.ts, github.ts, push.ts
│   │   └── template.generated.ts   # vault-template bundled at build time
│   ├── scripts/                # bundle-template.mjs, gen-vapid.mjs
│   ├── wrangler.toml, .dev.vars.example
│   └── test/
├── agent/
│   ├── run.sh                  # sync down → claude -p → copy up → status
│   ├── prompts/                # ingest.md, lint.md (short; rules live in the vault)
│   ├── workflows/              # ingest.yml, lint.yml: copied into the operator's instance repo
│   └── test/smoke.sh           # stubbed rclone/claude/curl
├── vault-template/             # CLAUDE.md rulebook, PARA folders, index.md, log.md, About-Me.md
├── docs/                       # runbook.md, decisions.md, brand.md, testing.md, security.md, privacy.md
├── scripts/                    # deploy.sh, new-instance.sh, check-sanitized.sh, deploy-api.sh
├── .github/                    # CI only (this repo never runs the agent)
├── README.md, ARCHITECTURE.md, CONTRIBUTING.md, CLAUDE.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE
└── package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js
```

## Two repositories per deployment

| | This repository (public template) | The operator's instance (private, e.g. `bower-home`) |
| --- | --- | --- |
| Holds | Code, docs, vault template, workflow files | The workflow files copied from `agent/workflows/`, `agent/run.sh`, instance config |
| Secrets | None, ever | `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, `BOWER_API_KEY`; variable `BOWER_API_URL` |
| GitHub Actions | CI only | Runs the agent; logs are private |
| Updated by | Pull requests here | `git pull` from here, then redeploy |

Vault content never enters either repository.

## Components

| Component | Runs on | Responsibility | Never does |
| --- | --- | --- | --- |
| **App** | Cloudflare Pages, in the user's browser | Sign in; list and render the vault by reading Drive directly; search (`fullText contains`); upload to `0-Inbox/`; create `Bower - …md` instruction notes; call `/process`; show status and the working animation; push notifications | Store notes; edit notes (v1); hold refresh tokens |
| **Worker** (`api/`) | Cloudflare Workers + KV | OAuth callback and allowlist; encrypted refresh tokens; vault provisioning from the template; `/process` with quota and single-active-run; `/status`; runner endpoints; push sending | Store content; watch Drive; run on a schedule |
| **Agent** (`agent/`) | GitHub Actions runner of the instance repo | `rclone` sync down with a 1 h token; `claude -p` inside the vault following its `CLAUDE.md`; `rclone copy` up (never deletes), mirror of the inbox folders; status report | Keep state; print vault content to logs; change rules without an instruction note |
| **Vault** | The user's Google Drive | The only state: notes, originals, rulebook, catalogue, journal | Leave the user's account |

## Data flows

```
User (browser) ── Sign in with Google ──▶ Worker ── stores encrypted refresh token, folder id
User (browser) ◀── 1 h Drive access token ── Worker
User (browser) ── read vault / write 0-Inbox ──▶ Google Drive
User (browser) ── POST /process ──▶ Worker ── repository_dispatch {vault_id} ──▶ Instance repo (Actions)
Runner ── GET /runner/vaults/:id (Bearer BOWER_API_KEY) ──▶ Worker ── 1 h Drive token, folder id, maxTurns, apiKey?
Runner ── rclone sync ↓, claude -p, rclone copy ↑, rclone sync 0-Inbox ↑ ──▶ Google Drive
Runner ── POST /runner/vaults/:id/status ──▶ Worker ── web push ──▶ User's devices
```

Trigger model: **button only**. The app calls `/process` after Add and Tell Bower; the user presses Process for anything that arrived through Drive, Obsidian or another path. No cron, no change watching, no state about "what is new" outside the vault itself.

## Credentials

| Credential | Owner | Stored | Used by | Never |
| --- | --- | --- | --- | --- |
| Google refresh token (scope `drive`) | The user | Worker KV, AES-GCM encrypted with `TOKEN_ENC_KEY` | Worker, to mint 1 h access tokens for the browser and the runner | Leaves the Worker |
| Session cookie | The user | Browser (HS256 signed, HttpOnly) | App → Worker | — |
| Claude token or API key | The operator (or a user with BYOK) | Instance repo secret (or encrypted in KV for BYOK) | Runner | Enters this repo or the Worker logs |
| `BOWER_API_KEY` | The operator | Worker secret + instance repo secret | Runner ↔ Worker | — |
| GitHub fine-grained token (`contents: write` on the instance repo) | The operator | Worker secret | Worker, to dispatch | — |
| Google OAuth client | The operator | Google Cloud; id/secret as Worker secrets | Worker | — |

Why full `drive` scope: `drive.file` only sees files the app itself created, which would blind the app and the agent to notes written by Obsidian, Drive Desktop or the Drive app. The operator's OAuth client is published **unverified**: Google shows a warning once and caps the client at 100 users. Verification (a paid security assessment) is out of scope. A client left in *Testing* status expires refresh tokens after 7 days and must not be used.

## Policies

- **The vault is the only state.** The Worker keeps credentials and pointers; the runner keeps nothing; the app keeps a read cache.
- **Rules are data.** The agent's behaviour is `CLAUDE.md` in the user's vault, changed only through instruction notes (`Bower - …md`), dated and in plain English. The agent never edits its rules on its own initiative.
- **Never delete.** Uploads use `rclone copy`; only `0-Inbox/` and `Clippings/` are mirrored, and Drive deletions go to the Trash. Processed originals move to `0-Inbox/Processed/`.
- **Free to run.** Cloudflare Pages/Workers/KV free tiers, GitHub Actions free minutes of a private repo (2,000/month), the operator's existing Claude subscription. No servers, no database of content, no paid provider. A dependency or a service that breaks this needs a decision entry.
- **Least privilege.** One repo per token; one folder per Drive remote (`root_folder_id`); bearer keys compared in constant time; secrets only in Cloudflare/GitHub; nothing personal in this repository (CI gate).
- **Fail loud, fail safe.** Any runner error reports `failed`, leaves originals in the inbox, and the next Process retries. Stale runs (no report within 25 min) unblock the button.
- **Household trust model.** The operator can, in principle, read every vault of their instance. Users are people who trust the operator. This is documented to users in `docs/privacy.md`, not hidden.
- **Self-hosted, not hosted.** The Claude subscription is personal; an instance serves its operator's household. Guests bring their own API key (BYOK) if the operator allows it.

## Adding a new piece (checklist)

1. Does it keep the cost at zero and the vault as the only state? If not, open a decision in `docs/decisions.md` first.
2. Put it under the folder that owns it; add it to the layout above and to the components table.
3. Env vars and secrets go through `api/src/env.ts` and the runbook table in the same PR.
4. Tests hermetic; CI green; `CLAUDE.md` unchanged unless a rule changed.

## Related documents

- `docs/decisions.md`: why things are the way they are, including what was rejected.
- `docs/runbook.md`: deploy, operate, pause, tear down.
- `docs/testing.md`: the manual end-to-end checklist.
- `docs/security.md` and `docs/privacy.md`: threat model and the user-facing privacy statement.
