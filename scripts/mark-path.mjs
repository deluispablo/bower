// Where the green-check mark lives: inside the worktree's git directory, so it is never a tracked file.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
export const head = (cwd) => git(cwd, 'rev-parse', 'HEAD');
export const dirty = (cwd) => git(cwd, 'status', '--porcelain') !== '';
export const markPath = (cwd) => resolve(cwd, git(cwd, 'rev-parse', '--git-path', 'bower-check-green'));
