---
name: bower-implement
description: Implement an assigned bower-app harness entry with test-first evidence; distinguish a parallel worker candidate from coordinator closure.
---

# Implement an assigned entry

Complete `bower-session` orientation (or `docs/harness/STARTUP.md`) first. Read `harness/briefs/implementer.md`, the assigned feature's what/steps/unchanged verify, and only its relevant spec/plan sections. Follow `docs/harness/COORDINATION.md` for ownership and integration.

Before coding, identify the intended failed assertion, allowed files and contract dependencies. If a new module would cause a load error, arrange a stub with the coordinator before proving the red. Capture the failing assertion, make the smallest fix and run the required verification in your checkout. Browser checks need the recorded reservation and the right server.

A parallel worker commits only the assigned code/tests and returns the candidate SHA plus red/green evidence; it never edits shared records or calls done.sh. A single-writer coordinator uses normal done.sh closure; an integration coordinator closes a cherry-picked candidate with its integration SHA via --fixed-in. Never report passes from worker checks alone or bypass a failed assertion proof with --known-green.

When a check fails or is unavailable, return the command, cause, remaining work and next action. Keep unrelated changes out of staging and commits. Use the result packet in COORDINATION.md.

Read the adopted plan revision and current phase acceptance through STARTUP; include them with capability IDs in the assignment/result. Use `docs/P2_ACCEPTANCE.md` for P2 obligations; a green historical entry count does not prove complete capability coverage.
