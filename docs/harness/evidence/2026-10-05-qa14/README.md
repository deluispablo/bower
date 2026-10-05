# Reused Sources account isolation observation

Plan `2026-10-05-contracts-2`; P2 / C01,C14. Coordinator observation, prompted by independent combined code review. Immutable targets: adoption `143ae2b12d5440330bee1a85bd16e90b8dccf746` and combined `e15d13ca4f6f0bd15d11277bae02c7db6d180990` (source `cb7306141f0dbc93e49df08bd4286eb520b88cd0`).

The script loads production TypeScript from Git objects and records hashes. It uses public FakeDrive and makeLiveSources methods, real separate synthetic roots and an existing-wire Worker stub supporting only the methods invoked. Cache account A's tree/note, sign out, sign in as B with a different folder, read the same note path and create a note. Current session user/root is B, but returned text is A and the new note and its saved journal file are under A. B gets no new note. Both targets exhibit the same result: this is a baseline defect, not a regression introduced by the seven foundation fixes.

Both invocations exit 1 on the first actual content assertion. Creation placement and journal location are recorded actual observations; the script's later placement assertions are not reached. No real OAuth, browser account switch, remote provider, model, new schema, harness proof or full isolation certification. WorkerHttp's normal sign-in redirects/reloads; this reproduction establishes the reused production Sources boundary, which current lifecycle tests also use.

Run from this prepared repository: copy the retained script to private tmp, then `node <script> <full-SHA>`. The loader's repository path is explicit; adapt it only when reproducing in another prepared checkout. JSON snapshots use made-up names, emails, text and local identifiers only. Existing folder-keyed durable/volatile journal outboxes must survive sign-out; a fix must prevent them and deferred work reaching another scope, without claiming rollback of calls already dispatched.

The new named regression is planned and NOT RUN. Final combined fake/PWA/native gates were not started at e15 after the Important defect was reproduced. Full e15 check passed 481 tests/51 files; demo passed 198/56 intentional skips. Subsequent fixes require a fresh combined freeze and independent review/evaluation.

## Late observed effect and wrong-owner outbox

A separate public-call observation at exact e15 applies an A note creation, captures and holds its successful metadata reply, switches the same Sources to B, fails the next actual journal send through public FakeDrive.failNext(offline), then releases the reply. The operation returns success; A outbox is empty, B outbox contains the actual A file ID, and no A journal record was saved. All three collected assertions genuinely fail: stale success refusal, original-owner retention and B isolation. Separate script/results/log are retained here. No private state, UI/OAuth/provider/new wire or harness proof.

This reproduces the already-assigned late-effect bookkeeping hazard rather than adding a new feature or changing scope. The repair must retain observed A bookkeeping under A even when its send fails, refuse stale success, and avoid rollback/cleanup with B credentials. Unknown/lost effects and general recovery remain separate.
