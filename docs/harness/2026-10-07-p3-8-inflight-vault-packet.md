# Packet: delete-me-inflight-vault (P3-8)

Starting model: `bower-implementer` (Sonnet). Reason: one guard on the folder step's person-object writes, building on `delete-me-generation-floor` (TL-P3-14 addendum, from the P3-7 review's minor 3).

- **Entry:** `delete-me-inflight-vault`. Checkout `/private/tmp/bower-p3-inflight`, branch `claude/p3-inflight`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/src/vault.ts` (the `POST /vault` flow: `claimVault`, `reserveFolder`, `pointFolder`, `markFolderComplete`), `api/src/person.ts` (those methods, `forget`, the session generation and its floor), `api/src/auth.ts` (`requireSession`, which knows the cookie's generation), `api/test/vault.test.ts`, `api/test/me.test.ts`.
- **The problem:** a `POST /vault` already past its session check, awaiting Drive while `DELETE /me` runs, can write `reserveFolder`, `pointFolder` or `markFolderComplete` into the freshly emptied person object afterwards. Delete then would not forget the person.
- **Acceptance contract:**
  - Every person-object write the folder step makes carries the session generation the request was authenticated with. The person object refuses the write when it differs from the current account's generation, or when there is no account. Do the check inside the same synchronous section as the write.
  - The refused request answers 401 `signed-out`, writes nothing more and does not clean up anything in Drive. A folder it may have made stays in the person's Drive. The next sign-in's `POST /vault` finds it by its marker.
  - Named test `a folder request that started before delete me writes nothing after it`:
    1. A `POST /vault` whose injected Drive fetch is held on a promise.
    2. A `DELETE /me` that completes (204).
    3. Release the held fetch.
    4. Expect the request to answer 401, and the person object to hold no account and no folder pointer.
  - A sign-out (`retireSessions`) during the folder step is refused the same way: one more assertion in the same test, or a second case.
  - Files in scope: `api/src/vault.ts`, `api/src/person.ts` (method signatures gain the generation), and `api/test/vault.test.ts` or `api/test/me.test.ts`. **Do not change `person-schema.ts`**, because another worker owns schema v7.
- **Gates:** the verify (red first on an assertion), `api/test/vault.test.ts` and `api/test/me.test.ts` whole, and `pnpm check` in full (quote its last line). Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 8 lines:** commit SHA, red→green, gates.
