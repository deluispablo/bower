# The Worker contract (app side) — design

Date: 2026-10-04. Status: written in phase 2 with the fake Worker that the app uses today (`src/data/fake/fake-worker.ts`). Phase 3 builds a Worker that answers exactly this. Where the two disagree, this document wins and the fake is fixed.

The Worker keeps credentials and pointers, never content: the person's Google refresh token (encrypted), their Bower folder id and the state of their runs. The app reads and writes the Bower folder in Google Drive itself, with a short-lived access token from the Worker. The runner (GitHub Actions) does the tidy-up and writes its result to the folder.

## Two things the deployment must get right

- **One Google OAuth client for the app and the runner, with the full `drive` scope.**
  - Bower marks files with Drive `appProperties`: `by`, `bowerNew`, `pile`, `asAdded`, `origin`, `kind` and `bowerItem`.
  - Drive shows `appProperties` only to the OAuth client that wrote them. If the runner's token comes from another client, Bower's marks, "new" and pile ids silently disappear.
  - The narrower `drive.file` scope would hide everything the person puts in the folder some other way, such as through drive.google.com or Obsidian.
- **The Worker on the app's own site** (for example `api.<app domain>`), never on another site.
  - The session cookie travels with `credentials: 'include'`. Across sites it is a third-party cookie, which Safari blocks, and Safari is how the app is installed on iPhones.
  - Cookie: `HttpOnly; Secure; SameSite=Lax`.
  - CORS: the app's origin only, with credentials allowed.
  - The app's service worker leaves the Worker's paths (`/auth/*`, `/me`, `/drive/*`, `/vault`, `/process`, `/status`) to the network. When both are on one origin, they go in `navigateFallbackDenylist` in `vite.config.ts`.

## Calls from the app

Every call sends the session cookie (`credentials: 'include'`). A call that changes something also needs the request to come from the app's own origin. Errors are JSON: `{ "error": { "code": "<code>", "message": "<one sentence for the person>" } }`, with the status codes below. The app shows `message` when there is one.

| Call | Body | Answer | Errors |
| --- | --- | --- | --- |
| `GET /me` | | `{ user: { name, email }, folderId: string \| null }` | 401 when signed out (the app shows sign-in) |
| `GET /auth/login` | | A redirect to Google, then back to the app | |
| `POST /auth/logout` | | 204, the cookie cleared | |
| `DELETE /me` | | 204: the Worker forgets the person (tokens, settings, runs, the pointer to their folder) and clears the cookie; the Drive folder is never touched, and signing in again starts at the folder step (`POST /vault` finds the folder they had) | 401 |
| `GET /drive/token` (`?fresh=1` after Drive said 401) | | `{ accessToken, expiresAt }` (epoch ms, at most 1 h) | 401 signed out; 409 `no-folder` |
| `POST /vault` | `{}` | `{ folderId }`: a new Bower folder made from the template (the five main folders, `Rules.md`, `About me.md`, `.bower/`), or the existing one | 401 |
| `POST /process` | `{ scope: "all" \| "instructions", allowWeb: boolean }` (the person's "Look things up on the web"; the dispatch's `allow_web`) | `{ run: RunWire }`, the run it started, or the one already going | 401; 409 `nothing` "Nothing is waiting in the inbox." / "There is nothing new for Bower to read."; 429 over the daily limit |
| `GET /status` | | `{ run: RunWire \| null }`, the run going now or the last one | 401 |

```ts
interface RunWire {
  id: string;
  scope: 'all' | 'instructions';
  phase: 'queued' | 'reading' | 'writing' | 'saving' | 'done' | 'failed';
  requestedAt: number;   // epoch ms, when the person tapped Tidy up
  phaseAt: number;       // when this phase started
  finishedAt?: number;
  total?: number;        // things to file, known from `reading` on
  failure?: string;      // one sentence, for a failed run
}
```

The app counts a run from `requestedAt` on every device. It asks `/status` every 4 s while a run is going and every 60 s otherwise, and again when the app comes back to the screen.

## What the Worker sends the runner

`repository_dispatch` with `{ run_id, vault_id, ticket, scope, allow_web }`. The runner fetches a Drive token with that ticket, reports each phase (`queued` → `reading` with `total` → `writing` → `saving` → `done` or `failed` with `failure`), and writes the run's report to the folder before it reports `done`:

- `.bower/last-run.json`: `{ v: 1, run: <RunWire with report> }`, where `report` is the app's `RunReport` (`filed`, `created`, `updated`, `setAside`, `questions`, `yourChanges`, and `requests` done and `rulesWorded` when there were any).
- `.bower/questions.json`, `.bower/suggestions.json`, `.bower/requests.json`, `.bower/hashes.json` (shapes in `src/data/vault/layout.ts`).
- `Rules.md` with the rules typed in the app worded (`src/data/vault/rules-format.ts`), and the rules a `rule` line `removes` (by their wording) taken out.
- After a `rename` or `move` line (`from` → `path`), every `[[link]]` to the old name written with the new one, in every note (a label after `|` stays). Until then the app finds a note by the names it had (`src/data/links.ts`).
- The journal files it read moved to `.bower/changes/archive/`. Journal records are unique by `id`: a runner keeps one per id and archives every copy (a device whose answer was lost may have written one twice).
- `appProperties.bowerNew = "1"` on what it filed or changed, cleared from the previous run's things first.

A run takes the piles in the inbox when it starts. Piles added during the run wait for the next one.
