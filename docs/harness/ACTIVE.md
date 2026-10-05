# Active coordination batch

Only the named coordinator writes this file. Read this integration copy before committing or returning work; see `COORDINATION.md`.

## Batch

- State: closing phase 2; one implementer in an isolated worktree; integration and browser gates serialized.
- Coordinator/session: Codex `/root`, continuing the owner's request to finish P2, test the local app fully and audit it before merging to main.
- Integration checkout: `/Users/deluisp/Projects/bower-app`.
- Integration branch: `codex/close-phase-2`; batch base: `5d26800`; methodology update: `1a79dfd`.
- Existing dirty work: none; separate-client handoff closed at `d423225`.
- Browser reservation: integration checkout only; dev 5190, test server 5191, production preview 5192. Servers were started by this coordinator. Browser gates and source restores are serialized; final evaluation will reserve an immutable SHA.

## Assignments

| Entry or scope | Tool/session | Role | Checkout / branch | Base / target SHA | Reserved files / contracts | State | Candidate / closure SHA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| journal-separate-clients | Codex `/root/journal_fixes` → `/root` | Sole implementer; handoff to coordinator | integration checkout | `37b6abb`; target work on `1a79dfd` | worker-contract.md; fake-runner.ts; drive-vault.test.ts; drive-vault.ts; journal.ts; vault-index.ts | closed; worker read-only | `d423225` |
| worker-response-shapes | Codex `/root/audit_p2` | Implementer | `/Users/deluisp/.codex/worktrees/qa11-worker-search/bower-app`; `codex/qa11-worker-search` | base `d423225` | worker-api.ts; worker-http.ts; worker-http.test.ts | assigned; candidate only | pending |
| home-person | Codex `/root` | Coordinator / sole integration writer | integration checkout | base `d423225` | Home.tsx; Home.test.tsx; shared records | assigned; browser gates reserved here | pending |
| search-root-scope | Codex `/root/audit_p2` | Prepared; not yet assigned | same isolated worktree | after Worker integration | drive-http.ts; drive-http.test.ts | waiting for assignment | none |
| Final review and evaluation | fresh sessions, pending | Reviewer / evaluator | integration checkout | final immutable SHA pending | read-only; no source/build changes during evaluation | unassigned | none |

## Required skills and capabilities

For each assignment, record `bower-session` plus its role skill, the actual tools available, required missing capabilities and gate evidence. Use `STARTUP.md` and `SKILLS.md`; optional skills do not imply installed tools. Documentation maintenance by Codex is limited to the shared startup/skills documents and definitions; it assigns no implementation entry and preserves existing dirty code.

## Evidence and next actions

- `journal-separate-clients`: failed assertion against the old behavior in `/private/tmp/bower-journal-clients-red.log`; confirmed named verify green in `-green.log`; related five unit files: 92 passed in `-unit.log`; full check: 373 tests plus build and sensors in `-check.log`. Earlier dependency failures were replaced by actual test executions after installation recovery.
- Coordinator closed the six handed-off files through `done.sh` at `d423225`, with genuine red/check/verify proof: 191/201 entries pass. The implementer now has an isolated checkout and may run unit gates only; all browsers remain reserved for integration.
- Register the next assignment before implementation. Only the coordinator changes feature status, proofs, progress and phase state.
- Reviewer follow-up: late acknowledgment still trusts an immutable matching journal filename; evaluate the effect of a manually corrupted same-id Drive copy beside a valid local record.
- Owner ruling remains pending for offline reading, uploads retained across reload and real Drive smoke testing in P3. P2 closure and merge are pending the remaining fixes, fresh review/evaluation, final gates and owner agreement.
