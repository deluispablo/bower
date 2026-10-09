/// <reference types="node" />
/** The PreToolUse hook that allows only the backup push of main (c3-permissions, BACKUP.md), and the deny rules. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = 'git push backup refs/heads/main:refs/heads/main';
// The PreToolUse input shape from https://code.claude.com/docs/en/hooks
const event = (command: string, cwd = '/Users/deluisp/Projects/bower-app') => ({
  session_id: 's1',
  cwd,
  permission_mode: 'default',
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command, description: 'x', run_in_background: false },
  tool_use_id: 'toolu_1',
});
const decide = (command: string): 'allow' | 'deny' | 'none' => {
  const r = spawnSync('node', [join(ROOT, 'scripts/guard-push.mjs')], { input: JSON.stringify(event(command)), encoding: 'utf8' });
  if (r.stdout.trim() === '') return 'none';
  const out = JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; permissionDecision: 'allow' | 'deny' } };
  expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
  return out.hookSpecificOutput.permissionDecision;
};

describe('the push hook', () => {
  it('only the backup push of main is allowed', () => {
    expect(decide(BACKUP)).toBe('allow');
    expect(decide(`  ${BACKUP}\n`)).toBe('allow');
    expect(decide('git push')).toBe('deny');
    expect(decide('git push origin main')).toBe('deny');
    expect(decide('git status')).toBe('none');
    expect(decide('pnpm check')).toBe('none');
  });

  it('a forced or other-ref push is refused', () => {
    for (const command of [
      `${BACKUP} --force`,
      'git push --force backup refs/heads/main:refs/heads/main',
      'git push -f backup refs/heads/main:refs/heads/main',
      'git push backup +refs/heads/main:refs/heads/main',
      'git push backup refs/heads/claude/p3:refs/heads/main',
      'git push backup refs/heads/main:refs/heads/other',
      'git push backup --all',
      'git push --tags backup',
      'git push origin refs/heads/main:refs/heads/main',
      'git push --force-with-lease',
      `git -C /tmp/x push backup refs/heads/main:refs/heads/main`,
      `cd /tmp && ${BACKUP}`,
      `${BACKUP} && git push origin x`,
      `echo $(git push origin x)`,
    ]) {
      expect(decide(command), command).toBe('deny');
    }
  });

  it('settings deny edits to the landing export and reads of env files', () => {
    const settings = JSON.parse(readFileSync(join(ROOT, '.claude/settings.json'), 'utf8')) as { permissions?: { deny?: string[] } };
    const deny = settings.permissions?.deny ?? [];
    expect(deny).toEqual(expect.arrayContaining(['Edit(public/landing/**)', 'Write(public/landing/**)', 'Read(.env*)']));
    // A hook allow cannot override a deny rule (permissions docs), so the backup push must not be denied by a rule.
    expect(deny.filter((rule) => /git push/.test(rule))).toEqual([]);
  });
});
