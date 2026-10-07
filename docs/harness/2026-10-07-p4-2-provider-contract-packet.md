# Packet: provider-contract (P4-2, bower-escalated)

This packet comes from [TL-P4-01](2026-10-07-tl-p4-01-p4-start.md) and the P4-1 review (notes in `/private/tmp/p4-1-review-notes.md`), with the lead's ruling (main `1089bd1`). There is no live model run, and `BOWER_PROVIDER` stays unset, until this entry closes.

- **Research first:**
  - cite the Claude Code `--setting-sources` and settings-precedence documentation, and GitHub Actions secrets scoping per step;
  - reuse the scripted provider's contract fixtures and the spine's admission (`runner/src/spine/admitted.ts`).
- **Read:**
  - `runner/src/claude.ts`, `runner/src/provider.ts`, `runner/src/spine/admitted.ts` and `runner/src/spine/run.ts`;
  - `src/data/spine/scripted.ts`, how the scripted provider builds operations, ids and digests;
  - `runner/workflows/tidy.yml` and `runner/test/claude-provider.test.ts`.
- **Fix:**
  1. **The runner computes ids and digests.** The model proposes intent only: which admitted thing goes where, the new names and note text. The runner builds the manifest, with operation ids, hashes and digests, exactly as the scripted path does. A model-supplied id, hash or digest is never trusted.
  2. **Only admitted targets.** Every operation's subject is a thing admitted in this run, or a note the run creates. A reply that bins, moves or edits anything else is refused as a whole, with a truthful failure and no write. That covers a folder such as `Resources`, a note outside the plan, or `Rules.md` other than through rule wording. Say how the rule-wording and hub-line exceptions stay in contract.
  3. **No checkout or home settings.** `claude -p` gets the `--setting-sources` that loads none of the checkout's or the user's settings, and no `CLAUDE.md` auto-load. Only the policy file the runner passes applies. Cite the docs.
  4. **The secret reaches the claude step only:** `CLAUDE_CODE_OAUTH_TOKEN` goes only to the step or condition where `BOWER_PROVIDER == 'claude'`.
- **Named tests (runner, recorded replies, no live call):**
  - `the Claude provider passes the scripted provider contract fixtures`;
  - `a Claude reply that targets a thing not admitted is refused and writes nothing`. Include a reply that bins `Resources`;
  - `the runner computes ids and digests, never the model`;
  - `claude runs with no checkout or home settings and the secret only reaches the claude step`.
- **Rules:**
  - Work in the checkout and branch in your prompt. Never push, deploy, call `gh`, `wrangler`, `claude` or any live service.
  - Red tests first, on their own commit; then the code in **one** commit.
  - Gates: the verify, the runner suite in full, `pnpm check`. Never write harness records or run `done.sh`.
  - `runner-overhead` works in `runner/src` at the same time. Keep to the provider, the admission check and `tidy.yml`.
- **Reply:** the implementer delivery card, every line under 120 characters (TL-P3-29). Details go in a notes file.
