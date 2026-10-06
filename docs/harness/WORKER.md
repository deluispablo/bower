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
- **Reviewers.** Read only the diff range and the packet. Judge against the acceptance contract: only Critical and Important findings against it block, each with a reproduction. List Minor findings in one line each; they never block.
- **Fix rounds** start in a fresh session with the packet, the finding and the diff range; nobody resumes a finished worker.
- **Deliver, under 15 lines:** commit SHAs, the files changed, red→green evidence, gate results, sources cited, anything left out.
