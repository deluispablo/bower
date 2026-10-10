# Packet: Q1a, stored answers (escalated; TL-P4-44 Q1, Q3, Q4, Q5, Q7, Q8, Q10)

- **Entry:** `q1a-stored-answers`. Worktree `/private/tmp/bower-q1a-stored-answers`, branch `q1a-stored-answers`. Escalated (contracts, journal, runner): Codex red session (may run now), Codex implementation **after B1a integrates** (shared run-manifest.ts, layout.ts, scripted.ts; lead 2026-10-10), Codex read-only pass, fresh Claude review. `ui: false`: no screen change here (Q1b owns the UI after Q1c).
- **Rulings:** TL-P4-44 and addenda 1–2 (`docs/harness/2026-10-10-tl-p4-44-q1-contract.md`; DECISIONS); TL-P4-40 (2). Prep: `docs/harness/2026-10-10-q1-prep.md` (promises P1, P3–P6, P8 back end, P9; its reds table and file ledger). Not here: P2/live publication and `q1-stored-and-live-question-merge`, `q1-status-seq-revision-recovery`, `q1-live-question-before-clear-effects-end` (Q1c); the `note` option kind (which-note follow-up).
- **Research first:** cite the standard for additive schema evolution (readers accept old shapes; tagged union widening) and for idempotent continuation by request id.

## Contract

1. **Options (Q1).** One kind, `file-to` an existing folder id, only when the script has 2–4 candidate folders the planner already sees; the model picks among those ids and words the question, never an id or payload. The action is stored with the question in questions.json at asking; the answer carries only the option id; the runner resolves it from the stored question, never by label. Legacy yes/no keeps its meaning; state and pair questions unchanged.
2. **Answer line (Q5, addendum 1–2).** The journal answer value widens additively: `true`, `false`, `{ option: id }`, `{ text }`, keyed by question id and askedAt. Text is trimmed, non-empty, at most 1,000 characters, line breaks allowed, other control characters refused (back end refuses over 1,000). A text answer applies to every inbox and pile question, with or without options. Later record wins; one continuation request id per asking.
3. **Rounds (Q3).** A round is a newly written asking for an inbox subject (thing or pile); repeats, retries, redispatch, failed saves and an unchanged re-run do not count. After the second asking's answer with no place, the subject is exhausted: never asked a third time, untouched in the inbox. Counters and exhausted subjects live in questions.json by the existing subject identity; a change to the pile's words resets them; leaving the inbox ends them. State, pair and folder questions keep their re-ask.
4. **Continuation (Q4, Q8).** An answer about a thing or pile starts today's subject-scoped run (answer-loop.ts:34); answers during a run batch into the Worker's single run after it ends (person.ts:688). No frozen member list or lineage store. One quota unit per continuation; a quota refusal keeps the answer and counts no round.
5. **Provenance (Q7).** Text is that subject's person's words only, carried as typed data to the continuation, never a global rule; an option is consent for its stored action only.
6. **Pile projection (Q10).** Pile gains `question?: 'waiting' | 'exhausted'`, derived by the vault from questions.json plus the open questions through the shared subject policy; waiting wins over exhausted; upload, error and readiness lines win over both; clears when the words change or the item leaves the inbox. No screen reads it yet (Q1b).
7. Old questions, yes/no lines, manifests, checkpoints and reports keep their meaning; content writes pass modifiedTime, moves `stillAsSeen`. Compatibility rows for contracts commits.

## Reds (a separate Codex session)

The prep's reds assigned to Q1a, through the real entry points (runner `main` via the corpus driver or the prep's named fixtures, `answerQuestion`, the Worker's `/process` via `createApp().request`, the vault): `q1-clear-work-with-waiting-item`, `q1-options-exact-action`, `q1-text-person-provenance` (all inbox and pile questions), `q1-continuation-members-and-journal` (narrowed to today's subject scope), `q1-waits-one-run-and-replay`, `q1-two-rounds-no-third` (with the words reset), `q1-legacy-question-answer-status` (the stored parts), `q1-continuation-budget-meter`, plus the pile projection (waiting, exhausted, precedence, clearing). Each with a positive control. Made-up data; fake clock.

## Verify

The reds by exact name, `pnpm check`, the corpus tests, e2e app/capabilities on demo and fake.

## Commits

Red (tests only), fix, notes (`docs/harness/2026-10-10-q1a-stored-answers-notes.md`, line 3 `implementer: codex`, `removed:` lines, compatibility rows).
