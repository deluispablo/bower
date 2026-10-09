# Packet: c3-reservation-home (stage 3, first entry)

Rulings: TL-P4-14 addendum 19; TL-P4-17 and its addendum 1 (DECISIONS, main e1bbf010). Registered in `harness/features.json`.

- **Entry:** `c3-reservation-home`. Ruling: DECISIONS, TL-P4-14 addendum 19 (and addenda 10, 11, 13 for what the reservation promises). Worktree `/private/tmp/bower-c3-res`, branch `c3-reservation-home` from `claude/p3`.
- **Starting model:** `bower-escalated`, because write-once starts escalated (TL-P4-14) and a lost reservation makes a second file.

## Finding (coordinator check, claude/p3 bebbfc71)

The lead asked whether "reserve per intended create, keep until confirmed" is written in both journal.ts and drive-vault.ts. It is written twice:

- **drive-vault.ts uses the home.** `Intended` comes from `src/data/spine/write-once.ts:117-148` (`kept`, `forget`, `make`). Callers: drive-vault.ts:113, 363, 1064, 1088, 1109-1128.
- **journal.ts has its own copy.**
  - `private intended = new Map<string, JournalRecord>()` (journal.ts:166) is an intent-to-line map, with the keep, forget and retry logic inline in `record()` (journal.ts:231-272).
  - `Waiting.reserved` (journal.ts:121-124) holds the id with the outbox line, so it survives a reload. `send()` reserves with a raw `this.drive.generateIds(1)[0]` (journal.ts:396), not `reserveId`. The "unsettled keeps, refused lets go" decision is made again through `kindOf`.
- **Two more copies of the same idea:**
  - drive-vault.ts:1532 `e.reserved ??= await reserveId(...)` for links and empty things (`Sending.reserved`);
  - upload-queue.ts:431 `fenced.generateIds(1)`, an id kept on the device with the upload record (C02).
- **Not copies; these are ruled batch reservations (addendum 11):** engine.ts:193 (`generateIds(creates.length)`), runner/src/drive.ts:95 (a per-attempt pool of 50, which none outlives), and fake-worker.ts:152 (the template).

## Contract (TL-P4-17 addendum 1)

- In scope: journal.ts (intent map :166, `record` :231-272, raw `generateIds` :396) and drive-vault.ts:1532 (`Sending.reserved`) move onto write-once `Intended`.
- Out of scope: upload-queue.ts:431 is the next entry (c3-reservation-upload). It stays on the rule test's allowlist, which may only shrink. The batch sites (engine.ts:193, runner pool, fake-worker template) stay as ruled.
- One home: write-once owns "reserve an id for an intended create, keep it until the create is confirmed or refused, and let it go on refusal". The journal and drive-vault use it.
- The home takes a port for where the id is kept: the outbox line (survives a reload) or memory. It never keeps a second store of its own.
- Behaviour is unchanged:
  - one file per intended create across a lost answer, a read-back failure and a person's retry;
  - a 4xx refusal releases the id (addendum 13);
  - a rate limit or quota keeps it (addendum 16);
  - a pile note stays keyed by pile id.
- Drive-call goldens never rise. `removed: <lines>` goes on the card. Files: write-once.ts, journal.ts, drive-vault.ts, and their tests.

## Red (from today's drift)

`only the write-once home and the ruled batch sites reserve Drive ids`: a source rule test.
- It allows write-once.ts, engine.ts (batch), runner/src/drive.ts (pool), fake-worker.ts (template) and upload-queue.ts (until c3-reservation-upload).
- It also fails when a module other than write-once keeps an intent→id map.
- Today it fails at journal.ts:166/396 and drive-vault.ts:1532.

## Verify (exact, from features.json)

- New: `only the write-once home and the ruled batch sites reserve Drive ids`.
- New: `a journal line kept on the device is sent after a reload under the id the home kept`.
- Kept:
  - `a journal line keeps its reserved id until confirmed and needs no key lookup`
  - `a person.s retry after a double failure makes one file`
  - `a journal line refused for good releases its id and says so once`
  - `a journal line refused by a rate limit keeps its id and is sent later`
  - `a link and an empty thing sent with lost answers arrive once by their reserved ids, with no second try`
  - `a pile note retried with new words after a double failure is one note with the new words`
- Real entry point (TL-P4-17): e2e:fake `a journal line refused in the background shows once in what failed on a phone` (`--project phone`).
- Goldens: C04 78, 25-runs 88, never rise. `pnpm check` green.

## Checklist

TL-P4-13: match by id, never by name; the red reproduces the drift; every sentence is backed by a test; the card names the exact tests. Research first: idempotency keys (Drive `files.generateIds`, Stripe idempotency keys); cite them.

Reviewers: read-only, never `git checkout` in the main repo.

Promised behaviour is verified through the real entry point (TL-P4-17).
