# Decisions

Short records of the choices that shape Bower, newest first. One entry per decision: date, what, why, what was rejected.
A private prototype (v4: Drive folder + Apps Script detector + GitHub Actions + rclone) preceded this repository; several entries record what it taught.

## 2026-09-26 · Semantic search over the vault — pending
Spike (#51, see git history) recommends embedding notes locally in the runner with a small multilingual model, not Cloudflare Workers AI (a second content-processing third party beyond Anthropic). Implementation decision still open.

## 2026-09-26 · Self-hosted model; no keys in the repository
Each operator deploys their own instance with their own Claude subscription (or API key) and their own Google OAuth client. The public repository is a recipe.
Rejected: a hosted multi-tenant service (would require per-user billing and Google app verification).

## 2026-09-26 · Sign-in is the credential
The app's Google sign-in produces the refresh token the agent uses; the Worker stores it encrypted. No per-user rclone config, no per-user secrets, no folder sharing.
Rejected (v4): `rclone config` per person on the operator's machine plus a static `RCLONE_CONF` secret.

## 2026-09-26 · Full `drive` scope with an unverified, published OAuth client
`drive.file` only sees files the app created, which would blind the agent to notes created by Obsidian, Drive Desktop or the Drive app. Full scope is required. An unverified client in production status serves up to 100 users with a one-time warning screen; verification (paid security assessment) is out of scope. Testing status is unusable: refresh tokens expire after 7 days.

## 2026-09-26 · Button-only trigger; no cron, no Drive watching
The app calls `POST /process` after Add and Tell Bower, and the user can press Process for anything that arrived another way. The Worker keeps no change-tracking state.
Rejected: Apps Script polling every 5 minutes (v4, extra Google account and script to maintain), Drive push notifications (channel renewal every 24 h), Actions cron (billed per minute rounded up; ~2,900 min/month idle).

## 2026-09-26 · The inbox is the API
Every user action becomes a file in `0-Inbox/`: uploads, and `Bower - <date> <title>.md` notes for rules, tasks and questions. The agent only reads that folder and writes notes elsewhere. No chat, no session state.

## 2026-09-26 · Read-only app in v1
The app reads the vault and writes only to the inbox, so there are no edit conflicts between the app, Obsidian on a PC and the agent. Append comes in v1.5, full editing with conflict detection in v2.

## 2026-09-26 · Notifications by web push; no email
Push from the Worker with VAPID keys; nothing to install, no mail account. iOS requires the PWA to be installed.
Rejected (v4): Gmail SMTP with an app password from a shared account.

## 2026-09-26 · Allowlist and quotas in the Worker
Google does not restrict who can sign in; the Worker does (allowlisted emails) and caps runs per user per day because the Claude subscription belongs to the operator.

## 2026-09-26 · Vaults stay in each owner's Drive, owned by the owner
Notes are written with the owner's own token, so every file belongs to them. The Worker stores credentials and pointers, never content. If Bower disappears, the folder remains.

## 2026-09-26 · Processed originals are moved, never deleted
`0-Inbox/Processed/` keeps everything ingested. Uploads back to Drive use `rclone copy` (never deletes); the only remote deletions are the pending originals the agent moved away, one `rclone deletefile` each, so files added during a run stay. Drive deletions go to the Trash.

## 2026-09-26 · One generic, self-improving rulebook per vault
`vault-template/CLAUDE.md` ships the PARA structure, the Ingest / Instructions / Query / Lint workflows, self-learning rules (update the owner profile; propose a workflow after three similar documents) and hard limits for unattended runs (never touch `.obsidian/`, never delete, never change rules without an instruction).

## 2026-09-26 · Stack
Cloudflare Pages + Workers + KV (free), GitHub Actions (free tier of the operator's private instance repo), Preact + Vite for the app, Hono for the Worker, rclone + Claude Code CLI in the runner. No servers, no database of content.
Rejected: a VPS (~4–5 €/month; documented as an upgrade path), local models (do not follow a long rulebook reliably), Notion as storage (lock-in, no Markdown ownership).

## 2026-09-26 · Names
Bower, after the Australian bowerbird that collects objects and arranges them with care. "Second brain" is used only to explain the concept.

## 2026-09-29 · Startup bundle budget 170 KB
v5 adds the Overlay queue, the tidy-up bar and sheet, the send-to-Bower sheet, dictation and the new bird poses, which took the gzipped startup scripts just past 150 KB. The budget in `app/scripts/check-size.mjs` goes to 170 KB so v5 can land; an issue in M46 code-splits the sheets and overlays that are not needed on first paint, with the goal of coming back under 150 KB.
