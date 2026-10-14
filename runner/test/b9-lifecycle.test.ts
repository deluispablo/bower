import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { empty, manifest, note, run, select, setup, type Base } from './b1-planning-support';
import { redispatchCase, replySequence, runOnDrive } from './corpus-run';
import { parseNote } from '../../src/data/contracts/note-format';

// B9b (TL-P4-50 B9 Q5): a marked line rides the existing operation ids, manifests, fences and recovery: once, never twice.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const TARGET = 'Projects/Garden visit/Visit.md';
const EARLIER = 'Projects/Garden visit/Earlier notice.txt';
const SOURCE = 'Garden notice.txt';
const TEXT = 'The earlier notice keeps the booking open; the later one may close the garden.';
const MARKED = `Contradiction: ${TEXT} (also from [[Earlier notice.txt]])`;
const BODY = '## My thoughts\nAlex keeps the sketchbook.\n\n## Timeline\n- 2026-10-02 · The booking remains open. · [[Earlier notice.txt]]\n';
const pacing = { baseMs: 0, sleep: async () => {} };

async function fixture() {
  return setup({ folder: { [TARGET]: note('Alex records a garden visit.', BODY, true), [EARLIER]: 'The booking remains open.' },
    inbox: [{ line: 'Record the garden notice beside Visit.', files: [SOURCE] }],
    inboxFiles: { [SOURCE]: 'The garden may close if heavy rain is forecast.' } });
}
const intent = (base: Base, marked: boolean) => ({ ...empty, things: [{ fileId: base.sources[0]?.itemId, to: 'Projects/Garden visit', name: SOURCE }],
  lines: [{ note: TARGET, text: TEXT, cites: base.sources[0]?.itemId, ...(marked ? { marker: 'contradiction', alsoCites: [EARLIER] } : {}) }] });
const selection = (base: Base) => select(base, [base.id(TARGET)], 'Projects/Garden visit');
const url = (input: Parameters<typeof fetch>[0]) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

async function recovery(marked: boolean, crash: boolean) {
  const expected = marked ? MARKED : TEXT;
  const base = await fixture(); const id = base.id(TARGET);
  let landed = 0; let readBack = 0;
  const first = await run(base, [selection(base), intent(base, marked)], { around: (next) => async (input, init) => {
    const at = url(input);
    if (landed && init?.method !== 'PATCH' && at.pathname === `/drive/v3/files/${id}`) {
      readBack++;
      return new Response('{"error":{"code":403,"message":"Made-up recovery read refusal."}}', { status: 403 });
    }
    if (crash && init?.method === 'PATCH' && at.pathname === `/upload/drive/v3/files/${id}`) { landed++; throw new TypeError('Made-up crash before the append.'); }
    const response = await next(input, init);
    if (!landed && init?.method === 'PATCH' && at.pathname === `/upload/drive/v3/files/${id}` && response.ok) { landed++; throw new TypeError('Made-up lost response after the append.'); }
    return response;
  } });
  expect(first.frames, 'the reply is accepted before recovery').toHaveLength(2);
  expect(landed, 'main reaches the edit before the injected interruption').toBeGreaterThan(0);
  if (!crash) { expect(readBack).toBeGreaterThan(0); expect(first.after[TARGET]).toContain(expected); }
  const model = vi.fn(() => { throw new Error('Recovery uses the stored manifest, not a new model call.'); });
  const resumed = await redispatchCase(base.c, first, 2, { claude: model, pacing });
  expect(resumed.code).toBe(0);
  expect(model).not.toHaveBeenCalled();
  expect((resumed.after[TARGET] ?? '').split(expected), 'the line lands exactly once').toHaveLength(2);
  const done = await redispatchCase(base.c, resumed, 3, { claude: model });
  expect(done.after[TARGET]).toBe(resumed.after[TARGET]);
  expect(model).not.toHaveBeenCalled();
  // A later resolution is another sourced line; the disagreement stays as history.
  const resolution = 'The garden has confirmed the visit can proceed.';
  await base.drive.createText(base.id('Inbox'), 'Resolution.txt', resolution, { pile: 'b9-resolution' });
  const resolved = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([{
    ...empty, things: [{ fileId: '$file:Resolution.txt', to: 'Projects/Garden visit', name: 'Resolution.txt' }],
    lines: [{ note: TARGET, text: resolution, cites: '$file:Resolution.txt' }],
  }]), pacing }, 2);
  expect(resolved.code).toBe(0);
  const entries = parseNote(TARGET, resolved.after[TARGET] ?? '').timeline;
  expect(entries.slice(1)).toEqual([{ date: '2026-10-07', text: expected, source: SOURCE }, { date: '2026-10-07', text: resolution, source: 'Resolution.txt' }]);
  // Renaming the older source through the app rewrites the citation link; the line stays one valid line.
  const vaultPath = new URL('../../src/data/vault/drive-vault.ts', import.meta.url).pathname;
  const { DriveVault } = await import(/* @vite-ignore */ vaultPath) as {
    DriveVault: new (options: { drive: Base['drive']; rootId: () => Promise<string>; runningPiles: () => ReadonlySet<string>; device: string }) => { rename(path: string, name: string): Promise<string> };
  };
  const vault = new DriveVault({ drive: base.drive, rootId: async () => base.root, runningPiles: () => new Set(), device: 'device-1' });
  await vault.rename(EARLIER, 'First notice.txt');
  const renamed = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), pacing }, 3);
  expect(renamed.code).toBe(0);
  expect(parseNote(TARGET, renamed.after[TARGET] ?? '').timeline[1]).toEqual({ date: '2026-10-07', source: SOURCE,
    text: expected.replace('[[Earlier notice.txt]]', '[[First notice.txt]]') });
}

it('AC16 control: a lost response and a crash recover an ordinary line once', async () => {
  await recovery(false, false);
  await recovery(false, true);
});
it('AC16 b9-resume-and-resolve: a lost response and a crash recover the marked line once, without a model call', async () => {
  await recovery(true, false);
  await recovery(true, true);
});

async function fenced(marked: boolean, mutation: 'none' | 'bytes' | 'version' | 'name' | 'place') {
  const expected = marked ? MARKED : TEXT;
  const base = await fixture(); const id = base.id(TARGET); let changed = false;
  const result = await run(base, [selection(base), intent(base, marked)], { around: (next) => async (input, init) => {
    const response = await next(input, init);
    const body = init?.body ? await new Response(init.body).text() : '';
    if (!changed && mutation !== 'none' && init?.method === 'POST' && url(input).pathname === '/upload/drive/v3/files' && body.includes('run-manifest')) {
      changed = true;
      const file = await base.drive.get(id);
      if (mutation === 'bytes') await base.drive.writeText(id, `${base.c.folder[TARGET]}\nAlex added a reminder.\n`, file.modifiedTime);
      if (mutation === 'version') await base.drive.writeText(id, base.c.folder[TARGET] ?? '', file.modifiedTime);
      if (mutation === 'name') await base.drive.update(id, { name: 'Renamed visit.md' });
      if (mutation === 'place') await base.drive.update(id, { addParent: base.id('Archive'), removeParent: file.parents[0] });
    }
    return response;
  } });
  const updated = ((result.lastRun as { run?: { report?: { updated?: Array<{ path: string }> } } })?.run?.report?.updated ?? []).map((row) => row.path);
  if (mutation === 'none') {
    expect(result.code, 'an unchanged target takes the line once').toBe(0);
    expect((result.after[TARGET] ?? '').split(expected)).toHaveLength(2);
    expect(updated).toContain(TARGET);
  } else {
    expect(changed, 'the edit was planned before the mutation').toBe(true);
    expect(await base.drive.readText(id), mutation).not.toContain(expected);
    expect(updated, `${mutation}: nothing unapplied is reported`).not.toContain(TARGET);
    expect(manifest(result).operations.length, 'the manifest was written').toBeGreaterThan(0);
  }
}
it('AC17 control: an ordinary line refuses a changed byte, version, name or place', async () => {
  for (const change of ['none', 'bytes', 'version', 'name', 'place'] as const) await fenced(false, change);
});
it('AC17 b9-marker-read-to-act-fence: a marked line refuses a changed byte, version, name or place', async () => {
  for (const change of ['none', 'bytes', 'version', 'name', 'place'] as const) await fenced(true, change);
});
