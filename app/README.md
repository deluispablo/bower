# App

Progressive web app (Vite + Preact + TypeScript) served by Cloudflare Pages; see `ARCHITECTURE.md`.

Copy `.env.example` to `.env` and set `VITE_API_URL`, then run `pnpm -C app dev` (or `pnpm dev` from this folder) to start it on `localhost`; `pnpm build` produces the production bundle.
