# Technical-lead decision TL-P4-14: consolidate the base before C06

**Owner decision, 2026-10-08.** The owner asked for a full code review aimed at DRY and at base changes that would replace special cases. After reading the findings, the owner approved a consolidation in stages before C06 and asked the lead to plan it and hand it to the coordinator. New feature work stops until the consolidation is done.

**The review.** Four read-only Opus reviews of `main` `e317fc7` covered the spine, contracts and runner; the Worker; the app's data layer; and the UI. They found one root cause: each live failure added its own copy of an idea, and the copies now disagree. That is also why tests pass while staging fails, since the fake and the demo run different code from the runner.

## Rules for every consolidation entry

1. **Behaviour stays the same.** The only changes allowed are the bug fixes listed here. Copy, contracts on the wire and Drive layout stay unchanged, unless an entry names the change.
2. **Each entry has a red that fails because of the drift today.** Examples:
   - a shared contract test that both old paths must pass, which one of them fails;
   - a golden;
   - a type-level check (for example `satisfies Record<keyof DriveApi, ...>`).

   A refactor with no red needs a stated reason in the entry.
3. **Deleted code is counted.** The card adds `removed: <lines>`. An entry that adds a mechanism must remove the copies it replaces in the same entry.
4. **Drive-call goldens never rise.** Every existing golden (C04 runner calls, Home calls, admission subrequests) stays equal or falls.
5. **Data-safety entries start on `bower-escalated`:** the engine, write-once, the Drive transport and Worker deadlines and dispatch. Everything else starts on `bower-implementer`, or `bower-mechanical` where marked.
6. **The TL-P4-13 checklist applies,** and the review card states whether a deleted copy had a behaviour the new mechanism lacks.
7. **Gates.** Each entry runs `pnpm check` and the touched e2e. Each stage ends with the four suites, a staging deploy and a live smoke: C04 garden ×1, offer-and-flat ×1, `c05-hub-lines` ×1 and Home's time.

## Stage 0: close what is in flight, then a baseline

- Finish `state-yes-writes`, the `ask-answer-loop` fix round and `home-errors-shown`. Nothing new starts from the TL-P4-13 queue except what stage 1 lists.
- Merge, run the suites, and send the SHA. The lead deploys and runs the C05 live check from TL-P4-13: keep-one-note through a real answer, a hub, a duplicate and Home's time. This is the baseline the consolidation must preserve.

## Stage 1: small, removes real bugs (about 10 entries)

| Entry | What | Fixes |
| --- | --- | --- |
| `c1-digest` | One digest module (size, SHA-256, MD5 and the empty-file constants), used by app, runner and Worker | Seven or more inline hashers; MD5 in the runner against SHA-256 in the fake for the same report check |
| `c1-still-as-seen` | One expectation type (id, name, parents, optional modifiedTime, sha256, children), one check at the write boundary, one typed error with a reason code | Five or more versions with different parent-order rules; a refusal recognised by its message text |
| `c1-drive-ops-table` (mechanical) | Every `DriveApi` method classed read or write in one typed table | The fake-only digest read going through the lease guard |
| `c1-worker-routes` | A `person` middleware that maps RPC errors once (503 on version skew), `jsonBody`, `HttpError` with details, one `authorize` RPC, one `refreshToken(env, person)` | `requireSession` answering 500 during a deploy; three copies of each helper |
| `c1-worker-deadlines` (escalated) | One `deadlines(kind, key, at)` table and a single `rearm()`; `alarm()` handles whatever is due | Gone-ticket rows outliving the hour after Delete me; four kinds of deadline setting and clearing one alarm |
| `c1-admit-once` | Drop `wouldAdmit`; `admit(null)` first; quota checked before any Drive read | A press over the daily limit spending up to 35 subrequests |
| `c1-shared-contracts` | The Worker imports `RunWire`, phases, lease types and the folder template from `src/data/contracts`; one pure `decideLease()` for the Durable Object and the fake | Four phase lists, two lease state machines that differ on old leaves, three folder templates that differ |
| `c1-worker-schema-v11` (mechanical) | Drop the unused `admission` table and `control` columns, rename `run_ticket.epoch` to `attempt`, delete dead exports | Dead schema |
| `c1-small-fixes` (mechanical) | BirdLab only in development builds; Settings' plural; `markSeen` errors reported | Visible defects |
| TL-P4-13 items | `corpus-grounded-scorer`, `verify-names-precheck`, `safety-polish` | As ruled |

## Stage 2: one engine, one Drive (the largest gain)

| Entry | What |
| --- | --- |
| `c2-drive-transport` (escalated) | One transport for the app, runner and Worker: token refresh, retry and backoff, error mapping, one wire type and field list. `DriveHttp` builds on it; `RunnerDrive` keeps only the fence and the attempt check; the Worker's `vault.ts` client goes. `FencedDrive` and `StoredEvidence` move into `drive-api.ts`, so no production code imports from `fake/`. |
| `c2-read-cache` | One read cache keyed by file id plus modifiedTime, used by DriveVault, Journal and the runner. Only the listing is ever invalidated, so a refresh can never clear a read in flight. The runner's eight caches and its time-based holds go. |
| `c2-fake-parity` | Digests, `unchecked` and `binnedByItem` join `DriveApi` and are built on both the fake and real Drive; the runtime "does this Drive have it" checks go. Fake search behaves like Drive's (tokens, page cap). |
| `c2-one-engine` (escalated) | One engine in `src/data/spine` checks, sends with a fence, observes and reads back, behind a Drive port. The runner and the fake run service both use it, so the fake becomes only a Drive adapter. Checkpoints per batch and recovery by the `bowerOp` stamp apply everywhere, so the demo and e2e use the live protocol. |
| `c2-write-once` (escalated) | Every write (operations, run records, report files) carries `bowerOp`, reconciles by the stamp and confirms from the answer's checksum. The six recovery methods, their text checks and their take-once caches go. |
| `c2-upload-queue-only` | The upload queue is always used, with an in-memory store in tests. The direct upload path and `DriveHttp`'s second resumable loop go. |
| `c2-worker-dispatch` (escalated) | Admission schedules a "dispatch now" deadline, and only the alarm mints tickets and dispatches. A run row holds `deadline_at` and `version`, and the alarm compares and sets. Delete me deletes personal tables explicitly and keeps the ticket rows and the generation floor, with a test that classes every table. |
| `home-reads-bounded` | As ruled in TL-P4-13 addendum 2, built on the new cache. |

**Review.** Stage 2 gets the cross-provider Codex review once `codex exec` answers (from 2026-10-12, TL-P3-16), together with the P3 range that review was already due to cover. If Codex is not back, the Opus fallback (TL-P2-46) applies.

## Stage 3: the planner and the model's reply

| Entry | What |
| --- | --- |
| `c3-reply-schema` | One declarative schema for the model's reply. Each rule's id is its refusal kind, and line limits come from `note-edit` (one set of limits). The admitted-set check moves into the manifest contract as a parameter, so Bower's own file list exists once. |
| `c3-subject` | One `Subject` type (pile, thing, note state or folder, with id and content hash), one key function and one open-questions function shared by the reader and the planner. One question type replaces `Question`, `ReportQuestion` and `CorpusQuestion`. |
| `c3-planner-split` (escalated) | `planScripted` is split into three steps: capture, decisions (from the script or the model) and building operations. The live path imports no demo fixture, and answers reach the model's path, so check the ask-answer-loop wiring. One "record to the operations it needs" map replaces the five "waits for the next run" sets. Report rows are generated from operation metadata, so `grounded()` keeps only a structural check. |
| `c3-note-sections` | One section parser (`ownership-format`) gives every section's position, old notes included. The Timeline-line pattern exists once. |
| `c3-state-mark` | Bower's last-written Current state is read from the previous state change in the manifest, or each line is marked, so the 2^12 subset search goes. |
| `c3-fingerprint` (mechanical) | The input fingerprint hashes a normalized object, not regex-edited JSON. |

## Stage 4: the UI

| Entry | What |
| --- | --- |
| `c4-query-store` | One shared store per data type, with one request in flight, one error and one reload, through `useSyncExternalStore`. `useRun` and `usePiles` stop multiplying `/status` calls and pile calculations. |
| `c4-resource` | Hooks return `loading`, `error` or `ready`. A `<Resource>` component renders the loading and the error-with-retry itself, and a lint rule bans reading data without it. The 8 screens that can stick or show something false are fixed by construction. |
| `c4-use-action` | `useAction(fn, {failure, success})` gives a busy guard, safety after unmount and reporting, plus `useStartRun()`. Every double press and hand-written busy pattern goes. |
| `c4-run-view` | One function in `run-words.ts` turns a run into its kind, label, title, detail and action, and all six surfaces render from it. |
| `c4-copy` | One copy file keyed by message id; tests check the keys. |
| `c4-e2e-fixtures` (mechanical) | `open()`, `tidyUp`, `toast` and `inbox` live in `e2e/fixtures.ts`, with one set of defaults. |

## Later: at the P4 freeze, if time allows

- **The demo on real code.** DriveVault over a seeded FakeDrive with a scripted Worker; `demo/world.ts` keeps only its scenario data. Size L.
- **One session-fencing model.** One object per sign-in, passed explicitly, instead of about 8 proxy layers. Size M to L.

## Order and capacity

Stages run in order: stage 0, then 1, 2, 3 and 4.
- **Within a stage,** at most two workers, with any two entries that touch different files.
- **In stage 2,** the transport and the cache come before the engine and write-once, and `c2-fake-parity` before `c2-one-engine`.
- **After stage 4,** the slices resume from C06, with P4-E alongside, as P4_PLAN says.
