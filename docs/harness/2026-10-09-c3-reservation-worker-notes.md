# c3-reservation-worker: implementer notes

- Red `104707e3` (tests only), fix `53f92201`, from `claude/p3` bbc80e85. Ruling TL-P4-17 add. 3 and 7.
- Red: "the Worker keeps reserved ids in Durable Object storage through the write-once port" failed with
  `expected 'reserved-14' to be undefined` (a 400 on Rules.md's create kept its id in the person object). The
  write-once ratchet failed too: `makeOnce(: expected false to be true` and `expected 8 to be less than or equal to 7`.
- "the Worker template retried after a lost answer makes one file per intent" passed before and after (guard: lost
  answer plus a failed read-back, then the retry's 409 finds the file by its kept id; one generateIds call).

## Import graph

`api/` already imported `src/data/spine/write-once.ts` (createById, reserveId, updateByStamp) and `DriveHttp`; no
second copy. The Worker now passes its one `DriveHttp` to the home's makers, as the fake Worker passes its drive.

## Change

- `api/src/vault.ts`: the folder and template ids are reserved in one `reserveFor` request (same count as before),
  kept in the person object before any create, and each create is `makeOnce(heldAs(id, letGo), http, (id) =>
  makeFolder|makeText(http, http, {..., id}))`. The keeper's `letGo` is `dropReservation` (folder) or the new
  `letTemplateIdGo` (one template item, matched by key and id). The release rule is write-once's: permanent 4xx lets
  go; lost answer, 5xx, rate limit, full Drive and 409 keep.
- `api/src/person.ts`: `reserveTemplate` now keeps ids only for items with none kept for that folder (earlier ids
  win, read and write in one synchronous step), so an item let go is reserved anew alone. `letTemplateIdGo` added.
- `scripts/eslint-reservation.mjs`: `api: []`, `ALLOWED_MAX = 7`.
- removed (base line numbers): vault.ts:80 (UPLOAD_URL), 143-160 (`multipart`, `made` = the Worker's own
  createById wrapper), 170-179 (own `generateIds`, `makeFolder`, `makeText`), 238/260 (`reserveId` fallbacks),
  388/403-413 (inline `generateIds` calls); person.ts:402-418 (all-or-nothing `reserveTemplate` SQL).
- Prod +74/-68 (vault.ts +46/-51, person.ts +26/-15, eslint-reservation +2/-2). Allowlist 8 -> 7.

## Unchanged, and notices

- Template files and names, the fake Worker, the 409 find-by-id, generateIds count (one request for a new folder).
- Subrequests: same Drive requests per call; one extra DO call only after a refusal outright.
- Notice for the lead: creates now go through `DriveHttp.createFolder/createText`, so the new folder's parent is
  sent as `'root'` (Drive's alias for My Drive, same place) and `.bower/*.json` are created `text/plain` as the
  app's own writes are (was `application/json`; nothing reads by mime type). Text creates are now confirmed by the
  answer's `md5Checksum` (`confirmed`), as the app's are.
- Sources: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds ,
  https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ ,
  https://developers.google.com/workspace/drive/api/guides/handle-errors

## Gates

- verify: 2 passed (/tmp/c3wrk-verify.log). `pnpm check` exit 0 (/tmp/c3wrk-check.log): app 3821, api 234, runner
  228; duplication 22 clones/217 lines (= baseline), unused 35 (= baseline). No screen touched: no e2e.
