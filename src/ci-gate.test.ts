// @vitest-environment node
/// <reference types="node" />
/**
 * ci-gate: GitHub Actions is the merge gate. `.github/workflows/gate.yml` runs every `check:run` step and the
 * `pnpm e2e` suites on a pushed `sdd/batch-*` branch; `scripts/ci-gate.sh` pushes that branch (never with force),
 * waits for the run and deletes the branch after integration. The script runs here with stand-ins for git and gh on
 * PATH, from a throwaway directory that is not a repository, so nothing reaches the network.
 *
 * The gh stand-in honours only the command shapes the script uses (`gh run list --repo --workflow --branch --commit
 * --json databaseId,headSha --jq ...` answers the id the jq filter would leave, only when every one of those flags
 * is there; `gh run watch <id> --exit-status`; `gh run view <id> --json conclusion --jq .conclusion`; `gh run view
 * <id> --log-failed`). It need not emulate any other gh flag.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/** Steps of a job, each as its own text block (list items two spaces under `steps:`). */
const stepsOf = (job: string): string[] => job.split(/^ {6}- /m).slice(1);
/** A job's keys before its steps: `if`, `needs`, `env`, `strategy`. */
const headOf = (job: string): string => job.split(/^ {4}steps:/m)[0] ?? '';
const SUITES = [
  { job: 'e2e-fake-phone', project: 'phone', fake: true, min: 8, max: 8 },
  { job: 'e2e-fake-desktop', project: 'desktop', fake: true, min: 8, max: 8 },
  { job: 'e2e-demo-desktop', project: 'desktop', fake: false, min: 6, max: 6 },
  // Only with `workflow_dispatch` and `full: true`: pnpm e2e:full also runs the demo on phone.
  { job: 'e2e-demo-phone', project: 'phone', fake: false, min: 2, max: 3 },
] as const;

describe('ci-gate workflow', () => {
  const yml = (): string => (existsSync(join(ROOT, WORKFLOW)) ? read(WORKFLOW) : '');
  const onBlock = (text: string): string => text.split(/^on:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';

  it('AC1 ci-gate-trigger: runs on push to sdd/batch-* and by hand, with no secret', () => {
    const text = yml();
    expect(text, `${WORKFLOW} exists`).not.toBe('');
    const on = onBlock(text);
    expect(on).toMatch(/push:[\s\S]*branches:[\s\S]*['"]?sdd\/batch-\*['"]?/);
    expect(on).toMatch(/workflow_dispatch/);
    expect(text).not.toMatch(/secrets\./);
    expect(text).toMatch(/permissions:\s*\n\s+contents:\s*read/);
  });

  it('AC1b ci-gate-dispatch-full: a full input runs e2e:full, and each branch has its own concurrency group', () => {
    const text = yml();
    expect(onBlock(text)).toMatch(/workflow_dispatch:\s*\n\s+inputs:\s*\n\s+full:[\s\S]*?type:\s*boolean/);
    // Per branch (github.ref), cancelling only the same branch's older run.
    expect(text).toMatch(/^concurrency:\s*\n\s+group:\s*gate-\$\{\{\s*github\.ref\s*\}\}\s*\n\s+cancel-in-progress:\s*true/m);
  });

  it('AC2 ci-gate-check-steps: every check:run step runs exactly once, in order, and blocks success', () => {
    const text = yml();
    const steps = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts['check:run']
      ?.split('&&')
      .map((s) => s.trim());
    expect(steps?.length).toBeGreaterThan(0);
    // The unit steps are sharded (`pnpm test --shard=i/n`); the step is still check:run's.
    const unshard = (l: string): string => l.replace(/ --shard=.*$/, '');
    const lines = new Set([...runLines(text)].map(unshard));
    expect((steps ?? []).filter((s) => !lines.has(s))).toEqual([]);
    // Each check step sits in exactly one step block, with no condition that could skip it.
    const all = [...jobs(text)].flatMap(([name, job]) => stepsOf(job).map((block, i) => ({ name, i, block })));
    const where = (steps ?? []).map((cmd) => all.filter((s) => [...runLines(s.block)].map(unshard).includes(cmd)));
    where.forEach((hits, k) => expect(hits.length, `${steps?.[k]} runs once`).toBe(1));
    for (const hit of where.flat()) expect(hit.block, `${hit.name}: a check step has no if or continue-on-error`).not.toMatch(/^\s+(if|continue-on-error):/m);
    // Within a job the check steps keep check:run's order (`pnpm build` before check-bundle).
    for (const name of new Set(where.flat().map((h) => h.name))) {
      const idx = where.map((hits) => hits[0]).filter((h) => h?.name === name).map((h) => h?.i ?? -1);
      expect(idx, `${name} keeps check:run order`).toEqual([...idx].sort((a, b) => a - b));
    }
    expect(text).not.toMatch(/continue-on-error|\|\|\s*true|set \+e/);
    // The check jobs are parallel: no job waits for another except the failure report.
    for (const [name, job] of jobs(text)) if (name !== 'e2e-report') expect(job, `${name} waits for nothing`).not.toMatch(/^ {4}needs:/m);
  });

  it('AC2c ci-gate-unit-shards: unit-app runs in 3 vitest shards and unit-runner in 2, every shard once', () => {
    const all = jobs(yml());
    for (const [job, cmd, total] of [['unit-app', 'pnpm test', 3], ['unit-runner', 'pnpm -C runner test', 2]] as const) {
      const body = all.get(job) ?? '';
      expect([...runLines(body)].filter((l) => l.startsWith(cmd)), `${job} runs its tests once`).toEqual([`${cmd} --shard=\${{ matrix.shard }}/${total}`]);
      const listed = (/shard:\s*\[([^\]]*)\]/.exec(headOf(body))?.[1] ?? '').split(',').map((n) => Number(n.trim()));
      expect(listed, `${job} runs every shard 1..${total}`).toEqual(Array.from({ length: total }, (_, i) => i + 1));
      expect(headOf(body)).toMatch(/fail-fast:\s*false/);
    }
  });

  it('AC2b ci-gate-setup: every job checks out, sets up pnpm 12.8.1 then Node 26 with a pnpm cache, installs frozen', () => {
    const all = [...jobs(yml())];
    expect(all.length).toBeGreaterThan(5);
    for (const [name, job] of all) {
      const [checkout, pnpm, node, install] = stepsOf(job);
      expect(job, `${name} runs on ubuntu-latest, bounded`).toMatch(/runs-on:\s*ubuntu-latest/);
      expect(job, `${name} has a timeout`).toMatch(/timeout-minutes:\s*\d+/);
      expect(checkout, `${name} checks out`).toMatch(/uses:\s*actions\/checkout@/);
      expect(pnpm, `${name} sets up pnpm first`).toMatch(/uses:\s*pnpm\/action-setup@[\s\S]*version:\s*['"]?12\.8\.1['"]?\s*$/);
      expect(node, `${name} then Node`).toMatch(/uses:\s*actions\/setup-node@[\s\S]*node-version:\s*['"]?26['"]?[\s\S]*cache:\s*['"]?pnpm['"]?/);
      expect(install, `${name} installs frozen`).toMatch(/run:\s*pnpm install --frozen-lockfile\s*$/);
    }
  });

  it('AC3 ci-gate-e2e-suites: fake on phone, fake on desktop and demo on desktop, each fully sharded; demo on phone when full', () => {
    const text = yml();
    const all = jobs(text);
    expect(text).not.toMatch(/E2E_BATCH/);
    for (const { job, project, fake, min, max } of SUITES) {
      const body = all.get(job);
      expect(body, `${job} exists`).toBeDefined();
      const head = headOf(body ?? '');
      const cmds = [...runLines(body ?? '')].filter((l) => /playwright test/.test(l));
      expect(cmds.length, `${job} runs playwright once`).toBe(1);
      const cmd = cmds[0] ?? '';
      const total = Number(/--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)\b/.exec(cmd)?.[1]);
      expect(total, `${job} has ${min}-${max} shards`).toBeGreaterThanOrEqual(min);
      expect(total).toBeLessThanOrEqual(max);
      const listed = (/shard:\s*\[([^\]]*)\]/.exec(head)?.[1] ?? '').split(',').map((n) => Number(n.trim()));
      expect(listed, `${job} runs every shard 1..${total}`).toEqual(Array.from({ length: total }, (_, i) => i + 1));
      expect(head).toMatch(/fail-fast:\s*false/);
      expect(cmd).toMatch(new RegExp(`^pnpm exec playwright test --project=${project} `));
      expect(cmd).toMatch(/--max-failures=5\b/);
      expect(cmd).toMatch(/--reporter=list,blob\b/);
      expect(cmd).toMatch(/--trace=retain-on-failure\b/);
      expect(cmd.match(/--project=/g)?.length).toBe(1);
      if (fake) expect(head, `${job} runs on the pretend Drive`).toMatch(/^ {4}env:\s*\n\s+E2E_SOURCE:\s*['"]?fake['"]?\s*$/m);
      else expect(body, `${job} runs on the demo`).not.toMatch(/E2E_SOURCE/);
      if (job === 'e2e-demo-phone') expect(head).toMatch(/^ {4}if:\s*\$\{\{\s*inputs\.full\s*\}\}\s*$/m);
      else expect(head, `${job} always runs`).not.toMatch(/^ {4}if:/m);
    }
  });

  it('AC4 ci-gate-failure-artifacts: blobs upload per shard on failure and one report merges them, only on failure', () => {
    const text = yml();
    const all = jobs(text);
    const names: string[] = [];
    for (const { job } of SUITES) {
      const ups = stepsOf(all.get(job) ?? '').filter((s) => /uses:\s*actions\/upload-artifact@/.test(s));
      expect(ups.length, `${job} uploads once`).toBe(1);
      const up = ups[0] ?? '';
      expect(up).toMatch(/if:\s*\$\{\{\s*failure\(\)\s*\}\}/);
      expect(up).toMatch(/path:\s*blob-report\/?\s*$/m);
      expect(up).toMatch(/retention-days:\s*\d+/);
      expect(up).toMatch(/if-no-files-found:\s*ignore/);
      const name = /^\s+name:\s*(blob-report-.+?)\s*$/m.exec(up)?.[1] ?? '';
      expect(name, `${job} names its blobs by job and shard`).toContain(job.replace(/^e2e-/, ''));
      expect(name).toContain('${{ matrix.shard }}');
      names.push(name);
    }
    expect(new Set(names).size, 'blob names are unique, so none overwrites another').toBe(names.length);
    // Every other upload is the report's.
    expect(text.match(/uses:\s*actions\/upload-artifact@/g)?.length).toBe(SUITES.length + 1);
    const report = all.get('e2e-report') ?? '';
    const head = headOf(report);
    for (const { job } of SUITES) expect(head, `the report waits for ${job}`).toContain(job);
    expect(head).toMatch(/^ {4}if:\s*\$\{\{\s*failure\(\)\s*\}\}\s*$/m);
    const rest = stepsOf(report).slice(4);
    const download = rest.find((s) => /uses:\s*actions\/download-artifact@/.test(s)) ?? '';
    expect(download).toMatch(/pattern:\s*blob-report-\*/);
    expect(download).toMatch(/path:\s*all-blob-reports\s*$/m);
    // Each artifact keeps its own folder, so zips with the same file name never overwrite one another; merging reads one flat folder.
    const lines = [...runLines(report)];
    expect(lines.some((l) => /^find all-blob-reports -mindepth 2 -name '\*\.zip'/.test(l)), 'the blobs are flattened with unique names').toBe(true);
    expect(lines).toContain('pnpm exec playwright merge-reports --reporter html ./all-blob-reports');
    // The report job itself runs only after a failure, so its upload carries no condition of its own.
    const up = rest.find((s) => /uses:\s*actions\/upload-artifact@/.test(s)) ?? '';
    expect(up).toMatch(/path:\s*playwright-report\/?\s*$/m);
    expect(up).not.toMatch(/^\s+if:/m);
    const merge = rest.findIndex((s) => /merge-reports/.test(s));
    expect(rest.indexOf(download)).toBeLessThan(merge);
    expect(merge).toBeLessThan(rest.indexOf(up));
  });

  it('AC5 ci-gate-no-lock-no-force: no job goes through the macOS lock or the local gate scripts, and none pushes', () => {
    const text = yml();
    expect(text).not.toBe('');
    expect(text).not.toMatch(/with-lock|\blockf\b|e2e-both/);
    expect(text).not.toMatch(/\bpnpm (check|e2e)\b/);
    expect(text).not.toMatch(/git push|--force|\bpush -f\b/);
    // Each job is its own machine: this pair only tells the worker budget it holds the lock (testing/workers.ts).
    const env = text.split(/^env:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
    const lock = /^\s+HARNESS_LOCK:\s*(\S+)\s*$/m.exec(env)?.[1];
    expect(lock, 'workflow env sets HARNESS_LOCK').toBeDefined();
    expect(env).toMatch(new RegExp(`^\\s+HARNESS_LOCK_HELD:\\s*${lock}\\s*$`, 'm'));
    expect(text.match(/HARNESS_\w+/g)?.sort()).toEqual(['HARNESS_LOCK', 'HARNESS_LOCK_HELD']);
  });
});

describe('ci-gate script', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const B1 = 'sdd/batch-b1';
  const B2 = 'sdd/batch-b2';
  const GIT = `#!/bin/sh
printf 'git %s\\n' "$*" >> "$CALLS"
case "$*" in
  rev-parse*) [ "$GIT_FAIL" = revparse ] && exit 1; printf '%s\\n' "$SHA" ;;
  push*) [ "$GIT_FAIL" = push ] && exit 1 ;;
esac
exit 0
`;
  const GH = `#!/bin/sh
printf 'gh %s\\n' "$*" >> "$CALLS"
case "$*" in
  "run list"*)
    [ -n "$LIST_FAIL" ] && exit 1
    n=$(cat "$WORK/lists" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$WORK/lists"
    [ "$n" -le "\${LIST_AFTER:-0}" ] && exit 0
    case "$*" in *--json*databaseId*headSha*) ;; *) exit 0 ;; esac
    for want in "--repo deluispablo/bower" "--workflow gate.yml" "--commit $SHA"; do
      case "$*" in *"$want"*) ;; *) exit 0 ;; esac
    done
    case "$*" in
      *"--branch sdd/batch-b2"*) echo 4343 ;;
      *"--branch sdd/batch-b1"*) echo 4242 ;;
    esac ;;
  "run watch"*) case "$*" in *--exit-status*) exit "\${WATCH:-0}" ;; esac ;;
  "run view"*--log-failed*)
    [ -n "$LOG_FAIL" ] && exit 1
    i=1; while [ "$i" -le "\${LOG_LINES:-1}" ]; do echo "LOG-LINE-$i"; i=$((i+1)); done ;;
  "run view"*) [ -n "$VIEW_FAIL" ] && exit 1; echo "$CONCLUSION" ;;
esac
exit 0
`;

  function run(args: string[], env: Record<string, string> = {}): { status: number | null; out: string; calls: string[]; lists: number } {
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
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: work, CALLS: calls, WORK: work, SHA, CONCLUSION: 'success', CI_GATE_POLL_SECONDS: '0', CI_GATE_POLL_TRIES: '5', ...env },
    });
    const lists = existsSync(join(work, 'lists')) ? Number(readFileSync(join(work, 'lists'), 'utf8')) : 0;
    return { status: res.status, out: `${res.stdout}${res.stderr}`, calls: readFileSync(calls, 'utf8').split('\n').filter(Boolean), lists };
  }
  const pushes = (calls: string[]): string[] => calls.filter((c) => /^git push\b/.test(c));
  const ghCalls = (calls: string[]): string[] => calls.filter((c) => c.startsWith('gh '));

  it('AC6 ci-gate-script-batch-only: refuses any branch but sdd/batch-*, before any push or gh call', () => {
    expect(existsSync(join(ROOT, SCRIPT)), `${SCRIPT} exists`).toBe(true);
    const bad = ['main', 'sdd/ci-gate', 'sdd/batch-1:main', 'sdd/batch-1:refs/heads/main', '+sdd/batch-1', '-f', '--force', '', 'sdd/batch-', 'sdd/batch-a/b', 'sdd/batch-1 ', ' sdd/batch-1', 'sdd/batch-1\n', 'sdd/batch-1\nmain', 'sdd/batch-1 main', 'refs/heads/sdd/batch-1'];
    const argSets = [
      ...bad.flatMap((b) => [[b], ['--cleanup', b]]),
      [], ['--cleanup'], [B1, 'extra'], [B1, B2], ['--cleanup', B1, 'extra'], ['--cleanup', B1, '--cleanup'], ['--cleanup', '--cleanup', B1], ['--clean', B1], [B1, '--cleanup'],
    ];
    for (const args of argSets) {
      const r = run(args);
      const shown = JSON.stringify(args);
      expect(r.status, `${shown} is refused`).not.toBe(0);
      expect(r.out.trim(), `${shown} says why`).not.toBe('');
      expect(r.calls, `${shown} calls nothing`).toEqual([]);
    }
  });

  it('AC7 ci-gate-script-push: pushes the batch branch to backup without force, then reports success', () => {
    const r = run([B1]);
    expect(r.status, r.out).toBe(0);
    const p = pushes(r.calls);
    expect(p.length).toBe(1);
    expect(p[0]).toMatch(/^git push backup (refs\/heads\/)?sdd\/batch-b1(:(refs\/heads\/)?sdd\/batch-b1)?$/);
    // Git is only asked for the pushed commit and the push.
    expect(r.calls.filter((c) => c.startsWith('git ') && !/^git (push|rev-parse)\b/.test(c))).toEqual([]);
    expect(r.out).toMatch(/success/);
  });

  it('AC7b ci-gate-script-lookup: finds the run by repository, workflow, branch and pushed commit, then waits for that run', () => {
    const r = run([B1]);
    expect(r.status, r.out).toBe(0);
    const firstGh = r.calls.findIndex((c) => c.startsWith('gh '));
    expect(r.calls.findIndex((c) => c.startsWith('git push')), 'the push comes first').toBeLessThan(firstGh);
    const list = r.calls.find((c) => c.startsWith('gh run list')) ?? '';
    for (const flag of ['--repo deluispablo/bower', '--workflow gate.yml', `--branch ${B1}`, `--commit ${SHA}`]) expect(list).toContain(flag);
    expect(list).toMatch(/--json databaseId,headSha\b/);
    expect(r.calls.some((c) => /^gh run watch 4242\b.*--exit-status/.test(c)), 'waits on the run it found').toBe(true);
    expect(r.calls.some((c) => /^gh run view 4242\b/.test(c)), 'reads the conclusion of that run').toBe(true);
    expect(ghCalls(r.calls).filter((c) => /^gh run (watch|view) /.test(c) && !/ 4242\b/.test(c))).toEqual([]);
  });

  it('AC7c ci-gate-script-polling: run discovery is bounded; a late run is found, none, or a lookup error fails in one sentence', () => {
    const late = run([B1], { LIST_AFTER: '2' });
    expect(late.status, late.out).toBe(0);
    expect(late.lists).toBe(3);
    const failing: Record<string, string>[] = [{ LIST_AFTER: '999', CI_GATE_POLL_TRIES: '3' }, { LIST_FAIL: '1', CI_GATE_POLL_TRIES: '3' }];
    for (const env of failing) {
      const r = run([B1], env);
      expect(r.status, JSON.stringify(env)).not.toBe(0);
      expect(r.out).toMatch(/no run/i);
      expect(r.out.trim().split('\n').length, 'one sentence').toBe(1);
      expect(r.calls.filter((c) => /^gh run (watch|view)/.test(c)), 'nothing to watch').toEqual([]);
    }
    expect(run([B1], { LIST_AFTER: '999', CI_GATE_POLL_TRIES: '3' }).lists).toBe(3);
  });

  it('AC7d ci-gate-script-two-batches: two batches in flight each wait for their own run', () => {
    const [one, two] = [run([B1]), run([B2])];
    expect(one.status, one.out).toBe(0);
    expect(two.status, two.out).toBe(0);
    expect(one.calls.some((c) => /^gh run watch 4242\b/.test(c))).toBe(true);
    expect(two.calls.some((c) => /^gh run watch 4343\b/.test(c))).toBe(true);
    expect(two.calls.filter((c) => / 4242\b/.test(c))).toEqual([]);
    expect(pushes(two.calls)).toEqual([`git push backup ${B2}`]);
  });

  it('AC8 ci-gate-script-failure: a failed run exits non-zero with the conclusion and the failing log tail', () => {
    const r = run([B1], { WATCH: '1', CONCLUSION: 'failure', LOG_LINES: '300' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/failure/);
    expect(r.calls.some((c) => /^gh run view 4242\b.*--log-failed/.test(c))).toBe(true);
    // The tail of the log, 150 lines.
    expect(r.out).toContain('LOG-LINE-300');
    expect(r.out).toContain('LOG-LINE-151');
    expect(r.out).not.toContain('LOG-LINE-150\n');
  });

  it('AC8b ci-gate-script-no-false-green: only a watched run whose conclusion is success exits 0', () => {
    for (const [WATCH, CONCLUSION] of [['1', 'success'], ['130', 'success'], ['0', 'cancelled'], ['1', 'cancelled'], ['0', 'timed_out'], ['0', 'skipped'], ['0', ''], ['1', ''], ['0', 'failure'], ['1', 'failure']] as const) {
      const r = run([B1], { WATCH, CONCLUSION });
      expect(r.status, `watch ${WATCH}, conclusion "${CONCLUSION}" is not a pass`).not.toBe(0);
      expect(r.out, `watch ${WATCH}, conclusion "${CONCLUSION}" never says the gate passed`).not.toMatch(/\bgate passed\b/i);
    }
    // gh failing to give the conclusion, or the log, is a failure that still says so.
    const view = run([B1], { VIEW_FAIL: '1' });
    expect(view.status).not.toBe(0);
    const log = run([B1], { WATCH: '1', CONCLUSION: 'failure', LOG_FAIL: '1' });
    expect(log.status).not.toBe(0);
    expect(log.out).toMatch(/failure/);
  }, 60_000);

  it('AC8c ci-gate-script-git-failure: a failed push or a branch git does not know never reaches gh or succeeds', () => {
    const push = run([B1], { GIT_FAIL: 'push' });
    expect(push.status).not.toBe(0);
    expect(ghCalls(push.calls)).toEqual([]);
    const known = run([B1], { GIT_FAIL: 'revparse' });
    expect(known.status).not.toBe(0);
    expect(pushes(known.calls)).toEqual([]);
    expect(ghCalls(known.calls)).toEqual([]);
  });

  it('AC9 ci-gate-script-cleanup: --cleanup deletes only the remote batch branch and keeps every local ref', () => {
    const r = run(['--cleanup', B1]);
    expect(r.status, r.out).toBe(0);
    expect(r.calls).toEqual([`git push backup --delete ${B1}`]);
    const failed = run(['--cleanup', B1], { GIT_FAIL: 'push' });
    expect(failed.status).not.toBe(0);
    expect(failed.calls).toEqual([`git push backup --delete ${B1}`]);
  });

  it('AC10 ci-gate-script-never-force: the script text never force-pushes, and it is executable', () => {
    const text = existsSync(join(ROOT, SCRIPT)) ? read(SCRIPT) : '';
    expect(text).not.toBe('');
    expect(text).not.toMatch(/--force|--mirror|push[^\n]*\s-[a-zA-Z]*f\b|push[^\n]*\s['"]?\+/);
    expect(text).not.toMatch(/\/tmp\//);
    expect(statSync(join(ROOT, SCRIPT)).mode & 0o111, `${SCRIPT} is executable (documented as run directly)`).not.toBe(0);
  });
});

describe('ci-gate docs', () => {
  it('AC11 ci-gate-docs: CLAUDE.md, README and the runbook make CI the merge gate and allow only batch pushes', () => {
    const claude = read('CLAUDE.md');
    const gates = claude.split('\n').find((l) => l.startsWith('Gates:')) ?? '';
    expect(gates).toMatch(/scripts\/ci-gate\.sh sdd\/batch-N/);
    expect(gates).toMatch(/pnpm check/);
    expect(gates).toMatch(/e2e:fake/);
    const rule = claude.split('\n').find((l) => l.includes('deluispablo/bower`')) ?? '';
    expect(rule).toMatch(/sdd\/batch-\*/);
    expect(rule).toMatch(/never force|no force/i);
    expect(rule).toMatch(/delet/i);
    expect(read('README.md')).toMatch(/scripts\/ci-gate\.sh sdd\/batch-N/);
    const runbook = read('docs/runbook.md');
    const section = runbook.split(/^## The CI gate\s*$/m)[1]?.split(/^## /m)[0] ?? '';
    expect(section, 'the runbook has "## The CI gate"').not.toBe('');
    expect(section).toMatch(/scripts\/ci-gate\.sh sdd\/batch-N/);
    expect(section).toMatch(/scripts\/ci-gate\.sh --cleanup sdd\/batch-N/);
    expect(section).toMatch(/artifact/i);
    expect(section).toMatch(/not a backup/i);
    expect(section).toMatch(/first green run/i);
    expect(section).toMatch(/full/);
  });
});
