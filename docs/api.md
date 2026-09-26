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
| `push:<id>:<subId>` | `PushSubscription` | none | `putPushSub` | `listPushSubs` (deleted by `deletePushSub`, `DELETE /push/subscribe`, and `sendPush` on a 404/410) |
| `drivetoken:<id>` | `DriveToken` (cached Drive access token) | token lifetime − 60 s, at least 60 s (set by `drive.ts`) | `putDriveToken` | `getDriveToken` |

Notes:

- `<id>` is always a `User.id`.
- `<email>` is lower-cased and trimmed before use as a key, so lookups are case-insensitive.
- `quota` has no atomic increment in KV: `incrQuota` reads, increments and writes back. Two requests racing on the same user and date can undercount by one. Accepted as a soft per-user daily limit, not a billing figure.
- `deleteUserData` removes every `user:`, `run:`, `quota:<id>:*`, `push:<id>:*` and `drivetoken:<id>` key for a user, plus its `email:` index, but never `allow:<email>` — the allowlist belongs to the operator, not the user.
- `deleteDriveToken` also drops `drivetoken:<id>` on its own, used by `GET /drive/token?fresh=1` (see below) to force a fresh mint.

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
| `id` | `string` | `base64url(SHA-256(endpoint))`, first 32 characters; the `<subId>` of its key |
| `endpoint` | `string` | The push service URL (`https:`); never logged |
| `keys.p256dh` | `string` | base64url, the browser's P-256 public key (65 bytes) |
| `keys.auth` | `string` | base64url, the browser's 16-byte auth secret |
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
2. If the stored run is `queued` or `running` and not stale, it is returned as is: no new dispatch, nothing counted. See the staleness table below for when a run is stale. A stale run does not block: it is stored as `failed` with `error: "stale"` first (so it is never silently replaced), then a new run is dispatched below.
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

### `Run` lifecycle

| State | Set by | Meaning |
| --- | --- | --- |
| `queued` | `POST /process` | GitHub accepted the dispatch; the runner has not reported yet |
| `running` | `POST /runner/vaults/:id/status` | The runner started; `startedAt` is set |
| `done` | `POST /runner/vaults/:id/status` | The runner finished; `finishedAt`, `summary` and `processed` are set |
| `failed` | `POST /runner/vaults/:id/status` | The runner gave up; `finishedAt` and `error` are set |

### Staleness

A `queued` or `running` run with no news for long enough is stale: the runner never started, or died mid-run. A stale run no longer blocks `POST /process`, and both `POST /process` and `GET /status` mark it `failed` with `error: "stale"` before moving on, so it is recorded rather than silently dropped. A `done` or `failed` run is never stale: the next `POST /process` starts a new one regardless of age.

| State | Measured from | Stale after |
| --- | --- | --- |
| `queued` | `requestedAt` | 25 minutes |
| `running` | `startedAt` (`requestedAt` if somehow absent) | 30 minutes |
| `done`, `failed` | — | never |

One function, `runStaleness` in `api/src/process.ts`, is the single source of truth for this table; `isActiveRun` (used by `POST /process`) and `GET /status` both build on it, so they always agree.

## `GET /status`

The signed-in user's current run, with staleness. Requires the session cookie; no request body. The app polls this to show idle / queued / running / done / failed truthfully, including a run that will never report back.

In order:

1. No valid session: 401 `unauthenticated`.
2. No stored run: `{ "run": null, "stale": false }`.
3. The stored run is stale (see the table above): it is stored as `failed` with `error: "stale"` and `finishedAt` set to now, and `{ "run": <that failed run>, "stale": true }` is returned.
4. Otherwise the stored run is returned as is: `{ "run": Run, "stale": false }`.

Response: `{ "run": Run | null, "stale": boolean }`, status 200.

| Status | `error.code` | When |
| --- | --- | --- |
| 401 | `unauthenticated` | No valid session cookie, or the user no longer exists |

## Runner endpoints

Called by the GitHub Actions runner of the instance repo, never by the app. Every route under `/runner/` requires `Authorization: Bearer <BOWER_API_KEY>`, compared in constant time; anything else is a 401 `unauthorized`. `:id` is the user id, the `vault_id` that `POST /process` dispatches. Nothing here logs the key, a token, the user's API key, file names or summaries.

### `GET /runner/vaults/:id`

What one run needs:

| Field | Type | Notes |
| --- | --- | --- |
| `folderId` | `string` | The vault's Drive folder |
| `inboxFolderId` | `string` | Its `0-Inbox` folder |
| `driveAccessToken` | `string` | A Google access token (scope `drive`), the same cached token `GET /drive/token` serves; never the refresh token |
| `expiresAt` | `string` | ISO-8601; when Google stops accepting `driveAccessToken` (at least a minute away) |
| `maxTurns` | `number` | `DEFAULT_MAX_TURNS` |
| `apiKey` | `string` | Optional; the user's own Claude API key, decrypted here and nowhere else. Absent unless the user set one |

| Status | `error.code` | When |
| --- | --- | --- |
| 401 | `unauthorized` | Missing or wrong runner key |
| 404 | `not_found` | No user with that id, or the user has no vault yet |
| 409 | `reauth` | Google refused the user's refresh token (`invalid_grant`). The user is flagged `needsReauth` (the app asks them to sign in again); the runner reports `failed` with this reason and stops. A 409, not a 401, so it is not mistaken for a bad runner key |
| 502 | `google_error` | Any other Google failure |

### `POST /runner/vaults/:id/status`

The runner's progress report. Body, validated strictly (an unknown field, a wrong type or another `state` is a 400 `bad_request`):

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `'running' \| 'done' \| 'failed'` | Required |
| `runId` | `string` | Optional, non-empty; replaces the stored `runId` when given |
| `summary` | `string` | Optional; cut to 2,000 characters |
| `processed` | `string[]` | Optional; cut to 200 entries |
| `error` | `string` | Optional; cut to 2,000 characters |

The stored run (`run:<id>`) is updated; without one, a run is started with `requestedAt` set to now.

- `running`: `state` and `startedAt` (now) are set. A run that is already `running` keeps its `startedAt`. Outcome fields of an earlier attempt (`finishedAt`, `summary`, `processed`, `error`) are dropped.
- `done` or `failed`: `state` and `finishedAt` (now) are set; `summary`, `processed` and `error` become exactly the report's (absent when the report has none). Then the user's devices get a push notification (see [Web push](#web-push)): `2 files processed` (the length of `processed`), `Nothing new to process` when `processed` is empty or absent, or `Something went wrong` for `failed`. A push failure never fails the report.

Response: `{ "run": Run }`, status 200.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `bad_request` | The body is not a JSON object matching the table above |
| 401 | `unauthorized` | Missing or wrong runner key |
| 404 | `not_found` | No user with that id, or the user has no vault yet |

## Web push

The Worker sends notifications itself, with Web Crypto only (`api/src/push.ts`): the payload is encrypted per RFC 8291 (`aes128gcm`) and each request is signed with a VAPID JWT per RFC 8292 (ES256, `aud` the push service's origin, `sub` `VAPID_SUBJECT`, valid 12 h). Keys come from `pnpm -C api gen-vapid` (see `docs/runbook.md`). Nothing logs an endpoint, a key or a payload.

### Payload

What the service worker receives in the `push` event, as JSON:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | `string` | `Bower` |
| `body` | `string` | `2 files processed` (or `1 file processed`), `Nothing new to process`, or `Something went wrong` |
| `url` | `string` | App path to open on click; `/` |

Sent with `TTL: 86400`, `Urgency: normal`, `Content-Encoding: aes128gcm` to every subscription of the user when a run is reported `done` or `failed`. A 404 or 410 from the push service deletes that subscription; any other failure is logged by status only and the subscription is kept.

### `GET /push/public-key`

No session needed. Response: `{ "publicKey": string }`, the `VAPID_PUBLIC_KEY` (base64url, 65-byte uncompressed P-256 point) to pass as `applicationServerKey` to `pushManager.subscribe`. A 500 `config` when the key is missing or malformed.

### `POST /push/subscribe`

Requires the session cookie. Body: `{ "subscription": { "endpoint": string, "keys": { "p256dh": string, "auth": string } } }`, the shape of the browser's `PushSubscription.toJSON()` (other subscription fields, such as `expirationTime`, are ignored). Stored as a `PushSubscription` under `push:<userId>:<id>`; subscribing the same endpoint again replaces it. Response: 204, no body.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Not a JSON object; `endpoint` not an `https:` URL (at most 2,048 characters); `p256dh` not a base64url 65-byte P-256 point; `auth` not base64url of 16 bytes |
| 401 | `unauthenticated` | No valid session cookie, or the session's user no longer exists |

### `DELETE /push/subscribe`

Requires the session cookie. Body: `{ "endpoint": string }`. Deletes the subscription stored for that endpoint, if any. Response: 204, no body.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Not a JSON object, or `endpoint` missing or empty |
| 401 | `unauthenticated` | No valid session cookie |

## `GET /drive/token`

Returns a short-lived Drive access token for the signed-in user: `{ accessToken, expiresAt, folderId }` (`folderId` is `null` before the vault is provisioned). Requires the session cookie.

`?fresh=1`: drops the cached token (`drivetoken:<id>`) before minting, so the response is never the token Drive just answered a 401 with. The app's `driveFetch` sends this on its one retry after a Drive 401 (see `app/src/drive.ts`); without it, a retry could receive the same rejected token back from the cache. Without `fresh=1` the cached token is returned as usual.

| Status | `error.code` | When |
| --- | --- | --- |
| 401 | `unauthenticated` | No valid session cookie, or the session's user no longer exists |
| 401 | `reauth` | Google refused the user's refresh token (`invalid_grant`); happens on the `fresh=1` path too |
| 502 | `google_error` | Any other Google failure |
