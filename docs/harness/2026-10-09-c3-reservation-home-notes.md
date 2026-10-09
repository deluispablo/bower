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
