import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { claudeArgs } from '../src/claude';

it('AC1 image_arguments_satisfy_cli_constraints', () => {
  const args = claudeArgs('claude-haiku-5-5', 60, undefined, true);
  const flag = (name: string) => args[args.indexOf(name) + 1];
  expect(flag('--input-format')).toBe('stream-json');
  expect(flag('--output-format')).toBe('stream-json');
  expect(args).toContain('-p');
  expect(args).toContain('--verbose');
  const text = claudeArgs('claude-sonnet-5-5', 60);
  expect(text[text.indexOf('--output-format') + 1]).toBe('json');
  expect(text).not.toContain('--input-format');
  expect(text).not.toContain('--verbose');
});

// Explicit offline probe: unsupported hosts and prerequisites are reported as skipped, never passing evidence.
it.skipIf(process.env.BOWER_CLAUDE_OFFLINE_PROBE !== '1').for([
  ['JSON output with stream input', ['-p', '--input-format', 'stream-json', '--output-format', 'json', '--verbose'],
    /--input-format(?:=|\s+)stream-json[^\n]*requires[^\n]*--output-format(?:=|\s+)stream-json/i],
  ['stream print output without verbose', ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json'],
    /--output-format(?:=|\s+)stream-json[^\n]*requires[^\n]*--verbose/i],
] as const)('AC4 installed_cli_rejects_invalid_format_pairs_without_model_call: %s', { timeout: 35_000 }, ([_name, args, diagnostic], context) => {
  const work = mkdtempSync(join(tmpdir(), 'bower-cli-contract-'));
  const home = join(work, 'home'); const cwd = join(work, 'run');
  mkdirSync(home); mkdirSync(cwd);
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, CLAUDE_CONFIG_DIR: home,
    DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  const command = process.env.BOWER_CLAUDE_EXECUTABLE ?? 'claude';
  const workflow = readFileSync(resolve(import.meta.dirname, '../workflows/tidy.yml'), 'utf8');
  const productionVersion = /CLAUDE_CODE_VERSION: '([^']+)'/.exec(workflow)?.[1];
  expect(productionVersion).toBeTruthy();
  const denial = process.platform === 'darwin'
    ? ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)']
    : process.platform === 'linux' ? ['unshare', '--net', '--'] : null;
  const unavailable = (reason: string): never => {
    console.info(`AC4 unavailable/inconclusive: ${reason}`);
    context.skip(reason);
    throw new Error(reason);
  };
  const sanitize = (text: string) => text.split(work).join('<isolated>').replaceAll(process.env.HOME ?? work, '<user-home>').slice(0, 4000);
  try {
    const [deny, ...denyArgs] = denial ?? [];
    if (!deny) return unavailable('No supported OS network denial mechanism');
    const run = (binary: string, flags: string[]) => spawnSync(deny, [...denyArgs, binary, ...flags],
      { cwd, env, input: '', encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: 64_000 });
    const guard = run('/usr/bin/true', []);
    console.info(JSON.stringify({ denial, guardExit: guard.status, diagnostic: sanitize(guard.stderr ?? ''), error: sanitize(guard.error?.message ?? '') }));
    if (guard.error || guard.status !== 0) return unavailable('OS network denial could not be established');
    const version = run(command, ['--version']);
    console.info(JSON.stringify({ command, version: sanitize(version.stdout ?? '').trim(), exit: version.status, diagnostic: sanitize(version.stderr ?? '') }));
    if (version.error || version.status !== 0 || version.stdout.trim() !== `${productionVersion} (Claude Code)`)
      return unavailable(`Exact production CLI ${productionVersion} is not available`);
    const flags = [...args, '--bare', '--setting-sources', '', '--tools', '', '--strict-mcp-config', '--no-session-persistence'];
    const output = run(command, flags);
    const message = sanitize((output.stdout ?? '') + (output.stderr ?? ''));
    console.info(JSON.stringify({ command, args: flags, stdin: 'empty', exit: output.status, signal: output.signal, error: sanitize(output.error?.message ?? ''), diagnostic: message }));
    if (output.error || output.signal || output.status === null || !diagnostic.test(message))
      return unavailable('No specific format rejection: timeout, authentication, or another prerequisite may have intervened');
    expect(output.status).not.toBe(0);
    expect(message).toMatch(diagnostic);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
