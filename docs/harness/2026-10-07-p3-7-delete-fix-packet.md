# Fix packet: delete-me-generation-floor (P3-7 review)

Starting model: `bower-implementer` (Sonnet), fresh session. Reason: the P3-7 Opus delta review blocked on one Important finding in `DELETE /me` (df56b60). The fix direction is clear and the change is small.

- **Entry:** `delete-me-generation-floor`. Checkout `/private/tmp/bower-p3-floor`, branch `claude/p3-floor`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, the [me-and-delete packet](2026-10-07-p3-7-me-and-delete-packet.md), `git show df56b60`, `api/src/person.ts` (`forget`, `signIn`, `retireSessions`, the session generation), `api/src/auth.ts` (`assertCurrentGeneration`), `api/test/me.test.ts`.
- **The finding:**
  - `forget()` runs `deleteAll()` and re-migrates, so the account row, and with it `session_generation`, starts again at 0 on the next `signIn`.
  - A cookie from another device that never signed out (generation 0, valid for 30 days) is refused only until that sign-in, then accepted again.
  - **Reproduction:** sign in; sign two cookies at the same generation; `DELETE /me` with one (with its fence) answers 204; `signIn` again; `GET /me` with the other cookie answers 200 where 401 is expected.
- **The fix:**
  - Keep a non-personal **generation floor** through the forget: one integer, the old generation + 1.
  - Write it after `deleteAll()` and the re-migration, in the same call. For example, use the Durable Object's key-value API `ctx.storage.put('generationFloor', n)`, so no schema version is needed. Another worker is adding schema v7 right now, so **do not change `person-schema.ts`**.
  - `signIn` for a new account starts `session_generation` at that floor. Every cookie signed before the deletion is then below it and refused.
  - Nothing personal survives: no email, name, token or id.
- **Named test, red first, in `api/test/me.test.ts`:** `a cookie from before delete me stays refused after signing in again`. It is the reproduction above, and also checks that the new sign-in's own cookie works.
- **Files in scope:** `api/src/person.ts`, `api/test/me.test.ts`.
- **Gates:** the verify, `api/test/me.test.ts` and `api/test/auth.test.ts` whole, and `pnpm check` in full (quote its last line). Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 8 lines:** commit SHA, red→green, gates.
