# Current handoff: Claude coordinator, P2 fast close

Coordinator: Claude Code session `claude-orchestrator-2026-10-06-e759b272`; integration `/Users/deluisp/Projects/bower-app`, branch `codex/close-phase-2`. Lead: the Claude Planificador session ([DECISIONS.md](DECISIONS.md)). Owner rules: [TL-P2-38](2026-10-06-tl-p2-38-fast-close.md) fast close, [TL-P2-39](2026-10-06-tl-p2-39-main-and-staging.md) green batches to `main` + staging, [TL-P2-41](2026-10-06-tl-p2-41-token-budget.md) token budget. Earlier handoff text: [archive](archive/2026-10-06-handoff-before-tl-p2-41.md). Minors: [P2_POLISH.md](P2_POLISH.md).

## Where things stand

- **P2 is closed** under the owner's conditional acceptance at dossier SHA `3e6e7da`: [2026-10-06-p2-dossier.md](2026-10-06-p2-dossier.md). Four full suites green there (check 3486, e2e 216, e2e:fake 240, e2e:pwa 4); review CLEAN (TL-P2-46 Opus fallback); evaluation's F1/F2 focus findings fixed in `focus-after-replay-and-route`; 281/281 entries pass. Minors in [P2_POLISH.md](P2_POLISH.md).
- Coordinator runs from `/Users/deluisp/Projects/bower-app`: project agents load and the quiet-gates hook is active; dispatch only through `.claude/agents/`, never with `model`.

- **Backup:** `backup/main` = `03054bd` (verified by the lead, fast-forward from `4d7ab08`, scan clean). The owner authorised `gh`, and git reaches it through the keychain; Bash may need to run outside the sandbox. The coordinator pushes after each green integration per BACKUP.md: `git push backup refs/heads/main:refs/heads/main`, then verify the remote SHA.

## The plan, in order

1. [TL-P2-47](DECISIONS.md): one supplemental walk on 3e6e7da before P3 implementation (see ACTIVE); P3 planning runs in parallel. First P3 batch entries: C11 "no policy change from documents" and an app console-error e2e check.
2. Coordinator resumes from HANDOFF/ACTIVE and runs P3 batches under the same method. Codex is back as reviewer from 2026-10-12 (no re-review of 4d7ab08, TL-P2-46).

## How to run a round

- At most two workers at a time, through `.claude/agents/` only (TL-P2-44). Packets one page with the rules copied in; workers read only `WORKER.md` + packet.
- Ordinary entry: self-review + coordinator spot check. Independent review only for contracts, data or shared persistence, plus one batch review at the freeze; a delta only after a Critical.
- Per entry: `pnpm check` + the touched screens' e2e; full `e2e` + `e2e:fake` once per batch, under `caffeinate -dims`, display awake.
- Workers never use port 5191 (Playwright reuses it): a private config on 5195–5198.
- `harness/done.sh <id> "<msg>" --fixed-in <sha>`; when later commits touched the same lines, `--known-green` citing the review's red.

## Traps on this machine

- Playwright stalls when the display sleeps (`system_profiler SPDisplaysDataType | grep Asleep`); never edit `src/` while e2e or `done.sh` runs.
- macOS has no `timeout`; chain gates with `&&`, not `;`.
- A jsdom teardown race can fail `pnpm check` once under load; rerun before blaming code.
- Verify `-g` patterns must name full test titles (the harness refuses short ones).

## Decisions taken in phase 2

All rulings are indexed in [DECISIONS.md](DECISIONS.md). P3 notes: a session `leave` after `DELETE /me` must be answered harmlessly; the real runner drops the last edit without re-reading on a size refusal; native Workspace members need their own capture rule; the Inbox byte checks must use Drive checksums on the real source, and the real listing must request `sha256Checksum`/`size` and mark a file with neither as `unchecked` (O5 I1).
