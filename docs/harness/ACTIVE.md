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
| worker-response-shapes | Codex `/root/audit_p2` | Implementer | `/Users/deluisp/.codex/worktrees/qa11-worker-search/bower-app`; `codex/qa11-worker-search` | base `d423225` | worker-api.ts; worker-http.ts; worker-http.test.ts | closed; assignment released | candidate `3cba3ba`; integration `0e978af`; closure `55810f9` |
| home-person | Codex `/root` | Coordinator / sole integration writer | integration checkout | base `d423225` | Home.tsx; Home.test.tsx; shared records | closed | `cc131fe` |
| search-root-scope | Codex `/root/audit_p2` | Implementer | same isolated checkout; `codex/qa11-search-root` | base `55810f9` | drive-http.ts; drive-http.test.ts | closed; assignment released | revised `a67c632`; integration `759ed24`; closure `0da4746` |
| task-keeps-seen | Codex `/root` | Coordinator / sole integration writer | integration checkout | base `55810f9` | drive-vault.test.ts; temporary task-only red in drive-vault.ts; shared records | closed; production restored exactly after manual assertion red | `4460586` |
| upload-retry-screen | Codex `/root` | Coordinator / sole integration writer | integration checkout | base `4460586` | PileScreen.test.tsx; temporary retry-callback red in PileScreen.tsx; shared records | closed; production restored after assertion red | `866a63c` |
| Final review and evaluation | fresh sessions, pending | Reviewer / evaluator | integration checkout | final immutable SHA pending | read-only; no source/build changes during evaluation | unassigned | none |

## Required skills and capabilities

For each assignment, record `bower-session` plus its role skill, the actual tools available, required missing capabilities and gate evidence. Use `STARTUP.md` and `SKILLS.md`; optional skills do not imply installed tools. Documentation maintenance by Codex is limited to the shared startup/skills documents and definitions; it assigns no implementation entry and preserves existing dirty code.

## Evidence and next actions

- `journal-separate-clients`: failed assertion against the old behavior in `/private/tmp/bower-journal-clients-red.log`; confirmed named verify green in `-green.log`; related five unit files: 92 passed in `-unit.log`; full check: 373 tests plus build and sensors in `-check.log`. Earlier dependency failures were replaced by actual test executions after installation recovery.
- Coordinator closed the six handed-off files through `done.sh` at `d423225`, with genuine red/check/verify proof: 191/201 entries pass. The implementer now has an isolated checkout and may run unit gates only; all browsers remain reserved for integration.
- Register the next assignment before implementation. Only the coordinator changes feature status, proofs, progress and phase state.
- Reviewer follow-up: late acknowledgment still trusts an immutable matching journal filename; evaluate the effect of a manually corrupted same-id Drive copy beside a valid local record.
- Owner ruling remains pending for offline reading, uploads retained across reload and real Drive smoke testing in P3. P2 closure and merge are pending the remaining fixes, fresh review/evaluation, final gates and owner agreement.

- Worker candidate `d423225..3cba3ba` reviewed independently by `/root/review_worker_candidate`: no Critical, Important or Minor findings; no tests run by the reviewer, supplied red/green/check evidence inspected. Cherry-picked without conflict as `0e978af`; coordinator closure pending.
- Home identity closed at `cc131fe`; named assertion red/green, check, full demo/fake each 187 passed / 53 intentional skips. Visual check at 1440×900 and 390×844 on fake: correct account initial, intact layout, no console warnings/errors. First assignment delivery took about 10 minutes; most time was the two full browser suites.

- Worker proof closure `55810f9`: red/check/verify green; 193/201 entries pass. Next: isolated search candidate; coordinator coverage for own-task seen state. Production/source restores stay confined to their respective checkouts.

- Coordinator startup refresh after methodology/skills update `4c189ba`: `bower-session` and `bower-implement` loaded directly from canonical repository files (not present in this host catalog); Git/shell/Node/pnpm and native CUA browser available. Integration branch unchanged, owned tree clean. Initial harness/init and later checks already passed; no duplicate installation over another session. Next assignment: pile screen retry coverage.
- Task-seen coverage closed `4460586`: temporarily removed only task keepSeen, observed assertion failure, restored exact production and closed the test-only entry under its precommitted note. Evidence `/private/tmp/bower-task-keeps-seen-{red,green,close}.log`; 194/201 entries pass.
- Search candidate `55810f9..b1682a` returned by isolated implementer; fresh review `/root/review_search_candidate` pending. No browser or shared-record writes from the worker.

- Fresh search review of `55810f9..b1682a`: Important stale-parent regression after creating a folder and moving an existing note into it. No integration; same assignment returned for a mutation/cache regression and corrected single candidate. Original reviewed SHA is retained for comparison.

- Revised search `55810f9..a67c632` reviewed by fresh `/root/review_search_revised`: no findings. Mutation invalidation covers both caches; original and move-regression assertion reds inspected. Integration `759ed24`, proof closure `0da4746`; 196/201 pass. Pile retry coverage closed `866a63c` with real callback-disabled assertion red.
- Coordinator assignment: `runner-json-shapes`, integration only, layout.ts; drive-vault.ts/test; runner-errors.test.tsx; LoadError.tsx; Home/BowerScreen/BowerPanel/StatusBar/RunChip/TidySheet and their layout styles. New helper stub first; strict full-shape guards, visible retries, keyboard recovery; all screen gates and manual sizes required. No parallel writer or browser evaluator.

- Runner read errors closed `1939fc1`: two assertion reds, strict guards and retries on 14 component read cases; check 383 tests, full demo/fake each 187 passed / 53 intended skips. Manual fake desktop 1280×720, phone 390×844, desktop dimensions/footer also checked at 1440×900: Home, Tell Bower, tidy confirmation, no console warning/error; runner failure rendering pinned by component coverage. Evidence `/private/tmp/bower-runner-{data-red,screen-red,green,check,demo,fake,close}.log`; 197/201 pass.
- Coordinator assignment: `open-in-drive`; integration only; sources.ts, DriveVault and tests, live/index.ts, choose.ts, demo/world.ts, loading-sources.ts, report.ts and tests, Settings.tsx, file-actions.ts, e2e/qa11.spec.ts. Public source capability serialized; trusted Drive URLs by ID, synchronous popup reservation and readable fake-source explanation. No other writer or evaluator.
