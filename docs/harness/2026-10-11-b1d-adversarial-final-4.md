# B1d adversarial pass 4 (Codex gpt-6-astra xhigh, read-only) after round 6

- **Important — Blocking: data safety — [runner/src/claude.ts:1582](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1582):** Request pins grant authority without selection. Admit “Update [[Remote search]],” but select only `Offer.txt → Resources/Careers`, with empty wants. Execution appends an offer line to Remote search anyway. Reproduced through `main`: two calls, done/code 0, unselected note changed.

- **Important — v1 limit — [runner/src/claude.ts:1387](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1387):** A matching personal note with `type: moc` and no `by: bower` produces `moc: undefined` in the shared snapshot. Both valid replies succeed, then manifest encoding fails. `main` ends failed/code 0 and leaves the offer unfiled. Changing only the type to `concept` completes.

- **Minor — v1 limit — [runner/src/model-input.ts:30](/private/tmp/bower-b1d-selection/runner/src/model-input.ts:30):** Cut contexts leave some MOC member ids unnormalized. With 90 members, pruning removes 17 referenced metadata rows. Identical successful runs with different physical ids produce fingerprints `178037787e26` and `111f446f0571`; those 17 ids remain literal.

No second planner, cache, ledger, writer or pending store found. Sweeps 3–6 show no unauthorized assertion weakening. Round 6’s shared-contract, read-ahead and Home edits stay within addendum 23’s scope.

verdict: BLOCK
