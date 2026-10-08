# lost-bytes-slow: the time is the offline setup's real backoff, not the lost-bytes path

Diagnoser note (TL-P4-15), 2026-10-09, on `claude/p3` c7e25564. Read-only; no repo file changed. The probes were scratch copies of the test outside the repo (scratchpad `probe/`), with logs in `/tmp/lbs-*.log`.

## What failed

`src/data/upload-queue-real.test.ts:246` ("lost bytes ask to choose the file again") took 3122 ms when run alone (`/tmp/lbs-run1.log`) and 4446 ms in a 13-file run (`/tmp/lbs-class.log`). The test is under the 5000 ms default timeout, and it failed `pnpm check` twice.

**Where the time goes (reproduced).** A scratch copy logged every fetch with its timestamp (`/tmp/lbs-probe.log`):

- **Offline phase, `:254-260`.** Two items are added while `drive.offline = true`. Each item sends `GET files/generateIds` 4 times: the first send plus `RETRIES = 3` (`transport.ts:31`). The jittered waits come from `backoff.baseMs = 500` (`transport.ts:74`), so the phase took 4607 ms. The items end as `waiting/offline`.
- **Lost-bytes phase, `:262-274`.** It took 11 ms. The lost item's `record.fileId` is null, because `generateIds` never answered, so `upload-queue.ts:416` skips `arrivedFile`. `:424-425` fails it with `LOST_TEXT` and sends nothing. Only member-2 sends requests: ids, open and 4 PUTs.
- **With `backoff.baseMs = 0`,** the same test took 18 ms (`/tmp/lbs-zero.log`). The backoff is the whole cost.
- **Expected run time.** Two items × (U(0,0.5) + U(0,1) + U(0,2)) s gives a mean of 3.5 s, a maximum of 7 s and a standard deviation of about 0.94 s. So, by my estimate (computed, not measured), about 5% of unloaded runs exceed 5000 ms from jitter alone.

**Commit.** It started with 18f8a4da (`c2-drive-transport`, merged in 2d56af45). Before that, `DriveHttp.raw` and `call` turned a `TypeError` into `offline` at once (`git show 2d56af45^1:src/data/drive/drive-http.ts:297`). Retries covered 429 and 5xx answers only. Now `send` resends a `TypeError` for every idempotent request (`transport.ts:94-96`), in the browser too. Neither 56b4d7fd nor e3d1cc54 changed this path.

## Why (5 whys)

1. **Why 3.5 s?** Every offline `generateIds` waits through three real backoff sleeps.
2. **Why real sleeps in a unit test?** `src/test-setup.ts` never sets `backoff.baseMs = 0`. The runner's suite does, in `runner/test/setup.ts:8-10`, and that comment names the exact cost: "up to 3.5 s per call". The app suite has run on the shared transport since 18f8a4da, but its setup was not changed with it.
3. **Why is that per suite?** The backoff is a mutable module global (`transport.ts:35`). It is not an option of the transport's callers, so each suite has to remember to zero it.
4. **Why does a browser retry a network error at all?** TL-P4-16 addendum 4 ruled "idempotent GETs retried" for one policy everywhere. The motive was the headless runner (`smoke-runner-offline`). The browser's own knowledge that it is offline is computed in `drive-http.ts:306` (`knownOffline`), but it is used only to word writes. `send` never sees it.
5. **Design cause.** The transport's timing has no seam: neither tests nor context choose it, and every app test that loses the network pays real time. **Person impact (real, not a fake artefact):** in a browser that is offline, `fetch` rejects with a `TypeError` at once, so the same retries run. Each file added offline shows "uploading" for about 1.75 s on average (3.5 s at most), one file after another, before "waiting for a connection". Any Drive read made offline takes about as long before it shows offline. Before 2d56af45 both were immediate. **"Choose the file again" itself costs no extra wait:** it appears in 11 ms and sends nothing for the lost item.

**Q3: a retry that cannot succeed?** Not on the lost path. When `fileId` is set, `arrivedFile`'s `getUploaded` must ask Drive, because Drive may have made the file (test `:277`), and a 404 is not retried. The pointless retries happen elsewhere. They are the network-error resends while `navigator.onLine === false`: MDN says false means the browser has no network. They cannot succeed unless the link comes back within 3.5 s, and `live/index.ts:440` already flushes the queue on `online`.

## Owner mechanism

**Drive transport (token, retry, errors, wire type)**, `src/data/drive/` (`transport.ts`, `drive-http.ts`). The app's unit-test setup is the second half of the fault. No map entry covers it.

## Same class elsewhere (5)

App tests paying real backoff (measured in `/tmp/lbs-class.log`):
1. `src/data/drive/drive-http.test.ts:134` "a network TypeError rejects offline": 1355 ms.
2. `src/data/drive/raw-bytes.test.ts:197` "offline transport refusals": 1247 ms.

Product: a backoff the caller cannot stop (verified by reading the code, not run):
3. `upload-queue.ts:432` calls `fenced.generateIds(1)` with no signal (`drive-http.ts:225`).
4. `resumable-upload.ts:86` calls `getUploaded(id)` with no signal (`drive-http.ts:265`).

In both, `sleep` (`transport.ts:53`) honours only `init.signal`. So `stop()` (sign-out or Use here) waits up to 3.5 s for each request in flight while offline.

5. `api` (Worker) tests: `api/test/no-network.ts` does not zero the backoff either. *Unverified* whether any api test reaches a Drive `TypeError`.

Not this class: the reload and expired-session tests (`:176`, `:211`) take 550-680 ms with the backoff at 0 too, for another cause (*not diagnosed*). `live.test.ts:1158` (1207 ms) runs on `FakeDrive`, which does not use the transport.

## Options

- **(a) Fix in the owner and its test setup.** `src/test-setup.ts` gets `beforeEach(() => { backoff.baseMs = 0 })`, as `runner/test/setup.ts:8-10` has. `transport.test.ts` sets `BASE_MS` itself, since it asserts real waits under fake timers. Size S (2 files). Risk low. The person's 1.75 s per offline request stays.
- **(a2) The same, plus a browser known to be offline is not resent.** `send` gets `knownOffline`, computed once in `authorized` (`drive-http.ts:306`), and skips the network-error resend when it is true. The 429 and 5xx retries stay. The person sees offline at once again. Size S-M (transport, drive-http, a test that sets `navigator.onLine`). Risk low. It refines the TL-P4-16 addendum 4 ruling for the browser context, so the lead must rule on it. A flaky link with `onLine === true` still retries.
- **(b) Refactor first, then fix.** Make the backoff a `send` option that the clients pass (`DriveHttp`, `RunnerDrive`, the Worker's), not a mutable global. Tests then pass 0 through one shared test helper, and the context decides offline behaviour. Also thread the caller's signal through `generateIds` and `getUploaded` (class items 3 and 4). Then apply (a2). Size M (transport, three clients, two setups). Risk medium, because it touches the runner and the Worker. It removes the per-suite knob rather than adding a second one.
- **(c) A new mechanism:** none is needed. A queue-side "skip when offline" check would be a second retry policy next to the transport's.

## Regression test (class)

1. **A guard on the backoff,** in the app's setup and in the api's: an `afterEach` that fails any test whose transport slept a non-zero backoff with real timers. It catches items 1, 2 and 5 and every future one.
2. **For the person (a2 or b):** with `navigator.onLine = false`, adding two files reaches `waiting/offline` with exactly one `generateIds` each.
3. **For items 3 and 4:** `stop()` during an offline `generateIds` settles at once.

## Ruling (lead, DECISIONS main 1968a8c): (b) plus (a2)
- The root is a mutable global that every test setup must remember to zero. New entry c2-transport-options (implementer): backoff, sleep and the abort signal become send options that each client injects; no global.
- While the browser is known offline, a network error is not resent and the upload shows offline at once.
- The 5 same-class sites in this note become named tests.
- Slot: after c2-fake-parity (it touches the transport; c2-one-engine builds on it).
