# Packet: rules-template-bower (P3-22)

Starting model: `bower-implementer` (Sonnet), per the TL-P3-27 addendum. While preparing the C16 walk, we found that rules typed in the app never apply on real Drive. The real vault template's `Rules.md` (`api/src/template.generated.ts:67`) is plain text without Bower's mark, so `applyChanges` refuses the rule wording as `not-bower` (`src/data/contracts/note-edit.ts:206`). The rule then stays pending, and a rule sent alone gets "There is nothing new for Bower to read." The fake creates `Rules.md` with `serializeRules([])` and the app property `by: bower` (`src/data/fake/fake-worker.ts:143`).

- **Entry:** `rules-template-bower`. Checkout `/private/tmp/bower-p3-rules`, branch `claude/p3-rules`, from the commit named in your prompt. Never push or deploy, and never run `wrangler`, `gh` or any live call.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/src/vault.ts`, `api/src/template.generated.ts` and how it is generated (find its generator), `src/data/fake/fake-worker.ts` (about lines 135–150), `src/data/contracts/note-edit.ts` (ownership), `src/data/rules.ts` or wherever `serializeRules` lives, and `api/test/vault*.test.ts`.
- **Acceptance contract:**
  - **Same file as the fake.** The real template creates `Rules.md` with the bytes of `serializeRules([])` and the app property `by: bower`, through the same constants the fake uses. Import them; don't copy them. If the template is generated, fix the generator and regenerate.
  - **Contract test:** `the real template writes Rules.md as the fake does`. Create a folder through the real `POST /vault` path over the Drive v3 fake, and one through the fake Worker, then compare `Rules.md` bytes and `appProperties`. They must be identical.
  - **One-time repair:** `the old template Rules.md is repaired once and nothing else is touched`.
    - Where the folder is checked or opened (choose the least invasive point and say why), rewrite a `Rules.md` whose bytes equal the old template text exactly to the new bytes, and set the property. The write is fenced and still-as-seen.
    - Leave any other `Rules.md` alone, including one the person edited or the original app's plain file. The original's plain `Rules.md` is a P4 item.
    - Repair once: a second check does nothing.
  - **The rule applies:** `a typed rule is worded into Rules.md on the real adapter` (runner). A typed rule in the journal is worded into a repaired, or new, `Rules.md` by the scripted run over the real adapter's Drive fake.
  - **Compatibility row:** if you touch `src/features/**` or `src/data/contracts/**`, add the row to `docs/harness/2026-10-07-p3-compatibility.md`.
  - **Red first:** commit the tests on their own before the fix.
  - **Files in scope:** `api/src/vault.ts`, the template and its generator, any shared helper the repair needs, and their tests.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full;
  - `pnpm e2e:fake` in full on port 5197.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
