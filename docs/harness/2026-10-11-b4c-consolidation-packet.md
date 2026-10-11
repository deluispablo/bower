
# Packet: B4c, consolidation, archive and recovery

- **Entry:** `b4c-consolidation`; worktree `/private/tmp/bower-b4c-consolidation`; branch `b4c-consolidation`; escalated: yes (accepted prep split and persistence boundary); `ui: false` under TL-P4-48 Q9.
- **Sessions:** TL-P4-29/TL-P4-57: separate Codex red, implementation, read-only adversarial and fresh closing-review sessions. Fast tier; `gpt-6-astra high` for reds, implementation and closing review; `gpt-6-astra xhigh` for adversarial. Fresh fix sessions; coordinator owns commits and restricted gates.
- **Order:** B4a → B4b → B4c, after landed B5a/B6a; require B4b’s scripted/test handoff and B1d’s maintain/provider/budget/corpus handoffs. Consume landed B1a/B1c/B3b and Q1a/Q1c/Q1b.
- **Rulings:** `docs/harness/2026-10-10-tl-p4-48-b4-b11-contract.md`, B4 Q3–Q9 and Order; `docs/harness/2026-10-10-b4-prep.md`, B4c ledger, cases and H1–H4, excluding dropped case 4.
- **Rulings:** DECISIONS TL-P4-48 fixes archive paths, frozen replay and non-reviving Undo. TL-P4-42 addendum 4 supplies B3b’s generic declared-target slot in the existing maintain home; TL-P4-41 addendum 8 preserves opaque personal spans.
- **Research first:** reuse offline [episodic memory](https://arxiv.org/pdf/2605.12978), [plan then execute](https://arxiv.org/html/2506.08837v1) and landed B3b’s [reconciliation reference](https://kubernetes.io/docs/concepts/architecture/controller/). Reuse manifest/checkpoints, reserved ids, write-once and maintain; no network or second lifecycle.

## Owned files

- After B4b handoff: `src/data/spine/scripted.ts`, `src/data/spine/scripted.test.ts`, `runner/test/b4-incorporation.test.ts`.
- `runner/test/b4-consolidation.test.ts` (new), `runner/test/b4-recovery.test.ts` (new), `runner/test/corpus.test.ts`, `runner/test/second-brain-method.test.ts`.
- `harness/corpus/README.md`, `docs/harness/2026-10-08-p4-method-rubric-changes.md`, after their support-owner handoffs; notes file named under Commits.
- Exact existing fixture files below; each filename is relative to its stated directory. No wildcard or dropped-case allocation.

| Directory | Exact files |
| --- | --- |
| `harness/corpus/c17-b4-forget-no-return/` | `case.json`, `expected.json`, `folder/.bower/archive/about-me/about-fixture/how-you-like-things/2026-10-07-old.md`, `folder/.bower/changes/archive/remember-fact-remote.json`, `folder/.bower/observations.jsonl`, `folder/About me.md`, `folder/Resources/Career/Remote preference.md`, `inbox/.gitkeep`, `replies.json`, `rubric.md` |
| `harness/corpus/c17-b4-gate-archive-first/` | `case.json`, `consolidation-reply.json`, `expected.json`, `folder/.bower/archive/about-me/about-fixture/how-you-like-things/2026-10-06-old.md`, `folder/.bower/changes/archive/remember-fact-choice-1.json`, `folder/.bower/changes/archive/remember-fact-choice-2.json`, `folder/.bower/changes/archive/remember-fact-choice-3.json`, `folder/.bower/changes/archive/remember-fact-choice-4.json`, `folder/.bower/changes/archive/remember-fact-choice-5.json`, `folder/.bower/changes/archive/remember-fact-choice-6.json`, `folder/.bower/changes/archive/remember-fact-choice-7.json`, `folder/.bower/observations.jsonl`, `folder/About me.md`, `folder/Resources/Personal/Preference statements.md`, `inbox/.gitkeep`, `replies.json`, `rubric.md` |
| `harness/corpus/c17-b4-origin-not-authority/` | `case.json`, `expected.json`, `folder/About me.md`, `folder/Projects/Job hunt/Job hunt.md`, `inbox/.gitkeep`, `inbox/Ferrowick offer.txt`, `proposed-refusal.json`, `replies.json`, `rubric.md` |

## Contract

1. Consolidate only above the section’s 400/400/200-word budget and with ≥5 new live observations since its successful frontier. Four-event overflow remains; duplicates, rereads and tombstones cannot inflate the count. Forget/Undo rebuild without the gate.
2. Derive text only from live observations minus tombstones, retaining qualifications and attribution. Prior section/archive prose is never semantic authority. Validate line-to-fact membership and provenance; mechanical ids do not prove semantic entailment.
3. Archive exact pre-consolidation section bytes, write-once, at `.bower/archive/about-me/<section>/<date>-<op id>.md`; no About me file-id segment. Persist identities, inputs and proposed text in the existing manifest before effects.
4. Apply ledger events → confirm archive/readback → make one combined About me edit → record successful frontier → maintain/barrier. An archive failure blocks replacement; a failed edit cannot advance its frontier or claim success.
5. Lost replies, revocation, redispatch and same-day runs reuse reserved ids and frozen text without a fresh model call. Reconcile through the existing effect lifecycle and B3b’s declared-target slot; never add an after-run writer.
6. Undo invalidates the undone run’s observations and rebuilds live evidence; it never restores an old summary or revives Forget. Later tombstones remain effective; explicit remembering requires new words.
7. Supply B1d position 4 with ≤4,000 characters of learned content, an honest cut mark and separately typed personal input/provenance. Share discovery/read cache, 300 maintenance calls and the 20% reserve; unchanged runs write nothing.
8. Count ledger bytes, source checks, archive prechecks/readbacks, consolidation/retries and B1d calls in the existing timing ledger. Preserve landed index/hot behavior and pins except individually explained added calls.
9. Complete C17 production oracles: bind historical selectors to real admitted ids, validate lineage, parse the real ledger and prove exact archive bytes, membership, ordering and settlement. Do not claim green pending fixtures prove behavior; case 4 is dropped.

## Reds

Exact proposed names through production `main`, corpus driver or existing Undo entry point; made-up data and injected faults/clock only.
- `c17-b4-gate-archive-first`: the 201-word preference section with four new observations does not consolidate; control: the fifth triggers archival and consolidation from eight live facts, preserving qualifications.
- `c17-b4-archive-crash-resume`: archive failure/lost reply cannot cause early replacement, duplicate archive or replay model calls; control: redispatch completes the same frozen work and done replay writes nothing.
- `b4c-same-day-archive-identity`: prevent date-only collisions and overwrite; control: distinct operations preserve distinct exact archives, while one operation reuses its identity.
- `b4c-frontier-and-version-fence`: fail the section write or change its read version and observe no advanced frontier/barrier success; control: unchanged evidence completes the ordered chain.
- `c17-b4-undo-then-forget`: Undo cannot restore a forgotten fact from former views/archives; control: unrelated live evidence survives and the undone run’s observations disappear.
- `c17-b4-bootstrap-malformed-limit`: duplicate/damaged notes, torn logs and exhausted reserve refuse unsafe writes; control: missing-note template initialization and valid within-budget work succeed.
- `b4c-context-budget-noop`: cap learned context honestly without trusting archive/document prose or duplicating reads; control: typed personal context remains usable and an unchanged run writes nothing.
- `b4c-corpus-lineage-and-membership`: reject unbound selectors, forged lineage and unsupported consolidated lines; control: all three retained C17 cases bind real ids and prove ledger/archive outcomes.

## Verify

Run all named reds, retained C17 cases, corpus/method gates, B4a/B4b and landed B1a/B1c/B3b/B5a/B6a/Q1 compatibility tests; run main/provider/timing/golden suites after allocation. Coordinator runs `pnpm check` and full `pnpm e2e:fake` for fixture changes; integration runs full suites. Record measured production-only call deltas; >20% time delta returns to the lead. Temp logs, failures only; reviewers run unit/contract tests without servers/e2e/main-checkout switches.

## Commits

Tests-only red, then implementation, then notes alone: `docs/harness/2026-10-11-b4c-consolidation-notes.md`; line 3 exactly `implementer: codex`. Record exact reds, fault traces, archive bytes, named calls, compatibility and `removed:` lines; worker reply uses the WORKER.md card.

## Open for the lead

- Excluded B1d overlaps: `runner/src/index.ts`, `runner/src/claude.ts`, `runner/test/claude-provider.test.ts`, `runner/test/main.test.ts`, `runner/test/timing-counts.test.ts`, `runner/src/corpus.ts`, `runner/test/corpus-run.ts`, `runner/test/corpus-driver.test.ts`; allocate serially after handoff. B1d’s other listed files remain untouched.
- Allocate `runner/test/drive-calls-golden.test.ts` only after identifying B1d’s moved goldens. No alternate maintain/provider/corpus mechanism is authorized to bypass these exclusions.
- Existing fixture archive paths contain the superseded file-id segment; allocate exact replacement fixture paths under the ruled scheme before fixture repair.
- Confirm C13’s available Undo seam and allocate any missing files; unresolved Undo evidence cannot be counted as passed. Resolve the prep’s older B11-before-B4 dependency against TL-P4-48’s Order.

