---
name: bower-review
description: Review an immutable bower-app candidate independently against its harness entry, specs and proof requirements; report findings without changing files.
---

# Review a Bower candidate

Complete startup orientation without installing dependencies or running mutating gates. Read `harness/briefs/reviewer.md` and obtain explicit base/target SHAs and scope. If the target is moving HEAD or contains uncommitted work, report that it cannot certify an immutable candidate and request a pinned target while continuing useful read-only inspection.

Compare the assigned diff with its entry's what/steps/verify and relevant contracts. Trace whether the named test would fail for the intended behavior without the fix; inspect error paths and interactions with adjacent code, rather than treating green output as proof of correctness. Verify file ownership and any shared-record or contract changes.

Return Critical/Important/Minor findings with file:line, triggering steps, effect, evidence and a suggested fix; name the exact reviewed SHAs, coverage and things set aside. Distinguish reproduced failures from reasoned concerns. Do not invent test runs, mutate records, spawn agents or approve your own implementation. Later behavior changes need renewed review. Follow COORDINATION.md's return packet.

Read the adopted plan revision and current phase acceptance through STARTUP; include them with capability IDs in the assignment/result. Use `docs/P2_ACCEPTANCE.md` for P2 obligations; a green historical entry count does not prove complete capability coverage.
