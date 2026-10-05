---
name: bower-evaluate
description: Evaluate a frozen bower-app build with demo and fake flows on phone and desktop using an assigned browser reservation; report reproducible user-facing findings.
---

# Evaluate the frozen app

Complete startup orientation; read `harness/briefs/evaluator.md` and the browser rules in `docs/harness/COORDINATION.md`. Confirm target SHA, checkout, built-server origin, source/scenario, viewport and dedicated browser reservation. The coordinator prepares and freezes the build; you do not rebuild, install dependencies or edit files.

Use the browser automation available in this session. Follow its actual documentation and refresh UI state after navigation before interacting. The optional Playwright skill can help terminal exploration if installed, but does not replace Bower's pnpm e2e and pnpm e2e:fake test gates. Never create a new automation stack merely because a skill mentions one.

Replay assigned regression steps, then explore the specified user and keyboard flows on demo/fake and phone/desktop. Check visible outcomes and console errors. Use synthetic fixtures only. Stop certifying the run if the checkout/build changes; name the invalidated target and steps to repeat.

Return exact SHA, flows covered and findings with source, scenario, size, steps, actual/expected result and console evidence. If interactive automation is unavailable, report evaluation as not run and suggest the remaining check; code reading is not user evaluation. Do not edit the backlog or run Git mutations.

Read the adopted plan revision and current phase acceptance through STARTUP; include them with capability IDs in the assignment/result. Use `docs/P2_ACCEPTANCE.md` for P2 obligations; a green historical entry count does not prove complete capability coverage.
