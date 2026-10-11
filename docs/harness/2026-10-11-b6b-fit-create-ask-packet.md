# Packet: B6b, fit, create or ask through main

- **Entry:** `b6b-fit-create-ask`; worktree `/private/tmp/bower-b6b-fit-create-ask`; branch `b6b-fit-create-ask`; escalated: no; `ui: false`.
- **Sessions:** TL-P4-29/TL-P4-57: Codex red session (`gpt-6.1-sol high`), then normal implementation (`gpt-6.1-sol high`), an adversarial pass (`gpt-6-astra xhigh`), a fresh closing review (`gpt-6-astra high`). The red is red-first now; the implementation waits for B1d's integration (it needs `runner/src/claude.ts`) and for B5b/B5c's handoff of `scripted.ts`.
- **Rulings:** `2026-10-10-tl-p4-47-b56-contract.md` and the accepted prep `2026-10-10-b56-prep.md` (B6b row, file ledger, cases `c17-b56-near-name-reuses` and `c17-b56-ambiguous-partial-run`); TL-P4-41 addenda 13–25 (B1d selection); Q1 stored candidate actions; Q6 (no taxonomy registry, no auto-inferred preference, no lint); B7's allowed-tag list is not implemented here (an absent list gives no tag-fit evidence).
- **Research first:** reuse the prep's citations. No network. Reuse B1d's selection and execution replies, B6a's template declarations and single grounding check, and Q1's stored `file-to` options.

## Owned files

- Reds now: `runner/test/b6-incorporation.test.ts` (new) only.
- Implementation (later): `runner/src/claude.ts`, `runner/test/claude-provider.test.ts`, `src/data/spine/scripted.ts`, `src/data/spine/scripted.test.ts`, `runner/test/b6-incorporation.test.ts`, and the sale/topic B6 corpus folders and replies named in the prep.
- Not owned: B1d's `model-input.ts`, `drive.ts`, `index.ts`, `main.ts`, `timing.ts`, `src/data/vault/vault-index.ts`.

## Reds

Exact names, each with a positive control, through production `main` with scripted replies. Made-up data only.
- `b6-existing-fit-before-create`: a matching existing note, MOC or allowed tag is used before any new note; control: no fit creates.
- `b6-near-name-reuses`: Rainwater against Rain-water or a suffixed name reuses the existing note; control: a clearly different name creates.
- `b6-clear-topic-creates`: a clear new topic creates a note with its template; control: an existing fit still reuses.
- `b6-clear-project-source-basis`: a clear project creates with its source as basis; control: an ambiguous one does not create.
- `b6-ambiguous-q1-file-to`: two to four candidate folders produce stored `file-to` options and one question; a clear sibling files while the ambiguous one waits; control: the answer by option id applies the stored folder once.
- `b6-cut-index-no-create`: when the candidate index was cut, nothing is created and the source is kept honest; control: a complete index creates normally.

## Verify

Run each red with `--maxWorkers=2`: it fails only on its finding and its control passes. Output to OS-temp files; read failures only.

## Commits

Tests-only red, then (later) the fix, then notes alone: `docs/harness/2026-10-11-b6b-notes.md`, line 3 `implementer: codex`. Reply with the WORKER.md card.
