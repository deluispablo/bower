/// <reference types="node" />
/** Things the repository promises its contributors and its pages, checked. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('what the repository promises', () => {
  it('CLAUDE.md keeps the copy and brand rules', () => {
    const map = read('CLAUDE.md');
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
    const text = read('CLAUDE.md');
    expect(text).not.toMatch(/every write passes the modifiedTime/);
    expect(text).toMatch(/content write passes the modifiedTime it read/);
    expect(text).toMatch(/move or rename checks the name and place it read/);
  });

  it('the code says why the outbox stays at sign-out', () => {
    expect(read('src/data/device.ts')).toMatch(/The journal outbox \(`bower:outbox:<folder>`\) stays at sign-out/);
    expect(read('CLAUDE.md')).toMatch(/outbox stays at sign-out/);
  });

  it('the contract says journal records are unique by id', () => {
    expect(read('docs/specs/2026-10-04-worker-contract.md')).toMatch(/Journal records are unique by `id`: a runner keeps one per id and archives every copy/);
  });

  it('the landing has no jargon where it says what a tidy-up does', () => {
    const html = read('public/landing/index.html');
    expect(html).not.toMatch(/using PARA unless your rules say otherwise/);
    expect(html).toMatch(/in folders by how soon you need things/);
  });

  it('the Worker config never targets the original production Worker, and serves the app as a single-page app (TL-P3-08)', () => {
    const config = read('api/wrangler.jsonc');
    expect(config).not.toMatch(/"name":\s*"bower-api"/);
    expect(config).toMatch(/"name":\s*"bower-staging"/);
    expect(config).toMatch(/"not_found_handling":\s*"single-page-application"/);
    // The real ids are read from the deploy scripts they live in, never spelled here (sec-hardening L1).
    const production = /^PRODUCTION_KV='([0-9a-f]{32})'$/m.exec(read('scripts/deploy-staging.sh'))?.[1];
    const staging = /^STAGING_KV='([0-9a-f]{32})'$/m.exec(read('scripts/deploy-lib.sh'))?.[1];
    expect(production).toMatch(/^[0-9a-f]{32}$/);
    expect(staging).toMatch(/^[0-9a-f]{32}$/);
    expect(config).not.toContain(production);
    expect(config).toMatch(new RegExp(`"binding":\\s*"BOWER_KV",\\s*"id":\\s*"${staging}"`));
  });

  it('the staging Worker keeps its logs and names its build', () => {
    const config = read('api/wrangler.jsonc');
    expect(config).toMatch(/"observability":\s*\{\s*"enabled":\s*true\s*\}/);
    const runbook = read('docs/runbook.md');
    expect(runbook).toMatch(/--var APP_VERSION:<main short SHA>/);
    expect(runbook).toMatch(/`\/health` \(names the SHA\)/);
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
    expect(names.length).toBeGreaterThanOrEqual(11);
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

describe('runbook-tools', () => {
  const production = (): string => read('docs/runbook.md').split('## Production')[1] ?? '';

  it('AC1 runbook-precheck-command: the precheck is the read-only command, not a walk through the app', () => {
    const text = production();
    expect(text).toContain('BOWER_DRIVE_TOKEN=<token> pnpm -C runner precheck FOLDER_ID');
    expect(text).toMatch(/drive\.readonly/);
    // What each exit says, as the command's own header does, each on its own.
    expect(text).toMatch(/exit `0`[^\n]*checked/i);
    expect(text).toMatch(/exit `1`[^\n]*(read failed|not checked)/i);
    expect(text).toMatch(/exit `2`[^\n]*(arguments|token)/i);
    expect(text).not.toMatch(/Open Home, a few notes, the piles and the search/);
  });

  it('AC2 runbook-cutover-script: the deploy is scripts/cutover.sh, dry run first', () => {
    const text = production();
    const dry = text.indexOf('scripts/cutover.sh --dry-run <main short SHA> <production origin> api/wrangler.production.jsonc');
    const real = text.indexOf('scripts/cutover.sh <main short SHA> <production origin> api/wrangler.production.jsonc');
    expect(dry, 'the dry run is named').toBeGreaterThan(-1);
    expect(real, 'the real run follows the dry run').toBeGreaterThan(dry);
    expect(text).not.toContain('npx wrangler deploy --var APP_ORIGIN:<production origin>');
  });

  it('AC3 runbook-rollback-script: the rollback is scripts/rollback.sh, dry run first', () => {
    const text = production();
    const dry = text.indexOf('scripts/rollback.sh --dry-run <version id> <production origin>');
    const real = text.indexOf('scripts/rollback.sh <version id> <production origin>');
    expect(dry, 'the dry run is named').toBeGreaterThan(-1);
    expect(real, 'the real run follows the dry run').toBeGreaterThan(dry);
    expect(text).not.toContain('npx wrangler rollback <version id>');
  });

  it('R5 runbook-rollback-last-good: the redeploy runs from a scratch clone whose main is the last good commit (guard of deploy-lib.sh)', () => {
    const text = production();
    const reset = text.indexOf('git reset --hard <last good SHA>');
    expect(text).toContain('git clone');
    expect(reset, 'main is moved in the scratch clone').toBeGreaterThan(-1);
    expect(text.indexOf('scripts/cutover.sh', reset), 'the cutover runs from there').toBeGreaterThan(reset);
  });

  it('R4 runbook-tools-lead-only: the scripts stay the technical lead\'s, never an agent\'s (guard)', () => {
    expect(production()).toMatch(/by hand, by the technical lead/);
  });
});
