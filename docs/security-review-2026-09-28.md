# Security review, 2026-09-28

An independent review of the whole system before the doors open (issue #191). Read-only: nothing in the code changed with this review; each finding of medium severity or higher has its own issue in the "M12 · Security review" milestone.

## Scope

The state of `main` after M11 (#178 to #183) and M12 (#184 to #190) merged:

- **Worker** (`api/src/`): `index.ts`, `security.ts`, `auth.ts`, `session.ts`, `crypto.ts`, `env.ts`, `errors.ts`, `store.ts`, `google.ts`, `drive.ts`, `drive-api.ts`, `vault.ts`, `settings.ts`, `process.ts`, `status.ts`, `runner.ts`, `github.ts`, `admin.ts`, `push.ts`, `push-routes.ts`.
- **App** (`app/src/`): `api.ts`, `session.tsx`, `drive.ts`, `picker.ts`, `markdown/render.ts`, `markdown/hydrate-embeds.ts`, `markdown/frontmatter.ts`, `cache.ts`, `forget.ts`, `sw.ts`, `sw-push.ts`, `share-target.ts`, `tell.ts`, `upload-names.ts`, the routes that take input (`add.tsx`, `tell.tsx`, the note editor, `settings.tsx`), and the build-time headers (`app/scripts/generate-headers.mjs`).
- **Runner** (`agent/`): `run.sh`, `scan.sh`, `claude-settings.json`, `prompts/`, `workflows/ingest.yml`, `workflows/lint.yml`, `test/smoke.sh`, `test/redteam/`.
- **Scripts and CI**: `scripts/deploy.sh`, `scripts/deploy-api.sh`, `scripts/new-instance.sh`, `scripts/check-sanitized.sh`, `.github/workflows/ci.yml`, `.github/workflows/zap.yml`, `.github/zap-rules.tsv`.
- **Vault template**: `vault-template/CLAUDE.md`, `Rules.md`, `.claude/`.
- **Documents checked against the code**: `ARCHITECTURE.md` (threat model), `docs/security.md`, `docs/privacy.md`, `SECURITY.md`, `docs/superpowers/specs/2026-09-27-hardening-learning-showcase-design.md` §3.

Out of scope: the operator's trust by design (they hold every secret), Google's and Cloudflare's own platforms, the model's judgement on note content. Issue #255 (only instruction notes the app wrote are instructions) is known and in progress; it is referenced here, not re-filed.

## Method

- Each area of OWASP ASVS level 1 that applies to this system (authentication, session management, access control, input validation, cryptography, error handling and logging, data protection, communication, configuration, file handling, API and JSON, business logic), plus the runner's prompt-injection controls from the spec's §3 (A.1 nothing to steal, A.2 nowhere to send it, A.3 nothing to persist, A.4 everything reversible, A.5 set aside and say so).
- Every claim was checked in the code, not in the documents. Where a document and the code disagree, the finding says so.
- Behaviour of third-party tools was checked against their own documentation where a finding depends on it (Claude Code's permission rules; Cloudflare KV's limits and consistency).
- No dynamic testing against a live instance: the ZAP baseline (#189) has not been run yet, and the red-team corpus (#183) has not been run against a real model (both are open items of `docs/security.md`).

Severity: **critical** (exploitable now by an outsider, full compromise), **high** (breaks a documented guarantee across users or exposes every vault), **medium** (breaks a control or availability, bounded blast radius or preconditions), **low** (defence in depth, hard to exploit), **info** (observation, no action required).

## Summary

| # | Severity | Finding | Issue |
| --- | --- | --- | --- |
| H1 | High | The agent can read runner secrets outside the vault: the runner key in its parent's environment and the Drive token and user API key in `../vault.json` | #258 |
| H2 | High | `BOWER_API_KEY` is a master key for every vault, held by every runner job; the documented threat model says the opposite | #259 |
| M1 | Medium | Unauthenticated requests can exhaust the free tier's daily KV writes through the strict rate limiter, taking the whole instance down | #260 |
| M2 | Medium | "Sign out everywhere" and account deletion can be undone by a stale write of the whole user record | #261 |
| M3 | Medium | Any website can drop files into a signed-in user's inbox through the Web Share Target, uploaded without a tap | #262 |
| M4 | Medium | An ordinary ingest may write `Rules.md` (and a nested `CLAUDE.md`), so an injected note can plant instructions every later run obeys first | #263 |
| M5 | Medium | A quarantined file is pending again on the next run: the model sees it, and it is counted as processed | #264 |
| L1 | Low | Accounts are keyed by email address, not Google's stable subject id | — |
| L2 | Low | The Worker does not check the strength of `SESSION_SECRET`, `ADMIN_KEY` or `BOWER_API_KEY` | — |
| L3 | Low | Push subscriptions: any `https` endpoint, no cap per user | — |
| L4 | Low | `VAULT_ID` is not validated in the runner; `zap.yml` interpolates inputs into a shell script | — |
| L5 | Low | Runner tool supply chain: `pandoc` unpinned, Claude Code installed without a lockfile or `--ignore-scripts`, shared tool caches | — |
| L6 | Low | Vault-supplied Claude Code configuration other than `settings.json` still loads (`.mcp.json`, `.claude/skills`, `agents`, `commands`) | — |
| L7 | Low | The privacy statement understates what the Worker keeps about a run | — |
| I1–I9 | Info | Observations, no action required | — |

Counts: 0 critical, 2 high, 5 medium, 7 low, 9 info.

## Findings

### H1 · High · The agent can read runner secrets outside the vault

**Location.** `agent/run.sh` lines 56 (`BASE_TOOLS`), 105–116 (`WORK_DIR`, `VAULT_JSON`), 302–318 (the fetched vault info), 550–555 (the `claude` call); `agent/claude-settings.json`; `agent/workflows/ingest.yml` and `lint.yml` (the `Run` step's `env`).

**What was checked.** Spec A.1 says the model's process holds nothing to steal. `run.sh` does start `claude` under `env -i` with an allow-list, and that part is correct. But:

1. The model is given `Read`, `Glob` and `Grep` as bare tool names (`--allowedTools 'Read,…,Glob,Grep,…'`). Claude Code's permission documentation states that a bare `Read` rule "matches all file reads", and reads outside the working directory are otherwise gated only by `permissions.blockReadsOutsideWorkingDirectories`, which `claude-settings.json` does not set. Nothing denies an absolute path.
2. `BOWER_API_KEY` (and the operator's Claude credential) are in the step environment, so they are in the initial environment block of the `bash` running `run.sh` and of the subshell that forks `claude`. On Linux, `/proc/<pid>/environ` of a process with the same uid is readable, and `/proc/self/status` names the parent's pid. `env -i` cleans the child's own environment, not its parent's.
3. The fetched vault info, `driveAccessToken` and the user's decrypted `apiKey` included, is written to `$WORK_DIR/vault.json`, which is `../vault.json` from the vault the model runs in, and stays there for the whole run.
4. `Bash(mv:*)` is allowed. If Claude Code lets `mv` reach absolute paths outside the working directory under that explicit allow rule (not verified here), `mv` can also bring either file into the vault (a cross-device `mv` copies before failing to remove a `/proc` source), and can overwrite files in the runner's tool caches (`~/rclone-bin`, `~/claude-cli`), which `actions/cache` saves at the end of a job on a cache miss and restores into every later run of every user.

**Impact.** A prompt-injected note, or simply the owner of any vault through their own instruction note, can have the agent read `BOWER_API_KEY` and write it into a note that is uploaded to that user's Drive. With that key, `GET /runner/vaults` lists every vault and `GET /runner/vaults/:id` returns a one-hour, full-`drive`-scope access token and any Claude API key for **every user of the instance** (see H2): exactly the cross-user access `SECURITY.md` lists as in scope. With the default configuration an outsider's injected note cannot send anything out (no network tool), so the outsider path needs `BOWER_ALLOW_WEB=1`; a household member needs nothing more than their own account. The Drive token and API key in `../vault.json` are the user's own, so that half matters mainly with `BOWER_ALLOW_WEB=1`.

**Recommendation.**
- In `claude-settings.json`: set `permissions.blockReadsOutsideWorkingDirectories: true`, and deny `Read`, `Grep`, `Glob` on absolute paths (`//proc/**`, `//home/**`, `//tmp/**`, `//etc/**`) and on `..` as belt and braces; scope the `mv`/`mkdir`/`ls` rules to relative paths inside the vault.
- In `run.sh`: remove `vault.json` right after the fields are read (keep the values in shell variables only), and keep every work file outside the directory tree above the vault.
- Structurally: run `claude` as a separate unprivileged user (the runner has passwordless `sudo`: create one, `chown` only the vault to it, run `sudo -u` with the same `env -i` list), so `/proc/<ppid>/environ`, the work directory and the tool caches are simply not readable or writable by the model.
- Add a smoke scenario with a stub `claude` that tries each path (parent environ, `../vault.json`, a cache directory) and assert it fails; verify once against real Claude Code.

### H2 · High · `BOWER_API_KEY` is a master key for every vault, held by every runner job

**Location.** `api/src/runner.ts` lines 57–67 (`requireRunnerKey`), 316–356; `agent/workflows/ingest.yml` line 100, `lint.yml` lines 35, 138; `ARCHITECTURE.md` "Threat model", second and last bullets.

**What was checked.** Every runner route accepts the one operator key, for any `:id`. `ARCHITECTURE.md` says a compromised runner job gets one user's token and "never … `BOWER_API_KEY` itself (the runner is handed derived, time-boxed credentials, not the secrets that mint them)", and that the design prevents "a runner or a compromised instance repo reaching any vault but the one it was dispatched for". In the code, every ingest and lint job holds `BOWER_API_KEY` in its environment, and that key alone mints a fresh Drive token (full `drive` scope) and returns the decrypted API key for any user, lists every vault, and writes any user's run status (which also sends them a push).

**Impact.** Any code execution in any runner job (H1; a compromised download or package in the job, see L5; a malicious change to the instance repo) reaches every user's whole Drive and every BYOK key, not one vault. The documented guarantee does not hold, and operators and users are told it does.

**Recommendation.** Make the runner's credential per run and per vault. For example: at dispatch, the Worker mints a random run ticket, stores its hash under the vault (TTL of the stale window, 30 min) and sends it in `client_payload`; `GET /runner/vaults/:id` and `POST …/status` require that ticket for that id (single use for the token fetch). For the weekly lint, replace `GET /runner/vaults` plus the master key with a Worker endpoint that the lint workflow calls once with `BOWER_API_KEY` to dispatch one ticketed `repository_dispatch` per vault, and stop giving `BOWER_API_KEY` to the job that runs the agent. Until then, correct `ARCHITECTURE.md` and `docs/security.md` so they state the real blast radius.

### M1 · Medium · Unauthenticated KV-write exhaustion through the strict rate limiter

**Location.** `api/src/security.ts` lines 209–230 (`rateLimit`), `api/src/store.ts` lines 230–243 (`hitRateWindow`), `api/src/process.ts` line 107, `api/src/auth.ts` line 256.

**What was checked.** The strict limit runs first on `POST /process` (before `requireSameOrigin` and `requireSession`) and on `GET /auth/callback` (before the OAuth cookie is checked). Each request under the limit costs one KV read and one KV **write** (`rate:<route>:<ip>:<minute>`), with no cookie, no valid state, nothing.

**Impact.** Cloudflare KV's free tier allows 1,000 writes a day per account. One client IP, with no account, can spend 30 writes a minute on each of the two routes: the day's allowance is gone in about 17 minutes, faster from several IPs. After that every write fails until 00:00 UTC: sign-ins, `POST /vault`, runs, status reports, settings. The whole instance is down for the day, and the operator's other Workers on the same account are affected too.

**Recommendation.** Count only requests that could be legitimate: mount `rateLimit('process')` after `requireSameOrigin` and `requireSession` and key it by user id; on the callback, verify the `bower_oauth` cookie (an HMAC, no KV) before counting. Better, move both strict limits to Cloudflare's Workers Rate Limiting binding (free, no KV) or the in-memory limiter already used for the generic limit. Document the KV write budget in the runbook.

### M2 · Medium · Session revocation can be undone by a stale write of the user record

**Location.** `api/src/auth.ts` lines 160–162, 337–348; `api/src/settings.ts` lines 56–111; `api/src/store.ts` lines 84–89 (`putUser`); also `vault.ts` line 203, `drive.ts` line 69.

**What was checked.** `sessionGeneration` lives inside the user record. Every write path (`PATCH /settings`, `POST /vault`, the `needsReauth` flag, sign-in) reads the whole record, changes one field and writes the whole record back. Workers KV is eventually consistent: a read in another location can return the old value for up to about 60 seconds, and the last write wins.

**Impact.** Someone holding a stolen session cookie keeps calling `PATCH /settings` (`{"tourSeenAt": …}`, with a forged `Origin`, since the check is for browsers). When the owner presses Sign out everywhere, the attacker's next request is authenticated against a cached record with the old generation and writes that old generation back: the revocation is undone for good, until 30 days after the stolen session's sign-in. The same race re-creates a deleted account's record after `DELETE /me` or an admin removal (its refresh token is revoked at Google, but the session works again and a stored Claude API key would be used for runs).

**Recommendation.** Keep revocation state out of the record the other routes rewrite: a separate `sessiongen:<userId>` key written only by logout-all (and a `deleted:<userId>` tombstone written by deletion, checked in `authenticate`), and have `putUser` callers write only the fields they change (or merge on write). Accept the ≤60 s propagation window and say so in `docs/security.md`.

### M3 · Medium · Any website can drop files into a signed-in user's inbox

**Location.** `app/src/sw.ts` lines 30–45 (`handleShareTarget`), `app/src/routes/add.tsx` lines 187–205, `app/vite.config.ts` (`share_target`).

**What was checked.** The service worker accepts any `POST /add` navigation with `multipart/form-data` as a share, stores the files and redirects to `/add?shared=1`, where the Add screen uploads them to `0-Inbox/` straight away (`runQueue(created)`), without the user confirming. A navigation from another site is handled by the service worker like one from the OS share sheet; no `Sec-Fetch-Site` or other origin check is made, and there is no limit on file count or size.

**Impact.** A web page the user visits can build a `FormData` (a script can set an `<input type=file>`'s files from a `DataTransfer`) and submit it to the app's origin: the files land in the user's Drive inbox with the name the page chose. That delivers prompt-injection material into the next Tidy up, including a perfect instruction-note lookalike (the #255 gap), and can fill the user's Drive. The user only sees the Add screen appear.

**Recommendation.** In the service worker, accept a share only when `Sec-Fetch-Site` is `none` (a share from the OS) and refuse others with a redirect to `/add` and nothing stored; on the Add screen, show shared files queued and upload them only when the user taps; cap count and size. Never let a shared file take the `Bower - …md` shape (rename it), even after #255.

### M4 · Medium · Ordinary ingests may write the files every later run obeys first

**Location.** `vault-template/CLAUDE.md` lines 53, 125–126, 154, 158–159; `agent/run.sh` lines 192–198 (`in_known_root`), 221–251 (`audit`); `agent/claude-settings.json`.

**What was checked.** Spec A.3 is "nothing to persist". `CLAUDE.md` is protected, but it includes `@Rules.md` and says `Rules.md` wins where they disagree. `Rules.md` is a known root, the audit accepts any change to it, and the rulebook tells every ingest to add new domain tags to `Rules.md` the first time they are used, so a change to it in an ordinary run is normal and invisible. The same holds for a `CLAUDE.md` inside a known root: the deny rule `Write(CLAUDE.md)` matches it at any depth, but `mv note.md 1-Projects/CLAUDE.md` is allowed and the audit accepts it, and Claude Code loads nested `CLAUDE.md` files as memory.

**Impact.** An injected note (a clipping, a shared file, M3) that gets the model to write one "rule" or one nested `CLAUDE.md` plants text that every later run reads with rulebook authority: silent, persistent misfiling, rule rewriting, or standing instructions waiting for `BOWER_ALLOW_WEB=1` or H1. This is wider than the instruction-note origin gap (#255): no instruction note is needed.

**Recommendation.** Let `Rules.md` change only in a run that processed a verified instruction note (after #255: one listed by the runner), and revert it otherwise; move domain tags to a file that is data, not rules (for example `Tags.md`, never included). Have the audit refuse, at any depth, a new or changed file named `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` or anything under a `.claude/` directory. Report a `Rules.md` change to the user in the app ("Bower added a rule"), so a spurious one is seen.

### M5 · Medium · A quarantined file is pending again on the next run

**Location.** `agent/run.sh` lines 378–391 (list pending) and 482–508 (quarantine); `agent/scan.sh` line 85; `agent/prompts/ingest.md` step 2.

**What was checked.** The pre-scan moves a flagged file to `0-Inbox/Quarantine/` and skips that folder in later scans. But the pending list excludes only `0-Inbox/Processed/`, `_*.md` and `.gitkeep`: on the next run every file in `Quarantine/` is pending, is not scanned (so not flagged), is in `processed`, and is in the model's working directory. Keeping the model away from it then rests on one sentence of the prompt. The smoke test covers the first run only.

**Impact.** The quarantine promise ("so the model never sees it", spec A.5) holds for one run. From the second Tidy up on, the flagged file is ordinary input that the model can read, obey or move into a known root (which the audit accepts, and which then deletes it from `Quarantine/` in Drive as a processed original), and the app counts it as tidied up.

**Recommendation.** Exclude `0-Inbox/Quarantine/*` from the pending list (and from `processed`), and exclude it from the model's view altogether (deny `Read`/`Grep`/`Glob` on `0-Inbox/Quarantine/**`); have the audit refuse any change under it except the runner's own moves. Add a two-run smoke scenario.

### L1 · Low · Accounts are keyed by email address, not Google's subject id

`api/src/auth.ts` lines 278–315, `store.ts` `findUserByEmail`. Sign-in looks the user up by address and replaces its refresh token. Google's `sub` is stable; an address can change hands (a Workspace address reassigned to another person, an account renamed). Whoever next signs in with that address, if still allowlisted, takes over the record: the vault pointer, the settings, a stored API key (not the old Drive content, since the new refresh token is theirs). Store `sub` on the user and refuse a sign-in whose `sub` differs from the stored one (ask the operator to remove and re-invite).

### L2 · Low · No strength check on the Worker's shared secrets

`api/src/env.ts` lines 157–203. `TOKEN_ENC_KEY` must be 32 bytes, but `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS`, `ADMIN_KEY` and `BOWER_API_KEY` only need to be non-empty. `scripts/deploy-api.sh` generates 32 random bytes for each, so a scripted deploy is fine; a hand-made `wrangler secret put` with a short value is accepted silently, and `/admin/*` and `/runner/*` have no rate limit. Require at least 32 characters in `assertEnv`.

### L3 · Low · Push subscriptions: any `https` endpoint, no cap per user

`api/src/push-routes.ts` lines 40–58, 111–126; `push.ts` `sendPush`. A signed-in user can store any number of subscriptions, each an arbitrary `https` URL, and every finished run makes the Worker POST to all of them (the Worker then talks to hosts of the user's choosing, and a large set exceeds the 50-subrequest limit of the status request, so the runner's report fails). Cap subscriptions per user (for example 10, oldest dropped) and accept only the known push services' hosts.

### L4 · Low · Unvalidated identifiers in the runner and in `zap.yml`

`agent/run.sh` line 102 puts `VAULT_ID` into the API path unchecked; `workflow_dispatch` accepts any string. `.github/workflows/zap.yml` interpolates `${{ inputs.app_url }}` and `${{ inputs.api_url }}` into a `run:` script. Both need repository write access to reach, so the risk is low. Check `VAULT_ID` against the UUID pattern in `run.sh`; pass the ZAP inputs through `env:`.

### L5 · Low · Runner tool supply chain

`agent/workflows/ingest.yml` and `lint.yml`. `rclone` is pinned by version and hash, and every action is pinned by SHA. But `pandoc` comes unpinned from `apt-get`, and Claude Code is installed with `npm install` at a pinned version without a lockfile or `--ignore-scripts`, so its dependency tree and install scripts are whatever the registry serves that day. Both `~/rclone-bin` and `~/claude-cli` are shared through `actions/cache` across every run. Given H2, a compromise here reaches every vault. Pin `pandoc` (a release `.deb` with its hash), install Claude Code with `--ignore-scripts` from a committed lockfile (`npm ci`), and include the lockfile's hash in the cache key.

### L6 · Low · Vault-supplied Claude Code configuration other than settings still loads

`agent/run.sh` lines 363–373. The run replaces `.claude/settings.json` and removes `.claude/settings.local.json`, but the vault's `.claude/skills/`, `.claude/agents/`, `.claude/commands/` and a root `.mcp.json` come down from Drive and are left in place. They are owner-controlled (the model cannot write them), so this matters for a malicious household member rather than an outsider: a project MCP server is a command the runner would execute. Remove everything under `.claude/` except the copied settings, delete `.mcp.json` from the local copy, and run `claude` with `--strict-mcp-config`.

### L7 · Low · The privacy statement understates what a run leaves in the Worker

`docs/privacy.md` "What this instance stores" says the Worker keeps a run's status "and a short summary of it, such as how many files it tidied up". The stored `Run` (`api/src/runner.ts` lines 226–256) also holds the paths of every processed, quarantined and refused file and the last five lines of the agent's output, and KV caches a plaintext Drive access token for up to an hour. `docs/security.md` item 4 is accurate; the user-facing page should say the same in plain words.

### Info

- **I1.** Session, OAuth and "not invited" tokens share `SESSION_SECRET` and carry no type claim. Confusion is prevented today by their disjoint claim shapes (`userId` only in sessions); adding a `typ`/`purpose` claim to every token and checking it would make that explicit.
- **I2.** AES-GCM envelopes (`crypto.ts`) carry no associated data, so a ciphertext is not bound to its user or field, and the "not invited" cookie encrypts an attacker-chosen address with the same key as the refresh tokens. Harmless with random 96-bit nonces at this volume; binding `userId` and the field name as AAD would be a cheap improvement at the next envelope version.
- **I3.** Sign out (`POST /auth/logout`) only clears this device's cookie; a copied cookie stays valid until its 30 days are up. Documented behaviour; Sign out everywhere is the revocation.
- **I4.** Revocation (logout-all, deletion, allowlist removal) takes up to about 60 seconds to reach every Cloudflare location, because KV reads are cached (see M2 for the part that is a defect).
- **I5.** The app's `_headers` do not set `X-Content-Type-Options: nosniff`; Cloudflare Pages adds it by default. Setting it explicitly would not depend on the host.
- **I6.** With the Picker enabled, `script-src` allows `https://apis.google.com`, a broad host with known CSP-bypass gadgets. Only exploitable after an HTML injection, which DOMPurify prevents.
- **I7.** The note sanitizer keeps `class`, so a note can borrow the app's CSS classes (for example to look like an app control). No script, style or event handler gets through.
- **I8.** `GET /drive/token?fresh=1` (drops the cached token) and `GET /status` (marks a stale run failed) change state on a `GET`. Both are harmless to trigger cross-site: no response is readable and the effect is the one the app would cause itself.
- **I9.** `clientIp` falls back to `X-Forwarded-For` when `cf-connecting-ip` is missing, which only happens off Cloudflare (local development), where the header is client-controlled.

## Checked and found fine

- **OAuth**: authorization code with PKCE (S256, 32-byte verifier), `state` bound to a signed, `HttpOnly`, 10-minute cookie scoped to `/auth` and compared in constant time; fixed `redirect_uri`; `email_verified` required; the allowlist checked on the normalized address before anything is stored; nothing stored for a rejected address, which travels only encrypted in a 5-minute cookie; fixed post-login redirect to `APP_ORIGIN` (no open redirect).
- **Session tokens**: HS256 only (`alg` checked, so `none` never passes), strict canonical base64url, integer `exp` and `iat`, absolute 30-day lifetime from sign-in with no sliding refresh, a fresh `sid` on every sign-in, a rejected cookie cleared, previous-secret grace only on `bad_signature`.
- **Cookies**: session and helper cookies `HttpOnly; Secure; SameSite=Lax`; same registrable domain required and documented.
- **CSRF and CORS**: every state-changing cookie route has `requireSameOrigin` (`POST /process`, `POST /vault`, `PATCH /settings`, `DELETE /me`, `POST /auth/logout`, `POST /auth/logout-all`, `POST` and `DELETE /push/subscribe`); CORS reflects `APP_ORIGIN` only; writes with a body must be `application/json`, which closes the simple-request door.
- **Access control**: every user route derives the user from the session, never from input; runner and admin routes compare bearer keys in constant time; `GET /runner/vaults` returns ids only; `/admin/users` never returns a token. No route takes another user's id from a cookie holder.
- **Input limits**: 64 KB body cap before parsing, bounded request id, strict status-report schema with unknown fields refused and every string and list cut, strict `tourSeenAt` round trip, push keys decoded and length-checked, `https` push endpoints of bounded length.
- **Cryptography**: AES-256-GCM with a fresh 96-bit nonce per envelope, non-extractable key, strict envelope parsing, `TOKEN_ENC_KEY` length validated; HMAC keys via Web Crypto; `crypto.getRandomValues` and `crypto.randomUUID` for every random value; deploy scripts generate 32 random bytes per secret and keep `ADMIN_KEY` in a `0600` file.
- **Error handling and logging**: `HttpError` messages are generic; anything else is a 500 `internal` with details to the log only; no token, key, email or file name in any `console.*` call (checked by hand and by `api/test/log-hygiene.test.ts`); Google errors surface only their OAuth `error` code; revoke failures log a code; `run.sh` logs counts and step names only.
- **Response headers**: Worker `no-store`, `nosniff`, `no-referrer`, HSTS, `frame-ancestors 'none'` on every response; app CSP without `unsafe-inline` scripts, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, a narrow `img-src` that blocks tracking pixels.
- **Note rendering**: DOMPurify with a tag and attribute allowlist, no SVG or MathML, no `style`, ids prefixed, a URL allowlist that rejects every other scheme, raster-only `data:` images, forced `noopener noreferrer` on external links, embeds resolved only through the vault index (a hand-written `data-bower-file` cannot point outside the Bower folder), transcluded bodies sanitized again, image object URLs only for image MIME types, a frontmatter parser that keeps `__proto__` an own property.
- **App data at rest**: the Drive token lives in memory only; sign-out, a lost session and deletion clear IndexedDB, both Cache Storage buckets, preferences, the Tell history and recent searches; Drive queries escape quotes and backslashes; the app refuses to append to or edit `CLAUDE.md`, `index.md`, `log.md` and `_*.md`.
- **Runner**: `env -i` with a short allow-list for the model; no web tools, `curl` or `wget` by default; `pandoc --sandbox` conversion before the model starts; permission policy from the instance repo replacing the vault's; post-run audit with known roots, protected paths reverted and a change cap; upload by explicit file list, never a sync; deletes only of pending originals whose content Drive holds elsewhere; failure reports without file names; logs private with a 3-day retention.
- **CI**: `permissions: contents: read` at the top, widened per job; every action pinned by SHA; `pnpm audit --audit-level=high` and gitleaks on every PR; no `pull_request_target`; ZAP only on manual dispatch with `https` inputs.
- **Vault template**: no secret or personal data; the rulebook's own `Never` rules match the runner's protected paths.

## Follow-ups

- Issues #258 to #264 (H1, H2, M1 to M5), milestone "M12 · Security review". H1 and H2 should land before the doors open; together they are the one path from a household member to every other household member's Drive.
- The owner enables private vulnerability reporting (Settings → Code security → Private vulnerability reporting); it is off today, and `SECURITY.md` now depends on it.
- Run the red-team corpus (#183) against a real model once H1, M4, M5 and #255 have landed, and record the outcome table in `docs/security.md`; add a fixture for M4 (a note asking to add a "domain tag" that is really a rule) and one for H1 (a note asking to read `/proc/<ppid>/environ`).
- Run the ZAP baseline (#189) against the production instance and record the date in `docs/security.md`.
- Low findings L1 to L7 are left for a later hardening pass; none needs its own issue now.
- Re-review after H1 and H2 land: they change the runner's trust boundaries, which this review assumed as they are.
