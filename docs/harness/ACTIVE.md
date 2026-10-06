# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

Integration `codex/close-phase-2` HEAD has O5 final (`07a8bb4`) and docs up to `main` `3bc335a`; `main` = batch 4 `3939760` + lead docs. Two workers at a time.

- **O5 pace fix** `claude/p2-o5-final-fix` (`/private/tmp/bower-p2-o5-final`, red `04cb286` → fix `982a75c`): fixes the three fake e2e regressions (qa5 ×2, robustness retry). Independent review running (run-record persistence). When CLEAN: cherry-pick `07a8bb4..982a75c` onto integration, full e2e/e2e:fake awake, close `b-path-asked-question`, `legacy-runner-write-removal`, `o5-no-legacy-run-path` (`--known-green` fallback) and the five TL-P2-37 superseded entries (known-green, pinned in fake-worker "no tidy-up takes the legacy path"), push batch 5, tell the lead.
- **Journeys A** `claude/p2-journeys-r1` (`/private/tmp/bower-p2-journeys`, base `07a8bb4`, head `9e8b7d8`): `run-result-links`, `journeys-existing-effects` done (review passed, Important fixed). Coordinator spot check of r1, then integrate; close `c04/c05/c11` originals as superseded by TL-P2-40.
- **Journeys B** `claude/p2-journeys-b` (`/private/tmp/bower-p2-journeys-b`, base `07a8bb4`, head `91e7673`): C06/C09, C10, C07 pass review; C08 demo `{note}` Important + C07 follow-up (TL-P2-40 answer lines) in progress. Then integrate; close `c06/c09` originals as superseded. Verifies point at `e2e/capabilities-b.spec.ts`.
- After batch 6: freeze one SHA → one batch review → phone/desktop evaluation → one C/I round → dossier.
