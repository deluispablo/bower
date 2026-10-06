# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

Integration `codex/close-phase-2` HEAD `c49aaa4`: O5 final (`07a8bb4`) + journeys A r1 (`dd1142a..c49aaa4`) + `main` docs to `4462c74`. `main` = batch 4 `3939760` + lead docs (not yet batch 5: O5 final needs its pace fix first). Two workers at a time. Subagents are in-process: clear this session only when neither runs (TL-P2-43).

- **O5 pace fix** (Opus, agent `a6deeff0d3fec0f0e`) `claude/p2-o5-final-fix` (`/private/tmp/bower-p2-o5-final`, port 5195, red `04cb286` → fix `982a75c`). Review a481 BLOCKED on I1: an uncheckable thing (e.g. restored, no kept hash) holds the pile with no Inbox reason. Fix sent: flag from metadata with no byte reads, so the Inbox and the run both show and hold `not-tidied`. When it is delivered: spot check, then cherry-pick `07a8bb4..<head>`.
- **Journeys B** (Opus, agent `ad08b860ee6ed7b92`) `claude/p2-journeys-b` (`/private/tmp/bower-p2-journeys-b`, port 5198, head `16f3b02`): review Important fixed (C08 demo, web-on line) plus the C07 Timeline answer (R4-1). It is now rebasing onto `c49aaa4`, because of conflicts with A in demo `fileInbox` and fake-runner `WantedLine`. Then cherry-pick.
- **Batch 5** = both of the above on integration → full e2e + e2e:fake awake → close `b-path-asked-question`, `legacy-runner-write-removal`, `o5-no-legacy-run-path`, the 5 superseded TL-P2-37 entries (known-green), `run-result-links`, `journeys-existing-effects`, `journeys-cites-and-answers`, C07/C08/C10 entries, and the c04/c05/c06/c09/c11 originals as superseded by TL-P2-40 → push main + backup → tell the lead the SHA → clear this session.
- **Owed to the lead:** the batch 5 SHA.
- After batch 5: freeze one SHA → one batch review → phone/desktop evaluation → one C/I round → dossier.
- Polish to add: the `PileScreen.test.tsx` "a draft whose note changed elsewhere" flake under full-suite load.
