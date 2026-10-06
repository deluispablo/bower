# Replacement coordinator inventory

Snapshot: 2026-10-06, integration c41e600 before the final handoff documentation commit. All 32 branch refs and nine worktrees independently rechecked by outgoing root. The final integration SHA is the handoff delivery commit in git log. See evidence/2026-10-06-replacement-inventory.json for machine-readable observation; its only dirty paths are root-owned handoff archives created during this delivery, committed before release.

## Resume

Resume codex/close-phase-2 in /Users/deluisp/Projects/bower-app after the explicit outgoing release recorded in 2026-10-06-orchestrator-replacement.md; the successor must register its own assignment before writing. Main/backup baseline: 10ca886626206e0d4d880d6679dd4f57adcafcee. P2 is open; P3 requires full P2 acceptance; P4 is not authorized. Candidate/integration work is local, not backed up to GitHub. Continuity heartbeat is paused for replacement.

## Registered open work

- **partial-pile-readiness**: A tidy-up must keep every missing member of an incomplete pile visible and retryable, including from another client.
  Verify: `pnpm vitest run src/data/fake/fake-runner.test.ts -t "an incomplete pile retains every member across tidy-up and retry"`.
- **protected-current-prose**: Current state remains protected when it contains paragraphs or tasks, without exposing them as personal editable text.
  Verify: `pnpm vitest run src/data/vault/note-format.test.ts -t "protected sections retain prose and tasks outside the personal body"`.
- **run-report-save-barrier**: A tidy-up must not claim completion until its actual effects and report are durably recoverable.
  Verify: `pnpm vitest run src/data/fake/fake-worker.test.ts -t "report save failure cannot publish done or repeat effects"`.
- **pile-declaration-authority**: Immutable pile declarations refuse damaged shape, foreign scope and context digests without inventing ready content.
  Verify: `pnpm vitest run src/data/contracts/pile-declaration.test.ts -t "pile declarations preserve immutable authority"`.

## Remaining work beyond registered entries

- R1: demonstrated external-content lost update; ETag probes ended inconclusive. Save a copy is pending product choice, not adopted. No fourth probe or CAS claim.
- R2: real principal/folder isolation and external-input evidence incomplete.
- R3: real admission/dispatch/executor evidence incomplete; preserve minimal Worker.
- R4: reserved-ID specification independently reviewed, zero Critical/Important/Minor documentation findings (report SHA27720282). No runtime instrument or provider execution; validated principal/preflight and full resumable/reload recovery remain.
- O3: remaining capture/operation/checkpoint/report/reference contracts, guards and compatibility.
- O4: durable admitted run -> effects/report -> reopen/retry with another client and unknown outcomes.
- O5: fake persisted semantic effects C04-C11 and C13 undo.
- O6: preparation, context/fallback and approved D01 offline reading/D02 retention-reselection behavior.
- O7: complete capability/efficiency corpus and measurements.
- O8: frozen full gates, demo/fake/PWA, independent review and phone/desktop evaluation, capability mapping. Counts are not completion percentages.

## All local branches

Older p2/qa11 and evidence branches preserve candidates/provenance. Cherry-pick/squash means ancestry is not proof of missing implementation. Do not merge or delete them blindly.

| Branch | SHA | Role |
| --- | --- | --- |
| `codex/backend-proposal-v2` | `da9e4a15ee41094d402e672e3590fd41cf03038f` | Superseded proposal; historical |
| `codex/close-phase-2` | `c41e600919be1f4eb7e1cc6d8e54d5bc3a754ef4` | Integration: successor resume point after release |
| `codex/design-exploration` | `ede62b9fa408a95f48f7ef334d2e8c88233307a4` | Independent design proposal; not adopted |
| `codex/evidence-add-draft-e23245a` | `e23245a7882744a40173bf8e27602b252a285dfb` | Frozen evidence reference |
| `codex/evidence-creation-5c08e24` | `5c08e2427e702bfc8216c8fa628f541ad30c17a2` | Frozen evidence reference |
| `codex/evidence-foreground-50d918f` | `50d918f5bb944be91854a3069e1341cb6dd047c2` | Frozen evidence reference |
| `codex/evidence-run-order-803b62d` | `803b62ddfc09ceedc24f73c26a64972aba1fe60b` | Frozen evidence reference |
| `codex/evidence-run-order-fb80bd1` | `fb80bd1df4c74a7e0ecda19cf37dab5494cd666d` | Frozen evidence reference |
| `codex/evidence-session-isolation-8bd67cd` | `8bd67cdd77e3b3f32459b3708eccdf7d8bb80c8b` | Frozen evidence reference |
| `codex/evidence-timeline-621ac55` | `621ac558ba1781a2ceac152636a068c667f1a7d3` | Frozen evidence reference |
| `codex/p2-add-draft-no-loss` | `666074fb23ef9b858e02bf0bb15c7cbe621c54a0` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-create-names` | `24fc0f0eef764b9b0c7aa01c20b83ed372fa80c0` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-declaration-guards` | `4052532b482e69f5945e19fc3aaba7f4fbbfff3d` | Current candidate: review/integration/proof pending |
| `codex/p2-draft-memory-cleanup` | `f219a40ca073a69a2231aded3a926d83dcf163e8` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-foreground-refresh` | `1d6fe32e6bd9dd972f54a0806482d8ec6b76cbf6` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-journal-ack` | `244be6838ba67bf93aca58e712b1c8198cdaf4a0` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-ownership-parser` | `e3ee111213079708794044cfe6c90d4a1b1bae7d` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-pile-context` | `dc45b035b41b1b63ef05cddaac37996c2d2fb62d` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-pile-seen` | `929d95b686bdc8034d96f055e0da359c95fcc489` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-raw-read` | `32b2a19cffed20d4b09d04c36ba7c40722e5b88a` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-record-json` | `140d8aec8e238e1f36c193666a836b74206e9e68` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-request-preflight` | `00a17ff374893dc79dd156789ab8ba677e4115f5` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-run-order` | `71ef6be0dc636ae032c9835a943308614241d260` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-run-v1-recovery` | `17bbee4ab0d4717f708e8f681de7ba22571176a6` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-session-isolation` | `2244218c60f25ffa5f8991a905f52eba9f460199` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-task-bytes` | `71e97077a353aed92a2e0cafe017aad00dfadc25` | Retained implementation/review candidate; consult integration proofs |
| `codex/p2-timeline-names` | `ec9b0e7dbde2af0739ea3bc4750d25c54c33c2e8` | Retained implementation/review candidate; consult integration proofs |
| `codex/phase-plan-and-harness` | `10ca886626206e0d4d880d6679dd4f57adcafcee` | Technical-lead planning; separate ownership |
| `codex/qa11-search-first-review` | `b1682a786972ff36072e7b5d1fa1d4143da2ce76` | Retained implementation/review candidate; consult integration proofs |
| `codex/qa11-search-root` | `a67c632b2b003ca9f1ffe1c16866d2d2fbd6ee5d` | Retained implementation/review candidate; consult integration proofs |
| `codex/qa11-worker-search` | `3cba3baa6d1e295ba3a9f6889d4e535bc00e2fff` | Retained implementation/review candidate; consult integration proofs |
| `main` | `10ca886626206e0d4d880d6679dd4f57adcafcee` | Validated planning/main backup |

## All worktrees

| Checkout | Branch | HEAD | Observed status |
| --- | --- | --- | --- |
| `/Users/deluisp/Projects/bower-app` | `codex/close-phase-2` | `c41e600919be1f4eb7e1cc6d8e54d5bc3a754ef4` | Clean |
| `/private/tmp/bower-p2-declaration-guards` | `codex/p2-declaration-guards` | `4052532b482e69f5945e19fc3aaba7f4fbbfff3d` | Clean |
| `/private/tmp/bower-p2-journal-ack` | `codex/p2-draft-memory-cleanup` | `f219a40ca073a69a2231aded3a926d83dcf163e8` | Clean |
| `/private/tmp/bower-p2-ownership-parser` | `codex/p2-ownership-parser` | `e3ee111213079708794044cfe6c90d4a1b1bae7d` | Clean |
| `/private/tmp/bower-p2-raw-read` | `codex/p2-raw-read` | `32b2a19cffed20d4b09d04c36ba7c40722e5b88a` | Clean |
| `/private/tmp/bower-p2-record-json` | `codex/p2-record-json` | `140d8aec8e238e1f36c193666a836b74206e9e68` | Clean |
| `/Users/deluisp/.codex/worktrees/backend-proposal-v2/bower-app` | `codex/backend-proposal-v2` | `da9e4a15ee41094d402e672e3590fd41cf03038f` | Clean |
| `/Users/deluisp/.codex/worktrees/design-exploration/bower-app` | `codex/design-exploration` | `ede62b9fa408a95f48f7ef334d2e8c88233307a4` | Clean |
| `/Users/deluisp/.codex/worktrees/planning-main/bower-app` | `codex/phase-plan-and-harness` | `10ca886626206e0d4d880d6679dd4f57adcafcee` | Clean |

## Release completed by outgoing coordinator

Outgoing root and both current children have ceased writes; no owned process/server/provider/browser reservation remains. Integration/shared records, worker checkouts and main-backup responsibility are released. The technical-lead and design checkouts retain their separate ownership. See the unique handoff for exact artifacts, missing acceptance evidence and first successor action. Root committed its documentation/evidence, checked clean Git, and returned the final SHA to Planificador.

## Historical release checklist

Outgoing coordinator must record final integration SHA, candidate/review status, archived scratch evidence, agents stopped/read-only, processes/ports released or transferred, and any dirty files. Do not include credentials. New coordinator reads startup/current ACTIVE/HANDOFF then explicitly records ownership before writing. No worktree cleanup is authorized by this inventory.
