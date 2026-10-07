/// <reference types="node" />
/** Things the repository promises its agents and its pages, checked. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('what the repository promises', () => {
  it('AGENTS.md keeps the copy and brand rules', () => {
    const map = read('AGENTS.md');
    expect(map).toMatch(/never "the bird" in copy/);
    expect(map).toMatch(/--brand-line/);
    expect(map).toMatch(/do not edit it by hand/);
  });

  it('the landing has no placeholder the browser would parse', () => {
    const html = read('public/landing/index.html');
    expect(html.match(/\s(d|fill|stroke|opacity|marker-end|points|transform|viewBox)="[^"]*\{\{/g) ?? []).toEqual([]);
    expect(read('scripts/fix-landing.mjs')).toMatch(/sc-camel-/);
  });

  it('no stale comment says the pretend Drive starts over on reload', () => {
    expect(read('e2e/qa5.spec.ts')).not.toMatch(/starts the pretend Drive again, so the folder is missing again/);
  });

  it("the fixture says how its timeline dates work", () => {
    expect(read('src/data/demo/fixture.ts')).toMatch(/Timeline dates are fixed text/);
  });

  it('the docs say which writes check what (a content write passes its modifiedTime; a move or rename checks name and place)', () => {
    for (const doc of ['AGENTS.md', 'docs/superpowers/plans/2026-10-04-phase-2-app-logic.md']) {
      const text = read(doc);
      expect(text, doc).not.toMatch(/every write passes the modifiedTime/);
      expect(text, doc).toMatch(/content write passes the modifiedTime it read/);
      expect(text, doc).toMatch(/move or rename checks the name and place it read/);
    }
    expect(read('docs/superpowers/plans/2026-10-04-phase-2-ledger.md')).toMatch(/Ruling: a move or rename is not a content conflict/);
  });

  it('the code says why the outbox stays at sign-out', () => {
    expect(read('src/data/device.ts')).toMatch(/The journal outbox \(`bower:outbox:<folder>`\) stays at sign-out/);
    expect(read('AGENTS.md')).toMatch(/outbox stays at sign-out/);
  });

  it('the contract says journal records are unique by id', () => {
    expect(read('docs/specs/2026-10-04-worker-contract.md')).toMatch(/Journal records are unique by `id`: a runner keeps one per id and archives every copy/);
  });

  it('the landing has no jargon where it says what a tidy-up does', () => {
    const html = read('public/landing/index.html');
    expect(html).not.toMatch(/using PARA unless your rules say otherwise/);
    expect(html).toMatch(/in folders by how soon you need things/);
  });

  it('a new agent is sent to the handoff, and the handoff has the plan and the traps', () => {
    expect(read('AGENTS.md')).toMatch(/docs\/harness\/HANDOFF\.md/);
    expect(read('AGENTS.md')).toMatch(/docs\/PHASES\.md/);
    const phases = read('docs/PHASES.md');
    for (const n of [1, 2, 3, 4]) expect(phases, `phase ${n}`).toMatch(new RegExp(`## Phase ${n}:`));
    const handoff = read('docs/harness/HANDOFF.md');
    for (const part of ['## Where things stand', '## The plan, in order', '## How to run a round', '## Traps on this machine', '## Decisions taken in phase 2']) expect(handoff, part).toContain(part);
  });

  it('the Worker config never targets the original production Worker, and serves the app as a single-page app (TL-P3-08)', () => {
    const config = read('api/wrangler.jsonc');
    expect(config).not.toMatch(/"name":\s*"bower-api"/);
    expect(config).toMatch(/"name":\s*"bower-staging"/);
    expect(config).toMatch(/"not_found_handling":\s*"single-page-application"/);
    expect(config).not.toContain('dedd167004be415cbd90c4b154b1f4e2');
    expect(config).toMatch(/"binding":\s*"BOWER_KV",\s*"id":\s*"6969d46bffdb4b1e90d068f84235fbec"/);
  });

  it('the staging Worker keeps its logs and names its build', () => {
    const config = read('api/wrangler.jsonc');
    expect(config).toMatch(/"observability":\s*\{\s*"enabled":\s*true\s*\}/);
    const staging = read('docs/harness/STAGING.md');
    expect(staging).toMatch(/--var APP_VERSION:<main short SHA>/);
    expect(staging).toMatch(/\/health.*must name that SHA/);
  });

  it('the runbook names every Worker secret and variable', () => {
    const runbook = read('docs/runbook.md');
    const env = read('api/src/env.ts');
    const list = (name: string): string[] => {
      const body = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(env)?.[1] ?? '';
      return [...body.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1] ?? '');
    };
    const names = [...list('REQUIRED_SECRETS'), ...list('OPTIONAL_SECRETS'), ...list('REQUIRED_VARS')];
    const defaults = /const DEFAULTS = \{([^}]*)\}/.exec(env)?.[1] ?? '';
    names.push(...[...defaults.matchAll(/^\s*([A-Z_]+):/gm)].map((m) => m[1] ?? ''));
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (const name of names) expect(runbook, name).toContain(name);
    expect(runbook).toContain('APP_VERSION');
  });

  it('the runbook holds no real values', () => {
    const runbook = read('docs/runbook.md');
    for (const pattern of ['ghp_', 'github_pat_', 'sk-ant', 'AIza', 'ya29.', 'workers.dev']) expect(runbook, pattern).not.toContain(pattern);
    expect(runbook).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    const addresses = runbook.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) ?? [];
    expect(addresses.filter((a) => a !== 'you@example.com')).toEqual([]);
  });

  it('every change since the P2 freeze is listed', () => {
    const doc = 'docs/harness/2026-10-07-p3-compatibility.md';
    expect(existsSync(join(ROOT, doc)), `${doc} exists`).toBe(true);
    const list = read(doc);
    const log = execFileSync('git', ['log', '--no-merges', '--format=%h', '00ec9a5..HEAD', '--', 'src/features', 'src/data/contracts'], { cwd: ROOT, encoding: 'utf8' });
    const commits = log.split('\n').filter(Boolean);
    expect(commits.length).toBeGreaterThan(0);
    // One row per commit: `| sha | entry | what it changes for the accepted app's files |`, never an empty cell.
    const rows = new Map([...list.matchAll(/^\|\s*`?([0-9a-f]{7,40})`?\s*\|\s*([^|\s][^|]*?)\s*\|\s*([^|\s][^|]*?)\s*\|\s*$/gm)].map((m) => [m[1] ?? '', m[2] ?? '']));
    const listed = (sha: string): boolean => [...rows.keys()].some((k) => k.startsWith(sha) || sha.startsWith(k));
    expect(commits.filter((sha) => !listed(sha)), 'commits missing from the list').toEqual([]);
    for (const entry of rows.values()) expect(entry).toMatch(/^[a-z][a-z0-9-]+$/);
  });
  it('the P3 security review is recorded', () => {
    const doc = 'docs/harness/2026-10-07-p3-security-review.md';
    expect(existsSync(join(ROOT, doc)), `${doc} exists`).toBe(true);
    const review = read(doc);
    const verdict = /^verdict: (PASS|FINDINGS \((\d+)\))$/m.exec(review);
    expect(verdict, 'verdict line').not.toBeNull();
    // One finding per line: `- F<n> <Critical|Important|Minor> ...; entry: <fix-entry-id>` or `...; P4 note`.
    const findings = review.match(/^- F\d+ .*$/gm) ?? [];
    for (const line of findings) {
      expect(line).toMatch(/^- F\d+ (Critical|Important|Minor) /);
      expect(line).toMatch(/(entry: `[a-z][a-z0-9-]+`|P4 note)\s*$/);
    }
    expect(findings.length).toBe(verdict?.[1] === 'PASS' ? 0 : Number(verdict?.[2]));
  });
  it('the built app ships its security headers', () => {
    const file = existsSync(join(ROOT, 'public/_headers')) ? read('public/_headers') : '';
    const block = (path: string): Record<string, string> => {
      const out: Record<string, string> = {};
      let on = false;
      for (const line of file.split('\n')) {
        if (/^\S/.test(line)) on = line.trim() === path;
        else if (on && line.trim()) {
          const at = line.indexOf(':');
          if (at > 0) out[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
        }
      }
      return out;
    };
    const app = block('/*');
    expect(app['content-security-policy'] ?? '').toMatch(/default-src 'self'/);
    expect(app['content-security-policy'] ?? '').toMatch(/frame-ancestors 'none'/);
    expect(app['content-security-policy'] ?? '').toMatch(/object-src 'none'/);
    expect(app['content-security-policy'] ?? '').not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(app['strict-transport-security'] ?? '').toMatch(/max-age=\d{7,}/);
    expect(app['x-content-type-options'] ?? '').toBe('nosniff');
    // The one inline script in index.html is allowed by its hash.
    const inline = /<script>([\s\S]*?)<\/script>/.exec(read('index.html'))?.[1] ?? '';
    const hash = createHash('sha256').update(inline).digest('base64');
    expect(app['content-security-policy'] ?? '').toContain(`'sha256-${hash}'`);
    // The landing keeps all four; its exported script needs its own script policy.
    const landing = block('/landing/*');
    expect(landing['content-security-policy'] ?? '').toMatch(/frame-ancestors 'none'/);
  });
});

describe('deletion-allowlist-doc', () => {
  it('the runbook says the invitation stays after deletion', () => {
    const runbook = read('docs/runbook.md');
    expect(runbook).toMatch(/invitation.*stays.*after.*deletion|remains.*after.*delete|deletion.*invitation.*remains/i);
    expect(runbook).toMatch(/operator.*remov|remov.*operator|remov.*by hand|by hand/i);
  });
});
