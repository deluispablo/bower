# The Worker contract (app side) — design

Date: 2026-10-04. Status: written in phase 2 with the fake Worker that the app uses today (`src/data/fake/fake-worker.ts`). Phase 3 builds a Worker that answers exactly this. Where the two disagree, this document wins and the fake is fixed.

The Worker keeps credentials and pointers, never content: the person's Google refresh token (encrypted), their Bower folder id and the state of their runs. The app reads and writes the Bower folder in Google Drive itself, with a short-lived access token from the Worker. The runner (GitHub Actions) does the tidy-up and writes its result to the folder.

## Calls from the app

Every call sends the session cookie (`credentials: 'include'`). A call that changes something also needs the request to come from the app's own origin. Errors are JSON: `{ "error": { "code": "<code>", "message": "<one sentence for the person>" } }`, with the status codes below. The app shows `message` when there is one.

| Call | Body | Answer | Errors |
| --- | --- | --- | --- |
| `GET /me` | | `{ user: { name, email }, folderId: string \| null }` | 401 when signed out (the app shows sign-in) |
| `GET /auth/login` | | A redirect to Google, then back to the app | |
| `POST /auth/logout` | | 204, the cookie cleared | |
| `GET /drive/token` (`?fresh=1` after Drive said 401) | | `{ accessToken, expiresAt }` (epoch ms, at most 1 h) | 401 signed out; 409 `no-folder` |
| `POST /vault` | `{}` | `{ folderId }`: a new Bower folder made from the template (the five main folders, `Rules.md`, `About me.md`, `.bower/`), or the existing one | 401 |
| `POST /process` | `{ scope: "all" \| "instructions" }` | `{ run: RunWire }`, the run it started, or the one already going | 401; 409 `nothing` "Nothing is waiting in the inbox." / "There is nothing new for Bower to read."; 429 over the daily limit |
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

- `.bower/last-run.json`: `{ v: 1, run: <RunWire with report> }`, where `report` is the app's `RunReport` (`filed`, `created`, `updated`, `setAside`, `questions`, `yourChanges`).
- `.bower/questions.json`, `.bower/suggestions.json`, `.bower/requests.json`, `.bower/hashes.json` (shapes in `src/data/vault/layout.ts`).
- `Rules.md` with the rules typed in the app worded (`src/data/vault/rules-format.ts`).
- The journal files it read moved to `.bower/changes/archive/`.
- `appProperties.bowerNew = "1"` on what it filed or changed, cleared from the previous run's things first.

A run takes the piles in the inbox when it starts. Piles added during the run wait for the next one.
