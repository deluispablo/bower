import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const landmarks = (html: string): number => (html.match(/role="main"|<main\b/g) ?? []).length;

it('AC2 fix-landing puts the exported page content in one main landmark, and --check flags an export without it', () => {
  const root = mkdtempSync(join(tmpdir(), 'landing-landmarks-'));
  const landing = join(root, 'public/landing');
  mkdirSync(landing, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  copyFileSync('scripts/fix-landing.mjs', join(root, 'scripts/fix-landing.mjs'));
  const source = 'class Component extends DCLogic { renderVals(){return {label:this.props.label}} }';
  // The export's content container, as in public/landing/index.html.
  const html = `<div class="pg" ref="{{ setRoot }}" onPointerMove="{{ onMove }}">\n<section id="top"><h1>{{ label }}</h1></section>\n</div><script type="text/x-dc" data-dc-script>${source}</script>`;
  const runtime = 'function ze(t){return new Function("DCLogic","StreamableLogic","React",t+`\n;return (typeof Component!=="undefined"&&Component)||undefined;`)(I,I,L())}';
  writeFileSync(join(landing, 'index.html'), html);
  writeFileSync(join(landing, 'support.js'), runtime);
  const run = (...args: string[]) => spawnSync(process.execPath, [join(root, 'scripts/fix-landing.mjs'), ...args], { encoding: 'utf8' });
  const read = (name: string): string => readFileSync(join(landing, name), 'utf8');
  try {
    expect(run().status).toBe(0);
    const fixed = read('index.html');
    expect(landmarks(fixed)).toBe(1);
    expect(fixed).toContain('<h1>{{ label }}</h1>');
    expect(run('--check').status).toBe(0);
    // Idempotent: a second run leaves both generated files byte-identical.
    const support = read('support.js');
    expect(run().status).toBe(0);
    expect(read('index.html')).toBe(fixed);
    expect(read('support.js')).toBe(support);
    // A fresh export without the landmark (everything else already fixed) fails the check.
    writeFileSync(join(landing, 'index.html'), html);
    expect(run('--check').status).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
