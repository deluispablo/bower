// `node:fs` has no ambient types in this repo (no `@types/node`, see
// app/scripts/check-size.mjs) — just enough of it, for tests that read a
// file from disk instead of importing it through Vite.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
