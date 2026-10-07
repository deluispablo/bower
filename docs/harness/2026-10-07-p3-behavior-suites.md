# P3-18: behaviour suites on the real adapters

Entry `behavior-suites-real-adapters` ([packet](2026-10-07-p3-18-behavior-suites-packet.md), [TL-P3-25](2026-10-07-tl-p3-25-pile-notes-and-the-last-p3-e-entries.md) point 4, P3_ACCEPTANCE C12).

## The world

- **App:** `makeLiveSources` as `choose.ts` builds it for `?source=real` (Drive links, declared piles, one place `tab-1` started as the app shell starts it), with `WorkerHttp` and `DriveHttp`. The upload queue is off: there is no IndexedDB in the suite, so pile files are sent straight.
- **Worker:** its Hono app in-process through `app.request` ([Hono testing](https://hono.dev/docs/guides/testing)). The person objects are the real `Person` class over in-memory SQLite (`node:sqlite`), behind the storage calls it makes ([SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)). The alarm is fired by calling `recover` at the alarm's own time, through the replayed GitHub; that is what `Person.alarm()` does with the wall clock and the global fetch. `crypto.subtle.timingSafeEqual`, a Workers extension, comes from Node's.
- **Runner:** `main` with the dispatch's event file at `GITHUB_EVENT_PATH`, one call per GitHub job.
- **Transports, all replayed:**
  - Drive v3 is `runner/test/drive-v3.ts`, unchanged, plus what real Drive also does that the app needs (`drive-v3-real.ts`): restore from the Bin (`trashed: false`), `fullText contains`, and tokens minted by Google's token endpoint, which `revoke` turns into 401s.
  - Google's token endpoint answers `invalid_grant` once revoked.
  - GitHub's dispatches, workflow runs and jobs are named `tidy <run_id> <attempt>`.
- **Files:**
  - `api/test/in-process.ts`;
  - `runner/test/real-world.ts`, `real-world-types.ts`, `drive-v3-real.ts`;
  - the suites `src/data/contract/real.contract.test.ts` (vault contract and app cases) and `runner/test/real-adapters.test.ts` (runner cases).
- **Skipped groups:** none. The whole vault contract (42 tests with the app cases) passes on the real adapters, the tidy-up group included.

## Cases and the live side

Each case ends as the fake ends: the run is `done`, the piles taken are gone, and the files are where an uninterrupted run puts them, each once.

| Case | Suite test (describe "real adapters: …") | Staging evidence (ACTIVE) |
| --- | --- | --- |
| 1. Browser close mid-run | app: the page is disposed after the press; attempt 1 is cut after `saving`; the alarm redispatches; attempt 2 is `done` | Cancel-and-recover, 2026-10-07: run 37630230892 was cancelled at 13:40:00Z with the app tab moved off staging (it had reached `saving`). The alarm redispatched once at 14:10:34Z, and run 37634507122 (`tidy … 2`) was `done` at 14:10:55Z with no app open. One filed note, chain 0–11, `last-run.json` done. |
| 2. Revoked auth | app: Google `invalid_grant` → this page and another device signed out, no Drive write | Not walked live. Revoking access in a test account's Google settings is one owner step in the C16 walk (TL-P3-25). |
| 3. Duplicate dispatch | runner: a second job of an ended attempt is refused and writes nothing; a second job after a cut one finishes it with one set of effects | R3 (P3-6): same-run duplicates both start, and their jobs run one after the other (concurrency group, no cancel). First real run, 2026-10-07: one press sent two `POST /process` with the same run id. |
| 4. Expired attempt | runner: attempt 1 superseded by the alarm's attempt 2; its late job writes nothing and reports nothing | Not walked live: no superseded job ran late on staging. The cancel-and-recover redispatch retired attempt 1's ticket, but attempt 1's job had already ended. |
| 5. Lost callback | runner: a lost `saving` reply with the same report sent again (same revision); a lost `done` reply fails the job, and the run stays `done` | R3: a lost 204 is found by run-name, with exactly one run, and a lost completion reconciles from the conclusion. R4 Part B: a withheld final reply is reconciled by a status query, with no duplicate. A lost status-route reply was not walked live. |
| 6. Recovery | runner: attempt 1's job ended with no report; the alarm redispatches; attempt 2 is `done` | The same cancel-and-recover runs as case 1. `/process` smoke, 08:33:46Z: queued with no dispatch, failed `stale` after 17.0 min, revision 2, written once. |
