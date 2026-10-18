/// <reference lib="es2024.sharedmemory" />
/** Real deadline guards live outside the workload: a blocked parser can always be terminated. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

export const FAMILIES = ['[[\\', '[[|\\'] as const;
export const SIZES = [262144, 1044480] as const;
export type Route = 'scan' | 'plain' | 'rewrite' | 'rewrite-later' | 'profile' | 'profile-later' | 'reader' | 'discovery' | 'selected';
export function payload(unit: string, bytes: number): string {
  const repeated = '[[' + unit.repeat(Math.floor((bytes - 2) / unit.length));
  const text = repeated + '\\'.repeat(bytes - repeated.length);
  assert.equal(Buffer.byteLength(text), bytes);
  return text;
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let bundle: Promise<string> | undefined;
async function workerCode(): Promise<string> {
  bundle ??= (async () => {
    // Build in Node, outside Vitest's jsdom realm (esbuild requires native typed arrays).
    return execFileSync(process.execPath, ['-e', `
      const { build } = require(${JSON.stringify(require.resolve('../runner/node_modules/esbuild'))});
      const { dirname } = require('node:path');
      build({ entryPoints: [${JSON.stringify(resolve(ROOT, 'testing/wikilink-worker.ts'))}], bundle: true, write: false,
        platform: 'node', format: 'cjs', jsx: 'automatic', tsconfig: ${JSON.stringify(resolve(ROOT, 'tsconfig.app.json'))},
        define: { 'import.meta.url': ${JSON.stringify(JSON.stringify(import.meta.url))} },
        plugins: [{ name: 'installed-packages', setup(build) {
          build.onLoad({ filter: /\\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' }));
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.path.startsWith('@/')) return;
            return { path: require.resolve(args.path, { paths: [dirname(args.importer), ${JSON.stringify(ROOT)}, ${JSON.stringify(resolve(ROOT, 'runner'))}] }), external: true };
          });
        } }],
      }).then(result => process.stdout.write(result.outputFiles[0].text));
    `], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
      + '\nmodule.exports.workerMain().catch(error => { console.error(error); process.exit(1); });';
  })();
  return bundle;
}

/** Same imports, fixtures and route for calibration and hostile input; no workload runs before ready. */
export async function boundedWikilinks(route: Route, unit: string, size: number): Promise<void> {
  const state = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(await workerCode(), { eval: true, workerData: { route, unit, size, state } });
  let failure: Error | undefined;
  worker.on('error', (error) => { failure = error instanceof Error ? error : new Error(String(error)); Atomics.store(state, 0, -1); Atomics.notify(state, 0); });
  worker.on('exit', (code) => {
    if (code !== 0) { failure ??= new Error(`worker exited ${code}`); Atomics.store(state, 0, -1); Atomics.notify(state, 0); }
  });
  async function wait(ms: number, phase: string): Promise<void> {
    // Atomics is a deadline guard, not a test sleep or a fake application timer.
    const until = performance.now() + ms;
    while (Atomics.load(state, 0) === 0 && performance.now() < until) {
      await Atomics.waitAsync(state, 0, 0, Math.max(0, until - performance.now())).value;
    }
    if (failure) throw new Error(`${phase}: ${failure.message}`);
    assert.notEqual(Atomics.load(state, 0), 0, phase);
  }
  async function invoke(hostile: boolean, deadline: number): Promise<number> {
    Atomics.store(state, 0, 0);
    const start = performance.now();
    worker.postMessage(hostile);
    await wait(Math.max(0, deadline - (performance.now() - start)), `${route} ${hostile ? 'payload deadline' : 'calibration failure'} (${unit}, ${size} bytes, D=${deadline}ms)`);
    return performance.now() - start;
  }
  try {
    await wait(30000, `${route} worker startup failure`);
    const measured: number[] = [];
    for (let i = 0; i < 8; i++) {
      const elapsed = await invoke(false, 2000);
      if (i >= 3) measured.push(elapsed);
    }
    const C = measured.sort((a, b) => a - b)[2] ?? 0;
    const D = Math.min(2000, Math.max(250, 20 * C));
    const start = performance.now();
    try {
      const elapsed = await invoke(true, D);
      assert.ok(elapsed <= D, `${route} payload deadline: ${elapsed} > ${D}`);
    } finally {
      console.log(JSON.stringify({ route, family: unit, size, C, D, elapsed: performance.now() - start }));
    }
  } finally { await worker.terminate(); }
}

async function prepare(route: Route, text: string): Promise<() => unknown> {
  if (route === 'discovery' || route === 'selected') return prepareRunner(route, text);
  const { scanLinks, plainLinks, rewriteLinks } = await import('../src/data/contracts/links');
  const { profileTextOk } = await import('../src/data/contracts/note-edit');
  const former = new Map([['old', 'Notes/New.md']]);
  if (route === 'scan') return () => assert.equal([...scanLinks(text)].length, 0);
  if (route === 'plain') return () => assert.equal(plainLinks(text), text);
  if (route === 'rewrite') return () => assert.equal(rewriteLinks(text, former), text);
  if (route === 'rewrite-later') return () => assert.equal(rewriteLinks(text + '\n[[Old]]', former), text + '\n[[New]]');
  if (route === 'profile') return () => assert.equal(profileTextOk(text), false);
  if (route === 'profile-later') return () => assert.equal(profileTextOk(text + '\n[[CV]]'), true);
  const { parseNote } = await import('../src/data/contracts/note-format');
  // The runner's test project has no JSX; esbuild folds this import for the isolated reader worker.
  const { Markdown } = await import('../src/features/note/' + 'markdown') as {
    Markdown: import('react').ComponentType<{ text: string; link: (target: string, label: string, key: string) => import('react').ReactNode }>;
  };
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } };
  const dom = new JSDOM('<main></main>');
  const main = dom.window.document.querySelector('main');
  assert.ok(main);
  const raw = text + '\n[[CV]]';
  return () => {
    const note = parseNote('Note.md', raw);
    assert.equal(note.body, raw);
    main.innerHTML = renderToStaticMarkup(createElement(Markdown, { text: note.body,
      link: (target, label, key) => createElement('a', { href: `#${target}`, key }, label) }));
    assert.equal(main.textContent, text + ' CV');
    assert.deepEqual([...main.querySelectorAll('*')].map((e) => e.tagName), ['P', 'A']);
    assert.equal(main.querySelector('a')?.getAttribute('href'), '#CV');
  };
}

/** The same in-memory Drive and actual provider pattern as b5c-fr7, with recorded selection and execution. */
async function prepareRunner(route: 'discovery' | 'selected', text: string): Promise<() => Promise<void>> {
  const { FakeDrive } = await import('../src/data/drive/fake-drive');
  const { fakeRead } = await import('../src/data/spine/read');
  const { planAdmission } = await import('../src/data/spine/plan');
  const { listedPiles } = await import('../src/data/spine/scripted');
  const { claudeProvider, CONTEXT_BOUNDS } = await import('../runner/src/claude');
  const drive = new FakeDrive({ clock: () => Date.UTC(2026, 9, 7, 9) });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  const areas = (await drive.createFolder(root, 'Areas')).id;
  const career = (await drive.createFolder(areas, 'Career')).id;
  const source = await drive.createText(inbox, 'Later CV.txt', 'Alex uses TypeScript.', { pile: 'cv' });
  const raw = text + '\n[[CV]]';
  const profile = await drive.createText(career, 'Career profile.md', raw, { profile: 'cv', by: 'bower' });
  const reads = fakeRead(drive);
  const read = { ...reads, piles: (id: string) => listedPiles(reads, id), provenance: 'fake-stored' as const };
  const admission = await planAdmission(read, root, { scope: 'all', clock: () => Date.UTC(2026, 9, 7, 9), newId: () => 'admission' });
  assert.equal(admission.kind, 'manifest');
  if (admission.kind !== 'manifest') throw new Error('fixture admission failed');
  let writes = 0;
  drive.onChange = () => { writes++; };
  return async () => {
    const frames: Array<{ profileSources?: Record<string, Array<{ path: string }>>;
      notes?: Array<{ path: string; text: string; cut: number; sources?: Array<{ path: string }> }> }> = [];
    const provider = claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-test-token' },
      prefixes: async (file) => file.id === profile.id ? raw.slice(0, 4096) : undefined,
      spawn: async (call) => {
        frames.push(JSON.parse(call.input.split('\n').at(-1) ?? '{}') as typeof frames[number]);
        const value = frames.length === 1
          ? { items: [{ itemId: source.id, kind: 'unknown', destination: career, wants: route === 'selected' ? [profile.id] : [] }], asks: [] }
          : { kind: 'tidy-intent', v: 1, things: [{ fileId: source.id, to: 'Areas/Career', name: 'Later CV.txt',
            note: { name: 'Later CV.md', summary: 'Alex uses TypeScript.', body: 'Alex uses TypeScript.' } }] };
        return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false,
          result: JSON.stringify(value), num_turns: 1 }) };
      },
    }, { rootId: root, runId: 'wikilink-run', allowWeb: false }, read);
    const manifest = await provider({ taken: admission.manifest, deferred: [] });
    assert.equal(frames.length, 2);
    if (route === 'discovery') {
      assert.equal(Buffer.byteLength(raw), 4096);
      assert.deepEqual(frames[0]?.profileSources?.[profile.id], [{ path: '[[CV]]' }]);
    } else {
      const shown = frames[1]?.notes?.find((n) => n.path === 'Areas/Career/Career profile.md');
      assert.ok(shown);
      assert.ok(shown.text.length <= CONTEXT_BOUNDS.perNote);
      assert.ok(shown.text.length >= CONTEXT_BOUNDS.perNote - 20);
      assert.ok(shown.cut > 0);
      assert.ok(!shown.text.includes('[[CV]]'));
      assert.deepEqual(shown.sources, [{ path: '[[CV]]' }]);
    }
    assert.equal(await drive.readText(profile.id), raw);
    assert.equal(writes, 0);
    assert.ok(!JSON.stringify(manifest.operations).includes(`"fileId":"${profile.id}"`));
  };
}

export async function workerMain(): Promise<void> {
  const { route, unit, size, state } = workerData as { route: Route; unit: string; size: number; state: Int32Array };
  const hostile = await prepare(route, payload(unit, size));
  const benign = await prepare(route, 'x'.repeat(size));
  parentPort?.on('message', async (bad: boolean) => {
    await (bad ? hostile : benign)();
    Atomics.store(state, 0, 1); Atomics.notify(state, 0);
  });
  Atomics.store(state, 0, 1); Atomics.notify(state, 0);
}
