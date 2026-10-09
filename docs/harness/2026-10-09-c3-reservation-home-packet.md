# Packet: c3-reservation-home (stage 3, first entry) — DRAFT, not dispatched

Status: draft for the lead's review (TL-P4-14 addendum 19). Not registered in `harness/features.json` yet.

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

## Contract

- One home: write-once owns "reserve an id for an intended create, keep it until the create is confirmed or refused, and let it go on refusal". The journal and drive-vault use it.
- Where the id must survive a reload (the journal outbox line, the upload record), the home takes the caller's kept value and gives back the one to store. It never keeps its own second store.
- Behaviour is unchanged:
  - one file per intended create across a lost answer, a read-back failure and a person's retry;
  - a 4xx refusal releases the id (addendum 13);
  - a rate limit or quota keeps it (addendum 16);
  - a pile note stays keyed by pile id.
- Drive-call goldens never rise. `removed: <lines>` goes on the card. Files: write-once.ts, journal.ts, drive-vault.ts, and their tests.

## Red (from today's drift)

A dependency/architecture rule:
- `generateIds` is called only from write-once.ts and the ruled batch sites (engine, runner pool, fake-worker template; upload-queue per the question below).
- The journal has no intent map of its own.

It fails today at journal.ts:166/396 and drive-vault.ts:1532.

## Verify (names to fix at registration)

- The new rule test.
- The existing journal retry tests ("a person retry … one line", "4xx releases the id", "rate limit keeps the id").
- The drive-vault pile-note and create tests.
- write-once `Intended` tests.
- Goldens C04 78 and 25-runs 88.

## Checklist

TL-P4-13: match by id, never by name; the red reproduces the drift; every sentence is backed by a test; the card names the exact tests. Research first: idempotency keys (Drive `files.generateIds`, Stripe idempotency keys); cite them.

Reviewers: read-only, never `git checkout` in the main repo.

## Questions for the lead (before dispatch)

1. Does upload-queue.ts:431 (C02, persisted reserved id with a resumable session) join this entry, or stay its own documented case?
2. drive-vault.ts:1532 (`Sending.reserved`, links and empty things): in scope? It looks like the same rule.
