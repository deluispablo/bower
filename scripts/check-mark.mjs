// Runs `pnpm check` and, only on green, records the HEAD it passed on (TL-P4-20 row 2).
// The stop gate (stop-gate.mjs) reads the mark. Run it as `node scripts/check-mark.mjs > log 2>&1`.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { head, markPath } from './mark-path.mjs';

const main = () => {
  const cwd = process.cwd();
  const before = head(cwd);
  const run = spawnSync('pnpm', ['check'], { cwd, stdio: 'inherit' });
  const status = run.status ?? 1;
  if (status === 0 && head(cwd) === before) writeFileSync(markPath(cwd), `${before}\n`);
  process.exit(status);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
