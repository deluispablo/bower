# Packet: B8, log and lint

- **Entry:** `b8-log`; worktree `/private/tmp/bower-b8-log`; branch `b8-log`; escalated: **yes**, from the prep's B8a/B8b call. `ui: false`: health content and existing report links only. The prep's a/b/c allocation needs the lead's dispatch mapping below.
- **Sessions:** TL-P4-29/TL-P4-57. Separate Codex red session `gpt-6.1-sol high`; implementation `gpt-6.1-sol high`; independent adversarial pass `gpt-6-astra xhigh`; fresh closing review `gpt-6-astra high`. All Fast. Sol is explicitly assigned here; the escalated flag is not silently changed. Fresh sessions for fixes. The coordinator commits and runs restricted gates under the lock.
- **Rulings:** `docs/harness/DECISIONS.md`, TL-P4-50, all B8 Q1–Q8 and Order bullets. Source: `docs/harness/2026-10-10-b8-prep.md`, entry rows, ledger, reds and cases. B8 follows B3b's maintain handoff. Preserve B1 retrieval, B5/B6 profile/template and B4/B11 contracts. B9 markers are outside this entry.
- **Research first:** reuse the prep's [HTTP idempotency](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2), [Drive reserved ids](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds) and [CommonMark fences](https://spec.commonmark.org/0.31.2/#fenced-code-blocks). No network or fresh verification. Reuse write-once, ReadCache, shared parsers, maintain, materialize and the report barrier.

## Owned files

Carry forward this exact prep ledger, subject to serial handoff and the dispatch mapping below. New files are the prep's proposed paths. No extra provider, planner, transport or screen files are implied.

- **Contracts (prep B8a):** `src/data/contracts/log-format.ts`, `src/data/contracts/log-format.test.ts`, `src/data/contracts/run-manifest.ts`, `src/data/contracts/run-manifest.test.ts`, `src/data/contracts/run-checkpoint.ts`, `src/data/contracts/run-checkpoint.test.ts`, `src/data/contracts/note-edit.ts`, `src/data/contracts/note-edit.test.ts`, `src/data/contracts/links.ts`, `src/data/contracts/links.test.ts`, `src/data/contracts/note-format.ts`, `src/data/vault/note-format.test.ts`, `src/data/vault/layout.ts`, `runner/src/spine/admitted.ts`, `runner/test/admitted.test.ts`.
- **Reduction/maintenance (prep B8b):** `runner/src/log.ts`, `runner/test/log.test.ts`, `runner/src/lint.ts`, `runner/test/lint.test.ts`, `runner/src/index.ts`, `src/data/spine/report.ts`, `src/data/spine/report.test.ts`, `src/data/spine/barrier.ts`, `src/data/spine/barrier.test.ts`, `src/data/spine/engine.ts`, `src/data/spine/engine.test.ts`, `runner/test/main.test.ts`, `runner/test/b8-incorporation.test.ts`.
- **Evidence (prep B8c):** `runner/src/corpus.ts`, `runner/test/corpus.test.ts`, `runner/test/second-brain-method.test.ts`, `runner/test/corpus-run.ts`, `runner/test/corpus-driver.test.ts`, `runner/test/b8-corpus.test.ts`, `runner/test/b8-recovery.test.ts`, `runner/test/main.test.ts`, `runner/test/timing-counts.test.ts`, `runner/test/drive-calls-golden.test.ts`, `e2e/b8-health-report.spec.ts`, `harness/corpus/README.md`, `docs/harness/2026-10-08-p4-method-rubric-changes.md`.
- **Case files:** each of the four prefixes below owns `case.json`, `expected.json`, `replies.json`, `rubric.md`, `oracle.json`, plus only its listed inputs. All paths are relative to that prefix.
  - `harness/corpus/c17-b8-settled-recovery/`: `folder/Bower health.md`, `folder/Resources/Gardening/Gardening.md`, `inbox/Mulch notice.txt`.
  - `harness/corpus/c17-b8-report-only-grammar/`: `inbox/.gitkeep`, `folder/Resources/Gardening/Gardening.md`, `folder/Resources/Gardening/Plot diary.md`, `folder/Resources/Gardening/Linked reference.md`, `folder/Resources/Gardening/Loose thought.md`.
  - `harness/corpus/c17-b8-bounded-encoding/`: `folder/Bower health.md`, `folder/.bower/log.md`, `folder/Resources/Gardening/Gardening.md`, `inbox/Options | alternatives.txt`.
  - `harness/corpus/c17-b8-findings-refresh/`: `inbox/.gitkeep`, `folder/Resources/Gardening/Gardening.md`, `folder/Resources/Gardening/Checklist.md`.
- **Overlap:** owned `note-edit.ts` and its test wait for B5b/B5c's profile work and B4a. Owned `run-manifest.ts`, `run-checkpoint.ts` and their tests wait for B4a's contracts; `note-format.ts` is conditional B4a scope. Preserve its runner-target and ownership guards. B11 and earlier B1/B6 contract owners also hand back shared files.
- **Not owned:** `runner/src/claude.ts` and `src/data/spine/scripted.ts`. B5b/B5c share these upstream paths; B4a also touches scripted.ts. Their handoffs are dependencies, not permission to edit them. B8b waits for B3b and other maintain owners; B8c waits for the shared C17 admission/driver/scorer handoff.
- **Notes:** `docs/harness/2026-10-11-b8-log-notes.md`.

## Contract

1. **Truthful log.** In manifest order, emit one event per applied primary op. Create → `create`; ordinary edit → `update`; link-only repair → `fix`; inbox filing → `ingest`; other visible move/rename or Bin → `move`; settled B7 tag addition → `decision`. No duplicate ingest/move event. Refused, unknown, sent-only, no-op, hidden plumbing and derived maintain effects produce no success event.
2. **Readable monthly files.** Write runner-only `.bower/log/YYYY-MM.md`. Use the frozen admission UTC date. Keep `date | action | note | detail`; replace newlines with spaces and ` | ` with ` / `. Append ` · op:<12-hex key>`, hashed from root/run/op. Replay skips existing keys. No JSON fields or log-driven rebuild. Over 4,096 UTF-8 bytes, cut detail only with `…`. No segments, sealing or deletion.
3. **Report-only lint.** Apply the prep's appendix checks to Bower notes: summary/required metadata, parser diagnostics, links, non-hub orphans, tags, activity, duplicates, dated names and bound originals. Consume B5's invalid-row/unreadable-table and unresolved-profile diagnostics, plus B7/view diagnostics, in their existing homes. A person's notes get only broken links and duplicate names. No repair, adoption, schema installation or new parser.
4. **Evidence and coverage.** Cache by id/version in retrieval.json. Read at most 200 changed notes through ReadCache, within the shared 300-call budget and 20% reserve. No second scan/store or extra model calls. Use real ids, shared alias/heading/block and fence grammar. Orphans need a complete inbound graph; self-links do not count. Exclude hidden files, Inbox and health. Stale active projects use valid Timeline activity at the prep's 60-day boundary; absent activity is unknown. Preserve checked/unchecked counts; incomplete evidence cannot prove clean or orphan.
5. **Health identity.** Create root `Bower health.md` with `by:bower` and the existing summary format. Store its id in retrieval.json. Rewrite that wholly Bower-owned note through maintain. Never find a write target by title. On a personal title collision, preserve its bytes and create Bower's note with the next free name. Write only when findings or coverage change; then report the actual create/update through existing rows. Complete empty coverage says exactly `No findings in the checked notes.` Partial coverage never says this.
6. **One recovery home.** Freeze inputs and declared ids/versions with the manifest. Use maintain's existing per-artifact outcomes, fences and readback. Every required artifact must settle before done; retrieval alone is insufficient. Lost responses retain actual create/update identity without duplicate writes/events. Old stored records remain readable. Content writes pass the read modifiedTime; moves/renames check the read name/place. Changed-before-act and revoked attempts refuse safely through existing BowerError recovery.
7. **Freshness and honesty.** Supported personal edits refresh evidence. Undo logs its own settled inverse ops, keeps prior audit events and rebuilds health from restored evidence. Done redispatch does nothing. Scripted main/corpus runs prove deterministic integration, not model semantics. No screen code, new UI, question, marker store or after-done writer.

## Reds

Exact proposed names; the separate red session must record assertion failures. Production promises run through `main` or the existing corpus driver. Each row includes a positive control.

- `b8-log-field-roundtrip`: reject JSON/embedded record breaks; control: sanitized pipes, quotes, backslashes, Unicode and newlines yield four readable fields and one stable suffix. This is sanitization, not reversible decoding.
- `b8-log-monthly-detail-bound`: wrong month or oversized detail fails; control: frozen month survives replay/month rollover, and detail-only ellipsis keeps the event within 4,096 bytes.
- `b8-runner-path-exact-scope`: reject unrelated dot paths and mismatched target ids; control: an exact declared monthly target succeeds and root personal log bytes stay unchanged.
- `b8-old-records-readable`: reject malformed new writes; control: old manifests/checkpoints and legacy log bytes remain readable without migration or guessed dedup keys.
- `b8-applied-only-one-event`: rejected hub edit, no-op and plumbing produce no events; control: settled create/ingest/B7 decision each appear once in manifest order.
- `b8-health-person-bytes-refused`: refuse a personal target id; control: same-title personal bytes survive while Bower creates the next free name and later rewrites its stored id.
- `b8-links-fence-one-grammar`: fenced backtick/tilde examples create no broken links; control: a real broken link is found and valid alias/heading/block links resolve.
- `b8-lint-no-person-write`: no personal summary/orphan/tag/filename findings or repairs; control: personal broken links/duplicate names and equivalent Bower-only checks are reported.
- `b8-health-real-report-row`: failed/no-op health writes produce no success row; control: confirmed create/update survives fixedReport and last-run publication.
- `b8-all-targets-before-done` and `b8-partial-retrieval-not-completion`: missing log/health proof prevents done despite retrieval landing; control: all required per-artifact outcomes permit completion.
- `b8-same-run-lost-log-response` and `b8-done-redispatch-noop`: lost response/replay cannot duplicate events; control: recovery finishes once, and a third done dispatch makes zero provider calls/writes.
- `b8-fresh-person-edit` and `b8-no-stamp-only-write`: stale findings clear after a supported edit; control: preserve the entire edit and observe zero health sends/rows on the identical third run.
- `b8-incomplete-not-clean`: cut/unreadable evidence gives no orphan/clean claim; control: a complete graph yields the exact supported findings or clean sentence.
- `b8-undo-keeps-audit`: Undo never erases prior events; control: applied inverses append once and health reflects restored evidence.
- `b8-shared-budget-no-second-reads` and `b8-zero-lint-model-calls`: duplicate media reads or a lint/log model call fail; control: cached unchanged evidence adds none and changed reads stay within shared limits.
- `b8-report-link-opens-health`: a wrong destination fails; control: actual created/updated health opens through existing RunLinks on demo/fake, 375/1440. Designer verifies before closure.

## Verify

Run every named red and complete touched contract, log/lint, spine, main and corpus suites. Replay all four named cases through production main with actual admitted ids and named selection/execution replies. Case 1 proves rejected-edit/lost-response recovery; case 2 needs ruled ownership expectations; case 3 needs monthly sanitization expectations; case 4 proves supported-edit/third-run zero sends. Preserve unrelated C04–C15 gates. Use fake timers/injected clocks.

Run corpus/method and call-golden gates, `pnpm check`, full `pnpm e2e:fake` for fixture edits, and the health-route e2e. Integration runs full suites. Coordinator runs heavy gates through `bash harness/with-lock.sh`; output goes to OS-temp files, failures only. Measure call deltas; timing growth over 20% returns to the lead. Reviewers run unit/contract tests only, no server/e2e or checkout switch. No red or implementation gate is claimed by this documentation packet.

## Commits

Tests-only red, then fix, then notes alone. Notes line 3: `implementer: codex`. Record exact red/green names, all contradictions with file:line, every `tests changed:` reason, corpus evidence, measured calls and `removed:` lines. Never weaken unchanged contracts. Deliver the WORKER.md card, each line under 120 characters. The runner commits this packet; no worker git writes or pushes.

## Ruled

TL-P4-50 wins over the prep wherever they differ:
- Q1–Q2 replace reversible JSON fields, 512 KiB/1024-event segments, annual archives, seal protocol and oversize refusal with sanitized text, monthly files and detail-only cutting. Retire `b8-seal-before-active` and `b8-seal-retry-lossless`; use the monthly red above. The 1024-event/378578-byte seed proves neither a cap nor sealing.
- Q3 removes personal missing-summary, orphan, tag and filename checks. The four-personal-findings oracle in case 2 must change; retain the real broken-link control and add Bower-owned controls only after allocation.
- Q5 rejects a new receipt type. Adapt `b8-receipt-all-target-binding` into `b8-all-targets-before-done` using existing per-artifact outcomes.
- Q6 replaces span-only health editing and collision failure with whole Bower-note rewriting, stored-id lookup and next-free-name creation. No new health-rewrite grammar is required.
- Q7–Q8 settle changed-only writes, complete-only clean copy and no new UI. B8 follows B3b. B9's separate marker contract stays outside this packet.

## Open for the lead

- Map requested `b8-log` to the prep's B8a/B8b/B8c rows. Confirm this cumulative ledger or split dispatches; no new split or handoff status is asserted here. The explicit session assignment above overrides TL-P4-57's usual Astra mapping for escalated reds/implementations.
- Return shared files after B5b, B5c, B4a and maintain/driver owners finish. Neither claude.ts nor scripted.ts is allocated here. Any required change to them needs exact ownership.
- Allocate the replacement monthly fixture path for case 3; the ledger currently owns only `folder/.bower/log.md`. Rule legacy single-log migration and missing/damaged stored health-id recovery; do not invent either policy.
- Allocate Bower-owned case-2 controls and any extra schema/tag/stale/duplicate/year/Undo fixture paths. Confirm the inherited 1 MiB/full-note proposal and exact call goldens before pinning them. Rule a non-detail prefix that alone exceeds 4,096 bytes; never cut note/action/date to guess a solution.
- Confirm C17 admission/verdict and named-call driver handoffs. The prep's 38 passing tests did not prove B8 outcomes; its covers:model labels are pending evidence.
