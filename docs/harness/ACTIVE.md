# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

Batch 5 is on `main`; main adopted at e27069d (TL-P2-45, docs only). Staging redeployed from 4d7ab08 (version 826a00ad). All 280 entries pass.

- **Freeze:** code SHA `4d7ab08`, detached checkout `/private/tmp/bower-p2-freeze`.
- **Done at 4d7ab08:** batch review CLEAN (9e38dab); evaluation 2 Important F1/F2 focus + 10 minors ([report](2026-10-06-p2-evaluation-4d7ab08.md)); `e2e:pwa` 4/4. Minors in P2_POLISH.
- **Running, the one C/I round:** `focus-after-replay-and-route`, Sonnet (general-purpose, model pinned; TL-P2-44 adoption note allows it outside bower-app), packet [2026-10-06-focus-fix-packet.md](2026-10-06-focus-fix-packet.md), checkout `/private/tmp/bower-p2-focus` branch `claude/p2-focus` from b562019. `caffeinate -dims` held.
- Next: spot-check + integrate the fix → `done.sh` → on the integrated (dossier) SHA, once and batched, all four full suites: `pnpm check`, `e2e`, `e2e:fake`, `e2e:pwa`; then the evaluator replays F1/F2 there (no independent review: UI-only, TL-P2-44 rule 6) → dossier (record C08 revision and C10 failed/stale as moved to P4) → close P2. At that batch boundary the owner restarts the coordinator from bower-app.
- Owed to the lead: the evaluation result (review verdict sent).
- Resume (TL-P2-45): never clear; after a manual compaction re-read HANDOFF and this file. If a worker is gone and its report is missing, rerun it fresh from its packet.
