# Current handoff: Claude coordinator, P2 fast close

Coordinator: Claude Code session `claude-orchestrator-2026-10-06-e759b272`; integration `/Users/deluisp/Projects/bower-app`, branch `codex/close-phase-2`. Lead: the Claude Planificador session ([DECISIONS.md](DECISIONS.md)). Owner rules: [TL-P2-38](2026-10-06-tl-p2-38-fast-close.md) fast close, [TL-P2-39](2026-10-06-tl-p2-39-main-and-staging.md) green batches to `main` + staging, [TL-P2-41](2026-10-06-tl-p2-41-token-budget.md) token budget. Earlier handoff text: [archive](archive/2026-10-06-handoff-before-tl-p2-41.md). Minors: [P2_POLISH.md](P2_POLISH.md).

## Where things stand

- `main` carries green batches 1–4 (latest batch 4 `3939760`); 261/280 entries pass.
- Integrated, waiting for e2e + closure (batch 5): `b-path-asked-question`, `legacy-runner-write-removal`, `o5-no-legacy-run-path` (+ five superseded TL-P2-37 entries pinned). Blocked by three fake e2e regressions (qa5 ×2, robustness retry), being fixed on `claude/p2-o5-final-fix`.
- Journeys A (`claude/p2-journeys-r1`): `run-result-links`, `journeys-existing-effects` delivered with the demo-duplicate fix; needs a spot check.
- Journeys B (`claude/p2-journeys-b`): C06/C09, C10, C08, C07 in review; C07 follow-up (TL-P2-40: answer recorded as a Timeline line) still to add.

## The plan, in order

1. O5 fix → e2e (display awake) → batch 5 to `main`, tell the lead the SHA.
2. Journeys A and B → batch 6. Close `c04/c05/c11/c06/c09` journey originals as superseded by TL-P2-40 (pinned).
3. Freeze one SHA → one batch review → phone/desktop evaluation → one C/I fix round → dossier (fresh C01–C16 row-to-evidence map) → close P2.

## How to run a round

- At most two workers at a time (Sonnet; Opus only for contracts/data safety). Packets one page with the rules copied in; workers read only `WORKER.md` + packet.
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

All rulings are indexed in [DECISIONS.md](DECISIONS.md). P3 notes: a session `leave` after `DELETE /me` must be answered harmlessly; the real runner drops the last edit without re-reading on a size refusal; native Workspace members need their own capture rule; the Inbox byte checks must use Drive checksums on the real source.
