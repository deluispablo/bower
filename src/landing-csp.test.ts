import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('fix-landing removes the runtime eval from an export', () => {
  const root = mkdtempSync(join(tmpdir(), 'landing-csp-'));
  const landing = join(root, 'public/landing');
  mkdirSync(landing, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  copyFileSync('scripts/fix-landing.mjs', join(root, 'scripts/fix-landing.mjs'));
  const source = 'class Component extends DCLogic { renderVals(){return {label:this.props.label, same:DCLogic===StreamableLogic, react:React.label}} }';
  const html = `<x-dc><h1>{{ label }}</h1></x-dc><script type="text/x-dc" data-dc-script>${source}</script>`;
  const runtime = 'function ze(t){return new Function("DCLogic","StreamableLogic","React",t+`\n;return (typeof Component!=="undefined"&&Component)||undefined;`)(I,I,L())}';
  writeFileSync(join(landing, 'index.html'), html);
  writeFileSync(join(landing, 'support.js'), runtime);
  const run = (...args: string[]) => spawnSync(process.execPath, [join(root, 'scripts/fix-landing.mjs'), ...args], { encoding: 'utf8' });
  try {
    expect(run('--check').status).toBe(1);
    expect(run().status).toBe(0);
    const fixed = readFileSync(join(landing, 'support.js'), 'utf8');
    expect(fixed).not.toMatch(/new Function|\beval\s*\(/);
    expect(readFileSync(join(landing, 'index.html'), 'utf8')).toBe(html);
    // The production replacement executes with string code generation forbidden.
    class Logic { constructor(public props: { label: string }) {} }
    const result: unknown = runInNewContext(`${fixed}; new (ze(source))({label:'Made up'}).renderVals()`, {
      source, I: Logic, L: () => ({ label: 'React fixture' }),
    }, { contextCodeGeneration: { strings: false, wasm: false } });
    expect(result).toEqual({ label: 'Made up', same: true, react: 'React fixture' });
    expect(run('--check').status).toBe(0);
    expect(run().status).toBe(0);
    expect(readFileSync(join(landing, 'support.js'), 'utf8')).toBe(fixed);
    writeFileSync(join(landing, 'index.html'), html.replace('Made up', 'Alex').replace('return {label:', 'return {extra:true,label:'));
    expect(run('--check').status).toBe(1);
    expect(run().status).toBe(0);
    expect(run('--check').status).toBe(0);
    // Re-exporting the runtime also needs the mechanical fix again.
    writeFileSync(join(landing, 'support.js'), runtime);
    expect(run('--check').status).toBe(1);
    expect(run().status).toBe(0);
    expect(run('--check').status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('the landing CSP has no unsafe-eval', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const landing = headers.split('/landing/*\n')[1];
  expect(landing).toBeDefined();
  expect(landing).toMatch(/script-src 'self';/);
  expect(landing).not.toContain("'unsafe-eval'");
});
