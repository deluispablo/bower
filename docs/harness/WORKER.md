# Worker card

Read this and your packet. Do not read other planning or harness documents unless the packet names them.

- **Scope.** One entry, in your own checkout. Touch only the files the packet owns. Never push. Never edit `features.json`, `proof.log`, `progress.md`, `HANDOFF.md` or `ACTIVE.md`.
- **Research first.** Find the standard solution (official docs, a well-known library, a successful app) and cite it in your delivery. For current library docs you may use context7. Its queries leave the machine, so a query names only the library and the topic: never code, file contents, paths or project names (TL-P4-20 addendum 2). Prefer reusing the original app (`/Users/deluisp/Projects/bower`) where the packet says so. Use the simplest approach that is honest and loses no data.
- **Acceptance contract.** Your packet lists the named tests, the observable behaviours and the files in scope. Build to it; anything outside it goes in "left out", not into the change ([TL-P2-44](2026-10-06-tl-p2-44-enforced-token-method.md)).
- **Test first.** Write or adjust the test the packet names, and see it fail on an assertion. Then make the smallest fix that turns it green.
- **Gates.** Run the packet's verify, `pnpm check`, and the e2e of the screens you touched. Run `pnpm check` and any e2e through the one heavy-run lock, `bash harness/with-lock.sh <command>`, shared with done.sh and integrate.sh (TL-P4-22 addendum 11). Always redirect output to a file and read only the failures or the tail: `pnpm check > /tmp/<entry>-check.log 2>&1; tail -20 /tmp/<entry>-check.log`. `pnpm check` itself records the green mark for your worktree and HEAD on success; one command, no wrapper. In Claude a hook makes a plain gate command quiet. Do not re-read a file already in your context or re-run a gate that has not changed. Tests never write into the repository: debug and scratch files go to `os.tmpdir()`, never tmp-logs/ or the worktree (TL-P4-54). A sudden mass of unrelated matcher or import failures after a revert means mislinked node_modules: run `pnpm install --offline --frozen-lockfile --force` and re-run the gate before treating it as a regression (TL-P4-54).
- **Rules that never bend.**
  - No personal data: use `Alex`, `you@example.com`, `FOLDER_ID`.
  - English. UI copy in sentence case and plain words, never "vault".
  - TypeScript strict, no `any`.
  - `BowerError` with one sentence for the person.
  - Drive Bin only, never hard-delete.
  - A content write passes the modifiedTime it read.
- **Checklist for every change ([TL-P4-13](2026-10-08-tl-p4-13-c05-findings.md)):**
  - every Bin, move or write passes what it read (bytes, modifiedTime or md5), with a test that changes the file between the read and the act;
  - match by id, never by name or substring;
  - every new sentence in the app has a test of the behaviour it promises; no copy promises what is not built;
  - the red reproduces the live evidence, with its numbers and shape;
  - the card's `red:` and `green:` lines name the exact verify tests;
  - a promised behaviour is verified through the real entry point that runs it in production: the Worker route, the runner's `main` or the screen, not only the helper (TL-P4-17);
  - unit tests never wait on real time. Use fake timers or the injected clock and options; a real timer of 100 ms or more fails the run (TL-P4-17, `c3-timer-gate`);
  - a gate's test (knip, jscpd, dependency-cruiser, an ESLint rule) runs on a fixture, never over the repository inside vitest. The script in `pnpm check` is the gate's one home, and a rule about code syntax lives in ESLint (TL-P4-17);
  - a stored format is strict on write and lenient on read. Everything already stored must still parse, with a fixture test (TL-P4-14 addendum 22);
  - the live path never reads demo, corpus or test fixtures (TL-P4-14 addendum 23);
  - your notes file goes in its own commit, never in a fix commit;
  - never weaken a test to get to green. Every existing test you modify or delete gets a line in your notes, `tests changed: <file>: <why>`, which the reviewer checks. Never add `.only` or `.skip` (TL-P4-20);
  - use the mechanism the packet names from the ARCHITECTURE mechanism map. Never write a second way of doing what it does; if it cannot do what you need, stop and report `blocked`. For a defect, the packet cites its diagnosis note: implement the ruling, nothing else ([DEFECTS.md](DEFECTS.md)).
- **List every contradiction before stopping (TL-P4-51).** If tests contradict the packet or a ruling, run the whole targeted suite first and list every contradicting test with file:line in the notes, then stop; never stop at the first one.
- **A red's numbers are contract (TL-P4-22 addendum 22).** Never loosen a bound, tolerance or threshold in your own red or in a reference fixture, even with a `tests changed:` line: stop and ask through the card. Only the lead changes a contract number.
- **Hook tests (TL-P4-22).** A hook test's input is copied from a recorded live hook input, never written from the docs alone; a change to a hook or agent frontmatter goes live only after the affected sessions restart.
- **Reviewers.** Read only the diff range and the packet. Read other revisions with `git show` or `git diff`, or in a scratch worktree. Never run checkout, switch, reset, rebase, merge or stash in the main checkout: a hook blocks it for subagents, and the forms it misses (subshell, `pushd`, `GIT_DIR`) are still forbidden. Never start a server or run e2e; run the unit and contract tests only. Always answer one fixed question: does this change add a second way to do something that already exists (ARCHITECTURE mechanism map)? A yes is an Important finding. Judge against the acceptance contract: only Critical and Important findings against it block, each with a reproduction. List Minor findings in one line each; they never block.
- **Fix rounds** start in a fresh session with the packet, the finding and the diff range; nobody resumes a finished worker.
- **Output ([TL-P3-17](2026-10-07-tl-p3-17-output-discipline.md)).** Only the coordinator reads you, and only your final reply. Write no text between tool calls: think, act, and keep notes in files. The stop gate judges the tree named by the strict `worktree:` line (absolute path) of the card, and refuses a reply without it. Your final reply is one card of `key: value` lines and nothing else, with no greeting, recap or narrative. Point to files and SHAs instead of pasting them. Keep each card line under 120 characters: list SHAs, test names and paths, never explanations. Never leave out a fact the coordinator needs to decide; a missing fact costs more than a line.
- **Delivery card (implementer), at most 9 lines:**
  ```
  status: done | blocked | stalled
  commits: <sha>[, <sha>]
  red: <test name>: <the assertion that failed>
  green: verify pass; pnpm check pass|fail; e2e <names> pass|fail; logs <paths>
  worktree: <absolute path of your worktree>
  files: <paths>
  sources: <urls>
  left out: <one line, or none>
  tokens: <total if known>
  ```
- **Review card, at most 12 lines:** `verdict: PASS | BLOCK`, `range: <sha>..<sha>`, then one line per Critical or Important finding (`<severity> <file:line>: <failing scenario>; missing test: <name>`), then one line per Minor finding (at most five), then `tokens:`.
- **Evaluation card, at most 12 lines:** `verdict`, `bundle`, `cells`, one line per finding (`<severity> <cell>: <what>; steps in <notes file>#<n>`), then `tokens:`.
