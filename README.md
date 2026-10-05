# Bower app (rebuild)

The Bower app, started again from zero.

The adopted plan is [WORK_PLAN](docs/WORK_PLAN.md), with [product scope](docs/PRODUCT.md), [boundary architecture](docs/ARCHITECTURE.md) and [P2 acceptance](docs/P2_ACCEPTANCE.md).

- P1: accepted UI baseline on synthetic demo data.
- P2: complete app over realistic simulated services, with bounded integration-premise probes.
- P3: minimal real backend and recoverable deterministic execution, using a scripted semantic provider.
- P4: full second-brain reasoning and research through the same accepted boundaries.

Implementation advances only after the current phase is accepted. An assigned coordinator starts with [the launch packet](docs/harness/ORCHESTRATOR_START.md); every Claude/Codex session follows AGENTS.md and shared startup.

```bash
pnpm install
pnpm dev            # http://localhost:5190 — the demo
pnpm check          # lint, types, unit tests, build
pnpm e2e            # Playwright on the demo, phone and desktop, with axe
pnpm e2e:fake       # the same suite on the real logic over a pretend Google Drive
pnpm e2e:pwa        # the built app: manifest, service worker, offline start
pnpm harness        # how many harness features pass, and the next one
```

## Where the data comes from

Add `?source=` to the address; the choice is kept for the tab.

- `demo` (the default): Alex's folder in memory.
- `fake`: the real logic (Drive folder, change journal, piles, runs) over a pretend Google Drive and a pretend Worker in the browser, seeded with the same folder.
- `real`: Google Drive and the Worker at `VITE_API_URL`. It is the default when that variable is set and there is no `?source=`. The Worker arrives in phase 3.

## Demo situations

- `?scenario=`: `default`, `signed-out`, `first`, `back`, `running`, `empty`, `fail-run`, `slow` or `offline`.
- `?time=`: `demo` (a tidy-up takes about 25 s), `real` (about 5 min) or `instant`.
- ⌘⇧D opens the demo panel, which also switches between `demo` and `fake`.

Every situation works on both `demo` and `fake`. The sample piles in the demo panel are only on `demo`.

Bower in motion: `/_bird` shows every pose and flight.

## How the work is done

Phase work follows the harness in `harness/`: one feature at a time, each proven by its own command.

Claude and Codex use the same startup: `AGENTS.md` → `docs/harness/STARTUP.md`. The four project skills are versioned in `.agents/skills/`, with Claude discovery links in `.claude/skills/`. Load session guidance first, then only the assigned role; check actual optional capabilities in `docs/harness/SKILLS.md`. Worktree assignments and serialized integration follow `docs/harness/COORDINATION.md`.

Development stays local. Only local `main` is backed up to the owner-authorized private GitHub repository; see [BACKUP](docs/harness/BACKUP.md). Feature branches and uncommitted work remain local.
