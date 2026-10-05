# Brief: implementer

Start with `docs/harness/STARTUP.md` (`bower-session`), then load only `bower-implement`. Check the assigned role's actual capabilities; `docs/harness/SKILLS.md` lists optional aids.

You build one entry of `harness/features.json` in the checkout explicitly assigned to you.

Read first: `AGENTS.md`, `docs/harness/METHOD.md`, `docs/harness/COORDINATION.md`, the current integration copy of `docs/harness/ACTIVE.md`, your assignment packet, the entry itself, and the files it names.

Do:
- Write the test named in `verify` first and watch it fail for the right reason.
- Make the smallest change that makes it pass; follow the surrounding code's style.
- Run `pnpm check`; for screen changes also the e2e for that test on demo and on fake (`E2E_SOURCE=fake`).
- Single-writer coordinator mode only: stage your change (`git add`), then close it with `bash harness/done.sh <id> "<commit message>"` (red first with your code set aside, then the gates and the verify, then flips, logs and commits). Fix already committed: `--fixed-in <sha>`. See docs/harness/METHOD.md.

- Parallel worker mode: commit one candidate for the assigned entry, without shared-record changes or `done.sh`; return its SHA, base, paths and red/green evidence. The coordinator reviews, cherry-picks and closes using the integration SHA with `--fixed-in`.
- Check reservations before editing outside your assigned paths. Browser gates are serialized; confirm the assigned checkout owns the server. Report missing checks as missing.

Never: edit `verify` to pass, skip a failing test, push, add a remote, put real names or places in data or copy, write "vault" in UI copy.

Report: what changed (files), the test, the command output that proves it, anything you decided that the entry did not say.

Read the adopted planning revision, PRODUCT, WORK_PLAN and current phase acceptance before acting. Record plan revision and capability IDs with the code SHA. Implement only the assigned phase/entry; missing contract or capability scope returns to the coordinator/technical lead, not an improvised backend expansion.

Boundary assignments follow `docs/ARCHITECTURE.md`: preserve consumer compatibility, test versioned fixtures and recovery, and keep shared schema changes serialized. Read only the affected contract sections. The coordinator uses `docs/harness/ORCHESTRATOR_START.md` for dependency order; bounded P2 probes do not authorize P3 implementation.
