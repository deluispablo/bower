/// <reference types="node" />
/** The PreToolUse hook that keeps gate output out of an agent's context (TL-P2-44 rule 7). */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, checked by these tests
import { quietGate } from '../scripts/quiet-gates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = (input: unknown): string =>
  execFileSync('node', [join(ROOT, 'scripts/quiet-gates.mjs')], { input: JSON.stringify(input), encoding: 'utf8' });

describe('the quiet-gates hook', () => {
  it('sends a plain gate command to a log and shows only failures and the tail', () => {
    for (const command of ['pnpm check', 'pnpm test', 'pnpm e2e:fake', 'E2E_SOURCE=fake pnpm exec playwright test -g "the inbox"', 'pnpm exec vitest run src/x.test.ts']) {
      const quiet = quietGate(command) as string;
      expect(quiet, command).toContain(command);
      expect(quiet, command).toMatch(/> "\$log" 2>&1/);
      expect(quiet, command).toMatch(/tail -15 "\$log"/);
      expect(quiet, command).toMatch(/exit \$s\)$/);
    }
  });

  it('leaves alone anything else, including gates the agent already redirects or chains', () => {
    for (const command of ['git status', 'pnpm check > /tmp/a.log 2>&1', 'pnpm check && rm -rf x', 'pnpm test; echo hi', 'pnpm check | tail', 'pnpm install', 'echo pnpm check']) {
      expect(quietGate(command), command).toBeNull();
    }
  });

  it('keeps the exit status and the failures of a failing gate', () => {
    const quiet = quietGate('pnpm exec vitest run src/no-such-file.test.ts') as string;
    const out = execFileSync('bash', ['-c', `${quiet} || echo "status $?"`], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/No test files found/);
    expect(out).toMatch(/status 1/);
  });

  it('answers Claude Code with the rewritten command, and stays silent otherwise', () => {
    const answer = JSON.parse(hook({ tool_name: 'Bash', tool_input: { command: 'pnpm check', description: 'Run the gates' } })) as {
      hookSpecificOutput: { hookEventName: string; updatedInput: { command: string; description: string } };
    };
    expect(answer.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(answer.hookSpecificOutput.updatedInput.description).toBe('Run the gates');
    expect(answer.hookSpecificOutput.updatedInput.command).toMatch(/> "\$log" 2>&1/);
    expect(hook({ tool_name: 'Bash', tool_input: { command: 'git status' } })).toBe('');
  });
});
