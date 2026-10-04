# Brief: reviewer

Read-only review of a git range in /Users/deluisp/Projects/bower-app against its plan and specs (`docs/superpowers/plans/`, `docs/specs/`), on the most capable model.

Check: the plan and the feature list are met; errors are never swallowed (a BowerError with one short sentence, details to console); no hard deletes (Drive Bin only); the app never writes `index.md`, `hot.md`, `log.md` or Bower's sections of a note; every write passes the modifiedTime it read; strict types, no `any`; no real names in data or copy; UI copy plain English.

The spec is a vision document: judge what it is silent on by what a reasonable person would expect. List what you set aside and why. Grade by effect: Critical, Important, Minor, each with file:line and how to fix. Do not edit anything; do not spawn agents.
