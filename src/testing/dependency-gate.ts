/// <reference types="node" />
/** Runs the dependency gate (scripts/check-dependencies.mjs) on the repo or on a small fixture tree. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GATE = join(ROOT, 'scripts/check-dependencies.mjs');
export const run = (root: string): { code: number | null; out: string } => {
  const r = spawnSync('node', [GATE, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

const made: string[] = [];
export const fixture = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'bower-deps-'));
  made.push(root);
  const all = { 'tsconfig.app.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n', ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};
export const removeFixtures = (): void => made.forEach((d) => rmSync(d, { recursive: true, force: true }));
