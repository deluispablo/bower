/**
 * The first P4-C slice (`c04-incorporation`, TL-P4-03): the model sees bounded content, not just names, and its intent
 * carries note text (a thing's own note, Timeline lines for the notes it was shown), while the runner still builds
 * every operation and the spine validates it. No live call: scripted proposals first, then a recorded Claude reply,
 * each scored by the corpus scorer.
 */
import { phaseAwareClaude } from './b1-planning-support';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead, type ScriptedRead } from '../../src/data/spine/read';
import { listedPiles } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import { serializeNote } from '../../src/data/vault/note-format';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import type { RunManifest } from '../../src/data/spine/records';
import { claudeProvider, type ClaudeCall, type ClaudeExit, type ClaudeSpawn } from '../src/claude';
import { loadCorpus, score, type LoadedCase } from '../src/corpus';
import { runWithClaude } from './corpus-run';
import { RUN_ID, fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const AT = Date.UTC(2026, 9, 7, 9);

/** The bounds the context keeps (characters): each thing's text, all things' text, each note's text, all notes'. */
const PER_THING = 12_000;
const PER_RUN = 48_000;
const PER_NOTE = 4_000;
const NOTES_PER_RUN = 24_000;
/** The mark a cut text ends with: how much was left out. */
const CUT = /\n\[cut here: (\d+) more characters not shown\]$/;

afterEach(() => vi.restoreAllMocks());

interface ShownThing { fileId: string; name: string; kind: string; text: string | null; cut: number; why?: string }
interface Context {
  piles: Array<{ pileId: string; words: string; things: ShownThing[] }>;
  notes: Array<{ path: string; text: string; cut: number }>;
  indexed?: Record<string, { path: string; summary: string; version: string; coverage: unknown }>;
}

/** The prepared context: the JSON line at the end of the input. */
const contextOf = (input: string): Context => JSON.parse(input.split('\n').at(-1) ?? '{}') as Context;

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(resolve(ROOT, path)));

function fakeScripted(drive: FakeDrive): ScriptedRead {
  const reads = fakeRead(drive);
  return { ...reads, piles: (rootId) => listedPiles(reads, rootId), provenance: 'fake-stored' };
}

describe('what the model is shown (P4-3)', () => {
  it('the model context carries bounded extracted text for each admitted thing', async () => {
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    const folders: Record<string, string> = {};
    for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) folders[name] = (await drive.createFolder(root, name)).id;
    const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
    await drive.createFolder(sys, 'changes');
    await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
    // One of Bower's hub notes, long enough to be cut; a note of Alex's own, never offered for an update.
    const garden = (await drive.createFolder(folders.Areas ?? root, 'Garden')).id;
    const hub = serializeNote({ summary: 'Alex\'s plot.', properties: [], tags: [], currentState: [], body: 'Plot 14. '.repeat(800), timeline: [{ date: '2026-09-12', text: 'Planted garlic.', source: '' }], byBower: true });
    const hubFile = await drive.createText(garden, 'Garden.md', hub, { by: 'bower' });
    await drive.createText(garden, 'Seeds.md', 'My own list.\n');
    const loose = async (name: string, body: string | Uint8Array, pile: string): Promise<void> => {
      if (typeof body === 'string') await drive.createText(inbox, name, body, { pile });
      else await drive.upload(inbox, name, new Blob([body.slice()]), undefined, { pile });
    };
    await loose('Community garden newsletter, autumn.pdf', bytesOf('c04-garden-newsletter/inbox/Community garden newsletter, autumn.pdf'), 'p-news');
    await loose('Shopping list.md', '# Shopping\n\n- compost\n- twine\n', 'p-list');
    await loose('scan0001.pdf', bytesOf('bench-4-scanned-pdf/inbox/scan0001.pdf'), 'p-scan');
    await loose('IMG_0001.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'p-photo');
    await loose('Broken.pdf', '%PDF-1.4 not really a PDF', 'p-broken');
    for (const n of [1, 2, 3, 4, 5]) await loose(`Long notes ${n}.txt`, `${n}`.repeat(30_000), `p-long-${n}`);
    const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

    const calls: ClaudeCall[] = [];
    const source = admitted.manifest.piles.flatMap((p) => p.items).find((t) => t.name === 'Community garden newsletter, autumn.pdf');
    expect(source).toBeDefined();
    const selection = { items: [{ itemId: source?.fileId, kind: 'unknown', destination: garden, wants: [hubFile.id] }], asks: [] };
    const spawn: ClaudeSpawn = async (call) => {
      calls.push(call);
      const phase = (JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { selection?: unknown }).selection;
      return { code: 0, stderr: '', cut: null, stdout: envelope(phase === undefined ? selection : 'not intent') } satisfies ClaudeExit;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn }, { rootId: root, runId: RUN_ID, allowWeb: false }, fakeScripted(drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();
    const input = calls[0]?.input ?? '';
    const ctx = contextOf(input);
    const things = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t]));
    expect(things.size).toBe(10);

    // A text PDF: its text layer, read by the runner, whole.
    const news = things.get('Community garden newsletter, autumn.pdf');
    expect(news?.text).toContain('Saturday 18 October: bulb planting');
    expect(news?.text).toContain('due by 31 January');
    expect(news?.cut).toBe(0);
    // Plain text and Markdown as they are.
    expect(things.get('Shopping list.md')).toMatchObject({ text: '# Shopping\n\n- compost\n- twine\n', cut: 0 });
    // A scanned PDF, a picture and a PDF that cannot be read get no text, and the context says why.
    expect(things.get('scan0001.pdf')).toMatchObject({ text: null });
    expect(things.get('scan0001.pdf')?.why).toMatch(/no text layer/);
    expect(things.get('IMG_0001.jpg')).toMatchObject({ text: null });
    expect(things.get('IMG_0001.jpg')?.why).toMatch(/picture/);
    expect(things.get('Broken.pdf')).toMatchObject({ text: null });
    expect(things.get('Broken.pdf')?.why).toMatch(/could not be read/);
    // Bounded per thing, and the cut is marked, never silent.
    for (const n of [1, 2, 3, 4, 5]) {
      const long = things.get(`Long notes ${n}.txt`);
      const kept = long?.text?.replace(CUT, '') ?? '';
      expect(kept.length).toBeLessThanOrEqual(PER_THING);
      expect(kept).toBe(`${n}`.repeat(kept.length));
      expect(long?.cut).toBe(30_000 - kept.length);
      expect(long?.text).toMatch(CUT);
      expect(Number(CUT.exec(long?.text ?? '')?.[1])).toBe(long?.cut);
    }
    // Bounded per run, shared out so a big thing never crowds out a small one: the small ones are whole.
    const shown = [...things.values()].reduce((n, t) => n + (t.text?.replace(CUT, '').length ?? 0), 0);
    expect(shown).toBeLessThanOrEqual(PER_RUN);
    expect(things.get('Long notes 5.txt')?.cut).toBeGreaterThan(30_000 - PER_THING);
    // The prompt tells the model what it was not shown.
    expect(input).toMatch(/OCR/);

    // Selection has metadata; picked full-note evidence is bounded in execution, never Alex's unpicked note.
    expect(ctx.notes).toEqual([]);
    expect(ctx.indexed?.[hubFile.id]).toMatchObject({ path: 'Areas/Garden/Garden.md', summary: '(no summary)', version: hubFile.modifiedTime, coverage: { kind: 'prefix', bytes: 4096 } });
    expect(input).not.toContain('Plot 14. '.repeat(20));
    const execution = contextOf(calls[1]?.input ?? '');
    expect(execution.notes.map((n) => n.path)).toEqual(['Areas/Garden/Garden.md']);
    const note = execution.notes[0];
    expect(note?.text.startsWith(hub.slice(0, 200))).toBe(true);
    expect(note?.text.length).toBeLessThanOrEqual(PER_NOTE);
    expect(note?.cut).toBe(hub.length - (note?.text.replace(CUT, '').length ?? 0));
    expect(Number(CUT.exec(note?.text ?? '')?.[1])).toBe(note?.cut);
    expect(note?.text).toMatch(CUT);
    expect(execution.notes.reduce((n, x) => n + x.text.replace(CUT, '').length, 0)).toBeLessThanOrEqual(NOTES_PER_RUN);
  });
});

/** A proposal by names, as a script would write it: the runner's context gives each thing's file id. */
interface Proposal {
  things: Array<{ thing: string; to: string; name: string; basis?: string; responsibility?: string; note?: { name: string; summary: string; body: string } }>;
  lines?: Array<{ note: string; text: string; cites?: string }>;
}

const PROPOSALS: Record<string, Proposal> = {
  'c04-garden-newsletter': {
    things: [{
      thing: 'Community garden newsletter, autumn.pdf',
      to: 'Resources/Garden',
      name: 'Garden newsletter, autumn.pdf',
      note: {
        name: 'Garden newsletter, autumn.md',
        summary: 'The Larkspur Lane community garden\'s autumn newsletter.',
        body: '- Saturday 18 October: bulb planting, 10:00 to 12:00.\n- Saturday 8 November: leaf collection and soup lunch.\n- Sunday 7 December: winter social.\n- Plot fees for 2027 stay at 25 a year, due by 31 January.\n- The tool shed code changes on 1 November.\n\nAbout [[Garden plot]].',
      },
    }],
    lines: [{ note: 'Areas/Home/Garden plot.md', text: 'Autumn newsletter: bulb planting on 18 October, fees due by 31 January.', cites: 'Community garden newsletter, autumn.pdf' }],
  },
  'c04-hardware-receipt': {
    things: [{
      thing: 'receipt-2026-09-14.pdf',
      to: 'Areas/Money/Receipts/2026-09',
      basis: 'Receipts go to Areas / Money / Receipts, in a folder for each month.',
      name: 'Saltmere Hardware, 2026-09-14.pdf',
      note: { name: 'Saltmere Hardware, 2026-09-14.md', summary: 'Saltmere Hardware receipt, 2026-09-14, total 51.91.', body: 'Four items, total 51.91 paid by card. Returns within 28 days.' },
    }],
  },
  'c04-offer-and-flat': {
    things: [
      { thing: 'Offer_letter_final(2).pdf', to: 'Projects/Job hunt/Applications', basis: 'Projects/Job hunt/Job hunt.md', name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick for Industrial Designer.', body: 'Fully remote. Salary 42,000 a year. Start 2 November.' } },
      { thing: 'listing-88213.example.url', to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
      { thing: 'IMG_2301.jpg', to: 'Projects/Flat hunt/Viewing photos', basis: 'Projects/Flat hunt/Flat hunt.md', name: 'Wrenfield Road, kitchen.jpg' },
      { thing: 'Payslip_Aug.pdf', to: 'Areas/Money', responsibility: 'pay and tax records', name: 'Payslip August.pdf', note: { name: 'Payslip, August.md', summary: 'A payslip for August.', body: 'Payslip for August.' } },
    ],
    lines: [
      { note: 'Projects/Flat hunt/Flat hunt.md', text: 'A fourth flat added; the shortlist compared by commute.', cites: 'listing-88213.example.url' },
      { note: 'Projects/Job hunt/Job hunt.md', text: 'New offer from Ferrowick, fully remote.', cites: 'Offer_letter_final(2).pdf' },
      { note: 'Projects/Job hunt/Job hunt.md', text: 'A flat from the same pile went to the flat hunt.', cites: 'listing-88213.example.url' },
    ],
  },
  'bench-2-text-pdf': {
    things: [{ thing: 'Community garden newsletter, autumn.pdf', to: 'Resources/Garden', name: 'Community garden newsletter, autumn.pdf', note: { name: 'Community garden newsletter, autumn.md', summary: 'Autumn newsletter of the community garden.', body: 'Bulb planting on 18 October; plot fees due by 31 January.' } }],
  },
  'bench-3-receipt-pdf': {
    things: [{ thing: 'receipt-2026-09-14.pdf', to: 'Resources/Receipts', name: 'Example Hardware, 2026-09-14.pdf', note: { name: 'Example Hardware, 2026-09-14.md', summary: 'Hardware receipt, total 51.91.', body: 'Total 51.91, paid by card.' } }],
  },
};

/** Scripted proposals: `claude` answered by a script in the same intent shape, its file ids from the context. */
function proposing(p: Proposal, seen: Context[]): ClaudeSpawn {
  return phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const ctx = contextOf(call.input);
    if (phase === 'execution') seen.push(ctx);
    const ids = new Map(ctx.piles.flatMap((x) => x.things).map((t) => [t.name, t.fileId]));
    const id = (name: string): string => ids.get(name) ?? `no ${name}`;
    const intent = {
      kind: 'tidy-intent',
      v: 1,
      things: p.things.map(({ thing, ...rest }) => ({ fileId: id(thing), ...rest })),
      ...(p.lines ? { lines: p.lines.map(({ cites, ...rest }) => ({ ...rest, ...(cites ? { cites: id(cites) } : {}) })) } : {}),
    };
    return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
  });
}

const scored = (c: LoadedCase, run: { after: Record<string, string>; lastRun: unknown }) => score({ expected: c.expected, before: c.folder, after: run.after, lastRun: run.lastRun });

describe('the C04 slice through the Claude provider (P4-3)', () => {
  it('the C04 corpus cases score green with scripted proposals', async () => {
    const cases = (await loadCorpus(ROOT)).filter((c) => c.capability === 'C04');
    expect(cases.map((c) => c.id).sort()).toEqual(Object.keys(PROPOSALS).sort());
    for (const c of cases) {
      const seen: Context[] = [];
      const run = await runWithClaude(c, proposing(PROPOSALS[c.id] ?? { things: [] }, seen));
      expect({ id: c.id, code: run.code }).toEqual({ id: c.id, code: 0 });
      expect({ id: c.id, ...scored(c, run) }).toEqual({ id: c.id, pass: true, unmet: [] });
      // What the note says came in the context: the PDF's own text, read by the runner.
      for (const t of PROPOSALS[c.id]?.things ?? []) {
        const shown = seen[0]?.piles.flatMap((p) => p.things).find((x) => x.name === t.thing);
        const own = { 'receipt-2026-09-14.pdf': '51.91', 'Community garden newsletter, autumn.pdf': '18 October', 'Offer_letter_final(2).pdf': 'Ferrowick', 'Payslip_Aug.pdf': 'payslip, August' }[t.thing];
        if (t.thing.endsWith('.pdf')) expect({ id: c.id, thing: t.thing, text: own !== undefined && shown?.text?.includes(own) }).toEqual({ id: c.id, thing: t.thing, text: true });
      }
    }
  });

  it('a recorded Claude reply on a C04 case writes a note with its content', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('no c04-garden-newsletter');
    const reply = readFileSync(new URL('./fixtures/claude/reply-c04-garden.json', import.meta.url), 'utf8');
    const calls: ClaudeCall[] = [];
    const run = await runWithClaude(c, async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: reply }));
    expect(run.code).toBe(0);
    // The reply names the newsletter as the context showed it, with its text.
    const shown = contextOf(calls[0]?.input ?? '').piles.flatMap((p) => p.things);
    const intent = JSON.parse((JSON.parse(reply) as { result: string }).result) as { things: Array<{ fileId: string }> };
    expect(shown.map((t) => t.fileId)).toEqual(intent.things.map((t) => t.fileId));
    expect(shown[0]?.text).toContain('7 December');
    expect(scored(c, run)).toEqual({ pass: true, unmet: [] });
    const note = Object.entries(run.after).find(([p]) => /^Resources\/.*ewsletter.*\.md$/.test(p));
    expect(note?.[1]).toContain('winter social');
    expect(note?.[1]).toMatch(/^by: bower$/m);
    // The hub line it proposed, written by the runner on Bower's note with its source.
    expect(run.after['Areas/Home/Garden plot.md']).toMatch(/^- 2026-10-07 · .*18 October.* · \[\[.*ewsletter.*\]\]$/m);
  });
});

/** Alex's folder with the garden newsletter in the inbox, Bower's plot note, and `extra` files (path to text). */
async function gardenFolder(extra: Record<string, string> = {}, inbox: Record<string, Uint8Array> = {}): Promise<{ drive: FakeDrive; root: string; took: { taken: AdmissionManifest; deferred: [] } }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const box = (await drive.createFolder(root, 'Inbox')).id;
  const ids = new Map<string, string>();
  const folder = async (path: string): Promise<string> => {
    let parent = root;
    let at = '';
    for (const part of path.split('/').filter(Boolean)) {
      at = at ? `${at}/${part}` : part;
      const known = ids.get(at) ?? (await drive.createFolder(parent, part)).id;
      ids.set(at, known);
      parent = known;
    }
    return parent;
  };
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await folder(name);
  const sys = await folder(SYSTEM.dir);
  await drive.createFolder(sys, 'changes');
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  const plot = serializeNote({ summary: 'Alex\'s plot.', properties: [], tags: [], currentState: [], body: '', timeline: [{ date: '2026-09-12', text: 'Planted garlic.', source: '' }], byBower: true });
  await drive.createText(await folder('Areas/Home'), 'Garden plot.md', plot, { by: 'bower' });
  for (const [path, text] of Object.entries(extra)) await drive.createText(await folder(path.split('/').slice(0, -1).join('/')), path.split('/').at(-1) ?? path, text);
  const things = { 'Community garden newsletter, autumn.pdf': bytesOf('c04-garden-newsletter/inbox/Community garden newsletter, autumn.pdf'), ...inbox };
  for (const [i, [name, bytes]] of Object.entries(things).entries()) await drive.upload(box, name, new Blob([bytes.slice()]), undefined, { pile: `p-${i + 1}` });
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error('nothing admitted');
  return { drive, root, took: { taken: admitted.manifest, deferred: [] } };
}

/** Plans the garden folder from `intent` (with the newsletter's file id put in for NEWS), keeping the input. */
async function planned(g: Awaited<ReturnType<typeof gardenFolder>>, intent: (news: string) => unknown, calls: ClaudeCall[] = []): Promise<RunManifest> {
  const news = g.took.taken.piles.flatMap((p) => p.items).find((i) => i.name === 'Community garden newsletter, autumn.pdf')?.fileId ?? '';
  const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope(intent(news)) });
  return claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: g.drive, root: g.root })) }, { rootId: g.root, runId: RUN_ID, allowWeb: false }, fakeScripted(g.drive))(g.took);
}

const newsletter = (news: string, body: string, line: Record<string, unknown> | null = null): unknown => ({
  kind: 'tidy-intent',
  v: 1,
  things: [{ fileId: news, to: 'Resources/Garden', name: 'Garden newsletter, autumn.pdf', note: { name: 'Garden newsletter, autumn.md', summary: 'The autumn newsletter.', body } }],
  ...(line ? { lines: [{ note: 'Areas/Home/Garden plot.md', cites: news, ...line }] } : {}),
});

/** A one-font text PDF of `pages` pages, each with `lines` lines of made-up words. */
function pdfOf(pages: number, lines: number): Uint8Array {
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids: string[] = [];
  for (let p = 0; p < pages; p++) {
    const text = Array.from({ length: lines }, (_, l) => `(Page ${p + 1} line ${l + 1}: made-up words about the garden plot and its fees.) Tj T*`).join('\n');
    const stream = `BT\n/F1 9 Tf\n11 TL\n40 800 Td\n${text}\nET\n`;
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const content = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe('the C04 slice, review round (P4-3)', () => {
  it('a model cite links the note the run actually made', async () => {
    // Alex already has a note by the name the model asks for: the run's note gets a free name, and the line links it.
    const g = await gardenFolder({ 'Resources/Garden/Garden newsletter, autumn.md': 'Alex\'s own notes on the newsletter.\n' });
    const m = await planned(g, (news) => newsletter(news, 'Bulb planting on 18 October.', { text: 'Autumn newsletter filed.' }));
    const made = m.operations.flatMap((o) => (o.effect.kind === 'create-text' && o.effect.name.endsWith('.md') && o.effect.text.includes('Bulb planting') ? [o.effect.name] : []));
    expect(made).toHaveLength(1);
    expect(made[0]).not.toBe('Garden newsletter, autumn.md');
    const edit = m.operations.find((o) => o.effect.kind === 'edit-text');
    const text = edit?.effect.kind === 'edit-text' ? edit.effect.text : '';
    expect(text).toContain(`Autumn newsletter filed. · [[${(made[0] ?? '').replace(/\.md$/, '')}]]`);
  });

  it('the context reads no thing past its size and extracts no more than the run text budget', async () => {
    const big = new Uint8Array(21 * 1024 * 1024).fill(0x61);
    const g = await gardenFolder({}, { 'Huge notes.txt': big, 'Long report.pdf': pdfOf(40, 60) });
    const ids = new Map(g.took.taken.piles.flatMap((p) => p.items).map((i) => [i.name, i.fileId]));
    const read = fakeScripted(g.drive);
    const bytesRead: string[] = [];
    const counted: ScriptedRead = { ...read, readBytes: (id) => (bytesRead.push(id), read.readBytes(id)) };
    const calls: ClaudeCall[] = [];
    const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: g.drive, root: g.root })) }, { rootId: g.root, runId: RUN_ID, allowWeb: false }, counted)(g.took)).rejects.toThrow();
    const things = new Map(contextOf(calls[0]?.input ?? '').piles.flatMap((p) => p.things).map((t) => [t.name, t as ShownThing & { pagesNotRead?: number }]));
    // Past the read limit by its listed size: never downloaded.
    expect(bytesRead).not.toContain(ids.get('Huge notes.txt'));
    expect(things.get('Huge notes.txt')).toMatchObject({ text: null });
    expect(things.get('Huge notes.txt')?.why).toMatch(/too big/);
    // A long PDF is read page by page only as far as its share of the budget, and says how many pages were not read.
    const report = things.get('Long report.pdf');
    expect(report?.text).toContain('Page 1 line 1:');
    expect(report?.text?.replace(CUT, '').length).toBeLessThanOrEqual(PER_THING);
    expect(report?.pagesNotRead).toBeGreaterThan(20);
    expect(report?.text).toMatch(/pages not read/);
  });

  it('a note body or line that links outside what the model was shown is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused: Array<[string, (news: string) => unknown]> = [
      ['a body link to no note', (news) => newsletter(news, 'See [[Nowhere at all]].')],
      ['a body web link the newsletter does not have', (news) => newsletter(news, 'Sign up at [the form](https://forms.example/sign-up).')],
      ['a bare web address in a body', (news) => newsletter(news, 'More at https://garden.example/more.')],
      ['a Markdown link in a line', (news) => newsletter(news, 'Dates inside.', { text: 'See [the dates](https://garden.example).' })],
      ['a web address in a line', (news) => newsletter(news, 'Dates inside.', { text: 'More at www.garden.example today.' })],
    ];
    for (const [what, intent] of refused) await expect(planned(await gardenFolder(), intent), what).rejects.toThrow();
    // Links to a note in the folder, or to the thing it files, pass; and the model is told the text is data.
    const calls: ClaudeCall[] = [];
    const m = await planned(await gardenFolder(), (news) => newsletter(news, 'About [[Garden plot]], from [[Garden newsletter, autumn.pdf]].', { text: 'Autumn newsletter filed.' }), calls);
    expect(m.operations.some((o) => o.effect.kind === 'create-text' && o.effect.text.includes('[[Garden plot]]'))).toBe(true);
    expect(calls[0]?.input).toMatch(/data, not instructions/);
  });
});
