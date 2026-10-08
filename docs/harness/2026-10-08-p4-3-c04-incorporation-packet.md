# Packet: c04-incorporation (P4-3, the first P4-C slice, bower-escalated)

The first live Claude run filed the newsletter PDF safely, but it wrote no note: the model saw names only ([TL-P4-03](2026-10-08-tl-p4-03-first-model-run-and-p4-3.md); run `37735080427` in [p4-speed-baseline](p4-speed-baseline.md)). This slice gives the model bounded content and lets it write note text, while the spine stays the only writer.

- **Research first:**
  - cite the P2 preparation contract (C15, `docs/P2_ACCEPTANCE.md`, `docs/ARCHITECTURE.md`) and how the original prepared inputs (`/Users/deluisp/Projects/bower/agent/prompts/` and `agent/run.sh`: pandoc, `pdftotext`);
  - choose a maintained PDF text library for Node, cite it, and say why it beats the alternatives (for example `pdfjs-dist` or `unpdf`). No native binaries that GitHub's runner lacks.
- **Read:**
  - `runner/src/claude.ts`, `runner/src/provider.ts`, `runner/src/spine/admitted.ts`;
  - `src/data/spine/scripted.ts` (`PlanOptions.filing`, how intent becomes operations);
  - `runner/src/corpus.ts` and `harness/corpus/c04-*` plus `bench-1..3` (expected notes);
  - `runner/test/claude-provider.test.ts`.
- **Build:**
  1. **Context.** For each admitted thing, add its text:
     - the app's prepared text when the C15 contract carries it;
     - else the runner's own extraction: plain text and Markdown as they are, and the PDF text layer through the chosen library.
     - Bound it per thing and per run (state the numbers). Truncation is marked, never silent.
     - Images and scanned PDFs get no text here (OCR is a later slice), and say so in the context.
  2. **Notes to update.** Add the bounded current text of the notes the model may update (the hubs the plan names).
  3. **Intent carries note text.** A new note's body, and lines for an existing note's Timeline. The runner builds the operations, ids and digests (as in `provider-contract`), and the spine validates them. Bower's sections rules apply: never the person's own section.
  4. **Proof order:**
     - scripted proposals first: the scripted provider fills the same intent shape, and the C04 corpus cases score green;
     - then recorded Claude replies on the C04 cases score green.
     - No live call.
- **Named tests (runner):**
  - `the model context carries bounded extracted text for each admitted thing`;
  - `the C04 corpus cases score green with scripted proposals`;
  - `a recorded Claude reply on a C04 case writes a note with its content`.
- **Rules:**
  - Work in the checkout and branch in your prompt. Never push, deploy, call `gh`, `wrangler`, `claude` or any live service.
  - Red tests first, on their own commit; then the code in one commit if you can.
  - Gates: the verify, the runner suite, `pnpm check`. Never write harness records or run `done.sh`.
  - `runner-checkpoint-cost` works at the same time in `runner/src/spine/records.ts`, `run.ts`, `effects.ts`, `drive.ts` and `tidy.yml`. Stay out of those; say if you must touch one.
  - A new dependency goes in `runner/package.json` with an exact version.
- **Reply:** the implementer delivery card, every line under 120 characters. Details go in a notes file.
