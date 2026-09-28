# API data model

All state the Worker keeps lives in Cloudflare KV (binding `BOWER_KV`), accessed only through `api/src/store.ts`. This page documents the key layout and the shapes stored under each key. No real values (emails, ids, tokens) appear below or anywhere in the repository.

## Data model

| Key pattern | Value | TTL | Written by | Read by |
| --- | --- | --- | --- | --- |
| `user:<id>` | `User` | none | `putUser` (new user), `updateUser` (every later change) | `getUser`, `findUserByEmail`, `listUsers`, `listVaultIds` |
| `email:<email>` | user id (string) | none | `putUser` | `findUserByEmail` |
| `allow:<email>` | `'1'` | none | the operator, outside this module | `isAllowed` |
| `run:<id>` | `Run` (the latest ingest) | none | `putRun` | `getRun` |
| `lintrun:<id>` | `Run` (the latest scheduled lint) | none | `putRun(…, 'lint')` | `getRun(…, 'lint')` |
| `runticket:<id>` | `RunTicket` (`{ hash, expiresAt }`: the SHA-256 of the current ingest's ticket, never the ticket) | 55 min (`RUN_TICKET_TTL_MS`) | `issueRunTicket` (`POST /process`) | `checkRunTicket` (runner routes); deleted by a `done`/`failed` report |
| `lintticket:<id>` | `RunTicket`, for the current lint | 55 min | `issueRunTicket` (`POST /runner/lint/dispatch`) | `checkRunTicket`; deleted by a `done`/`failed` report |
| `quota:<id>:<yyyy-mm-dd>` | request count (string) | 48 h | `incrQuota` | `incrQuota`, `getQuota` |
| `push:<id>:<subId>` | `PushSubscription` | none | `putPushSub` | `listPushSubs` (deleted by `deletePushSub`, `DELETE /push/subscribe`, and `sendPush` on a 404/410) |
| `drivetoken:<id>` | `DriveToken` (cached Drive access token) | token lifetime − 60 s, at least 60 s (set by `drive.ts`) | `putDriveToken` | `getDriveToken` |
| `sessiongen:<id>` | session generation (string) | none | `putSessionGeneration`, only from `POST /auth/logout-all` | `getSessionGeneration` (every cookie route, sign-in) |
| `deleted:<id>` | `'1'` (tombstone) | none, kept for good | `deleteUserData` (`DELETE /me`, `DELETE /admin/allow/:email`) | `isDeleted` (every cookie route, sign-in, `updateUser`, `listUsers`, `listVaultIds`) |

Notes:

- `<id>` is always a `User.id`.
- `<email>` is lower-cased and trimmed before use as a key, so lookups are case-insensitive.
- `quota` has no atomic increment in KV: `incrQuota` reads, increments and writes back. Two requests racing on the same user and date can undercount by one. Accepted as a soft per-user daily limit, not a billing figure.
- `deleteUserData` first writes the `deleted:<id>` tombstone, then removes every `user:`, `run:`, `lintrun:`, `runticket:`, `lintticket:`, `quota:<id>:*`, `push:<id>:*`, `drivetoken:<id>` and `sessiongen:<id>` key for a user, plus its `email:` index, but never `allow:<email>` — the allowlist belongs to the operator, not the user. The tombstone holds no personal data (the key is a random id) and stays, so a record a stale write re-creates after the deletion is never treated as a user again. Ids are never reused: signing in again after a deletion creates a new account with a new id.
- Revocation state (`sessiongen:`, `deleted:`) lives outside `user:<id>`, in keys no other route writes. A route that changes the user record goes through `updateUser`, which re-reads the record and merges only the fields it changes, so a request holding an older copy of the record cannot write back fields it did not touch. KV is eventually consistent: a read in another location can be up to about 60 s old, so a sign-out everywhere or a deletion can take that long to reach every location.
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
| `tourSeenAt` | `string` | optional; ISO-8601, when the user finished or skipped the first-run tour. Set through `PATCH /settings`, returned by `GET /me`, never in `GET /admin/users` |
| `givenName` | `string` | optional; the Google profile's first name (`profile` scope), refreshed on every sign-in (`GET /auth/callback`). Returned by `GET /me` as `name`, never in `GET /admin/users` |
| `sessionGeneration` | `number` | optional, legacy and read only: where `POST /auth/logout-all` kept the generation before `sessiongen:<id>`. Nothing writes it any more; a stored value still counts (the higher of the two applies) |

## `Run`

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `'queued' \| 'running' \| 'done' \| 'failed'` | |
| `kind` | `'ingest' \| 'lint'` | optional; absent on runs stored before kinds existed, read as `ingest`. `run:<id>` only ever holds an ingest, `lintrun:<id>` a lint |
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

## Sessions

`GET /auth/callback` signs a new session on every sign-in and sets it as the `bower_session` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`, 30 days). Its claims are `userId`, `gen` (the user's session generation from `sessiongen:<id>`; a cookie without one reads as 0), `sid` (random, so no two sign-ins share a token), `iat` and `exp`. Every route that takes the cookie, `GET /me` included, loads the user and answers:

| Status | `code` | When |
| --- | --- | --- |
| 401 | `unauthenticated` | No cookie, a bad signature or malformed token, or the user no longer exists (a `deleted:<id>` tombstone, checked first, or no record) |
| 401 | `session_expired` | The session is more than 30 days old (`iat`; never extended), or `gen` is below the user's session generation (`sessiongen:<id>`; signed out everywhere) |

A rejected cookie is also cleared (`Max-Age=0`). The app treats any 401 from `GET /me` as signed out and shows the sign-in screen.

### `POST /auth/logout`

Same origin (see `docs/security.md`). Clears the cookie on this browser only. Response: 204.

### `POST /auth/logout-all`

"Sign out everywhere". Same origin, and requires a valid session cookie. Writes the next generation to `sessiongen:<id>` (one above the higher of the stored generation and this cookie's `gen`), so every session signed so far, on every device, is rejected from then on (within about 60 s everywhere, see [Data model](#data-model)), and clears this browser's cookie. The next sign-in signs with the new generation. Response: 204.

| Status | `code` | When |
| --- | --- | --- |
| 401 | `unauthenticated`, `session_expired` | As above |
| 403 | `forbidden` | `Origin` (or `Referer`) is not `APP_ORIGIN` |

## Every request

These apply before any route's own checks, in this order (`api/src/index.ts`, middleware in `api/src/security.ts`):

1. **Request id.** A client `x-request-id` of 1 to 64 characters from `A-Z a-z 0-9 . _ -` is kept; anything else (or none) is replaced by a fresh UUID. The id is echoed in the `x-request-id` response header and prefixes every log line; a rejected value is never echoed or logged.
2. **Body size.** A body over 64 KB answers 413 `payload_too_large` before any handler parses it: checked on `Content-Length` when sent, else counted while the body streams in.
3. **Content type.** A `POST`, `PUT`, `PATCH` or `DELETE` that carries a body must send `Content-Type: application/json` (a `charset` parameter is fine), else 415 `unsupported_media_type`. The writes that take no body (`POST /auth/logout`, `POST /auth/logout-all`, `DELETE /me`, `DELETE /admin/allow/:email`) send none and are not checked; neither is `POST /process` when it is sent without its optional body.
4. **Generic rate limit.** At most 120 requests per client IP in any 60 seconds across every cookie route (`/auth/*`, `/me`, `/drive/token`, `/settings`, `/vault`, `/process`, `/status`, `/push/subscribe`), else 429 `rate_limited` with `Retry-After` (seconds until the oldest counted request leaves the window). Counted in memory, not KV: a sliding window per Cloudflare isolate (at most 10,000 IPs tracked), so it is best-effort and costs no KV write. It runs ahead of the strict 30 in any 60 seconds on `GET /auth/callback` (per client IP, counted only once the `bower_oauth` cookie verifies) and `POST /process` (per user, counted only after the same-origin and session checks), which are counted in memory the same way. Not counted: `/health`, `GET /push/public-key`, `/runner/*`, `/admin/*` and unknown paths.

| Status | `error.code` | When |
| --- | --- | --- |
| 413 | `payload_too_large` | The body is over 64 KB |
| 415 | `unsupported_media_type` | A write carries a body that is not `application/json` |
| 429 | `rate_limited` | More than 120 requests in 60 seconds from the same IP on the cookie routes |

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

Starts one agent run for the signed-in user's vault. Requires the session cookie. The app calls it from Tidy up (after the "Is that everything?" confirmation), and from a waiting request's Do it now on the Bower tab.

The body is optional. Without one (or with `{}`), the run is a whole tidy-up. `{ "scope": "instructions" }` asks for an instructions-only run: only the instruction notes in `0-Inbox/`, the rest of the inbox left where it is (Do it now, #344). `{ "scope": "all" }` is the same as no body. Any other `scope`, a body that is not a JSON object, or one that is not JSON is a 400 `bad_request`, checked right after the session and the rate limit, before any run is dispatched, stored or counted.

The Worker sends a `repository_dispatch` to the operator's instance repo (`GITHUB_REPO`, authenticated with `GITHUB_TOKEN`) with `event_type: "ingest"` and `client_payload: { "vault_id": "<id>", "ticket": "<ticket>", "scope": "all" | "instructions" }`. The runner does not honour `scope` yet (#373): until it does, an instructions-only run still tidies up the whole inbox. The `vault_id` is the user's id: each user has one vault, and the runner fetches its credentials with `GET /runner/vaults/:id`. The `ticket` is this run's credential for the runner routes (see [Runner endpoints](#runner-endpoints)): 32 random bytes, base64url. Only its SHA-256 is stored, under `runticket:<id>`, before the dispatch; it replaces the previous run's.

In order:

1. No user or no vault: 401 or 409, nothing else happens.
2. If the stored run is `queued` or `running` and not stale, it is returned as is: no new dispatch, nothing counted. See the staleness table below for when a run is stale. A stale run does not block: it is stored as `failed` with `error: "stale"` first (so it is never silently replaced), then a new run is dispatched below.
3. If today's count (UTC date) has reached `DAILY_RUN_LIMIT`, the answer is 429.
4. The run's ticket is minted and its hash stored, then the dispatch is sent. If GitHub does not answer 204, the ticket is deleted again, the answer is 502 and nothing else is stored or counted.
5. A new run `{ state: "queued", kind: "ingest", requestedAt, runId }` is stored under `run:<id>`, today's count goes up by one, and the run is returned.

Response: `{ "run": Run }`, status 202, both for a new run and for the run already in progress.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `bad_request` | The body is not JSON, not a JSON object, or its `scope` is neither `"all"` nor `"instructions"` |
| 401 | `unauthenticated` | No valid session cookie, or the user no longer exists |
| 403 | `forbidden` | `Origin` (or, without it, the `Referer`'s origin) is not `APP_ORIGIN`. Checked before the session, on every state-changing session route (see `docs/security.md`) |
| 409 | `no_vault` | The user has not set up their Bower folder yet (`POST /vault`) |
| 429 | `rate_limited` | More than 30 requests this minute from the same IP (also on `GET /auth/callback`), or more than 120 in 60 seconds across the cookie routes (see [Every request](#every-request)). `Retry-After` gives the seconds left in the minute |
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

Called by the GitHub Actions runner of the instance repo, never by the app (`api/src/runner.ts`, `api/src/run-ticket.ts`). Two credentials, each sent as `Authorization: Bearer <credential>`; anything else is a 401 `unauthorized`. `:id` is the user id, the `vault_id` of the dispatch. Nothing here logs a key, a ticket, a token, the user's API key, file names or summaries.

- **A run ticket** for `GET /runner/vaults/:id` and `POST /runner/vaults/:id/status`. Each run gets its own: `POST /process` mints one for an ingest, `POST /runner/lint/dispatch` one per vault for a lint, and sends it in the `repository_dispatch`. The Worker keeps only its SHA-256 (`runticket:<id>`, `lintticket:<id>`) and compares hashes in constant time. A ticket works only for its own `:id` and its own kind of run (an ingest's ticket cannot report a lint, nor the other way round), and stops working when the run reports `done` or `failed`, when a newer run of the same kind on the same vault gets a ticket, or 55 min after it was minted (`RUN_TICKET_TTL_MS`: the 25 min queued window plus the 30 min running window).
- **The operator key `BOWER_API_KEY`**, compared in constant time, for `POST /runner/lint/dispatch` only. While the Worker var `RUNNER_ACCEPT_LEGACY_KEY` is `1`, a transition flag that is off by default, it is also accepted wherever a ticket is, and by `GET /runner/vaults`, so an instance repo whose workflows predate run tickets keeps working (`docs/runbook.md`, "Upgrading to run tickets"). With the flag off, the key is a 401 there.

### `POST /runner/lint/dispatch`

Starts the weekly health check. Called by `lint.yml`'s `dispatch` job with `BOWER_API_KEY`, on its schedule or by hand. Body optional: none or `{}` for every user with a vault (`listVaultIds`), or `{ "vaultId": "<user id>" }` for one. For each vault, in turn: a ticket is minted and its hash stored under `lintticket:<id>`; a `repository_dispatch` is sent with `event_type: "bower-lint"` and `client_payload: { "vault_id": "<id>", "ticket": "<ticket>" }`; and a `{ state: "queued", kind: "lint", requestedAt, runId }` run is stored under `lintrun:<id>`. One vault's failed dispatch does not stop the others: its ticket is deleted and nothing is stored for it.

Each vault costs about five subrequests: one GitHub call and four KV operations, which Workers count as subrequests too. The Workers free plan allows 50 subrequests per request, so one call starts about 10 health checks there; past that, the rest fail and the answer is a 502.

Response, status 200: `{ "dispatched": <number> }`.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `bad_request` | The body is not empty, `{}` or `{ "vaultId": "<non-empty string>" }` |
| 401 | `unauthorized` | Missing or wrong operator key (a run ticket is refused too) |
| 404 | `not_found` | `vaultId` names no user, or a user without a vault |
| 502 | `dispatch` | GitHub did not accept at least one dispatch; the message says how many of how many |

### `GET /runner/vaults`

Legacy: only while `RUNNER_ACCEPT_LEGACY_KEY` is `1`, for the old `lint.yml` whose `list` job still calls it. The id of every user who has a vault. The Worker pages through the `user:` keys (`listVaultIds`); users without a vault yet are left out.

Response, status 200: `{ "vaults": [{ "id": "<user id>" }] }` (an empty array when nobody has a vault). Ids only: never an email, a folder id or a token.

| Status | `error.code` | When |
| --- | --- | --- |
| 401 | `unauthorized` | Missing or wrong operator key, or the legacy flag is off |

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
| 401 | `unauthorized` | Missing, retired or expired ticket, or a ticket for another vault (or the operator key while the legacy flag is off) |
| 404 | `not_found` | No user with that id, or the user has no vault yet |
| 409 | `reauth` | Google refused the user's refresh token (`invalid_grant`). The user is flagged `needsReauth` (the app asks them to sign in again); the runner reports `failed` with this reason and stops. A 409, not a 401, so it is not mistaken for a bad ticket |
| 502 | `google_error` | Any other Google failure |

### `POST /runner/vaults/:id/status`

The runner's progress report. Body, validated strictly (an unknown field, a wrong type or another `state` is a 400 `bad_request`):

| Field | Type | Notes |
| --- | --- | --- |
| `state` | `'running' \| 'done' \| 'failed'` | Required |
| `kind` | `'ingest' \| 'lint'` | Optional; `ingest` when absent, so runners that predate it keep working |
| `runId` | `string` | Optional, non-empty; replaces the stored `runId` when given |
| `summary` | `string` | Optional; cut to 2,000 characters |
| `processed` | `string[]` | Optional; cut to 200 entries, each entry cut to 2,000 characters |
| `quarantined` | `string[]` | Optional; paths the pre-scan set aside under `0-Inbox/Quarantine/` this run (spec A.5); same bounds as `processed` |
| `refused` | `string[]` | Optional; paths (or `"*"` for the whole run) the post-run audit refused (spec A.3/A.4); same bounds as `processed` |
| `error` | `string` | Optional; cut to 2,000 characters |

A report with `quarantined` and/or `refused` but no `processed` is still valid.

The stored run of that kind is updated and takes the report's `kind`: an ingest under `run:<id>`, a lint under `lintrun:<id>`. A lint report never reads or writes `run:<id>`, so `GET /status`, `POST /process` and the app's Process button ignore it. Without a stored run of that kind, one is started with `requestedAt` set to now.

- `running`: `state` and `startedAt` (now) are set. A run that is already `running` keeps its `startedAt`. Outcome fields of an earlier attempt (`finishedAt`, `summary`, `processed`, `quarantined`, `refused`, `error`) are dropped.
- `done` or `failed`: `state` and `finishedAt` (now) are set; `summary`, `processed`, `quarantined`, `refused` and `error` become exactly the report's (absent when the report has none). The run's ticket is deleted: it can fetch nothing and report nothing more. Then the user's devices get a push notification (see [Web push](#web-push)). For an ingest: `2 files processed` (the length of `processed`), `Nothing new to process` when `processed` is empty or absent, or `Something went wrong` for `failed`. For a lint: `Health check ready`, or `Health check failed` for `failed`, never a count. A push failure never fails the report.

Response: `{ "run": Run }`, status 200.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `bad_request` | The body is not a JSON object matching the table above |
| 401 | `unauthorized` | Missing, retired or expired ticket, a ticket for another vault, or one for the other kind of run (or the operator key while the legacy flag is off) |
| 404 | `not_found` | No user with that id, or the user has no vault yet |

## Web push

The Worker sends notifications itself, with Web Crypto only (`api/src/push.ts`): the payload is encrypted per RFC 8291 (`aes128gcm`) and each request is signed with a VAPID JWT per RFC 8292 (ES256, `aud` the push service's origin, `sub` `VAPID_SUBJECT`, valid 12 h). Keys come from `pnpm -C api gen-vapid` (see `docs/runbook.md`). Nothing logs an endpoint, a key or a payload.

### Payload

What the service worker receives in the `push` event, as JSON:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | `string` | `Bower` |
| `body` | `string` | An ingest: `2 files tidied up` (or `1 file tidied up`), `Nothing new to tidy up`, or `Something went wrong`; a `done` body gets a short `" · n set aside"` suffix when the run quarantined anything. A lint: `Health check ready` or `Health check failed` |
| `url` | `string` | App path to open on click: `/` for an ingest, `/health` (the Health screen) for a lint |

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
