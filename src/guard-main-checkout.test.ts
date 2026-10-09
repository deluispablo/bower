/// <reference types="node" />
/** The PreToolUse hook that keeps a subagent from moving the main checkout (TL-P4-17 entry 2). */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, checked by these tests
import { guardMainCheckout } from '../scripts/guard-main-checkout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = '/Users/deluisp/Projects/bower-app';
const SCRATCH = '/private/tmp/bower-c3-guard';
const event = (command: string, cwd: string, agent = true) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  cwd,
  ...(agent ? { agent_id: 'a1b2', agent_type: 'bower-reviewer' } : {}),
  tool_input: { command },
});
const verdict = (e: unknown): string | null => guardMainCheckout(e);
const call = (input: unknown, args: string[] = []) =>
  spawnSync('node', [join(ROOT, 'scripts/guard-main-checkout.mjs'), ...args], { input: JSON.stringify(input), encoding: 'utf8' });
const run = (input: unknown, args: string[] = []): string => call(input, args).stdout;

describe('the main-checkout guard hook', () => {
  it("a subagent's git checkout in the main checkout is refused", () => {
    for (const command of ['git checkout d930f397', 'git switch main', 'git reset --hard HEAD~1', 'git rebase main', 'git merge x', 'git stash']) {
      expect(verdict(event(command, MAIN)), command).toMatch(/git show|git diff|worktree/);
    }
    expect(verdict(event(`git -C ${MAIN} checkout d930f397`, SCRATCH))).not.toBeNull();
    expect(verdict(event(`cd ${MAIN} && git checkout d930f397`, SCRATCH))).not.toBeNull();
    expect(verdict(event('git checkout x', `${MAIN}/src`))).not.toBeNull();
    const out = call(event('git checkout d930f397', MAIN));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/git show/);
  });

  it("the coordinator's own git checkout in the main checkout is allowed", () => {
    expect(verdict(event('git checkout claude/p3', MAIN, false))).toBeNull();
    expect(run(event('git checkout claude/p3', MAIN, false))).toBe('');
    // the explicit flag stands in for the field when the hook sits in agent frontmatter
    expect(call(event('git checkout x', MAIN, false), ['--subagent']).status).toBe(2);
  });

  it("a subagent's git checkout in a scratch worktree is allowed", () => {
    expect(verdict(event('git checkout d930f397', SCRATCH))).toBeNull();
    expect(verdict(event('git checkout x', '/private/tmp/bower-app-x'))).toBeNull();
    expect(verdict(event(`git -C ${SCRATCH} reset --hard`, MAIN))).toBeNull();
    expect(verdict(event(`cd ${SCRATCH} && git switch y`, MAIN))).toBeNull();
    expect(verdict(event('git show d930f397:src/a.ts', MAIN))).toBeNull();
    expect(verdict(event('git diff a..b', MAIN))).toBeNull();
    expect(verdict(event('git status', MAIN))).toBeNull();
  });
});
