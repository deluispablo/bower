
# Packet: B4b, observations, Forget and Bin

- **Entry:** `b4b-observations`; worktree `/private/tmp/bower-b4b-observations`; branch `b4b-observations`; escalated: yes (accepted prep split and source-Bin/provenance boundary); `ui: false` under TL-P4-48 Q9.
- **Sessions:** TL-P4-29/TL-P4-57: separate Codex red, implementation, read-only adversarial and fresh closing-review sessions. Fast tier; `gpt-6-astra high` for reds, implementation and closing review; `gpt-6-astra xhigh` for adversarial. Fresh fix sessions; coordinator owns commits and restricted gates.
- **Order:** after B4a’s contracts and B1d’s provider/context handoff; consume landed B5a/B6a and Q1a/Q1c/Q1b. Hand shared scripted files and incorporation tests to B4c only after completion.
- **Rulings:** `docs/harness/2026-10-10-tl-p4-48-b4-b11-contract.md`, B4 Q1–Q3, Q6–Q9 and Order; accepted B4b ledger/cases in `docs/harness/2026-10-10-b4-prep.md`, with the contract’s overrides.
- **Rulings:** DECISIONS TL-P4-48: own text is never observed; Forget binds shown fact ids; settled Bin removes facts bound only to that source; `forget-fact` is an added stored Q1 action, with no new UI.
- **Research first:** reuse offline [typed episodic evidence](https://arxiv.org/pdf/2605.12978), [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) and [plan then execute](https://arxiv.org/html/2506.08837v1). Reuse admitted capture, scripted settlement and Q1’s answer continuation; no network or new memory service.

## Owned files

- `src/data/spine/scripted.ts`, `src/data/spine/scripted.test.ts`.
- `runner/test/b4-incorporation.test.ts` (new).
- Notes file named under Commits. Provider changes and provider tests are excluded pending B1d handoff; no replacement provider home is authorized.

## Contract

1. Resolve useful observations from actual admitted words, subject-scoped text answers, rules or document evidence. The script supplies identity, hash, date and origin; model prose cannot choose its authority.
2. Documents may state facts about their explicit subject, never preferences, sensitive facts, rules or schema. Filing-option consent authorizes its stored action only. Never copy personal About me text into the ledger.
3. Persist each accepted observation once and write it through as a dated sourced line in the correct marked section. Reuse `timeline-line.ts` unchanged; merge same-note changes into one edit preserving every personal byte.
4. Consume a words-only request only after its memory effects and visible update settle successfully; create no redundant knowledge note merely to store a known preference. Reuse C05’s settlement home and existing question quota.
5. Resolve Forget only from the person’s words and shown fact ids. Apply fact/source tombstones before changing the view; source replay, changed hashes and archive text cannot revive the fact. Later explicit remembering is new evidence.
6. Ambiguous Forget uses Q1’s existing subject question and script-bound `forget-fact` options; the model words the question. Resolve only the chosen stored id, preserve rounds/exhaustion and clear sibling work, and publish through landed Q1c. Reuse landed Q1b controls without new strings or controls.
7. Only a settled app Bin tombstones facts bound solely to that source. Failed Bin does not; independently supported facts survive. Match source ids across rename/move, never names or substrings.
8. Malformed/unreadable memory freezes memory writes with a BowerError. Content writes use read versions; existing move/Bin operations retain their read name/place fences. Recovery uses the existing frozen manifest and settled outcomes.
9. Only actual About me creation/update earns existing report rows; JSONL/archive effects stay hidden. Keep B1d’s selected-target restrictions and typed position-4 context; no additional prompt builder, cache, scanner or authority path.

## Reds

Exact proposed names in `runner/test/b4-incorporation.test.ts`, through production `main` or existing production answer/Bin entry points; made-up data only.
- `c17-b4-origin-not-authority`: refuse forged document preference, sensitive inference and policy by origin rather than unknown-key rejection; control: remember Alex’s qualified remote-role preference and file Ferrowick’s offer.
- `c17-b4-answer-rule-origin`: reject filing consent and copied document instructions as personal authority; control: admitted rule and actual subject text answer supply only their authorized memory.
- `b4b-own-text-is-context-only`: editing personal About me creates neither observation nor deletion tombstone; control: direct personal context reflects the edited text.
- `b4b-write-through-settlement`: failed memory effects neither consume words nor claim completion; control: one observation, one visible edit and one settled consumption, with duplicate replay inert.
- `c17-b4-forget-no-return`: tombstone before view change and block same-source/version/archive resurrection; control: unrelated facts remain and explicit later remembering creates fresh evidence.
- `b4b-forget-fact-option-binding`: reject invented/stale fact choices and label-based retargeting; control: chosen stored fact id resolves through Q1 while clear sibling work succeeds.
- `c17-b4-source-bin-and-version`: failed Bin and source renames cannot trigger incorrect removal; control: settled Bin removes only solely supported facts and preserves independent evidence.
- `b4b-memory-fences-and-report`: changed-before-act targets or unreadable logs produce no false memory success; control: unchanged target settles, emits its existing row and hides internal artifacts.

## Verify

Run every named red, scripted tests, and Q1a/Q1c/Q1b, C05 and B4a compatibility gates; provider tests follow their explicit handoff. Coordinator runs `pnpm check`; fixture changes require full `pnpm e2e:fake`, and integration runs full suites. Preserve existing Q1 screen behavior. Log output to temp files; read failures only. Reviewers run unit/contract tests only, without servers, e2e or main-checkout switches.

## Commits

Tests-only red, then implementation, then notes alone: `docs/harness/2026-10-11-b4b-observations-notes.md`; line 3 exactly `implementer: codex`. Record named reds, production traces, provenance/settlement controls and `removed:` lines; worker reply uses the WORKER.md card.

## Open for the lead

- Required prep files `runner/src/claude.ts` and `runner/test/claude-provider.test.ts` overlap B1d and are excluded. Allocate them after B1d’s handoff before dispatching provider implementation.
- `runner/src/model-input.ts`, `drive.ts`, `index.ts`, `main.ts`, `timing.ts` and `src/data/vault/vault-index.ts` remain B1d-owned; do not move their mechanisms into scripted.ts to avoid the overlap.
- B4a must deliver the explicitly allocated `forget-fact` contract extension; Q1’s existing UI alone does not implement its stored action.
- Resolve the prep’s B2b/c, B5b/c and B6b/c provider/settlement handoff conditions against the current landed baseline; do not silently turn those older conditions into completed dependencies.

