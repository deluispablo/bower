# API data model

All state the Worker keeps lives in Cloudflare KV (binding `BOWER_KV`), accessed only through `api/src/store.ts`. This page documents the key layout and the shapes stored under each key. No real values (emails, ids, tokens) appear below or anywhere in the repository.

## Data model

| Key pattern | Value | TTL | Written by | Read by |
| --- | --- | --- | --- | --- |
| `user:<id>` | `User` | none | `putUser` | `getUser`, `findUserByEmail` |
| `email:<email>` | user id (string) | none | `putUser` | `findUserByEmail` |
| `allow:<email>` | `'1'` | none | the operator, outside this module | `isAllowed` |
| `run:<id>` | `Run` | none | `putRun` | `getRun` |
| `quota:<id>:<yyyy-mm-dd>` | request count (string) | 48 h | `incrQuota` | `incrQuota`, `getQuota` |
| `push:<id>:<subId>` | `PushSubscription` | none | `putPushSub` | `listPushSubs` |
| `drivetoken:<id>` | `DriveToken` (cached Drive access token) | token lifetime − 60 s, at least 60 s (set by `drive.ts`) | `putDriveToken` | `getDriveToken` |

Notes:

- `<id>` is always a `User.id`.
- `<email>` is lower-cased and trimmed before use as a key, so lookups are case-insensitive.
- `quota` has no atomic increment in KV: `incrQuota` reads, increments and writes back. Two requests racing on the same user and date can undercount by one. Accepted as a soft per-user daily limit, not a billing figure.
- `deleteUserData` removes every `user:`, `run:`, `quota:<id>:*`, `push:<id>:*` and `drivetoken:<id>` key for a user, plus its `email:` index, but never `allow:<email>` — the allowlist belongs to the operator, not the user.

## `User`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `email` | `string` | |
| `createdAt` | `string` | ISO-8601 |
| `vault` | `{ folderId, inboxFolderId, name }` | optional; set once the vault is provisioned |
| `encRefreshToken` | `string` | AES-GCM envelope (`crypto.ts`); never plaintext |
| `encApiKey` | `string` | optional; AES-GCM envelope (`crypto.ts`); never plaintext |
| `needsReauth` | `boolean` | optional |

## `Run`

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `'queued' \| 'running' \| 'done' \| 'failed'` | |
| `requestedAt` | `string` | ISO-8601 |
| `startedAt` | `string` | optional; ISO-8601 |
| `finishedAt` | `string` | optional; ISO-8601 |
| `summary` | `string` | optional |
| `processed` | `string[]` | optional |
| `error` | `string` | optional |
| `runId` | `string` | optional |

## `DriveToken`

| Field | Type | Notes |
| --- | --- | --- |
| `accessToken` | `string` | Google access token (scope `drive`); plaintext, lives about 1 h |
| `expiresAt` | `string` | ISO-8601; when Google stops accepting it |

## `PushSubscription`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `endpoint` | `string` | |
| `keys.p256dh` | `string` | |
| `keys.auth` | `string` | |
| `createdAt` | `string` | ISO-8601 |

## `POST /vault`

Gives the signed-in user a vault in their own Drive. Requires the session cookie. Nothing in Drive is ever overwritten or deleted.

Request body, one of:

| Body | Effect |
| --- | --- |
| `{ "mode": "create" }` | Creates a folder named `TEMPLATE_FOLDER_NAME` (default `Bower`) at the root of My Drive and copies the bundled `vault-template/` into it: every folder, every file uploaded as `text/markdown`. A `.gitkeep` becomes its (empty) folder; the file itself is not uploaded. |
| `{ "mode": "select", "folderId": "FOLDER_ID" }` | Registers an existing Drive folder (for example an Obsidian vault). Adds only the template folders and files it lacks, matched by name folder by folder; an existing file is never replaced. Finds or creates `0-Inbox`. |

Response: `{ "vault": { "folderId", "inboxFolderId", "name" } }`, status 201 for `create` and 200 for `select`. The same object is stored on the `User` and returned by `GET /me`.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `bad_request` | The body is not JSON, `mode` is neither `create` nor `select`, `folderId` is missing or empty, or `folderId` is not a folder Drive can find |
| 401 | `unauthenticated` | No valid session cookie |
| 401 | `reauth` | Google refused the user's token; sign in again |
| 409 | `vault_exists` | `create` when the user already has a vault |
| 409 | `folder_exists` | `create` when a folder with that name already exists at the root of My Drive; use `select` with it instead. Nothing is created. |
| 502 | `drive_error` | Drive answered an unexpected status or was unreachable (the message names the operation and the status only) |

A `create` that fails half-way leaves a partial folder behind; the next `create` answers `folder_exists`, and `select` on that folder completes it.

The template is bundled into the Worker at build time: `api/scripts/bundle-template.mjs` (run by `prebuild`) writes `api/src/template.generated.ts` from `vault-template/`, leaving out `vault-template/README.md`, which describes the folder to readers of this repository. The generated file is committed; after editing `vault-template/`, run `pnpm -C api build` and commit the regenerated file.

## `POST /process`

Starts one agent run for the signed-in user's vault. Requires the session cookie; no request body. The app calls it after Add and Tell Bower, and when the user presses Process.

The Worker sends a `repository_dispatch` to the operator's instance repo (`GITHUB_REPO`, authenticated with `GITHUB_TOKEN`) with `event_type: "ingest"` and `client_payload: { "vault_id": "<id>" }`. The `vault_id` is the user's id: each user has one vault, and the runner fetches its credentials with `GET /runner/vaults/:id`.

In order:

1. No user or no vault: 401 or 409, nothing else happens.
2. If the stored run is `queued` or `running` and not stale, it is returned as is: no new dispatch, nothing counted. A run is stale when its `startedAt` (or `requestedAt` before it started) is 25 minutes old or more; a stale run no longer blocks and is replaced below.
3. If today's count (UTC date) has reached `DAILY_RUN_LIMIT`, the answer is 429.
4. The dispatch is sent. If GitHub does not answer 204, the answer is 502 and nothing is stored or counted.
5. A new run `{ state: "queued", requestedAt, runId }` is stored under `run:<id>`, today's count goes up by one, and the run is returned.

Response: `{ "run": Run }`, status 202, both for a new run and for the run already in progress.

| Status | `error.code` | When |
| --- | --- | --- |
| 401 | `unauthenticated` | No valid session cookie, or the user no longer exists |
| 409 | `no_vault` | The user has not set up their Bower folder yet (`POST /vault`) |
| 429 | `quota` | `DAILY_RUN_LIMIT` runs were already started today (UTC). The body also carries `retryAfter`, the seconds until the next midnight UTC, also sent as the `Retry-After` header |
| 502 | `dispatch` | GitHub did not accept the dispatch (any status but 204, or unreachable). Only GitHub's status and request id are logged, never the token |

The daily count lives in `quota:<id>:<yyyy-mm-dd>`, so each UTC day starts from zero; the key itself expires after 48 h. KV has no transactions: two requests at the same instant can both dispatch, or both pass the quota check at the limit. Accepted for a per-user soft limit.

### `Run` lifecycle so far

| State | Set by | Meaning |
| --- | --- | --- |
| `queued` | `POST /process` | GitHub accepted the dispatch; the runner has not reported yet |
| `running`, `done`, `failed` | the runner endpoints (not built yet) | The runner started, finished, or failed |

A `queued` or `running` run with no news for 25 minutes stops blocking `POST /process` (`isActiveRun` in `api/src/process.ts`).
