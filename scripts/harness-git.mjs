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
