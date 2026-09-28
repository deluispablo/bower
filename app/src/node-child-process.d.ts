// `node:child_process` has no ambient types in this repo (no `@types/node`,
// see `vite.config.ts`) — just enough of it to shell out to `git` at build
// time. A global ambient module declaration (this file has no top-level
// `import`/`export`, so TypeScript treats it as a script, not a module)
// has to live outside `vite.config.ts` itself: a `declare module` inside a
// file that is already a module is a module *augmentation*, which needs
// the target module to already resolve — exactly what's missing here.
declare module 'node:child_process' {
  export function execSync(
    command: string,
    options: {
      encoding: 'utf8';
      stdio?: ['ignore' | 'pipe', 'ignore' | 'pipe', 'ignore' | 'pipe'];
    },
  ): string;
}
