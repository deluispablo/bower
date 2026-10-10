# Phase 4 plan and acceptance

**Status: adopted by the technical lead under [TL-P4-01](harness/2026-10-07-tl-p4-01-p4-start.md), 2026-10-07, after the owner accepted P3 and authorized P4.** It works under [WORK_PLAN](WORK_PLAN.md) Phase 4 and [PHASES](PHASES.md) Phase 4. P2's [acceptance](P2_ACCEPTANCE.md) and P3's [acceptance](P3_ACCEPTANCE.md) stay the baseline: every earlier journey keeps passing on demo, fake and staging.

P4 adds the real second brain. Claude understands, connects and writes. The P3 spine stays the only thing that changes Drive: Claude proposes structured operations, and the spine validates, applies, checkpoints and reports them ([ARCHITECTURE](ARCHITECTURE.md), "Two contracts, not one model-shaped API"). P4 ends with the new app replacing the original in production.

## What carries over

- **From P3:**
  - the Worker, the runner wire and the spine (TL-P3-18 to TL-P3-23);
  - the scripted provider, which stays as the test double behind the same provider interface;
  - the staging environment;
  - `bower-home` as the instance repository (TL-P3-13).
- **Behaviour reference:** the owner's local second brain method ([TL-P4-08](harness/2026-10-08-tl-p4-08-second-brain-method.md)); it wins where it differs from the original.
- **Reuse from the original app** (owner rule: reuse first):
  - `agent/prompts/ingest.md` and `lint.md`;
  - `agent/claude-settings.json`, the permission policy for every run;
  - the `CLAUDE_CODE_OAUTH_TOKEN` handling in `agent/run.sh`;
  - the benchmark in `agent/bench/` (its cases, fixtures and `run-bench.sh`).
- **Open from P3** ([dossier](harness/2026-10-07-p3-dossier.md)):
  - the Codex review of the P3 range on 2026-10-12 (TL-P3-16), whose Critical and Important findings are fixed before P4 code depends on that code;
  - the live revocation check with another test account (owner-deferred);
  - the P4 items listed in the dossier.

## Capability matrix, P4 column

| ID | What must work by P4 exit |
| --- | --- |
| C01 | P3 behaviour in production. The live revocation check passes with a test account. Google's publishing status for the OAuth client suits the people who use it (below). |
| C02 | Uploads resume after a reload where the browser kept the bytes, and the orphan-pile count is truthful (P3 limitation and P4 item). |
| C03 | P3 behaviour in production. |
| C04 | Real comprehension: a new input becomes a source note and compiled knowledge that are factually faithful, judged on the corpus. |
| C05 | Semantic updates of existing knowledge that keep the person's text and history, including the "keep one note" merge question. |
| C06 | Meaningful connections and citations across notes and projects. |
| C07 | Real disagreement detection, with both sources and appropriate uncertainty. |
| C08 | Useful authored documents (reports, comparisons, long answers with tables and sources), and revision of generated content. Necessary prose is never cut to hit a token target. |
| C09 | Answers about stored material that link back to the actual sources. |
| C10 | Real web lookup when the person allows it, with accurate citations, freshness and reuse rules, and honest failed, stale or denied outcomes. |
| C11 | Correct interpretation of rules, preferences, requests and questions. Source documents never change policy. |
| C12 | The real tidy-up lifecycle with the model in the loop: model or tool failures, budgets and partial results are truthful and recoverable. |
| C13 | Real undo of supported tidy-up effects from the manifest. Later edits are protected and partial recovery is visible. |
| C14 | P3 behaviour, with runner writes from a real model while the app is open. |
| C15 | The runner consumes the app's ready-input package, with deterministic fallbacks for unprepared inputs and bounded more-context requests. |
| C16 | Every journey above on phone and desktop, by keyboard, against staging and then production. |
| C17 | The brain of the owner's local vault in Bower's runner: index (L1), hot (L0), About me, summaries, type table and profiles, templates with fit → create → ask, tags, log and lint, markers, long-text summaries ([TL-P4-38](harness/2026-10-10-tl-p4-38-brain-port.md)). |

## Owner setup

No session enters credentials.
1. **The Claude credential** for the runner: run `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN -R deluispablo/bower-home` (TL-P3-22 moved it here). The lead asks when `claude-provider` is ready.
2. **Google OAuth publishing status.** Check whether the existing OAuth client is in "Testing" or "In production". In Testing, Google expires refresh tokens after 7 days ([Google OAuth, refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)). The `drive` scope is restricted, so production status for anyone beyond the owner's own accounts needs Google's verification. The owner decides who uses Bower after the cutover; that decides whether verification is needed.
3. **The production cutover,** at the end of P4. The owner approves the switch moment and the rollback plan.

## Work packages

| Package | Entries (registered batch by batch) |
| --- | --- |
| P4-A Adoption and evidence base | `p4-acceptance` (this document); `p4-corpus` (a synthetic capability corpus with expected outcomes for C04–C15, reusing `agent/bench/cases` and the P2 scripted journeys); `original-baseline` (the original app's quality, latency and tokens on the same corpus) |
| P4-B Provider | `claude-provider` (the semantic-provider interface over headless Claude Code on Actions, under the original's permission policy, returning structured operations only); `provider-contract` (the same fixtures as the scripted provider); `run-budgets` (turns and time per task, with an honest partial or continuation state) |
| P4-C Semantic slices, each proven with scripted proposals before the model | C04 incorporation; C05 updates and the merge question; C17 the brain (TL-P4-38, entries B1-B10); C06 connections; C07 disagreement; C11 rules, requests and questions; C08 creation and revision; C09 queries; C10 web research; C15 preparation and more-context requests; C13 real undo; C12 model and tool failures |
| P4-D Quality and speed | `corpus-evaluation` (scored against expected outcomes); `semantic-quality-review` (an independent reviewer judges the corpus outputs); `original-comparison` (quality, latency and tokens against the original) |
| P4-E Production readiness and cutover | `rate-limits` (TL-P3-14); `oauth-publishing` (owner setup 2); `rules-original-conversion` (how the original's plain `Rules.md` becomes Bower-managed, never by an automatic rewrite); `landing-csp` (drop `unsafe-eval` through `fix-landing.mjs`); `upload-resume-after-reload` and `orphan-pile-count` (C02); `revocation-live` (C01); `production-precheck` (a read-only check that the new app reads the owner's real Bower folder correctly); `production-cutover` (deploy the new Worker and app in place of the original, with a tested rollback); `runbook-p4` |
| P4-F Close | Freeze; the four suites; a cross-provider review; the C16 walk on staging and then on production; the dossier; owner acceptance |

**Order:**
1. P4-A and the P4-B provider in parallel.
2. Then P4-C in the listed order, one slice at a time, each with its corpus cases. After C05, a consolidation of the base in four stages runs before C06 ([TL-P4-14](harness/2026-10-08-tl-p4-14-consolidation.md)).
3. P4-D runs on each slice as it lands, and in full at the freeze.
4. P4-E runs alongside once a slot frees, with the cutover last.
5. Then P4-F.

## Rules that hold through P4

- **The model never writes to Drive.** Every effect is a validated spine operation with a checkpoint. Source notes stay immutable, and user content and Bower-owned sections keep their ownership rules.
- **The model is chosen by evidence.** Start on Sonnet for ingestion and move a task type to Opus only when the corpus shows a quality gap. Record tokens and latency per run.
- **Budgets adapt to the work.** A task that needs more surfaces an honest continuation or partial state. Nothing requested is dropped silently.
- **Synthetic data only until the production precheck.** The owner's real folder is read for the first time by `production-precheck`, and only read.
- **Free tiers and the owner's existing subscription only.** Paid plans go back to the owner.

## P4 exit checklist

- Every registered P4 entry passes with a valid proof. No Critical or Important finding is open; Minor findings go to a polish list.
- The corpus evaluation and the independent semantic review pass, and the comparison with the original is recorded.
- The four suites pass on the frozen SHA. C16 passes on staging, and then on production after the cutover.
- One cross-provider review covers the provider, the semantic slices and the cutover.
- The cutover is done, with a rollback tested and documented. `runbook-p4` covers operating the replaced production.
- Owner acceptance.
