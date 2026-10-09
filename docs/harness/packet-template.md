# Packet template (coordinator)

One page. Workers read `WORKER.md` and the packet only.

- **Entry** and its verify (exact test names), the ruling(s) by file or DECISIONS line, the worktree and branch.
- **Starting model** and a one-line reason. Entries that Bin, merge or move start on `bower-escalated` (TL-P4-13).
- **Live evidence** with its numbers and shape; the red must reproduce it (TL-P4-13).
- **Contract:** the observable behaviour, files in scope, compatibility needs.
- **Checklist (TL-P4-13, from WORKER.md):** every Bin, move or write passes what it read (bytes, modifiedTime or md5), tested by changing the file between read and act; match by id, never by name or substring; every new sentence in the app is backed by a test of what it promises; the red reproduces the live evidence; the card names the exact verify tests. Mark `ui: true` when the entry changes what the person sees or does: its touched screens' e2e then include an axe scan with WCAG 2.2 tags and `target-size` enabled (TL-P4-20), and it closes only after the designer's `verified` (TL-P4-18 addendum 3). Before dispatch, sweep DECISIONS for the entry id and its defects, and carry every ruling into the packet, each with its own red (TL-P4-19 addendum 7). A promised behaviour is verified through the real entry point that runs it in production: the Worker route, the runner's `main` or the screen, not only the helper (TL-P4-17).
- **Research first:** cite the standard solution.
- **Fixtures:** a change to corpus, demo or fake fixtures runs the full `pnpm e2e:fake` before delivery.
- **Reviewers:** read-only, unit and contract tests only; never start a server or run e2e; never `git checkout` in the main repo (use `git show`, `git diff` or a scratch worktree). The guard hook blocks checkout-class commands from subagents but not a subshell, `pushd` or `GIT_DIR`: those stay forbidden by this rule (TL-P4-17 addendum 5).
- **Fix rounds:** a fresh session with the packet, the finding and the diff range; never resume a finished worker.
- **Commits:** the red (tests only), then the fix, then the notes file in its own commit, so `done.sh` can revert the fix alone.
- **Reply:** the WORKER.md card, lines under 120 characters; details in a notes file.
