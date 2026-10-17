# Bower app

Bower tidies a Google Drive folder of notes and files into a second brain: it files what you add, keeps your notes current and asks when it is unsure. This is the app (React, Vite, a PWA), its Cloudflare Worker (`api/`) and the runner that does a tidy-up (`runner/`).

Read [the product](docs/PRODUCT.md), [the architecture](docs/ARCHITECTURE.md) and [the runbook](docs/runbook.md). Contracts and UI specs are in `docs/specs/` and `docs/design/specs/`.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5190, the demo
```

## Test it

```bash
pnpm check          # lint, types, unit tests (app, api, runner), builds and code gates
pnpm e2e            # the merge gate: pretend Drive on phone and desktop, then the demo on desktop, with axe
pnpm e2e:fake       # the suite on the real logic over a pretend Google Drive
pnpm e2e:demo       # the suite on the demo, phone and desktop
pnpm e2e:full       # all four (fake and demo, phone and desktop), before a backup or deployment
pnpm e2e:pwa        # the built app: manifest, service worker, offline start
```

Every change runs `pnpm check` plus the touched screens' e2e (`pnpm e2e:fake <specs>`); before merging to `main`, `scripts/ci-gate.sh sdd/batch-N` pushes the batch branch to the private backup (never with force) and waits for the GitHub Actions run, which replaces the local `pnpm check` plus `pnpm e2e` once it has run green once (`scripts/ci-gate.sh --cleanup sdd/batch-N` deletes the branch after integration); `pnpm e2e:full` before a backup of `main` or a deployment. After a failure, rerun the failing suite with `--last-failed` before the whole gate. Heavy runs share one lock (`testing/with-lock.sh`). Test fixtures, the synthetic corpus and the gate baselines live in `testing/`.

## Where the data comes from

Add `?source=` to the address; the choice is kept for the tab.

- `demo` (the default): Alex's folder in memory.
- `fake`: the real logic (Drive folder, change journal, piles, runs) over a pretend Google Drive and a pretend Worker in the browser, seeded with the same folder.
- `real`: Google Drive and the Worker at `VITE_API_URL`. It is the default when that variable is set and there is no `?source=`.

## Demo situations

- `?scenario=`: `default`, `signed-out`, `first`, `back`, `running`, `empty`, `fail-run`, `slow` or `offline`.
- `?time=`: `demo` (a tidy-up takes about 25 s), `real` (about 5 min) or `instant`.
- ⌘⇧D opens the demo panel, which also switches between `demo` and `fake`.

Every situation works on both `demo` and `fake`. The sample piles in the demo panel are only on `demo`.

Bower in motion: `/_bird` shows every pose and flight.
