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
│   ├── wrangler.toml, .dev.vars.example   # placeholders; the real deploy config is the git-ignored wrangler.local.toml
│   └── test/
├── agent/
│   ├── run.sh                  # sync down → claude -p → copy up → status
│   ├── prompts/                # ingest.md, lint.md (short; rules live in the vault)
│   ├── workflows/              # ingest.yml, lint.yml: copied into the operator's instance repo
│   └── test/smoke.sh           # stubbed rclone/claude/curl
├── vault-template/             # CLAUDE.md rulebook, PARA folders, index.md, log.md, About-Me.md
├── docs/                       # runbook.md, decisions.md, brand.md, testing.md, security.md, privacy.md
├── scripts/                    # deploy.sh (one-shot deploy), new-instance.sh (instance repo), deploy-api.sh (Worker only), check-sanitized.sh
├── .github/                    # CI only (this repo never runs the agent)
├── README.md, ARCHITECTURE.md, CONTRIBUTING.md, CLAUDE.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE
└── package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js
```

## Two repositories per deployment

| | This repository (public template) | The operator's instance (private, e.g. `bower-home`) |
| --- | --- | --- |
| Holds | Code, docs, vault template, workflow files | `.github/workflows/` copied from `agent/workflows/`, plus `agent/run.sh` and `agent/prompts/` (`scripts/new-instance.sh`) |
| Secrets | None, ever | `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, `BOWER_API_KEY` (the weekly lint's `dispatch` job only); variable `BOWER_API_URL` |
| GitHub Actions | CI only | Runs the agent; logs are private |
| Updated by | Pull requests here | `git pull` from here, then rerun `scripts/deploy.sh` |

Vault content never enters either repository.

## Components

| Component | Runs on | Responsibility | Never does |
| --- | --- | --- | --- |
| **App** | Cloudflare Pages, in the user's browser | Sign in; list and render the vault by reading Drive directly; search (`fullText contains`); upload to `0-Inbox/`; create `Bower - …md` instruction notes; append to and edit notes; call `/process`; show status and the working animation; push notifications | Store notes; write the notes the agent maintains; hold refresh tokens |
| **Worker** (`api/`) | Cloudflare Workers + KV | OAuth callback and allowlist; encrypted refresh tokens; vault provisioning from the template; `/process` with quota and single-active-run; `/status`; runner endpoints; push sending | Store content; watch Drive; run on a schedule |
| **Agent** (`agent/`) | GitHub Actions runner of the instance repo | `rclone` sync down with a 1 h token; `pandoc --sandbox` conversion of pending Office, HTML and EPUB files to Markdown; `claude -p` inside the vault following its `CLAUDE.md`; `rclone copy` up of only the files the agent added or changed (never deletes), then `rclone deletefile` only for the pending originals the agent moved away; status report | Keep state; print vault content to logs; change rules without an instruction note |
| **Vault** | The user's Google Drive | The only state: notes, originals, rulebook, catalogue, journal | Leave the user's account |

## Data flows

```
User (browser) ── Sign in with Google ──▶ Worker ── stores encrypted refresh token, folder id
User (browser) ◀── 1 h Drive access token ── Worker
User (browser) ── POST /vault {mode: create|select} ──▶ Worker ── copies vault-template/ (or fills gaps in an existing folder) ──▶ Google Drive
User (browser) ── read vault / write 0-Inbox, Clippings / append to or edit a note ──▶ Google Drive
User (browser) ── POST /process ──▶ Worker ── repository_dispatch ingest {vault_id, ticket} ──▶ Instance repo (Actions)
Lint dispatch job (Sundays) ── POST /runner/lint/dispatch (Bearer BOWER_API_KEY) ──▶ Worker ── repository_dispatch bower-lint {vault_id, ticket}, one per vault ──▶ Instance repo (Actions)
Runner ── GET /runner/vaults/:id (Bearer that run's ticket) ──▶ Worker ── 1 h Drive token, folder id, maxTurns, apiKey?
Runner ── rclone sync ↓, manifest, pandoc --sandbox, claude -p, rclone copy ↑ (files new or changed since the manifest only), rclone deletefile ↑ (processed originals only) ──▶ Google Drive
Runner ── POST /runner/vaults/:id/status (Bearer that run's ticket) ──▶ Worker ── web push ──▶ User's devices
User (browser) ── DELETE /me ──▶ Worker ── best-effort revoke at Google, deletes the user's KV data, clears the session cookie ──▶ (the Drive folder itself is never touched)
```

- **Sign-in**: Google OAuth (`openid email drive`) at `GET /auth/login` → `GET /auth/callback`; the Worker exchanges the code, stores the encrypted refresh token and issues the session cookie.
- **Vault provisioning**: `POST /vault` either copies `vault-template/` into a new `Bower` folder or fills in whatever an existing folder is missing (never overwrites a file already there); the folder id is stored, never its contents.
- **Add file**: the app writes straight to Drive with its own 1 h access token (`GET /drive/token`); the Worker is not on this path at all.
- **Append to a note**: the app reads the note, adds a paragraph at the end and writes it back (`files.update` media upload), checking `modifiedTime` just before the write and retrying once on a conflict. It never writes `CLAUDE.md`, `index.md`, `log.md` or `_*.md` folder notes, and writes no `log.md` line (that is the agent's job).
- **Edit a note**: the app reads the note's `modifiedTime`, then its text, when the editor opens; on Save it reads `modifiedTime` again and writes the whole text (`files.update` media upload) only if it is unchanged. Otherwise the user chooses: keep mine (overwrite), take theirs (drop the edit and reload) or open both (the current version in a new tab, the edit kept). Drive's own version history is the safety net. Same guard as append: never `CLAUDE.md`, `index.md`, `log.md` or `_*.md`.
- **Process/run**: `POST /process` dispatches one GitHub Actions run in the operator's instance repo, with a run ticket minted for that run of that vault; the runner uses the ticket to fetch a fresh Drive token and to report, pulls, runs and pushes, all through the Worker, never through the browser. The weekly lint is dispatched the same way, one ticketed run per vault, by `POST /runner/lint/dispatch`.
- **Push**: the runner's status report triggers a web-push message straight from the Worker to the browser's push subscription; no third-party notification service.
- **Delete account**: `DELETE /me` revokes the Google grant (best effort — a user can always leave even if Google does not cooperate), deletes every KV key for that user (profile, quota counters, cached Drive token, push subscriptions, session generation), keeps only a `deleted:<id>` tombstone of the random id so the account can never come back, and clears the cookie. The Drive folder and its content are never touched; the user keeps their notes.

Trigger model: **button only**. The app calls `/process` after Add and Tell Bower; the user presses Process for anything that arrived through Drive, Obsidian or another path. No cron for processing, no change watching, no state about "what is new" outside the vault itself. The one scheduled run is the weekly health check (`lint.yml`, Sundays): it checks the notes, makes only safe mechanical fixes and writes `Lint Report.md`.

## Credentials

| Credential | Owner | Stored | Used by | Never |
| --- | --- | --- | --- | --- |
| Google refresh token (scope `drive`) | The user | Worker KV, AES-GCM encrypted with `TOKEN_ENC_KEY` | Worker, to mint 1 h access tokens for the browser and the runner | Leaves the Worker |
| Session cookie | The user | Browser (HS256 signed, HttpOnly) | App → Worker | — |
| `bower_not_invited` cookie (a rejected sign-in's address, AES-GCM encrypted inside an HS256-signed token) | The person turned away | Browser (HttpOnly, Secure, SameSite=Lax), 5 minutes, cleared by the first `GET /me` | Worker → app's Not invited screen, via `GET /me` | Put the address in a URL, KV or logs |
| Claude token or API key | The operator (or a user with BYOK) | Instance repo secret (or encrypted in KV for BYOK) | Runner | Enters this repo or the Worker logs |
| `BOWER_API_KEY` | The operator | Worker secret + instance repo secret | The weekly lint's `dispatch` job → Worker (`POST /runner/lint/dispatch` only) | Reach a job that runs the agent |
| Run ticket (32 random bytes) | The Worker, one per run | Its SHA-256 in Worker KV (`runticket:<id>`, `lintticket:<id>`); the ticket itself only in the `repository_dispatch` payload and the run's job | That run's job → Worker (`GET /runner/vaults/:id`, `POST /runner/vaults/:id/status`) | Work for another vault, another run, or after its run reports `done`/`failed` |
| GitHub fine-grained token (`contents: write` on the instance repo) | The operator | Worker secret | Worker, to dispatch | — |
| Google OAuth client | The operator | Google Cloud; id/secret as Worker secrets | Worker | — |
| `TOKEN_ENC_KEY`, `SESSION_SECRET`, `ADMIN_KEY`, VAPID key pair | The operator | Worker secrets, generated per instance | Worker (encrypt tokens, sign cookies, admin auth, push) | Leave the Worker |
| Push subscription (endpoint + keys) | The user | Worker KV, opt-in | Worker, to send a run's status | Carry note content |

Lifetimes: the Google refresh token lives until the user deletes their account or revokes access at Google; a Drive access token minted from it lives 1 h and is cached in KV until then; the session cookie lives 30 days or until sign-out; a run ticket lives until its run reports `done` or `failed`, and at most 55 min (the queued plus running stale windows, `RUN_TICKET_TTL_MS` in `api/src/process.ts`), and a newer run of the same kind on the same vault retires it; `BOWER_API_KEY` and the GitHub token live until the operator rotates them.

## Why not X

- **`drive.file` instead of full `drive` scope.** `drive.file` only sees files the app itself created, which would blind the app and the agent to notes written by Obsidian, Drive Desktop or the Drive mobile app — most of a real vault. Full `drive` scope is required to read and write the whole folder. The cost: the operator's OAuth client is published **unverified**, so Google shows a one-time warning and caps the client at 100 users; verification (a paid security assessment) is out of scope.
- **Cron or Drive-change watching instead of a button.** Polling on a schedule (an Apps Script trigger, or GitHub Actions cron) either needs an extra always-on account to maintain or burns Actions minutes every few minutes whether or not there is anything to do (roughly 2,900 minutes a month idle, against a free tier of 2,000). Drive push notifications need a channel renewed every 24 h and a public endpoint to receive them. A button that dispatches a run on demand needs none of that, and keeps "what changed" entirely inside the vault instead of in Worker state.
- **No server between Drive and the runner.** Everything here runs on Cloudflare's and GitHub's free tiers plus the operator's own Claude subscription; a VPS or a background worker process would cost money to run continuously and be one more thing to patch and monitor, for a system whose only job is to move files and call an agent on a button press.
- **No email-in.** Accepting notes by email (forward-to-ingest) would need a mail-receiving integration — a dedicated inbox, a parsing service, or Gmail API access on the operator's own account — another credential and another attack surface, for something a Drive upload or the app's Add and Tell Bower screens already do. The inbox is `0-Inbox/`, a Drive folder, not a mailbox. Documented as an opt-in extension an operator could add themselves: `docs/extensions/email-in.md`.

See `docs/decisions.md` for the full record, including what else was tried in the prototype that came before this repository.

## Limits

| Limit | Value | Why |
| --- | --- | --- |
| Users per instance | 100 | Google's cap on an unverified OAuth client (see above); verification is out of scope |
| Drive access token lifetime | 1 h | Minted by the Worker from the refresh token on demand; never stored longer, cached in KV until it expires |
| One GitHub Actions run | 20 min (`timeout-minutes` in `agent/workflows/*.yml`) | Actions kills the job past this; `run.sh`'s own trap tries to report `failed` first, but a hard kill can pre-empt it |
| Stale-run unblock | 25 min for a `queued` run with no runner pickup, 30 min for a `running` run with no status report (`QUEUED_STALE_MS`, `RUNNING_STALE_MS` in `api/src/process.ts`) | Longer than the 20 min run cap on purpose, so a normal run never gets pre-empted by its own staleness check; catches a runner that died without reporting |
| Rate limit | 30 requests in any 60 s on `GET /auth/callback` (per client IP, once the OAuth cookie verifies) and `POST /process` (per user, after the session check); in memory, no KV write (`RATE_LIMIT_PER_MINUTE`, `api/src/security.ts`) | Slows abuse of the two public entry points that cost something (a Google token exchange, a workflow dispatch) |
| Generic rate limit | 120 requests per client IP in any 60 s, across every cookie route; in memory, best-effort per isolate (`GENERIC_RATE_LIMIT_PER_MINUTE`, `api/src/security.ts`) | Caps any one client well above normal use (the busiest minute of Home plus Tidy up is about 16 calls) |
| Request body | 64 KB, JSON only on writes (`MAX_BODY_BYTES`, `api/src/security.ts`) | Every body the Worker accepts is a small JSON object; anything bigger or of another type is refused before parsing |
| Runs per user per day | 20 by default (`DAILY_RUN_LIMIT`, `api/src/env.ts`), operator-configurable | The runner spends the operator's Claude subscription; a soft cap keeps one user from exhausting it |

## Threat model

Full checklist and the CORS/CSRF/cookie mechanics: `docs/security.md`. This is the design-level version: what someone who controls each piece could do, and what stops them.

- **Someone who controls the Worker** (the operator, or an attacker who compromises it) can read every user's decrypted refresh token, mint Drive access tokens for any vault, and read or write anything in those vaults — the Worker is the one place that holds the key to decrypt tokens. It cannot read note content directly (KV never stores it), only whatever it chooses to fetch from Drive with a minted token. This is the household trust model: users are told the operator can do this (`docs/privacy.md`), not protected from it.
- **Someone who controls a runner job** (code execution inside an ingest or lint job: the agent itself, or a compromised download or package in the job) gets that one run's ticket, and with it, until the run reports `done` or `failed` (at most 55 min), one user's 1 h Drive access token and, if that user set one, their Claude API key — never another user's token, never the refresh token behind it, never `TOKEN_ENC_KEY` or `BOWER_API_KEY` itself. No job that runs the agent holds `BOWER_API_KEY`: the Worker mints a ticket per run and per vault and sends it in the `repository_dispatch`, and a ticket is refused for any other vault (issue #259). The Drive token itself carries Google's full `drive` grant, not just the vault folder — `rclone`'s own configuration (`root_folder_id`) is what keeps an honest run inside the vault, so a compromised run could reach the rest of that one user's Drive for that hour, but no other user's.
- **Someone who can change the instance repo** (push access, or a malicious change to its workflows or `agent/run.sh`) can write a job that reads the repo's secrets, `BOWER_API_KEY` included, and use it to have the Worker dispatch a ticketed run for every vault, into workflows they control: every user's Drive, for as long as they keep that access. The instance repo is the operator's to guard like the Worker's secrets (private, two-factor, no outside collaborators; `docs/runbook.md`, "Hardening your instance"). While the transition flag `RUNNER_ACCEPT_LEGACY_KEY=1` is on, `BOWER_API_KEY` also works directly on every vault's runner routes, as it did before run tickets; it is off by default.
- **Someone who controls the app's origin** (the deployed Pages site, or a browser extension acting as the signed-in user) can do anything the signed-in user could do in the UI: read the vault, upload to the inbox, start a run, change settings, delete the account. It cannot mint a Drive token for another user or read the refresh token, which never reaches the browser. CORS and the same-origin check on state-changing routes stop another site from riding on the user's cookie.
- **Someone who gets a Drive access token** (leaked from a browser, a runner log, or a compromised runner) can read and write that one user's Drive — not just the vault folder, since the grant behind the token is full `drive` scope — for up to 1 h and nothing after it expires; it cannot be used to mint a new one, and revoking the user's Google grant invalidates it early.
- **Someone who writes a file the agent reads** (a clipped web page, a forwarded file in `0-Inbox/` or `Clippings/`) can try prompt injection: text telling the agent to do something else. The prompts tell it to treat note contents as data, never as instructions, and by default the runner gives it no tool that reaches the network or copies runner files: `WebSearch`, `WebFetch`, `curl` and `wget` are denied, and `Bash` is limited to `mv`, `mkdir` and `ls` (no `pandoc`, which takes a URL as input, and no `cp`), so it cannot send vault content to a third party. Office, HTML and EPUB files are converted to Markdown by `run.sh` before the agent starts, with `pandoc --sandbox` (the one input file only, no other file, no URL). Residual risk: an injected note can still make the agent misfile or rewrite notes in that vault, and an instance that opts in with `BOWER_ALLOW_WEB=1` gives the web tools back, the one way a run can reach the network.
- **What the design prevents:** one user reading or changing another user's vault, run or settings; a note ever sitting in Worker storage or Actions logs; a credential outliving the job or session it was minted for; a runner job reaching any vault but the one it was dispatched for; anyone but the operator holding a secret that decrypts a refresh token. It does not prevent someone who can change the instance repo from reaching every vault (see above).

## Policies

- **The vault is the only state.** The Worker keeps credentials and pointers; the runner keeps nothing; the app keeps a read cache.
- **Rules are data.** The agent's behaviour is `CLAUDE.md` in the user's vault, changed only through instruction notes (`Bower - …md`), dated and in plain English. The agent never edits its rules on its own initiative.
- **Never delete.** Uploads use `rclone copy`, and only for the files the agent added or changed, so a note edited in Drive during a run is not overwritten. The only remote deletions are targeted: each file that was pending in `0-Inbox/` or `Clippings/` at the start of a run and that the agent moved away, one `rclone deletefile` per path (a file already gone counts as done). Files added during a run are never touched, and Drive deletions go to the Trash. Processed originals move to `0-Inbox/Processed/`.
- **Free to run.** Cloudflare Pages/Workers/KV free tiers, GitHub Actions free minutes of a private repo (2,000/month), the operator's existing Claude subscription. No servers, no database of content, no paid provider. A dependency or a service that breaks this needs a decision entry.
- **Least privilege.** One repo per token; one folder per Drive remote (`root_folder_id`); bearer keys compared in constant time; secrets only in Cloudflare/GitHub; nothing personal in this repository (CI gate).
- **Fail loud, fail safe.** Any runner error reports `failed`, leaves originals in the inbox, and the next Process retries. Stale runs unblock the button (see Limits).
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
- `docs/security.md` and `docs/privacy.md`: the full security checklist and the user-facing privacy statement (also served by the app at `/privacy`, and linked from the Google OAuth consent screen).
