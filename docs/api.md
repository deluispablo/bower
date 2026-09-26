# API data model

All state the Worker keeps lives in Cloudflare KV (binding `BOWER_KV`), accessed only through `api/src/store.ts`. This page documents the key layout and the shapes stored under each key. No real values (emails, ids, tokens) appear below or anywhere in the repository.

## Data model

| Key pattern | Value | TTL | Written by | Read by |
| --- | --- | --- | --- | --- |
| `user:<id>` | `User` | none | `putUser` | `getUser`, `findUserByEmail` |
| `email:<email>` | user id (string) | none | `putUser` | `findUserByEmail` |
| `allow:<email>` | `'1'` | none | the operator, outside this module | `isAllowed` |
| `run:<id>` | `Run` | none | `putRun` | `getRun` |
| `quota:<id>:<yyyy-mm-dd>` | request count (string) | 48 h | `incrQuota` | `incrQuota` |
| `push:<id>:<subId>` | `PushSubscription` | none | `putPushSub` | `listPushSubs` |
| `drivetoken:<id>` | cached Drive access token (string) | caller-supplied | `putDriveToken` | `getDriveToken` |

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

## `PushSubscription`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `endpoint` | `string` | |
| `keys.p256dh` | `string` | |
| `keys.auth` | `string` | |
| `createdAt` | `string` | ISO-8601 |
