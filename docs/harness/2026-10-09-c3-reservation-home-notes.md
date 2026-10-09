# c3-reservation-home: implementer notes

Packet: `docs/harness/2026-10-09-c3-reservation-home-packet.md`. Red 476c90ee (tests only), fix in the next commit.

## What moved

- `src/data/spine/write-once.ts` is the one home. New: `Holder` (the port: `{ reserved?: string }`, the id kept on
  whatever holds the intended create), `reserveFor(w, holders)` (ids for every bare holder in one `files.generateIds`),
  `makeOnce(holder, w, create, kindOf?)` (reserve when none, keep until confirmed, release only on refusal).
  `Intended<H>` is now the memory port (key -> holder); `make` runs `makeOnce` on a memory holder.
- Release rule, one place: released only when the failure is `permanent` in the transport table and not unsettled
  (no answer, unconfirmed write, a conflict). Retry (5xx, 408, 429, rate limit) and wait (quota, sign-in) keep it.
- `journal.ts`: the intent map (:166) is `Intended<Waiting>`; a `Waiting` outbox line is the holder, so the id survives
  a reload. `send()` uses `makeOnce` (raw `generateIds(1)` :396 gone), bare lines get ids through `reserveFor`
  (the batch at :354 gone), the inline `create()` and `refused()` that deleted the id are gone. The journal's own
  `kindOf` (404 listed anew) is passed to `makeOnce`, called once per failure.
- `drive-vault.ts:1532`: a link or empty thing's `Sending` is the holder (`makeOnce`); `reserveId` import gone.

## Behaviour notes for the reviewer

- Drive-vault's memory intents (create, pile folder, pile note) now also keep the id on a rate limit or a quota wait
  (before: released on anything not unsettled). The id was never used, so reusing it makes the same one file; it saves
  a `generateIds` on the next try. Matches addendum 16.
- A link or empty thing refused with a 4xx now lets its id go (before: kept forever). Addendum 13.
- A person's retry of a journal intent whose outbox could not be read now reuses the in-memory holder (with its id)
  instead of a bare copy of the line; strictly fewer new ids.
- Goldens unchanged: C04 78, 25 runs 88 (runner/test/drive-calls-golden.test.ts, passed in `pnpm check`).

## Rule test allowlist (needs a lead look)

`api/src/vault.ts` (the Worker's real template, lines 260, 274, 388, 408) also reserves ids; the packet named only its
stand-in `fake-worker.ts`. It is on the allowlist as "the Worker's template"; the lead may rule it out of the list
or into a later entry. `upload-queue.ts` stays until c3-reservation-upload.

## Sources

- Drive `files.generateIds`: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds
- Stripe idempotent requests: https://stripe.com/docs/api/idempotent_requests

## Logs

/tmp/c3res-red.log, /tmp/c3res-verify.log, /tmp/c3res-check.log, /tmp/c3res-e2e.log

## Fix round (P4-39 BLOCKED), red 89bd9cfb, fix in the next commit

1. Rule test by mechanism (Important). `reservationSites` in write-once.test.ts parses each file with TypeScript's own
   parser (`ts.createSourceFile`, syntax only). The slot name and ports come from the home's exported interfaces, never
   from the offending module. A site is: a call for ids or the call passed on (`generateIds`/`reserveId`, any receiver,
   element access or alias; definitions do not count); the slot set, cleared or given by hand (`=`, `??=`, `['reserved']`,
   `delete`, `{ reserved: id }`); a class or module-level Map whose value is a holder (a type built on a port, or with a
   string slot) or what a holder always carries (a required member of a project object type: JournalRecord, PileItem);
   a slot read put in a store (`x.set(k, h.reserved)`). Run on e3eaee83's journal.ts and drive-vault.ts it finds
   journal.ts:166, 354, 355, 363, 395, 443 and drive-vault.ts:1532 (the original drift, the intent map included).
   New test `a renamed intent map, an id set or stored by hand, or the call for ids by another name is found by what it
   does`: fixtures for the reviewer's three repros (`intents = new Map<string, JournalRecord>()`; `idFor` filled from
   `h.reserved`; `w['reserved'] = id`), `delete`, an alias of `generateIds`, and a negative (a `Map<string, number>`
   named `intended`, a Map made inside a call, a slot read). The bare `idFor = new Map<string, string>()` line is only
   a site once an id goes into it; a map of strings by itself says nothing about ids.
   The new rule found one more site in journal.ts:363 (`{ ...r, reserved: id }` copying ids onto the outbox read
   again): now the line read again is kept as the holder the home gave its id to (`{ ...r, ...h }`).
2. Allowlist narrowed and ratcheted (Minor). `ALLOWED` is now path -> number of sites; the test asserts the per-file
   counts equal it, so one more site fails, and one fewer fails until its number is lowered (as the jscpd baseline).
   drive-api.ts and drive-http.ts left the list (they only define the call). Left: engine.ts 2 (the batch :193 and
   `reserveId` :604 for a create the batch did not cover), runner/src/drive.ts 3, fake-worker.ts 1, api/src/vault.ts 5
   (the lead rules on it), upload-queue.ts 4, seen-files.ts 1, fake-run-drive.ts 1, fake-drive.ts 6.
3. New test `a link refused with a 4xx lets its id go, and Try again sends it under a new one` (drive-vault.test.ts).
   Passes on arrival (behaviour from f162b5c7); a mutation that never releases makes it fail.
4. New test `a journal line kept on the device is sent after a reload under the id the home kept, through the app`
   (drive-vault.test.ts): DriveVault.addRule, answer and read-back lost, dispose, a new DriveVault, flushJournal: no
   generateIds, sent under the kept id, one file, outbox empty. Passes on arrival.
5. Journal 409 divergence: kept as is, comment added in `Journal.send`. A conflict whose read-back by the id found no
   file is `permanent` for the journal: the line leaves the outbox and goes to what failed, once. The home keeps the id
   then (unsettled), but the id lives only on that line's holder, which nobody sends again, so no second file can come
   of it, and no file landed under the id (the read-back found none). Releasing it would change nothing observable.

Gates: pnpm check pass (/tmp/c3res-check2.log; goldens C04 78 / 25 runs 88 pass, duplication 22 = baseline);
e2e:fake phone `a journal line refused in the background shows once in what failed on a phone` pass (/tmp/c3res-e2e2.log).
Source: TypeScript compiler API, https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
