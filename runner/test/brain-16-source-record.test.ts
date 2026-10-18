/**
 * brain-16 (rulings in specs/brain-audit/brain-16-rulings.md, rounds 1 and 2): the kind selection named decides an
 * authored note's row, so an invoice with a source row becomes an immutable source note even when the reply omits
 * typeRow; the original is the source record; a later press neither copies nor edits that note. Names are made up.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { REFUSALS, type ClaudeSpawn } from '../src/claude';
import { loadCase } from '../src/corpus';
import { note, run, setup, type Base } from './b1-planning-support';
import { AT, redispatchCase, runWithClaude } from './corpus-run';

const HOME = 'Areas/Home';
const HUB = `${HOME}/Home.md`;
const ORIGINAL = 'Boiler invoice.txt';
const NOTE = `${HOME}/Boiler invoice.md`;
const WORDS = 'Invoice 4471 from Oakfield Heating: boiler service, 120 due by 30 November.';
const REMINDER = 'Reminder: invoice 4471 for the boiler service, 120 due by 30 November.';
const REMINDER_LINE = 'Boiler invoice 4471 reminder: 120 due by 30 November.';
const SOURCE_LINE_REFUSAL = 'a line on a source note, which takes none: give it on its folder\'s hub note instead';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function invoiceFolder(extra: Record<string, string> = {}): Promise<Base> {
  const b = await setup({ folder: { [HUB]: note('Alex keeps the house papers here.', '## Timeline\n', true), ...extra },
    inbox: [{ line: '', files: [ORIGINAL] }], inboxFiles: { [ORIGINAL]: WORDS } });
  await b.drive.createText(b.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [
    { id: 'invoice', match: ['invoice'], template: 'source', properties: {}, table: [] },
  ] }));
  return b;
}

const selection = (b: Base, kind = 'invoice', to = HOME) =>
  ({ items: b.sources.map((s) => ({ itemId: s.itemId, kind, destination: b.id(to), wants: [] as string[] })), asks: [] });
const filing = (b: Base, extra: Record<string, unknown> = {}, to = HOME) => ({ kind: 'tidy-intent', v: 1,
  things: b.sources.map((s) => ({ fileId: s.itemId, to, name: ORIGINAL,
    note: { name: 'Boiler invoice.md', summary: 'Boiler service invoice from Oakfield Heating.', body: WORDS, ...extra } })) });

/** Press 1: the invoice filed into Areas/Home with the given note fields. */
async function press1(extra: Record<string, unknown> = {}, options: { kind?: string; to?: string; folder?: Record<string, string> } = {}) {
  const b = await invoiceFolder(options.folder);
  const r = await run(b, [selection(b, options.kind, options.to), filing(b, extra, options.to)]);
  return { b, r };
}

function sourceNote(text: string | undefined) {
  expect(text).toBeDefined();
  expect(text).toMatch(/^bower_template: source$/m);
  expect(text).toMatch(/^type: invoice$/m);
  expect(text).toMatch(/^original: Boiler invoice\.txt$/m);
  expect(text).toContain('related: "[[Areas/Home/Home]]"');
  expect(text).toMatch(new RegExp(`## Transcript\\n+${WORDS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  expect(text).not.toContain('## Timeline');
}
function ordinaryNote(text: string | undefined) {
  expect(text).toBeDefined();
  expect(text).not.toMatch(/^bower_template:/m);
  expect(text).toContain('## Timeline');
  expect(text).toContain('Filed by Bower.');
}

describe('AC1 omitted template cannot produce an ordinary source note', () => {
  it('(a) the selected source kind makes the source note, byte for byte the explicit typeRow one', async () => {
    const { r } = await press1();
    expect(r.code, r.errors).toBe(0);
    expect(r.frames).toHaveLength(2);
    sourceNote(r.after[NOTE]);
    const explicit = await press1({ typeRow: 'invoice' });
    expect(explicit.r.code, explicit.r.errors).toBe(0);
    expect(r.after[NOTE]).toBe(explicit.r.after[NOTE]);
  });

  it('(b) guard: an unknown kind keeps the ordinary note', async () => {
    const { r } = await press1({}, { kind: 'unknown' });
    expect(r.code, r.errors).toBe(0);
    ordinaryNote(r.after[NOTE]);
  });

  it('(c) guard: a destination with no hub keeps the ordinary note', async () => {
    const { r } = await press1({}, { to: 'Resources' });
    expect(r.code, r.errors).toBe(0);
    ordinaryNote(r.after['Resources/Boiler invoice.md']);
  });

  it('(d) guard (R2-1): a new Project backed by its source keeps the Project template', async () => {
    const goal = 'Alex will run a seed swap by the end of October.';
    const b = await setup({ folder: { 'Projects/Garden/Garden.md': note('Alex grows vegetables.', '## Timeline\n', true) },
      inbox: [{ line: '', files: ['Seed swap.txt'] }], inboxFiles: { 'Seed swap.txt': goal } });
    const fileId = b.sources[0]?.itemId ?? '';
    const basis = { kind: 'source', fileId, goal };
    const r = await run(b, [
      { items: [{ itemId: fileId, kind: 'other-project-material', destination: { parentId: b.id('Projects/Garden'), name: 'Seed swap' }, wants: [], basis }], asks: [] },
      { kind: 'tidy-intent', v: 1, things: [{ fileId, to: 'Projects/Garden/Seed swap', name: 'Seed swap.txt', basis,
        note: { name: 'Seed swap.md', summary: 'Alex plans a seed swap.', body: goal } }] },
    ]);
    expect(r.code, r.errors).toBe(0);
    expect(r.frames).toHaveLength(2);
    const text = r.after['Projects/Garden/Seed swap/Seed swap.md'];
    expect(text).toMatch(/^bower_template: project$/m);
    expect(text).toContain('## Goal');
  });

  it('(e) guard (R2-2): two hubs in the destination keep the ordinary note', async () => {
    const { r } = await press1({}, { folder: {
      [`${HOME}/House map.md`]: '---\nsummary: Map of house notes.\ntype: moc\nby: bower\n---\n## Overview\nHouse notes.\n',
    } });
    expect(r.code, r.errors).toBe(0);
    expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
    ordinaryNote(r.after[NOTE]);
  });
});

describe('AC1b explicit template cannot bypass the selected row', () => {
  it('(a) a conflicting template is refused thingType; the retry makes the source note', async () => {
    const b = await invoiceFolder();
    const r = await run(b, [selection(b), filing(b, { template: 'concept' }), filing(b)]);
    expect(r.frames, 'the concept template is refused once').toHaveLength(3);
    expect(r.frames[2]?.call.input).toContain(`Your reply was refused: ${REFUSALS.thingType}`);
    expect(r.code, r.errors).toBe(0);
    sourceNote(r.after[NOTE]);
  });

  it('(b) the thingType text is exact and the refusal kinds stay 73', () => {
    expect(REFUSALS.thingType).toBe('a note "typeRow" other than the kind its selection gave, or a "template" other than that kind\'s row gives');
    expect(Object.keys(REFUSALS)).toHaveLength(73);
  });

  it('(c) guard: the row\'s own template is accepted first time', async () => {
    const { r } = await press1({ template: 'source' });
    expect(r.code, r.errors).toBe(0);
    expect(r.frames).toHaveLength(2);
    expect(r.after[NOTE]).toMatch(/^bower_template: source$/m);
    expect(r.after[NOTE]).toMatch(/^original: Boiler invoice\.txt$/m);
  });
});

describe('AC2 guard: timeline incorporation still keeps extraction', () => {
  it('the original keeps its bytes, the line cites it, and no note is added', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-confirms-known-fact'));
    const claude: ClaudeSpawn = async (call) => {
      const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ fileId: string; name: string }> }> };
      const id = ctx.piles.flatMap((p) => p.things).find((t) => t.name === 'Plot fees 2027.txt')?.fileId ?? 'none';
      const intent = { kind: 'tidy-intent', v: 1, things: [{ fileId: id, to: HOME, name: 'Plot fees 2027.txt' }],
        lines: [{ note: `${HOME}/Garden plot.md`, text: 'Plot fees for 2027 confirmed: 25 a year, due by 31 January.', cites: id }] };
      return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(intent) }) };
    };
    vi.useRealTimers();
    const r = await runWithClaude(c, claude);
    expect(r.code).toBe(0);
    expect(r.after[`${HOME}/Plot fees 2027.txt`]).toBe(readFileSync(resolve(c.dir, 'inbox/Plot fees 2027.txt'), 'utf8'));
    const timeline = (r.after[`${HOME}/Garden plot.md`] ?? '').split('\n').filter((line) => line.startsWith('- '));
    expect(timeline.at(-1)).toMatch(/^- \d{4}-\d{2}-\d{2} · Plot fees for 2027 confirmed: 25 a year, due by 31 January\. · \[\[Plot fees 2027\.txt\]\]$/);
    const mds = (paths: string[]) => paths.filter((p) => p.startsWith(`${HOME}/`) && p.endsWith('.md')).sort();
    expect(mds(Object.keys(r.after))).toEqual(mds(Object.keys(c.folder)));
  });
});

const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
/** The name in the metadata part of a multipart upload that creates a file (as b12-result-note.test.ts reads it). */
async function createdName(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (init?.method !== 'POST' || url(input).pathname !== '/upload/drive/v3/files') return null;
  const body = init.body == null ? '' : await new Response(init.body).text();
  const meta = /\r\n\r\n(\{[^\r\n]*\})\r\n/.exec(body)?.[1];
  try { return meta ? (JSON.parse(meta) as { name?: string }).name ?? null : null; } catch { return null; }
}

/** Press 2: a reminder of the same invoice in a pile of its own, freshly admitted. */
async function press2(b: Base, wants: (invoiceId: string) => string[], replies: (reminderId: string, invoiceId: string) => unknown[]) {
  const pile = await b.drive.createFolder(b.id('Inbox'), 'Pile 2', { pile: 'p-2' });
  await b.drive.createText(pile.id, 'Boiler reminder.txt', REMINDER);
  const admitted = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + 1, newId: () => 'admission-2' });
  if (admitted.kind !== 'manifest') throw new Error('The reminder must be admitted.');
  const reminderId = admitted.manifest.piles.flatMap((p) => p.items).find((i) => i.name === 'Boiler reminder.txt')?.fileId ?? '';
  const invoiceId = (await b.drive.listAll(b.root)).find((f) => f.name === 'Boiler invoice.md')?.id ?? '';
  const chosen = { items: [{ itemId: reminderId, kind: 'invoice', destination: b.id(HOME), wants: wants(invoiceId) }], asks: [] };
  return run(b, [chosen, ...replies(reminderId, invoiceId)], { press: 2, admission: admitted.manifest });
}
const bare = (id: string) => ({ fileId: id, to: HOME, name: 'Boiler reminder.txt' });
const onHub = (id: string) => ({ kind: 'tidy-intent', v: 1, things: [bare(id)], lines: [{ note: HUB, text: REMINDER_LINE, cites: id }] });

describe('AC3 source retry is immutable and idempotent', () => {
  it('(a) a lost answer after the source note\'s create resumes to one source note, with no model call', async () => {
    const b = await invoiceFolder();
    let crashed = false;
    const first = await run(b, [selection(b), filing(b)], { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (await createdName(input, init) === 'Boiler invoice.md') {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost answer after the source note.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main created the note').toBe(true);
    // The job fails (code 1) and the run is left in saving, unfinished, for the Worker to redispatch (main.ts:520-525).
    expect(first.code).toBe(1);
    expect(first.wire?.statuses.at(-1)?.phase).toBe('saving');
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(b.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(resumed.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(model).not.toHaveBeenCalled();
    const copies = Object.keys(resumed.after).filter((p) => /^Boiler invoice.*\.md$/.test(p.split('/').at(-1) ?? ''));
    expect(copies).toEqual([NOTE]);
    expect(resumed.after[NOTE]).toMatch(/^bower_template: source$/m);
    expect(resumed.after[NOTE]).toMatch(/^original: Boiler invoice\.txt$/m);
    expect(resumed.after[`${HOME}/${ORIGINAL}`]).toBe(WORDS);
  });

  it('(b) a later press naming the source note is advised to its hub and leaves it unchanged', async () => {
    const { b, r: first } = await press1();
    expect(first.code, first.errors).toBe(0);
    const kept = first.after[NOTE];
    const r = await press2(b, () => [], (id) => [
      { kind: 'tidy-intent', v: 1, things: [{ ...bare(id), note: { name: 'Boiler invoice.md', summary: 'Boiler service reminder.', body: REMINDER } }] },
      onHub(id),
    ]);
    expect(r.frames).toHaveLength(3);
    expect(r.frames[2]?.call.input).toContain('a new note "Boiler invoice.md" for the note "Boiler invoice.md" that already exists: give a Timeline line citing this thing on that note, or on its folder\'s hub note when that note is a source note, instead of a new note');
    expect(r.code, r.errors).toBe(0);
    expect(r.after[HUB]).toContain(REMINDER_LINE);
    expect(r.after[NOTE]).toBe(kept);
  });

  it('(c) a Timeline line on a source note is refused lineNote; the retry puts it on the hub', async () => {
    const { b, r: first } = await press1({ typeRow: 'invoice' });
    expect(first.code, first.errors).toBe(0);
    const kept = first.after[NOTE];
    const r = await press2(b, (invoice) => [invoice], (id) => [
      { kind: 'tidy-intent', v: 1, things: [bare(id)], lines: [{ note: NOTE, text: REMINDER_LINE, cites: id }] },
      onHub(id),
    ]);
    expect(r.frames, 'the line on the source note is refused once').toHaveLength(3);
    expect(r.frames[2]?.call.input).toContain(SOURCE_LINE_REFUSAL);
    expect(r.code, r.errors).toBe(0);
    expect(r.after[HUB]).toContain(REMINDER_LINE);
    expect(r.after[NOTE]).toBe(kept);
  });
});
