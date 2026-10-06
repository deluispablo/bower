# Current handoff: Claude coordinator, P2 fast close

Coordinator: Claude Code session `claude-orchestrator-2026-10-06-e759b272`; integration `/Users/deluisp/Projects/bower-app`, branch `codex/close-phase-2`. Lead: the Claude Planificador session ([DECISIONS.md](DECISIONS.md)). Owner rules: [TL-P2-38](2026-10-06-tl-p2-38-fast-close.md) fast close, [TL-P2-39](2026-10-06-tl-p2-39-main-and-staging.md) green batches to `main` + staging, [TL-P2-41](2026-10-06-tl-p2-41-token-budget.md) token budget. Earlier handoff text: [archive](archive/2026-10-06-handoff-before-tl-p2-41.md). Minors: [P2_POLISH.md](P2_POLISH.md).

## Where things stand

- `main` carries green batches 1–5 (batch 5: O5 final + pace fix, journeys A and B); 280/280 entries pass. Batch 5 gates: check 3478, e2e 212, e2e:fake 238.
- No workers running. TL-P2-44 adopted: dispatch only through `.claude/agents/` (bower-implementer/reviewer Sonnet, bower-mechanical Haiku, bower-escalated Opus), never pass `model`; every fix round is a fresh session; one review from the other provider against the packet's acceptance contract; ledger has the new columns.

## The plan, in order

1. Freeze one SHA (the batch 5 SHA) → one batch review (Codex, `codex exec --json`, explicit effort) against the P2 exit contract.
2. Phone/desktop evaluation → one C/I fix round → dossier (fresh C01–C16 row-to-evidence map) → close P2.

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
