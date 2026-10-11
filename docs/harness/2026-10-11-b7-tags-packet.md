# Packet: B7 tags

- **Entry:** `b7-tags`; branch `b7-tags`; worktree `/private/tmp/bower-b7-tags`; escalated: **yes**, from the prep's B7a and Q1–Q6 calls. `ui: false`; existing Tags property only.
- **Sessions:** TL-P4-29/TL-P4-57. Separate Codex red session: `gpt-6-astra high` for this escalated entry (`gpt-6.1-sol high` for normal entries). Requested implementation: `gpt-6.1-sol high`. Independent adversarial pass: `gpt-6-astra xhigh`. Fresh closing review: `gpt-6-astra high`, with no earlier participation. All Fast; fresh fix sessions. Coordinator commits and runs restricted gates under the lock. Model mapping conflict is open below.
- **Rulings:** [DECISIONS.md](DECISIONS.md), whole TL-P4-49 Q1–Q7; B8 logging amendment TL-P4-50 Q1–Q2. Source: [B7 prep](2026-10-10-b7-prep.md), entry rows, file ledger, reds and cases. B7 follows B6a. Preserve B1 retrieval, B2/B6 generation, B5 lifecycle and B4a contracts.
- **Research first:** reuse the prep's [Obsidian tags](https://help.obsidian.md/tags), [YAML scalars](https://yaml.org/spec/1.2.2/#73-flow-scalar-styles), [Zod validation](https://zod.dev/api) and [plan then execute](https://arxiv.org/html/2506.08837v1). Offline citations only; no network or fresh verification. Reuse the shared validator, parser/serializer, read cache and manifest effects. No new library or writer.

## Owned files

Proposed consolidated B7a–c ledger; shared files wait for coordinator handoff. Only these exact paths are allocated. Unallocated needs go to the lead.

- Grammar/list: `src/data/contracts/tag-format.ts`, `src/data/contracts/tag-format.test.ts` (new).
- **B4a contract overlap:** `src/data/contracts/note-format.ts`, `src/data/vault/note-format.test.ts`, `src/data/contracts/run-manifest.ts`, `src/data/contracts/run-manifest.test.ts`, `src/data/vault/layout.ts`. Wait for B4a and B6a where shared. Admission: `runner/src/spine/admitted.ts`, `runner/test/admitted.test.ts`; coordinate B4a runner-write changes.
- **B5b/B5c planner overlap:** `runner/src/claude.ts`, `runner/test/claude-provider.test.ts`, `src/data/spine/scripted.ts`, `src/data/spine/scripted.test.ts`. Wait for B1d, B5b and B5c handoffs; serialize other B4/B6/B11 consumers. New proof: `runner/test/b7-incorporation.test.ts`.
- Corpus support after H1/H2 handoff: `runner/src/corpus.ts`, `runner/test/corpus.test.ts`, `runner/test/corpus-run.ts`, `runner/test/corpus-driver.test.ts`, `runner/test/second-brain-method.test.ts`, `harness/corpus/README.md`, `docs/harness/2026-10-08-p4-method-rubric-changes.md`.
- Case roots under `harness/corpus/`: `c17-b7-reuse-known`, `c17-b7-proposal-yes`, `c17-b7-proposal-budget`, `c17-b7-authority-full-cap`. Each owns exactly `case.json`, `expected.json`, `expected-tag-results.json`, `replies.json`, `rubric.md`, `folder/Rules.md`, `folder/.bower/tags.json`, `folder/Resources/Gardening/Gardening.md`, `folder/Resources/Gardening/Seed packet.md`. Additional paths, respectively: `inbox/Garden workshop.txt`; `inbox/Rain barrel guide.txt`; `inbox/Rain barrel guide.txt`, `inbox/Compost guide.txt`, `inbox/Seed saving guide.txt`; `inbox/Garden bulletin.txt`, `inbox/Alex notes.md`, `folder/Resources/Alex plans.md`. Legacy case slugs remain; their proposal expectations must change.
- Notes: `docs/harness/2026-10-11-b7-tags-notes.md`. Exclude B5's `runner/src/type-table.ts` and `runner/test/type-table.test.ts`: there is no tag proposal arm. No main/index/engine, note-edit, questions, answer-loop, ownership-format, screen or transport ownership.

## Contract

1. One runner-only `.bower/tags.json`: `{"v":1,"tags":["gardening","remote-work"]}`. Missing means empty, with no seed or write until growth. Strict writes; lenient reads. Invalid files disable tags for that run with a short BowerError and logged details. Never repair or truncate stored bytes silently. Over-30 historical lists freeze growth.
2. Canonical slugs: 1–40 characters, `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`. Normalize growth candidates as in the prep; deduplicate before counting. Show installed tags first for model reuse and semantic near-duplicate checks. No alias registry or folder-derived taxonomy. Generated assignments are distinct and canonical; unsafe, unknown or over-three replies use the existing validation retry/refusal.
3. At most 3 tags per new note, 30 installed per folder and 2 additions per run. Growth is automatic after normalization and reuse checks. Exact person requests install the named tags within those caps. At capacity, no eviction. Oversized requests install only what fits; the existing done line stands. No pending remainder queue or new copy.
4. Ground topics in admitted subject matter. Zero tags is valid. Detail stays in content/properties; tags never choose destinations or create schema authority. Only new companions, links, words, comparisons and eligible B6 knowledge notes gain tags. Mechanical routes with no authored choice use an empty list. No quota-only note, backfill or retag. Preserve moved personal Markdown bytes, including four legacy tags; never reserialize it. Existing Source metadata/body stays immutable.
5. Additions are frozen planning effects, before maintain/barrier. Use one vocabulary after-text per run. Dependent tagged creates wait for installation. Changed-before-act refuses the affected effect; unchanged effects apply once. Reuse ids, read versions, modifiedTime, stillAsSeen, reserved creates and checkpoint/readback. Replay makes no model call or duplicate addition. Undo reverses notes and keeps vocabulary. Log every addition through B8's sole log mechanism; allocation is open below.
6. Read the list at most once/version through B1's cache. No discovery scan, maintenance target or extra model call. Reuse B1's five-note/source and aggregate budgets, including 300 maintenance calls and 20% reserve. Unchanged vocabulary sends zero writes. Match and compare bytes by stable id. Production `main`/corpus-driver evidence is required; helper-only green is insufficient.

## Reds

Exact proposed test names. Each row requires the failing assertion and its positive control. Use invented inputs and injected clocks/faults. No model/network calls.

| Name | Failure to reproduce; positive control |
| --- | --- |
| `b7-list-strict-write-lenient-read` | Invalid list disables tags without cleanup; missing is empty, valid v1 assigns, over-cap bytes survive. |
| `b7-slug-normalization` | Unsafe/41-character candidates refuse; equivalent space/case/underscore spellings dedupe, 1/40-character slugs round-trip. |
| `b7-three-thirty-two` | Reject four assignments and prevent third addition/31st entry; three assignments, two additions and 29→30 succeed. |
| `b7-runner-path-admission` | Refuse arbitrary hidden paths and app writes; declared runner tags.json effect succeeds. |
| `b7-legacy-note-tags-readable` | No legacy flow/block tag rewrite; old forms remain readable and generated safe slugs round-trip. |
| `b7-new-note-tags-through-main` | Unknown/duplicate tags refuse; three known topics create once with zero vocabulary writes. |
| `b7-all-generation-routes` | No guessed fallback tag or value-gate bypass; all eligible authored routes retain validated tags in the same create. |
| `b7-automatic-growth-no-proposal` | No tag question, payload or B5 budget charge; new grounded topic installs/logs, near-duplicate reuses. |
| `b7-explicit-growth-origin` | Source imperatives cannot grant personal/schema edits; exact person tag request installs within caps, excess gets existing done settlement. |
| `b7-person-source-no-retag` | No personal/source metadata change or backfill; new Bower companion tags succeed while originals stay byte-identical. |
| `b7-growth-before-dependent-create` | Refused/changed vocabulary blocks dependent tagged create; unchanged installation precedes one create and honest report. |
| `b7-29-to-30-growth` | Two candidates at 29 cannot install both; one fills the last slot, full list stays unchanged and ordinary filing succeeds. |
| `b7-lost-vocabulary-response` | Lost response cannot repeat growth/log or re-model; redispatch reconciles the frozen effect once. |
| `b7-no-stamp-only-write` | Unchanged list cannot send a stamp-only mutation; real addition sends one vocabulary after-text with normal fencing. |
| `b7-person-move-byte-identity` | Four-tag personal upload cannot be normalized/truncated; unchanged move preserves exact bytes/id, changed name/place refuses. |
| `b7-undo-keeps-vocabulary` | Undo cannot remove installed topics; note effects reverse and replay remains idempotent. |

Keep the four prep cases. Reuse-known retains gardening/remote-work/learning. The old yes case becomes automatic rainwater growth on first filing. Its idle later run changes nothing. The old budget case proves duplicate-before-cap automatic growth, not proposal slots. Full-cap keeps 30 entries and Alex's four-tag Markdown unchanged. Use B1d selection then execution with real candidate ids. Rewrite obsolete `tagProposals`, question selectors and consent oracles. Record deterministic integration separately from pending semantic model evidence.

## Verify

Run every named red and full touched contract/provider/scripted/incorporation suites. Replay all four cases through production `main`. Cover missing/invalid/over-cap lists, every generation route, read-to-act fences, refusal, lost responses and real Undo. Run B1/B2/B5/B6/B4a compatibility and corpus/method gates, then `pnpm check`. Fixture changes require full `pnpm e2e:fake`; no new screen e2e follows from `ui: false`. Integration runs full suites.
Use `bash harness/with-lock.sh` for heavy gates. Redirect output to OS-temp logs; read failures only. Measure cold/warm/growth/refusal/replay calls; return growth above 20% to the lead. Reviewers run unit/contract tests only, with no server, e2e or checkout switch. List every contradiction after the full targeted suite; never weaken bounds or assertions.

## Commits

Tests-only red, then fix, then notes alone. Notes line 3: `implementer: codex`. Record exact tests, changed-test reasons, measured calls, case verdicts, deterministic/model evidence and `removed:` lines. Runner/coordinator commits; no worker git writes. Reply with the WORKER.md card, each line under 120 characters.

## Open for the lead

- Confirm dispatch model: the requested Sol high implementation differs from TL-P4-57's Astra high mapping for escalated entries. Prep marks this contract work escalated.
- Allocate B8 log integration and its tests. TL-P4-49 names `.bower/log.md`; TL-P4-50 Q2 later amends B7 too, to `.bower/log/YYYY-MM.md`, with `decision` events. No log implementation path appears in the B7 ledger. Do not add a second writer.
- Confirm consolidated B7a–c ownership and shared handoffs, including H1/H2 support. Allocate extra crash/Undo/matrix fixture paths if needed; the four case inventories above are the only corpus inputs owned here.
- Freeze the shared execution declaration for automatic candidates and tags across all B6 routes. The prep's `tagProposals` consent shape is obsolete; no replacement field spelling is ruled. Keep one validator and planner.
- Confirm partially malformed v1 arrays: the prep permits valid-entry reuse with growth frozen; TL-P4-49 says an invalid file disables tags. Whole invalid files disable tags. Do not invent the entry-level boundary.

## Ruled

- TL-P4-49 wins over prep P3/P6, Q3/Q5/Q6 and consent cases: growth needs no proposal, question, yes/no/ignore/decline path or B5 quota. No tag-payload arm, selector, consent queue or approval test survives.
- Replace prep reds `b7-tag-payload-roundtrip`, `b7-proposal-shared-budget`, `b7-proposal-yes-no-ignore-replay`, `b7-two-and-five-shared-proposals`, `b7-29-to-30-stale-yes` with automatic-growth/cap/recovery evidence above. Consent-shaped proposed cases are obsolete; their underlying cap/crash evidence remains.
- Q1/Q2/Q4 fix empty/missing policy, creation-only scope and exact 1–40/3/30/2 bounds. Q5 drops the proposed pending remainder. Q6 fixes replay and vocabulary retention on Undo. Q7 removes proposed question/error copy and designer dispatch work. B6a precedes B7; B12 owns later retag requests.
- TL-P4-50's later B8 log amendment wins over TL-P4-49's single-file spelling. Preserve that contract without claiming unallocated logging work is ready.
