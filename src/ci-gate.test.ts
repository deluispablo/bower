// @vitest-environment node
/// <reference types="node" />
/**
 * ci-gate: GitHub Actions is the merge gate. `.github/workflows/gate.yml` runs every `check:run` step and the
 * `pnpm e2e` suites on a pushed `sdd/batch-*` branch; `scripts/ci-gate.sh` pushes that branch (never with force),
 * waits for the run and deletes the branch after integration. The script runs here with stand-ins for git and gh on
 * PATH, from a throwaway directory that is not a repository, so nothing reaches the network.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const WORKFLOW = '.github/workflows/gate.yml';
const SCRIPT = 'scripts/ci-gate.sh';

/** The workflow's jobs, each as its own text block (two-space keys under `jobs:`). */
function jobs(yml: string): Map<string, string> {
  const body = yml.split(/^jobs:\s*$/m)[1] ?? '';
  const out = new Map<string, string>();
  for (const block of body.split(/^(?= {2}[A-Za-z0-9_-]+:\s*$)/m)) {
    const name = /^ {2}([A-Za-z0-9_-]+):/.exec(block)?.[1];
    if (name) out.set(name, block);
  }
  return out;
}

/** Every command line the workflow runs: `run: <cmd>` lines and the lines of `run: |` blocks, trimmed. */
function runLines(yml: string): Set<string> {
  const lines = yml.split('\n');
  const out = new Set<string>();
  lines.forEach((line, i) => {
    const at = line.search(/\brun:/);
    if (at < 0 || !/^\s*(- )?run:/.test(line)) return;
    const rest = line.slice(at + 4).trim();
    if (rest !== '|' && rest !== '>') return void out.add(rest);
    // A block scalar's lines are indented past the `run:` key.
    for (const next of lines.slice(i + 1)) {
      if (next.trim() === '') continue;
      if (next.length - next.trimStart().length <= at) break;
      out.add(next.trim());
    }
  });
  return out;
}

const e2eJob = (yml: string, project: 'phone' | 'desktop', fake: boolean): string | undefined =>
  [...jobs(yml).values()].find(
    (job) =>
      /playwright test/.test(job) &&
      new RegExp(`--project=${project}\\b`).test(job) &&
      /--shard=/.test(job) &&
      /E2E_SOURCE:\s*['"]?fake['"]?/.test(job) === fake,
  );

describe('ci-gate workflow', () => {
  const yml = (): string => (existsSync(join(ROOT, WORKFLOW)) ? read(WORKFLOW) : '');

  it('AC1 ci-gate-trigger: runs on push to sdd/batch-* and by hand, with no secret', () => {
    const text = yml();
    expect(text, `${WORKFLOW} exists`).not.toBe('');
    const on = text.split(/^on:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
    expect(on).toMatch(/push:[\s\S]*branches:[\s\S]*['"]?sdd\/batch-\*['"]?/);
    expect(on).toMatch(/workflow_dispatch/);
    expect(text).not.toMatch(/secrets\./);
    expect(text).toMatch(/permissions:\s*\n\s+contents:\s*read/);
  });

  it('AC2 ci-gate-check-steps: every check:run step runs, set up with pinned pnpm and Node and a pnpm cache', () => {
    const text = yml();
    const steps = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts['check:run']
      ?.split('&&')
      .map((s) => s.trim());
    expect(steps?.length).toBeGreaterThan(0);
    const lines = runLines(text);
    expect((steps ?? []).filter((s) => !lines.has(s))).toEqual([]);
    expect(text).toMatch(/uses:\s*pnpm\/action-setup@/);
    expect(text).toMatch(/uses:\s*actions\/setup-node@[\s\S]*?cache:\s*['"]?pnpm['"]?/);
    expect(text).toMatch(/pnpm install --frozen-lockfile/);
  });

  it('AC3 ci-gate-e2e-suites: fake on phone, fake on desktop and demo on desktop, each sharded', () => {
    const text = yml();
    expect(e2eJob(text, 'phone', true), 'a job runs the fake suite on phone').toBeDefined();
    expect(e2eJob(text, 'desktop', true), 'a job runs the fake suite on desktop').toBeDefined();
    expect(e2eJob(text, 'desktop', false), 'a job runs the demo suite on desktop').toBeDefined();
  });

  it('AC4 ci-gate-failure-artifacts: reports and traces upload only on failure, merged from blob reports', () => {
    const text = yml();
    const uploads = text.split(/\n\s*- /).filter((step) => /uses:\s*actions\/upload-artifact@/.test(step));
    expect(uploads.length).toBeGreaterThan(0);
    for (const step of uploads) expect(step).toMatch(/if:\s*(\$\{\{\s*)?failure\(\)/);
    expect(text).toMatch(/--reporter=[\w,]*blob/);
    expect(text).toMatch(/--trace=retain-on-failure/);
    expect(text).toMatch(/playwright merge-reports/);
  });

  it('AC5 ci-gate-no-lock-no-force: no job goes through the macOS lock or the local gate scripts, and none pushes', () => {
    const text = yml();
    expect(text).not.toBe('');
    expect(text).not.toMatch(/with-lock|\blockf\b|e2e-both|HARNESS_LOCK/);
    expect(text).not.toMatch(/\bpnpm (check|e2e)\b/);
    expect(text).not.toMatch(/git push|--force|\bpush -f\b/);
  });
});

describe('ci-gate script', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const GIT = `#!/bin/sh
printf 'git %s\\n' "$*" >> "$CALLS"
case "$*" in
  *--show-toplevel*) printf '%s\\n' "$WORK" ;;
  rev-parse*) printf '%s\\n' 0123456789abcdef0123456789abcdef01234567 ;;
esac
exit 0
`;
  /** gh: run list prints the run id (as --jq '.[0].databaseId' would); run watch exits $WATCH; run view prints the conclusion, or a log tail with --log-failed. */
  const GH = `#!/bin/sh
printf 'gh %s\\n' "$*" >> "$CALLS"
case "$*" in
  "run list"*) echo 4242 ;;
  "run watch"*) exit "\${WATCH:-0}" ;;
  "run view"*--log-failed*) echo "LOG-TAIL: a check step failed" ;;
  "run view"*) echo "$CONCLUSION" ;;
esac
exit 0
`;

  function run(args: string[], env: Record<string, string> = {}): { status: number | null; out: string; calls: string[] } {
    const work = mkdtempSync(join(tmpdir(), 'ci-gate-'));
    dirs.push(work);
    const bin = join(work, 'bin');
    mkdirSync(bin);
    mkdirSync(join(work, 'scripts'));
    for (const [name, body] of [['git', GIT], ['gh', GH]] as const) {
      writeFileSync(join(bin, name), body);
      chmodSync(join(bin, name), 0o755);
    }
    const script = join(work, SCRIPT);
    if (existsSync(join(ROOT, SCRIPT))) copyFileSync(join(ROOT, SCRIPT), script);
    const calls = join(work, 'calls.log');
    writeFileSync(calls, '');
    const res = spawnSync('/bin/bash', [script, ...args], {
      cwd: work,
      encoding: 'utf8',
      input: '',
      timeout: 20_000,
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: work, CALLS: calls, WORK: work, CONCLUSION: 'success', ...env },
    });
    return { status: res.status, out: `${res.stdout}${res.stderr}`, calls: readFileSync(calls, 'utf8').split('\n').filter(Boolean) };
  }
  const pushes = (calls: string[]): string[] => calls.filter((c) => /^git push\b/.test(c));

  it('AC6 ci-gate-script-batch-only: refuses any branch but sdd/batch-*, before any push or gh call', () => {
    expect(existsSync(join(ROOT, SCRIPT)), `${SCRIPT} exists`).toBe(true);
    for (const branch of ['main', 'sdd/ci-gate', 'sdd/batch-1:main', 'sdd/batch-1:refs/heads/main', '+sdd/batch-1', '-f', '--force', '']) {
      for (const args of [[branch], ['--cleanup', branch]]) {
        const r = run(args);
        expect(r.status, `${args.join(' ')} is refused`).not.toBe(0);
        expect(pushes(r.calls), `${args.join(' ')} pushes nothing`).toEqual([]);
        expect(r.calls.filter((c) => c.startsWith('gh ')), `${args.join(' ')} asks gh nothing`).toEqual([]);
      }
    }
  });

  it('AC7 ci-gate-script-push: pushes the batch branch to backup without force, then reports success', () => {
    const r = run(['sdd/batch-20261017-b1']);
    expect(r.status, r.out).toBe(0);
    const p = pushes(r.calls);
    expect(p.length).toBe(1);
    expect(p[0]).toMatch(/^git push backup (refs\/heads\/)?sdd\/batch-20261017-b1(:(refs\/heads\/)?sdd\/batch-20261017-b1)?$/);
    expect(r.calls.some((c) => /^gh run (watch|view)\b/.test(c))).toBe(true);
    expect(r.out).toMatch(/success/);
  });

  it('AC8 ci-gate-script-failure: a failed run exits non-zero with the conclusion and the failing log tail', () => {
    const r = run(['sdd/batch-20261017-b1'], { WATCH: '1', CONCLUSION: 'failure' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/failure/);
    expect(r.out).toMatch(/LOG-TAIL: a check step failed/);
  });

  it('AC9 ci-gate-script-cleanup: --cleanup deletes only the remote batch branch', () => {
    const r = run(['--cleanup', 'sdd/batch-20261017-b1']);
    expect(r.status, r.out).toBe(0);
    expect(pushes(r.calls)).toEqual(['git push backup --delete sdd/batch-20261017-b1']);
  });

  it('AC10 ci-gate-script-never-force: the script text never force-pushes', () => {
    const text = existsSync(join(ROOT, SCRIPT)) ? read(SCRIPT) : '';
    expect(text).not.toBe('');
    expect(text).not.toMatch(/--force|--mirror|push[^\n]*\s-[a-zA-Z]*f\b|push[^\n]*\s['"]?\+/);
  });
});

describe('ci-gate docs', () => {
  it('AC11 ci-gate-docs: CLAUDE.md, README and the runbook make CI the merge gate and allow only batch pushes', () => {
    const claude = read('CLAUDE.md');
    expect(claude).toMatch(/scripts\/ci-gate\.sh/);
    const rule = claude.split('\n').find((l) => l.includes('deluispablo/bower-app')) ?? '';
    expect(rule).toMatch(/sdd\/batch-\*/);
    expect(rule).toMatch(/no force/i);
    expect(rule).toMatch(/delet/i);
    expect(read('README.md')).toMatch(/scripts\/ci-gate\.sh/);
    expect(read('docs/runbook.md')).toMatch(/scripts\/ci-gate\.sh --cleanup/);
  });
});
