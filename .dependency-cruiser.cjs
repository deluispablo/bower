/**
 * dependency-cruiser rules (https://github.com/sverweij/dependency-cruiser, docs/rules-reference.md).
 * Run by scripts/check-dependencies.mjs inside `pnpm check`. Exceptions live in
 * scripts/dependency-exceptions.cjs, each with the entry that removes it.
 */
const { existsSync } = require('node:fs');
const { KNOWN, ROOTS, SHELL_MAY_IMPORT } = require('./scripts/dependency-exceptions.cjs');

const esc = (p) => `^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
/** Fake and demo modules: the two folders, and any file named fake-*. */
const FAKE_OR_DEMO = '^src/data/(fake|demo)/|(^|/)fake-[^/]+\\.tsx?$';
const PRODUCTION = '^(src|runner/src|api/src)/';
/** Production code is not the fakes themselves, the test helpers or the fixtures. */
const NOT_PRODUCTION = [FAKE_OR_DEMO, '^src/testing/', '\\.fixture\\.tsx?$'];
const SOURCES = '^src/data/(demo|drive|vault|live|worker|fake|contract)/|^src/data/choose\\.tsx?$';

const knownFiles = [...new Set(KNOWN.map((k) => k.from))];
const rootFiles = ROOTS.map((r) => r.from);

module.exports = {
  forbidden: [
    {
      name: 'production-imports-no-fake-or-demo',
      comment: 'Production code never imports a fake or demo module. Move what it needs out of fake/ or demo/ (see scripts/dependency-exceptions.cjs for the entries that do).',
      severity: 'error',
      from: { path: PRODUCTION, pathNot: [...NOT_PRODUCTION, ...rootFiles.map(esc), ...knownFiles.map(esc)] },
      to: { path: FAKE_OR_DEMO },
    },
    // A named exception allows only the targets it names.
    ...knownFiles.map((from) => ({
      name: 'production-imports-no-fake-or-demo',
      comment: `${from} may import only: ${KNOWN.filter((k) => k.from === from).map((k) => `${k.to} (${k.entry})`).join(', ')}.`,
      severity: 'error',
      from: { path: esc(from) },
      to: { path: FAKE_OR_DEMO, pathNot: KNOWN.filter((k) => k.from === from).flatMap((k) => k.to).map(esc) },
    })),
    {
      name: 'screens-use-data-only-through-sources',
      comment: 'Screens talk to data only through src/data/sources.ts (useSources, useLoad hooks in provider.tsx) and types.ts. Move what the screen needs behind a VaultSource/RunSource method, or into a pure module outside demo/drive/vault/live/worker/fake.',
      severity: 'error',
      from: { path: '^src/(features|app|ui|bird)/', pathNot: [esc('src/app/App.tsx'), '\\.test\\.tsx?$'] },
      to: { path: SOURCES },
    },
    {
      name: 'screens-use-data-only-through-sources',
      comment: 'The app shell may mount the demo panel and pick the source, nothing more.',
      severity: 'error',
      from: { path: esc('src/app/App.tsx') },
      to: { path: SOURCES, pathNot: SHELL_MAY_IMPORT.map(esc) },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.tsx?$|\\.test\\.tsx?\\.txt$|/test/|\\.fixture\\.tsx?$' },
    tsPreCompilationDeps: true,
    ...(existsSync('tsconfig.app.json') ? { tsConfig: { fileName: 'tsconfig.app.json' } } : {}),
  },
};
