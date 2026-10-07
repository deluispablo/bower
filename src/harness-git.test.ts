/// <reference types="node" />
/** done.sh's git steps (scripts/harness-git.mjs), on a throwaway repository. */
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, checked by these tests
import { codeInCommit, codeInWorktree, statusPaths, undoCommit } from '../scripts/harness-git.mjs';

const repo = (): { dir: string; git: (c: string) => string } => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  const git = (c: string): string => execSync(`git ${c}`, { cwd: dir, encoding: 'utf8' });
  git('init -q');
  git('config user.email you@example.com');
  git('config user.name Alex');
  return { dir, git };
};

describe('the harness and git', () => {
  it('fixed-in undoes only that commit, keeping later edits to the same file', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'a.ts'), 'one\ntwo\nthree\nfour\nfive\nsix\n');
    git('add -A && git commit -qm base');
    writeFileSync(join(dir, 'a.ts'), 'one\nTWO (the fix)\nthree\nfour\nfive\nsix\n');
    git('commit -qam fix');
    const fix = git('rev-parse --short HEAD').trim();
    writeFileSync(join(dir, 'a.ts'), 'one\nTWO (the fix)\nthree\nfour\nfive\nSIX (later)\n');
    git('commit -qam later');
    expect(undoCommit(fix, ['a.ts'], dir)).toBe(true);
    expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('one\ntwo\nthree\nfour\nfive\nSIX (later)\n');
  });

  it('fixed-in reads renamed paths by their new name', () => {
    expect(statusPaths('R  src/old.ts -> src/new.ts\nM  src/a.ts\n?? src/b.ts\n')).toEqual(['src/new.ts', 'src/a.ts', 'src/b.ts']);
  });

  it('done.sh sees a change under api/ as code and api tests as tests', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'api/src'), { recursive: true });
    mkdirSync(join(dir, 'api/test'), { recursive: true });
    writeFileSync(join(dir, 'api/src/x.ts'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'api/test/x.test.ts'), 'old\n');
    git('add -A && git commit -qm base');
    writeFileSync(join(dir, 'api/src/x.ts'), 'export const x = 2;\n');
    writeFileSync(join(dir, 'api/test/x.test.ts'), 'new\n');
    // Staged or not, in the working tree: the code, not its test.
    expect(codeInWorktree(dir)).toEqual(['api/src/x.ts']);
    git('commit -qam change');
    // In a commit (fixed-in): the same selection.
    expect(codeInCommit('HEAD', dir)).toEqual(['api/src/x.ts']);
  });

  it('done.sh sees a change under runner/ as code and runner tests as tests', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'runner/src'), { recursive: true });
    mkdirSync(join(dir, 'runner/test'), { recursive: true });
    writeFileSync(join(dir, 'runner/src/x.ts'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'runner/test/x.ts'), 'old\n');
    git('add -A && git commit -qm base');
    writeFileSync(join(dir, 'runner/src/x.ts'), 'export const x = 2;\n');
    writeFileSync(join(dir, 'runner/test/x.ts'), 'new\n');
    expect(codeInWorktree(dir)).toEqual(['runner/src/x.ts']);
    git('commit -qam change');
    expect(codeInCommit('HEAD', dir)).toEqual(['runner/src/x.ts']);
  });
});
