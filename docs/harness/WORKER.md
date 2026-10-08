# Worker card

Read this and your packet. Do not read other planning or harness documents unless the packet names them.

- **Scope.** One entry, in your own checkout. Touch only the files the packet owns. Never push. Never edit `features.json`, `proof.log`, `progress.md`, `HANDOFF.md` or `ACTIVE.md`.
- **Research first.** Find the standard solution (official docs, a well-known library, a successful app) and cite it in your delivery. Prefer reusing the original app (`/Users/deluisp/Projects/bower`) where the packet says so. Use the simplest approach that is honest and loses no data.
- **Acceptance contract.** Your packet lists the named tests, the observable behaviours and the files in scope. Build to it; anything outside it goes in "left out", not into the change ([TL-P2-44](2026-10-06-tl-p2-44-enforced-token-method.md)).
- **Test first.** Write or adjust the test the packet names, and see it fail on an assertion. Then make the smallest fix that turns it green.
- **Gates.** Run the packet's verify, `pnpm check`, and the e2e of the screens you touched. Always redirect output to a file and read only the failures or the tail: `pnpm check > /tmp/<entry>-check.log 2>&1; tail -20 /tmp/<entry>-check.log`. In Claude a hook does this for a plain gate command. Do not re-read a file already in your context or re-run a gate that has not changed.
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
  - the card's `red:` and `green:` lines name the exact verify tests.
- **Reviewers.** Read only the diff range and the packet. Never start a server or run e2e; run the unit and contract tests only. Judge against the acceptance contract: only Critical and Important findings against it block, each with a reproduction. List Minor findings in one line each; they never block.
- **Fix rounds** start in a fresh session with the packet, the finding and the diff range; nobody resumes a finished worker.
- **Output ([TL-P3-17](2026-10-07-tl-p3-17-output-discipline.md)).** Only the coordinator reads you, and only your final reply. Write no text between tool calls: think, act, and keep notes in files. Your final reply is one card of `key: value` lines and nothing else, with no greeting, recap or narrative. Point to files and SHAs instead of pasting them. Keep each card line under 120 characters: list SHAs, test names and paths, never explanations. Never leave out a fact the coordinator needs to decide; a missing fact costs more than a line.
- **Delivery card (implementer), at most 8 lines:**
  ```
  status: done | blocked | stalled
  commits: <sha>[, <sha>]
  red: <test name>: <the assertion that failed>
  green: verify pass; pnpm check pass|fail; e2e <names> pass|fail; logs <paths>
  files: <paths>
  sources: <urls>
  left out: <one line, or none>
  tokens: <total if known>
  ```
- **Review card, at most 12 lines:** `verdict: PASS | BLOCK`, `range: <sha>..<sha>`, then one line per Critical or Important finding (`<severity> <file:line>: <failing scenario>; missing test: <name>`), then one line per Minor finding (at most five), then `tokens:`.
- **Evaluation card, at most 12 lines:** `verdict`, `bundle`, `cells`, one line per finding (`<severity> <cell>: <what>; steps in <notes file>#<n>`), then `tokens:`.
