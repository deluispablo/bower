# c3-unused-code notes

- Tool: knip 6.40.0 (https://knip.dev), config `knip.jsonc` (three workspaces; every ignore has a reason). Gate `scripts/check-unused-gate.mjs`, baseline `harness/unused-baseline.json` (5 lines), runs in `pnpm check` after the duplication gate.
- Baseline lines may only shrink: a new finding fails, and a baseline line that is no longer a finding fails ("remove these lines").
- `ignoreExportsUsedInFile`: a symbol used only in its own file is not reported (standard knip option). Without it knip reports 160 exports/types that are only "exported for no reader".
- Removed: SAMPLE_RULES (demo fixture), isJournalRecord re-export (vault/journal.ts), rowCls (ui/menu.ts), resetBirdPresence (bird/presence.ts), dispatchesReach (api test helper), `Deferred` re-export (runner admitted.ts), `SortOrder` re-export (FolderScreen.tsx), dependency @radix-ui/react-tooltip (no import anywhere). knip found no unused files.
- Kept in the baseline, not removed:
  - api/src/security.ts `rateLimit`, `genericRateLimit`, `COOKIE_ROUTES`: the strict and generic rate limits are defined but nothing mounts them. Possible promised-but-dead defect (a closed entry promised rate limiting); to log, not delete.
  - api/src/process.ts `isStale`: dead; recovery.ts `ownDeadline` repeats its rule and cites it in a comment. Left for the lead.
  - src/data/contracts/run-phases.ts RUN_STEPS and ACTIVE_PHASES export one value twice; a contracts file, left alone.
- Blind spot: tests are entries, so a helper with only test callers (the `keepFinished` case in `retention-never-wired`) is not reported. A production-only pass (`knip --production`) would catch it; left out of this entry.
- Config keeps `dependency-cruiser` and `prettier` (no script imports them by name) and `cloudflare` (the `cloudflare:test` virtual module).
