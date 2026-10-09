// done.sh's git steps, kept here so they are tested (src/harness-git.test.ts).
import { execFileSync } from 'node:child_process';

/** Paths from `git status --porcelain`; a rename ("R  old -> new") is its new name. */
export function statusPaths(status) {
  return status
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
    .map((p) => (p.includes(' -> ') ? p.split(' -> ').pop() : p));
}

/**
 * Takes back only what commit `sha` changed in `paths`, in the working tree
 * (later edits to the same files stay). False when that change no longer
 * applies backwards: then nothing is touched.
 */
export function undoCommit(sha, paths, cwd = process.cwd()) {
  const diff = execFileSync('git', ['diff', '--binary', `${sha}^`, sha, '--', ...paths], { cwd, encoding: 'utf8' });
  if (!diff.trim()) return false;
  try {
    execFileSync('git', ['apply', '-R', '--check'], { cwd, input: diff });
    execFileSync('git', ['apply', '-R'], { cwd, input: diff });
    return true;
  } catch {
    // expected: a later change touched the same lines; the caller says so and stops.
    return false;
  }
}

/** Where code lives for done.sh's red step (everything else is a record or a test). */
export const CODE_PATHS = ['api', 'runner', 'src', 'public', 'index.html', 'vite.config.ts', 'scripts', 'package.json', 'AGENTS.md', 'docs'];
/** Tests stay in place while the code is set aside. */
export const TEST_PATTERN = /\.test\.tsx?$|^api\/test\/|^runner\/test\/|^e2e\/|^src\/data\/contract\/|^src\/testing\//;

/** The files of `files` that are code: under CODE_PATHS and not a test. */
export function selectCode(files) {
  return files.filter((f) => CODE_PATHS.some((p) => f === p || f.startsWith(`${p}/`)) && !TEST_PATTERN.test(f));
}

/** Code changed or new in the working tree (staged or not). */
export function codeInWorktree(cwd = process.cwd()) {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...CODE_PATHS], { cwd, encoding: 'utf8' });
  return selectCode(statusPaths(status));
}

/** Code that commit `sha` changed. */
export function codeInCommit(sha, cwd = process.cwd()) {
  const out = execFileSync('git', ['diff', '--name-only', `${sha}^`, sha, '--', ...CODE_PATHS], { cwd, encoding: 'utf8' });
  return selectCode(out.split('\n').filter(Boolean));
}

/**
 * The tips a history check judges: HEAD, plus MERGE_HEAD while a merge is
 * uncommitted, since HEAD does not move during `git merge --no-commit`
 * (https://git-scm.com/docs/git-merge, "MERGE_HEAD").
 */
export function historyTips(cwd = process.cwd()) {
  try {
    execFileSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd, stdio: 'pipe' });
    return ['HEAD', 'MERGE_HEAD'];
  } catch {
    // expected: no merge in progress (rev-parse exits 1 when MERGE_HEAD is absent).
    return ['HEAD'];
  }
}

/** Short shas of the non-merge commits in the judged tips since `base`, touching `paths`. */
export function commitsSince(base, paths, cwd = process.cwd()) {
  const out = execFileSync('git', ['log', '--no-merges', '--format=%h', ...historyTips(cwd), `^${base}`, '--', ...paths], { cwd, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}
