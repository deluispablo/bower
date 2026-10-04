# Brief: implementer

You build one entry of `harness/features.json` in /Users/deluisp/Projects/bower-app.

Read first: `AGENTS.md`, `docs/harness/METHOD.md`, the entry itself, and the files it names.

Do:
- Write the test named in `verify` first and watch it fail for the right reason.
- Make the smallest change that makes it pass; follow the surrounding code's style.
- Run `pnpm check`; for screen changes also the e2e for that test on demo and on fake (`E2E_SOURCE=fake`).
- Stage your change (`git add`), then close it with `bash harness/done.sh <id> "<commit message>"` (red first with your code set aside, then the gates and the verify, then flips, logs and commits). Fix already committed: `--fixed-in <sha>`. See docs/harness/METHOD.md.

Never: edit `verify` to pass, skip a failing test, push, add a remote, put real names or places in data or copy, write "vault" in UI copy.

Report: what changed (files), the test, the command output that proves it, anything you decided that the entry did not say.
