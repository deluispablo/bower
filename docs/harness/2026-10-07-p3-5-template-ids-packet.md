# Packet: vault-template-ids (P3-5 follow-up)

Starting model: `bower-implementer` (Sonnet). Reason: a bounded extension of the reserved-id mechanism already in `api/src/vault.ts`.

- **Entry:** `vault-template-ids` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-tids`, branch `claude/p3-tids`, from the integration head. Never push or deploy; no real accounts or secrets.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/src/{vault,person,person-schema}.ts`, `api/test/vault.test.ts`.
- **Research first, cite:** Drive v3 `files.generateIds` (`count`, `space`, `type`), `files.create` with a supplied `id`, and the error Drive answers for a duplicate id.
- **Acceptance contract:**
  - One `files.generateIds` call reserves the folder id plus one id per template item (folders and files); all are stored in the person object with the pointer before any create (schema step if needed, with a migration test).
  - Every template create uses its reserved id. When Drive refuses a create because the id exists, the fill counts that item as made and continues; any other error stops the call as today.
  - The 60 s claim stays as it is (no renewal).
  - Named tests: `the template files' ids are reserved with the folder's` and `a fill resumed after the claim expires makes no duplicate file` (a first call stalls mid-fill past the claim, a second call completes it, the first resumes: every template path exists exactly once). Red first on assertions (stub-first if a new function is added).
  - Files in scope: `api/src/**`, `api/test/**`.
- **Gates:** the verify, `pnpm check`. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 12 lines:** commit SHA(s), files, red→green, gates, sources.
