# c5-css-tokens

implementer: codex

Implemented the quoted DEFECTS css-unknown-token ruling. No git write commands ran;
the coordinator owns the red, fix, and notes commits.

Changed:
- Red: src/styles/css-tokens.test.ts adds the test
  `every var() in src CSS names a defined custom property`.
- The guard reads every src CSS file, including generated tokens.css, collects
  custom property declarations and TSX style keys/runtime style writes, and
  reports undefined var() references with file and line. Fallbacks still count.
- Fix: the two --muted references now use --text-muted. No other CSS changed.

removed: src/features/bower/bower.module.css:30: var(--muted)
removed: src/features/note/note.module.css:71: var(--muted)
removed: no files or existing tests
tests changed: none; the guard is a new test beside control-line.test.ts

Evidence:
- /tmp/csst-red.log: assertion failed with exactly the two --muted references
  above; no other undefined property names. The two control-line tests passed.
- /tmp/csst-green.log: the new guard and both control-line tests passed.
- /tmp/csst-tsc.log: pnpm exec tsc -p tsconfig.app.json passed (exit 0).
- /tmp/csst-eslint.log: pnpm exec eslint src/styles/css-tokens.test.ts passed (exit 0).
- Both targeted Vitest runs used --maxWorkers=2.
- An initial import.meta.glob raw CSS attempt returned non-string module data;
  it was replaced with direct filesystem reads before the assertion red above.
- Only the packet's targeted checks ran; full check and e2e were excluded by
  the explicit instruction to run only the listed checks.

Research (offline; no network requests): the existing tokens-to-css.mjs is the
generation home, invoked by pnpm tokens. The guard reads its generated CSS
rather than duplicating token generation. CSS var() takes a custom property
name as its first argument even with a fallback:
https://developer.mozilla.org/en-US/docs/Web/CSS/var
https://www.w3.org/TR/css-variables-1/#using-variables

Files per coordinator commit:
- red: src/styles/css-tokens.test.ts
- fix: src/features/bower/bower.module.css; src/features/note/note.module.css
- notes: docs/harness/2026-10-10-c5-css-tokens-notes.md

compatibility: ace15da0
