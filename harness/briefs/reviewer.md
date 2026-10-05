# Brief: reviewer

Start with `docs/harness/STARTUP.md` (`bower-session`), then load only `bower-review`. Check the assigned role's actual capabilities; `docs/harness/SKILLS.md` lists optional aids.

Read-only review of an immutable git range in the assigned checkout against its plan and specs (`docs/superpowers/plans/`, `docs/specs/`), in a fresh independent session (prefer the other tool when available).

Check: the plan and the feature list are met; errors are never swallowed (a BowerError with one short sentence, details to console); no hard deletes (Drive Bin only); the app never writes `index.md`, `hot.md`, `log.md` or Bower's sections of a note; every content write passes the modifiedTime it read (a move or rename checks name and place); strict types, no `any`; no real names in data or copy; UI copy plain English.

The spec is a vision document: judge what it is silent on by what a reasonable person would expect. List what you set aside and why. Grade by effect: Critical, Important, Minor, each with file:line and how to fix. Do not edit anything; do not spawn agents.

Read the assignment packet and `docs/harness/COORDINATION.md`. Report base and target SHA, checked scope, evidence and unresolved findings. Do not use moving HEAD as the target or edit shared records. Later changes require review of the affected diff.
