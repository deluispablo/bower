# Packet: worker-person-object (P3-3)

Starting model: `bower-escalated` (Opus). Reason: new concurrency code ([TL-P3-04](2026-10-06-tl-p3-04-batch-p3-3.md)).

- **Entry:** `worker-person-object` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-person`, branch `claude/p3-person`. Never push, never deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `docs/P3_DRAFT.md` "Reuse" (the Durable Object paragraph), `docs/ARCHITECTURE.md` "Durable execution without a large backend", `docs/specs/2026-10-04-worker-contract.md` (session lease and process sections, for field names only), `api/wrangler.jsonc`, `api/vitest.config.ts`.
- **Research first:** cite Cloudflare's docs on SQLite-backed Durable Objects (`new_sqlite_classes` migrations, `ctx.storage.sql`, input/output gates and `blockConcurrencyWhile`), `idFromName`, and testing them with `@cloudflare/vitest-pool-workers` (`runInDurableObject`).
- **Acceptance contract:**
  - A Durable Object class (e.g. `Person` in `api/src/person.ts`), one per person, addressed by `idFromName(sub)`; its SQLite migration in `api/wrangler.jsonc` (`new_sqlite_classes`, a tag) and the binding; the test config binds it.
  - A typed schema created on first use (a schema version row) with tables for: session lease (place, epoch), admission (active run, requestId), quota (counter, window), control row (head, status revision, claim, epoch) and run tickets (hash, run id, epoch, retired). Typed accessors only as far as the tests need; no HTTP endpoints.
  - Named tests: `one person's calls run one at a time` (concurrent increments of one counter through the object never lose an update) and `two people never see each other's rows` (two subs, writes in one invisible in the other). Plus a schema-version test. Red first on assertions.
  - Files in scope: `api/src/person.ts` (and a small schema module), `api/src/index.ts` (export the class only), `api/src/env.ts` (the binding type only), `api/wrangler.jsonc`, `api/vitest.config.ts`, `api/test/person*.test.ts`. The other P3-3 worker edits `index.ts`/`env.ts` too: keep your edits to the export and the binding.
- **Gates:** the verify, `pnpm check`.
- **Deliver, under 15 lines:** commit SHAs, files, schema summary, red→green, gates, sources, left out.
