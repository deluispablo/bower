# Packet: p4-rate-limits, the Worker's owed rate limits (TL-P3-14; TL-P4-17 addendum 6 point 4; lead ruling 2026-10-10)

- **Entry:** `p4-rate-limits`. Worktree `/private/tmp/bower-p4-rate-limits`, branch `p4-rate-limits` from `claude/p3`. `ui: false` (the client already maps 429 `rate-limited` to a sentence). Ruled sequence: Codex implementation test-first, a Codex adversarial pass, then a Claude review.
- **Rulings:** the lead accepted the proposal as written (LEAD_QUESTIONS 2026-10-10 p4-rate-limits; DECISIONS after ed3b1dc2). Per minute:
  - `/auth/*`: 20 per client address (`CF-Connecting-IP`);
  - `/drive/token`: 30 per person;
  - `/vault`: 60 per person.
  Over a limit, the response is 429 `rate-limited` with `Retry-After`. `/process` keeps its daily quota in admission. Staging only, and wrangler runs as a dry run.
- **Research first:** cite Cloudflare's rate-limiting binding (developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/): its periods are 10 s and 60 s, it is per location, and it is eventually consistent. Also cite RFC 9110 §10.2.3 on Retry-After.

## Contract

1. **One home.** `api/src/security.ts` already has `rateLimit`, `genericRateLimit` and `COOKIE_ROUTES`, which are unmounted and listed in the knip baselines. Mount them, and change their counter to the binding where the binding is the ruled standard. Keep exactly one rate-limit mechanism, so an in-memory window the binding replaces is removed. The removed code and its baseline lines leave both unused baselines.
2. **Limits.**
   - `/auth/*` is keyed by client address.
   - `/drive/token` and `/vault` are keyed by the person's session subject, after the session check. Nothing is counted before the checks that write nothing (the existing rule in the helper's comment).
   - Requests beyond the limit get 429 `rate-limited`, with `Retry-After` in whole seconds, at most 60.
   - A missing binding fails closed only in production config. Tests inject the binding.
3. **Config.** The binding is declared in `api/wrangler.toml` for staging, with namespace ids made up for the repo or taken from existing config. Check it with `wrangler deploy --dry-run` only. Never deploy, and never touch production config.
4. **Errors.** HttpError, as today. No new client copy.

## Tests (TDD: the red first, in its own commit)

Through `createApp().request`, with an injected fake binding:
- each route under and over its limit, with a positive control;
- the key (two addresses or two people are counted apart);
- `Retry-After` present and bounded;
- nothing counted for requests refused earlier;
- `/process` unaffected.
The entry's verify test must exist by its exact name: `a route over its rate limit is refused`.

## Verify

`pnpm -C api exec vitest run -t "a route over its rate limit is refused"`, then `pnpm check`, including the knip baselines, which may only shrink.

## Commits

The red (tests only), then the fix, then the notes (`docs/harness/2026-10-10-p4-rate-limits-notes.md`, line 3 `implementer: codex`, with `removed:` lines).
