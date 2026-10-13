# The Worker contract (app side) — design


Architecture revision `2026-10-05-contracts-2`: [ARCHITECTURE](../ARCHITECTURE.md) governs stable boundaries, compatible evolution, durable execution and early premise probes. Shapes and operation lists below are a historical implementation baseline, not the final capability ceiling; change them only with assigned migration/compatibility evidence.
Planning update 2026-10-05: read [PRODUCT](../PRODUCT.md), [WORK_PLAN](../WORK_PLAN.md) and [P2_ACCEPTANCE](../P2_ACCEPTANCE.md). The app-first, full second-brain capability contract governs delivery. Existing shapes below describe the current baseline; extensions must be versioned and implemented through assigned entries, not assumed present.

Keep the Worker minimal. P2 simulates complete generated-document, research, context-expansion, report/recovery and undo flows; the current API below does not yet cover all of them. Define/test those extensions in P2 before P3 real service implementation. App-side preparation is revalidated by the runner. No centralized all-write backend is adopted.

Date: 2026-10-04. Status: written in phase 2 with the fake Worker that the app uses today (`src/data/fake/fake-worker.ts`). Phase 3 implements the accepted versioned contract after P2 boundary work. Until a migration is accepted, this baseline guides existing clients; newer adopted architecture and capability requirements govern planned extensions.

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
| `GET /auth/login` | | A redirect to Google, then back to the app | A failed or cancelled callback redirects to the app's sign-in with `?signin=failed` or `?signin=cancelled`, never a JSON page (TL-P3-07) |
| `POST /auth/logout` | | 204, the cookie cleared | |
| `DELETE /me` | | 204: the Worker forgets the person (tokens, settings, runs, the pointer to their folder) and clears the cookie; the Drive folder is never touched, and signing in again starts at the folder step (`POST /vault` finds the folder they had) | 401 |
| `GET /drive/token` (`?fresh=1` after Drive said 401) | | `{ accessToken, expiresAt }` (epoch ms, at most 1 h) | 401 signed out; 409 `no-folder` |
| `POST /vault` | `{}` | `{ folderId, found }`: a new Bower folder made from the template (the five main folders, `Rules.md`, `About me.md`, `.bower/`), or the existing one (`found: true`, so the app says welcome back) | 401 |
| `POST /process` | `{ scope: "all" \| "instructions", allowWeb: boolean, requestId }` (the person's "Look things up on the web"; the dispatch's `allow_web`). `requestId` is made by the app once per press: lowercase letters, digits and dashes, at most 64 (TL-P3-15) | `{ run: RunWire, revision }`, the run it started, or the one already going. A repeat with the same `requestId` returns that request's run, and the first request's scope wins | 401; 409 `no-folder` "Choose a folder for Bower first."; 409 `nothing` "Nothing is waiting in the inbox." / "There is nothing new for Bower to read." / "Nothing in the inbox is ready yet." (only held piles wait, TL-P2-21; admission reads each pile's note by the runner's own rules, transiently, and keeps only its id and version, TL-P3-25); 409 `stale-session`; 429 over the daily limit |
| `POST /session` | `{ place, action: "check" \| "take" \| "leave", gen }` (`gen`, the place's leave generation; missing counts as 0, TL-P3-14) | `{ active, epoch }`: one active session per person (TL-P2-13, TL-P2-14, TL-P2-25) | 401 |
| `GET /status` | | `{ run: RunWire \| null, revision }`, the run going now or the last one. `revision` rises with every change to the person's runs; the app drops an answer older than the last it took | 401 |

**General error codes** (TL-P3-05). Every error answer carries one code from this list or from the calls above. Codes are kebab-case. The app decides by status and code, and shows `message`.

| Status | Code | When | Message (one sentence for the person) |
| --- | --- | --- | --- |
| 401 | `signed-out` | No valid session | "Sign in to continue." |
| 403 | `forbidden` | Wrong origin, or the person is not on the allowlist | "Bower can't do that from here." |
| 404 | `not-found` | Unknown path or resource | "Bower couldn't find that." |
| 413 | `payload-too-large` | The body is over the limit | "That is too large for Bower to take." |
| 415 | `unsupported-media-type` | The body is not JSON where JSON is expected | "Bower couldn't read that request." |
| 429 | `rate-limited` | Over a rate or daily limit | "Bower needs a short break. Try again later." |
| 500 | `internal` | Anything unexpected, including missing configuration | "Something went wrong on Bower's side. Try again later." |

A 500 never names its cause. Missing configuration, a missing secret or a failed dependency all answer `internal`, and the details go to the Worker's log only ([OWASP error handling](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)). There is no `config` code.

**One active session** (TL-P2-13, TL-P2-14, TL-P2-24 and TL-P2-25).

- **Headers.** `POST /process`, `POST /vault` and `DELETE /me` carry `x-bower-place` and `x-bower-epoch`. CORS allows both headers.
- **Stale session.** A missing or stale epoch on those calls gets 409 `stale-session` with "Bower is open in another window."
- **Leaving.** The app sends `leave` on `pagehide` with `fetch(..., { keepalive: true })`.
- **Leaving Bower.** `DELETE /me` releases the person's lease.
- **Coming back.** A holder whose lease expired, and that nobody took, takes it again without asking.
- **Checking after leaving.** A `check` by the same place right after its own `leave`, with no grant in between, returns the same epoch. Any other grant raises it.
- **Stale checks.** The client ignores replies to checks that started before its latest `leave`. Each `check` and `leave` carries the place's leave generation. The Worker discards a `check` with an older generation than that place's last `leave`, so a stale check never grants the lease.
- **Wiring.** The real source is wired to the session only once the Worker has `POST /session`. Fake and demo are wired already.

```ts
interface RunWire {
  id: string;
  scope: 'all' | 'instructions';
  phase: 'queued' | 'reading' | 'writing' | 'saving' | 'done' | 'failed';
  requestedAt: number;   // epoch ms, when the person tapped Tidy up
  phaseAt: number;       // when this phase started
  finishedAt?: number;
  total?: number;        // things to file (pile members; your changes are not counted), known from `reading` on
  failure?: string;      // one sentence, for a failed run
}
```

The app counts a run from `requestedAt` on every device. It asks `/status` every 4 s while a run is going and every 60 s otherwise, and again when the app comes back to the screen.

## What the Worker sends the runner

`repository_dispatch` with `{ run_id, vault_id, ticket, scope, allow_web }`. The runner fetches a Drive token with that ticket, reports each phase (`queued` → `reading` with `total` → `writing` → `saving` → `done` or `failed` with `failure`), and writes the run's report to the folder before it reports `done`:

- `.bower/last-run.json`: `{ v: 1, run: <RunWire with report> }`, where `report` is the app's `RunReport` (`filed`, `created`, `updated`, `setAside`, `questions`, `yourChanges`, and `requests` done and `rulesWorded` when there were any; `nothingReady: true` when every admitted pile was held, so the report says "Nothing in the inbox was ready yet", TL-P3-26).
- `.bower/questions.json`, `.bower/suggestions.json`, `.bower/requests.json`, `.bower/hashes.json` (shapes in `src/data/vault/layout.ts`).
- `Rules.md` with the rules typed in the app worded (`src/data/vault/rules-format.ts`), and the rules a `rule` line `removes` (by their wording) taken out.
- After a `rename` or `move` line (`from` → `path`), every `[[link]]` to the old name written with the new one, in every note (a label after `|` stays). Until then the app finds a note by the names it had (`src/data/links.ts`).
- The journal files it read moved to `.bower/changes/archive/`. Find every root child folder whose actual Drive name is `.bower`, then every child folder named `changes`: two clients can create duplicate folders before either sees the other. Read the direct journal files from all of them; disambiguated display paths such as `.bower (2)` are not folder identities. Journal records are unique by `id`: a runner keeps one per id and archives every copy (a device whose answer was lost may have written one twice). An unreadable record stops the run before writes and stays untouched. The app's late acknowledgment check also reads the `archive` children of every `changes` folder, so an already processed line is never recreated.
- `appProperties.bowerNew = "1"` on what it filed or changed, cleared from the previous run's things first.

A run takes the piles in the inbox when it starts. Piles added during the run wait for the next one.

### Runner wire (P3, TL-P3-18)

This adapts the original's run tickets and runner routes (`run-ticket.ts`, `runner.ts`) to the per-person object and to R3's results.

- **Dispatch.** `repository_dispatch` to the instance repository with `event_type: "bower-tidy"` and `client_payload: { run_id, attempt, ticket, scope, allow_web }`. The folder id is not in the payload; the token route gives it.
  - `run_id` is `<person object id, hex>-<random>`, so the Worker routes a runner call to the right person object without any lookup. It reveals nothing about the person.
  - The workflow's `run-name` is `tidy <run_id> <attempt>`, with a concurrency group per `run_id` and no `cancel-in-progress` (R3).
  - A 204 means "accepted, not yet observed", never "started".
- **Ticket.** 32 random bytes, base64url, minted per attempt. The person object keeps only its SHA-256, the `run_id`, the attempt and an expiry of 60 minutes. A new attempt replaces the ticket, so an older attempt's ticket stops working. A ticket is retired when its run reaches `done` or `failed`. It is never logged.
- **`GET /runner/runs/:id/token`** with `Authorization: Bearer <ticket>` → `{ accessToken, expiresAt, folderId, attempt }`.
- **`POST /runner/runs/:id/status`** with the same header and `{ attempt, seq, phase, total?, failure? }` → `{ run, revision }`.
  - `seq` rises with each report of an attempt. A repeat of the last `seq` returns the current state and changes nothing; a lower one is refused.
  - A phase only moves forward along `queued` → `reading` → `writing` → `saving` → `done` | `failed`. The phase a person sees never moves back, even across attempts.
    - 200: a repeat of the last `seq`; a report that reaches or passes the run's phase; and a report from a later attempt whose phase is behind the run's (attempt 2 posting `writing` after attempt 1 reported `saving`). That last one is recorded as the attempt's last `seq` and phase and answers the current run and revision, the run unchanged.
    - 409 `stale-report`: a lower `seq`; a phase behind the same attempt's own last phase; a run already ended.
  - The status revision rises only when the run a person sees changes: its phase, `total` or `failure` (and so its `finishedAt`). A report that shows nothing new, or is only recorded, answers the same revision.
  - `total` is the number of things (pile members) the run takes, on every report, in `last-run.json` and for a resumed attempt; your changes are not counted in it (TL-P3-25 point 3).
  - A run whose admitted piles are all held when the runner reads them (a pile changed after admission) ends `done` with nothing filed; its report says nothing was ready yet (`nothingReady`) and every admitted item's disposition is `waiting`. It is never `failed` (TL-P3-25 point 2).
- **Attempt ended** (TL-P4-16 addendum 4): the same route takes `{ attempt, ended: true }` (no `seq`, no phase; `src/data/contracts/attempt-ended.ts`) → `{ run, revision }`, nothing a person sees changed.
  - The runner sends it last when its attempt stops with no `done` or `failed` taken: left in `saving`, its chain unread, a report not taken, or any error nobody caught. Not after `stale-attempt`, a refused ticket, or a run the Worker already holds ended.
  - The Worker looks at the run 60 s later (the run's deadline, through the same early look as a lost dispatch) instead of at its stale deadline; recovery then decides as below. A run already ended answers its state and arms nothing; an older attempt is 409 `stale-attempt`.
  - Additive: a Worker from before it answers 415, and the run waits for its stale deadline as before. A job that Actions kills sends nothing and is caught only by that deadline.
- **Runner errors** use the same JSON shape:
  - 401 `signed-out` for a missing, wrong or expired ticket;
  - 409 `stale-attempt` "This tidy-up was taken over." for an attempt that is no longer current;
  - 410 `gone` "This tidy-up is no longer allowed to change your folder." on the token and attempt routes, for the run's own ticket, once the person is gone (any other bearer stays 401): after Delete me, or once Google access was revoked or the kept refresh token is unreadable. A plain sign-out leaves them answering, since a run never depends on a browser. The runner drops the Drive token it keeps, writes nothing more, and ends the run `failed` with that sentence;
  - 409 `stale-report` "That update arrived late." for a lower `seq`, a phase behind the same attempt's own last one, or a run already ended. Its body also carries `current: { seq, phase }`: the last `seq` the Worker took from this attempt (0 before any) and the run's phase. The runner resends once from `seq + 1`; when that phase is `done` or `failed` the run is finished and it sends nothing more, and a `done` refused again is a failed job, never swallowed.
- **Recovery without the browser.** At dispatch, the person object sets a [Durable Object alarm](https://developers.cloudflare.com/durable-objects/api/alarms/) for the stale deadline. When the alarm finds no progress, it looks up the run by `run-name` in GitHub Actions and reads the job's `started_at` and `completed_at`.
  - It redispatches once, as attempt + 1 with a new ticket, if no live job holds the run.
  - Otherwise, or after a second stale deadline, it marks the run failed `stale`.
  - The runner never repeats work that has already landed: before any write, it checks the folder for this `run_id`'s report (spine entries).
- **GitHub credential.** A Worker secret `GITHUB_TOKEN`: a fine-grained token limited to the instance repository, with Contents read and write (needed for `repository_dispatch`) and Actions read. The owner creates it and sets it with `wrangler secret put`.
