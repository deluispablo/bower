# Packet: c3-reservation-worker (stage 3)

- **Entry:** `c3-reservation-worker`. Ruling: TL-P4-17 addendum 3 (main 35989307) and addendum 7 (one release rule for every keeper). Worktree `/private/tmp/bower-c3-wrk`, branch `c3-reservation-worker` from `claude/p3`.
- **Starting model:** `bower-escalated`.
- **Live evidence:** P4-39 minor, confirmed by P4-40.
  - `api/src/vault.ts:388,408` reserves ids with `drive.generateIds` and keeps them across requests.
  - It is the last module besides the batch sites on the ESLint reservation allowlist (`scripts/eslint-reservation.mjs`).

## Contract

- **One home.** The Worker template reserves and keeps its ids through write-once (`reserveFor`/`makeOnce`/the keeper port). The keeper is Durable Object storage, the third keeper after the journal outbox line and the device upload record. Write-once keeps no store of its own.
- **One rule.** Release and keep follow the one rule (addenda 13, 16): a permanent 4xx releases; retry, wait, quota and 409 keep.
- **The allowlist shrinks.** `api/src/vault.ts` leaves it, the count drops by one, and growth still fails.
- **The import graph.** Check that `api/` can import `src/data/spine/write-once.ts` as the fake Worker does. If it cannot without a second copy, stop and report: that is a ruling, not a choice.
- **Unchanged:**
  - the template files and names;
  - the TL-P4-11 subrequest budget;
  - a lost answer is found by its reserved id (409);
  - the fake Worker still applies the template through the same helper.
- Goldens never rise. `removed: <lines>` goes on the card.

## Red

A test that the Worker's reservation goes through the write-once home and keeps ids in Durable Object storage. It fails today.

## Verify (exact, from features.json)

`pnpm -C api exec vitest run -t` with:
- "the Worker template retried after a lost answer makes one file per intent"
- "the Worker keeps reserved ids in Durable Object storage through the write-once port"

Real entry point (TL-P4-17): drive it through the Worker route that makes the template, not the helper alone. Then `pnpm check` must be green.

## Checklist

- Match by id.
- Every sentence is backed by a test.
- Research first: cite Drive `files.generateIds` and the Cloudflare Durable Objects storage API.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
