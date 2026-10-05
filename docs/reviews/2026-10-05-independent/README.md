# Independent review evidence archive

Historical evidence, not current feature status. The [original report](review-ce42c12.md) targets ce42c12; the [later probe output](probe-results-877ce26.txt) rechecks its four defects at 877ce26. Counts and architectural recommendations in that report are historical. Adopted planning is [WORK_PLAN](../../WORK_PLAN.md) and [P2_ACCEPTANCE](../../P2_ACCEPTANCE.md).

The four concerns are incomplete-pile loss, protected-section parsing, external-change refresh and stale status replies. The implementation coordinator must triage them on its actual fixed target before registration/closure. Main's planning merge does not claim fixes.

[Portable probe source](probes.cjs.txt) is preserved as text, not an automatically executed gate. Copy to a temporary .cjs file and pass a frozen repository root and the installed TypeScript module path. It uses synthetic in-memory data, logs an expected injected upload failure and does not replace named harness regressions or browser evaluation.
