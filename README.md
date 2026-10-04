# Bower app (rebuild)

The Bower app, started again from zero. Phase 1: the whole UI on demo data (Alex's made-up folder). See `docs/specs/2026-10-04-app-ui-design.md`.

```bash
pnpm install
pnpm dev            # http://localhost:5190 — the demo
pnpm check          # lint, types, unit tests, build
pnpm e2e            # Playwright, phone and desktop, with axe
```

Demo situations: add `?scenario=` (`default`, `signed-out`, `first`, `back`, `running`, `empty`, `fail-run`, `slow`, `offline`) and `?time=` (`demo` about 25 s, `real` about 5 min, `instant`). Or press ⌘⇧D.

Bower in motion: `/_bird` shows every pose and flight.

Local only for now: no remote.
