// The last step of `pnpm check` (TL-P4-20 addendum 3): on green, record the HEAD of the tree it ran in.
// The stop gate (stop-gate.mjs) reads this mark from the worker's own worktree.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { head, markPath } from './mark-path.mjs';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const cwd = process.cwd();
  writeFileSync(markPath(cwd), `${head(cwd)}\n`);
}
