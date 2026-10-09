// done.sh's git steps, kept here so they are tested (src/harness-git.test.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
export const CODE_PATHS = ['api', 'runner', 'src', 'public', 'index.html', 'vite.config.ts', 'scripts', 'harness', 'package.json', 'AGENTS.md', 'docs'];
/** Scripts under harness/ are code; its JSON, Markdown and data files are records. */
const HARNESS_SCRIPT = /^harness\/.+\.(sh|mjs|ts)$/;
/** Tests stay in place while the code is set aside. */
export const TEST_PATTERN = /\.test\.tsx?$|^api\/test\/|^runner\/test\/|^e2e\/|^src\/data\/contract\/|^src\/testing\//;

/** The files of `files` that are code: under CODE_PATHS and not a test. */
export function selectCode(files) {
  return files.filter((f) => (HARNESS_SCRIPT.test(f) || (!f.startsWith('harness/') && CODE_PATHS.some((p) => f === p || f.startsWith(`${p}/`)))) && !TEST_PATTERN.test(f));
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

/** Branches whose worktrees cleanup never touches, whatever the merge state (TL-P4-19). The one home of the list. */
export const PROTECTED_BRANCHES = [/^main$/, /^claude\/p3$/, /^claude\/tl-planning$/, /^claude\/design$/, /^archive\//, /^codex\//];
/** Worktree paths cleanup never touches: the deploy worktree. */
export const PROTECTED_WORKTREES = ['/private/tmp/bower-deploy'];

/** Why `branch` checked out at `worktree` must stay, or null. */
export function protectedReason(branch, worktree) {
  if (PROTECTED_BRANCHES.some((re) => re.test(branch)) || PROTECTED_WORKTREES.includes(worktree)) return 'it is a protected branch';
  return null;
}

/** The checked-out worktree path of `branch`, or null (git worktree list --porcelain). */
function worktreeOf(branch, cwd) {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' });
  for (const block of out.split('\n\n')) {
    const lines = block.split('\n');
    if (lines.includes(`branch refs/heads/${branch}`)) return lines[0].replace(/^worktree /, '');
  }
  return null;
}

/** True when a process has a file or its working directory under `dir` (lsof +D); unknown counts as in use. */
function inUse(dir) {
  const r = spawnSync('lsof', ['+D', dir], { encoding: 'utf8' });
  if (r.error) return true;
  return r.stdout.trim() !== '';
}

/**
 * After a green merge: removes the merged branch's worktree (never --force) and then the branch (-d).
 * Returns the lines to print. Keeps protected names, a dirty worktree and one in use.
 * https://git-scm.com/docs/git-worktree#_commands, https://git-scm.com/docs/git-branch
 */
export function cleanupMerged(branch, cwd = process.cwd()) {
  const wt = worktreeOf(branch, cwd);
  const path = wt ? realpathSync(wt) : null;
  const top = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim());
  const reason = protectedReason(branch, path ?? '') ?? (path === top ? 'it is the checkout in use' : null);
  if (reason) return [`Kept ${branch}: ${reason}.`];
  if (path && inUse(path)) return [`Kept ${branch}: a process is running in its worktree.`];
  try {
    if (path) execFileSync('git', ['worktree', 'remove', path], { cwd, stdio: 'pipe' });
  } catch {
    // expected: git refuses a worktree with changes (or locked); it stays, with its branch.
    return [`Kept ${branch}: its worktree has changes.`];
  }
  try {
    execFileSync('git', ['branch', '-d', branch], { cwd, stdio: 'pipe' });
  } catch {
    // expected: git refuses a branch that is not merged into HEAD; it stays.
    return [`Kept ${branch}: it is not merged into this branch.`];
  }
  return [`Removed worktree and branch ${branch}.`];
}

// integrate.sh: node scripts/harness-git.mjs cleanup <branch>
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) && process.argv[2] === 'cleanup') {
  for (const line of cleanupMerged(process.argv[3] ?? '')) console.log(line);
}
