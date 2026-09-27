# App

Progressive web app (Vite + Preact + TypeScript) served by Cloudflare Pages; see `ARCHITECTURE.md`.

Copy `.env.example` to `.env` and set `VITE_API_URL`, then run `pnpm -C app dev` (or `pnpm dev` from this folder) to start it on `localhost`; `pnpm build` produces the production bundle.

`VITE_DEMO=1` (in `.env` or on the command line) builds the demo instead: no backend, an invented person's sample notes, everything in memory. See "Demo mode" in `docs/testing.md`.
