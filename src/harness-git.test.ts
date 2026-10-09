/// <reference types="node" />
/** done.sh's git steps (scripts/harness-git.mjs), on a throwaway repository. */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lockTestEnv } from './harness-lock-test-env';
// @ts-expect-error plain JS module, checked by these tests
import { codeInCommit, codeInWorktree, commitsSince, historyTips, protectedReason, statusPaths, undoCommit } from '../scripts/harness-git.mjs';

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

  it('done.sh sees a change under harness scripts as code', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'harness'), { recursive: true });
    writeFileSync(join(dir, 'harness/with-lock.sh'), 'echo one\n');
    git('add -A && git commit -qm base');
    writeFileSync(join(dir, 'harness/with-lock.sh'), 'echo two\n');
    expect(codeInWorktree(dir)).toEqual(['harness/with-lock.sh']);
    git('commit -qam change');
    expect(codeInCommit('HEAD', dir)).toEqual(['harness/with-lock.sh']);
  });

  it('done.sh sees harness data as no code', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'harness'), { recursive: true });
    writeFileSync(join(dir, 'harness/features.json'), '[]\n');
    writeFileSync(join(dir, 'harness/notes.md'), 'old\n');
    git('add -A && git commit -qm base');
    writeFileSync(join(dir, 'harness/features.json'), '[{}]\n');
    writeFileSync(join(dir, 'harness/notes.md'), 'new\n');
    expect(codeInWorktree(dir)).toEqual([]);
    git('commit -qam change');
    expect(codeInCommit('HEAD', dir)).toEqual([]);
  });

  // integrate.sh runs in the repository it is started in; these fixtures make their own.
  const integrate = (checkCmd: string, branchFiles: Record<string, string>, dirtyFirst = false) => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'a.txt'), 'one\n');
    git('add -A && git commit -qm base');
    git('branch -M main');
    git('checkout -qb worker');
    for (const [f, c] of Object.entries(branchFiles)) writeFileSync(join(dir, f), c);
    git('add -A && git commit -qm "worker change"');
    git('checkout -q main');
    if (dirtyFirst) writeFileSync(join(dir, 'a.txt'), 'edited\n');
    const run = spawnSync('bash', [join(process.cwd(), 'harness/integrate.sh'), 'worker'], { cwd: dir, encoding: 'utf8', env: lockTestEnv({ INTEGRATE_CHECK: checkCmd, HARNESS_LOCK: join(dir, '.git/heavy.lock') }) });
    return { dir, git, run, out: run.stdout + run.stderr };
  };

  it('integrate.sh aborts a merge whose tree fails the check', () => {
    const { dir, git, run, out } = integrate('if [ -e bad.txt ]; then echo "FAIL bad.txt should not exist"; exit 1; fi', { 'bad.txt': 'x\n' });
    expect(run.status).toBe(1);
    expect(out).toContain('FAIL bad.txt should not exist');
    expect(out).toContain('check failed: worker is not merged');
    expect(existsSync(join(dir, 'bad.txt'))).toBe(false);
    expect(existsSync(join(dir, '.git/MERGE_HEAD'))).toBe(false);
    expect(git('log --oneline').trim().split('\n')).toHaveLength(1);
    expect(git('status --porcelain')).toBe('');
  });

  it('integrate.sh commits a merge whose tree passes the check', () => {
    const { git, run } = integrate('true', { 'good.txt': 'x\n' });
    expect(run.status).toBe(0);
    expect(git('log -1 --format=%s').trim()).toBe("Merge branch 'worker'");
    expect(git('log -1 --format=%p').trim().split(' ')).toHaveLength(2);
  });

  it('integrate.sh refuses to start on a dirty tree', () => {
    const { dir, git, run, out } = integrate('true', { 'good.txt': 'x\n' }, true);
    expect(run.status).toBe(1);
    expect(out).toContain('The tree has changes');
    expect(existsSync(join(dir, 'good.txt'))).toBe(false);
    expect(git('log --oneline').trim().split('\n')).toHaveLength(1);
  });

  // A worker branch that changes or deletes an existing test, with the notes file it adds (or none).
  const tamper = (change: 'edit' | 'delete', notes: string | null) => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'e2e'), { recursive: true });
    writeFileSync(join(dir, 'src/a.test.ts'), "it('a', () => {});\n");
    writeFileSync(join(dir, 'e2e/b.spec.ts'), "test('b', () => {});\n");
    git('add -A && git commit -qm base');
    git('branch -M main');
    git('checkout -qb worker');
    if (change === 'edit') writeFileSync(join(dir, 'src/a.test.ts'), "it('a', () => { expect(1).toBe(1); });\n");
    else git('rm -q src/a.test.ts');
    if (notes !== null) {
      mkdirSync(join(dir, 'docs/harness'), { recursive: true });
      writeFileSync(join(dir, 'docs/harness/2026-10-09-x-notes.md'), notes);
    }
    git('add -A && git commit -qm "worker change"');
    git('checkout -q main');
    const run = spawnSync('bash', [join(process.cwd(), 'harness/integrate.sh'), 'worker'], { cwd: dir, encoding: 'utf8', env: lockTestEnv({ INTEGRATE_CHECK: 'true', HARNESS_LOCK: join(dir, '.git/heavy.lock') }) });
    return { dir, git, run, out: run.stdout + run.stderr };
  };

  it('a branch that changes an existing test without a tests-changed line fails integration', () => {
    const { dir, git, run, out } = tamper('edit', null);
    expect(run.status).toBe(1);
    expect(out).toContain('src/a.test.ts');
    expect(out).toContain('tests changed');
    expect(existsSync(join(dir, '.git/MERGE_HEAD'))).toBe(false);
    expect(git('log --oneline').trim().split('\n')).toHaveLength(1);
    // A line for another file does not cover it.
    const other = tamper('edit', 'tests changed: src/other.test.ts: not this one\n');
    expect(other.run.status).toBe(1);
    expect(other.out).toContain('src/a.test.ts');
  });

  it('check-harness reports a changed test without a line against the branch base', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/a.test.ts'), "it('a', () => {});\n");
    git('add -A && git commit -qm base');
    git('branch -M main');
    git('checkout -qb worker');
    writeFileSync(join(dir, 'src/a.test.ts'), "it('a', () => { expect(1).toBe(1); });\n");
    git('commit -qam edit');
    const run = () => spawnSync('node', [join(process.cwd(), 'scripts/check-harness.mjs'), '--tests-changed', 'main'], { cwd: dir, encoding: 'utf8' });
    expect(run().status).toBe(1);
    expect(run().stderr).toContain('src/a.test.ts');
    mkdirSync(join(dir, 'docs/harness'), { recursive: true });
    writeFileSync(join(dir, 'docs/harness/2026-10-09-x-notes.md'), 'tests changed: src/a.test.ts: asserts the value\n');
    git('add -A && git commit -qm notes');
    expect(run().status).toBe(0);
  });

  it('a tests-changed line for each changed test lets the branch pass', () => {
    const { run, git } = tamper('edit', 'tests changed: src/a.test.ts: asserts the value now\n');
    expect(run.status).toBe(0);
    expect(git('log -1 --format=%p').trim().split(' ')).toHaveLength(2);
  });

  it('a deleted test needs its own tests-changed line', () => {
    const missing = tamper('delete', null);
    expect(missing.run.status).toBe(1);
    expect(missing.out).toContain('src/a.test.ts');
    const named = tamper('delete', 'tests changed: src/a.test.ts: the screen it covered is gone\n');
    expect(named.run.status).toBe(0);
  });

  // A fixture repo with a worker branch checked out in its own worktree (never the real repositories).
  const cleanupFixture = (branch: string) => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'a.txt'), 'one\n');
    git('add -A && git commit -qm base');
    git('branch -M main');
    const wt = join(realpathSync(mkdtempSync(join(tmpdir(), 'harness-wt-'))), 'wt');
    git(`worktree add -q -b ${branch} ${wt}`);
    writeFileSync(join(wt, 'b.txt'), 'two\n');
    execSync('git add -A && git commit -qm "worker change"', { cwd: wt });
    const run = () => {
      const r = spawnSync('bash', [join(process.cwd(), 'harness/integrate.sh'), branch], { cwd: dir, encoding: 'utf8', env: lockTestEnv({ INTEGRATE_CHECK: 'true', HARNESS_LOCK: join(dir, '.git/heavy.lock') }) });
      return r.stdout + r.stderr;
    };
    return { dir, git, wt, run };
  };

  it('integrate removes a merged branch and its clean worktree', () => {
    const { dir, git, wt, run } = cleanupFixture('worker');
    const out = run();
    expect(git('log -1 --format=%s').trim()).toBe("Merge branch 'worker'");
    expect(existsSync(wt)).toBe(false);
    expect(git('branch --list worker').trim()).toBe('');
    expect(git('worktree list --porcelain')).not.toContain('worker');
    expect(out).toContain('Removed worktree and branch worker.');
    expect(existsSync(dir)).toBe(true);
  });

  it('a dirty worktree is kept with its branch and a printed line', () => {
    const { git, wt, run } = cleanupFixture('worker');
    writeFileSync(join(wt, 'b.txt'), 'edited\n');
    const out = run();
    expect(existsSync(wt)).toBe(true);
    expect(git('branch --list worker').trim()).toContain('worker');
    expect(out).toContain('Kept worker: its worktree has changes.');
  });

  it('a merged claude/design worktree survives integrate', () => {
    const { git, wt, run } = cleanupFixture('claude/design');
    const out = run();
    expect(git('log -1 --format=%s').trim()).toBe("Merge branch 'claude/design'");
    expect(existsSync(wt)).toBe(true);
    expect(git('branch --list claude/design').trim()).toContain('claude/design');
    expect(out).toContain('Kept claude/design: it is a protected branch.');
  });

  it('protected names and the deploy worktree are kept, whatever the merge state', () => {
    for (const b of ['main', 'claude/p3', 'claude/tl-planning', 'claude/design', 'archive/old', 'codex/x']) expect(protectedReason(b, '/tmp/x')).not.toBeNull();
    expect(protectedReason('worker', '/private/tmp/bower-deploy')).not.toBeNull();
    expect(protectedReason('worker', '/tmp/x')).toBeNull();
  });

  it('a worktree with a running process survives integrate', async () => {
    const { git, wt, run } = cleanupFixture('worker');
    const child = spawn('sleep', ['30'], { cwd: wt, stdio: 'ignore' });
    try {
      await new Promise<void>((resolve) => child.once('spawn', () => resolve()));
      const out = run();
      expect(existsSync(wt)).toBe(true);
      expect(git('branch --list worker').trim()).toContain('worker');
      expect(out).toContain('Kept worker: a process is running in its worktree.');
    } finally {
      child.kill();
    }
  });

  it('a branch commit with no compatibility row fails the check under a no-commit merge', () => {
    const { dir, git } = repo();
    mkdirSync(join(dir, 'src/features'), { recursive: true });
    writeFileSync(join(dir, 'list.md'), '| sha | entry | what |\n');
    git('add -A && git commit -qm base');
    const base = git('rev-parse --short HEAD').trim();
    git('checkout -q -b branch');
    writeFileSync(join(dir, 'src/features/a.ts'), 'export const a = 1;\n');
    git('add -A && git commit -qm "branch change"');
    const branchSha = git('rev-parse --short HEAD').trim();
    git('checkout -q -');
    writeFileSync(join(dir, 'other.txt'), 'main moved\n');
    git('add -A && git commit -qm main-moved');
    expect(commitsSince(base, ['src/features'], dir)).toEqual([]);
    git('merge -q --no-ff --no-commit branch');
    expect(historyTips(dir)).toEqual(['HEAD', 'MERGE_HEAD']);
    expect(commitsSince(base, ['src/features'], dir)).toEqual([branchSha]);
    git('commit -qm merged');
    expect(historyTips(dir)).toEqual(['HEAD']);
    expect(commitsSince(base, ['src/features'], dir)).toEqual([branchSha]);
  });

  it('every history reader takes its tips from the one helper', () => {
    const root = join(__dirname, '..');
    const files = [
      ...readdirSync(join(root, 'src')).filter((f) => f.endsWith('.test.ts')).map((f) => join('src', f)),
      ...readdirSync(join(root, 'scripts')).filter((f) => f.endsWith('.mjs')).map((f) => join('scripts', f)),
    ];
    const walks = /\.\.\.?HEAD|'(log|rev-list)'|git (log|rev-list)/;
    const bad = files.filter((f) => f !== 'scripts/harness-git.mjs' && f !== 'src/harness-git.test.ts' && walks.test(readFileSync(join(root, f), 'utf8')) && !/commitsSince|historyTips/.test(readFileSync(join(root, f), 'utf8')));
    expect(bad).toEqual([]);
  });
  it('harness-git imported under node -e with a sha argument does not run the cleanup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-git-import-'));
    const copy = join(dir, 'harness-git.mjs');
    writeFileSync(copy, readFileSync(join(process.cwd(), 'scripts/harness-git.mjs'), 'utf8'));
    const run = spawnSync('node', ['-e', `import('${copy}')`, '24323495'], { cwd: dir, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe('');
    expect(run.status).toBe(0);
  });
});
