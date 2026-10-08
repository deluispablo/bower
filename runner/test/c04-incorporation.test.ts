/**
 * The first P4-C slice (`c04-incorporation`, TL-P4-03): the model sees bounded content, not just names, and its intent
 * carries note text (a thing's own note, Timeline lines for the notes it was shown), while the runner still builds
 * every operation and the spine validates it. No live call: scripted proposals first, then a recorded Claude reply,
 * each scored by the corpus scorer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead, type ScriptedRead } from '../../src/data/spine/read';
import { listedPiles } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import { serializeNote } from '../../src/data/vault/note-format';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { claudeProvider, type ClaudeCall, type ClaudeExit, type ClaudeSpawn } from '../src/claude';
import { loadCorpus, score, type LoadedCase } from '../src/corpus';
import { runWithClaude } from './corpus-run';
import { RUN_ID, fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');
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
    const hub = serializeNote({ summary: 'Alex\'s plot.', properties: [], tags: [], currentState: [], body: 'Plot 14. '.repeat(800), timeline: [{ date: '2026-09-12', text: 'Planted garlic.', source: null }], byBower: true });
    await drive.createText(garden, 'Garden.md', hub, { by: 'bower' });
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
    const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
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
    const first = things.get('Long notes 1.txt');
    expect(first?.cut).toBe(30_000 - PER_THING);
    expect(first?.text).toMatch(CUT);
    expect(first?.text?.replace(CUT, '')).toBe('1'.repeat(PER_THING));
    // Bounded per run: what is past the run's budget is cut too, and says so.
    const shown = [...things.values()].reduce((n, t) => n + (t.text?.replace(CUT, '').length ?? 0), 0);
    expect(shown).toBeLessThanOrEqual(PER_RUN);
    const last = things.get('Long notes 5.txt');
    expect(last?.cut).toBeGreaterThan(30_000 - PER_THING);
    expect(last?.text ?? last?.why ?? '').toMatch(/cut here|budget/);
    // The prompt tells the model what it was not shown.
    expect(input).toMatch(/OCR/);

    // The notes it may update: Bower's own, with their current text, bounded and marked; never Alex's own note.
    expect(ctx.notes.map((n) => n.path)).toEqual(['Areas/Garden/Garden.md']);
    const note = ctx.notes[0];
    expect(note?.text.startsWith(hub.slice(0, 200))).toBe(true);
    expect(note?.cut).toBe(hub.length - PER_NOTE);
    expect(note?.text).toMatch(CUT);
    expect(ctx.notes.reduce((n, x) => n + x.text.replace(CUT, '').length, 0)).toBeLessThanOrEqual(NOTES_PER_RUN);
  });
});

/** A proposal by names, as a script would write it: the runner's context gives each thing's file id. */
interface Proposal {
  things: Array<{ thing: string; to: string; name: string; note?: { name: string; summary: string; body: string } }>;
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
      name: 'Saltmere Hardware, 2026-09-14.pdf',
      note: { name: 'Saltmere Hardware, 2026-09-14.md', summary: 'Saltmere Hardware receipt, 2026-09-14, total 51.91.', body: 'Four items, total 51.91 paid by card. Returns within 28 days.' },
    }],
  },
  'c04-offer-and-flat': {
    things: [
      { thing: 'Offer_letter_final(2).pdf', to: 'Projects/Job hunt/Applications', name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick for Industrial Designer.', body: 'Fully remote. Salary 42,000 a year. Start 2 November.' } },
      { thing: 'listing-88213.example.url', to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
      { thing: 'IMG_2301.jpg', to: 'Projects/Flat hunt/Viewing photos', name: 'Wrenfield Road, kitchen.jpg' },
      { thing: 'Payslip_Aug.pdf', to: 'Areas/Money/Payslips', name: 'Payslip August (2).pdf' },
    ],
    lines: [
      { note: 'Projects/Flat hunt/Flat hunt.md', text: 'A fourth flat added; the shortlist compared by commute.', cites: 'listing-88213.example.url' },
      { note: 'Projects/Job hunt/Job hunt.md', text: 'New offer from Ferrowick, scored 7 out of 10 against your CV.', cites: 'Offer_letter_final(2).pdf' },
      { note: 'Projects/Job hunt/Job hunt.md', text: 'A flat from the same pile went to the flat hunt.', cites: 'listing-88213.example.url' },
    ],
  },
  'bench-2-text-pdf': {
    things: [{ thing: 'Community garden newsletter, autumn.pdf', to: 'Resources/Garden', name: 'Community garden newsletter, autumn.pdf', note: { name: 'Community garden newsletter, autumn.md', summary: 'Autumn newsletter of the community garden.', body: 'Bulb planting on 18 October; plot fees due by 31 January.' } }],
  },
  'bench-3-receipt-pdf': {
    things: [{ thing: 'receipt-2026-09-14.pdf', to: 'Areas/Money/Receipts', name: 'Example Hardware, 2026-09-14.pdf', note: { name: 'Example Hardware, 2026-09-14.md', summary: 'Hardware receipt, total 51.91.', body: 'Total 51.91, paid by card.' } }],
  },
};

/** Scripted proposals: `claude` answered by a script in the same intent shape, its file ids from the context. */
function proposing(p: Proposal, seen: Context[]): ClaudeSpawn {
  return async (call) => {
    const ctx = contextOf(call.input);
    seen.push(ctx);
    const ids = new Map(ctx.piles.flatMap((x) => x.things).map((t) => [t.name, t.fileId]));
    const id = (name: string): string => ids.get(name) ?? `no ${name}`;
    const intent = {
      kind: 'tidy-intent',
      v: 1,
      things: p.things.map(({ thing, ...rest }) => ({ fileId: id(thing), ...rest })),
      ...(p.lines ? { lines: p.lines.map(({ cites, ...rest }) => ({ ...rest, ...(cites ? { cites: id(cites) } : {}) })) } : {}),
    };
    return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
  };
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
        if (t.thing.endsWith('.pdf') && c.inboxFiles[t.thing]?.startsWith('%PDF-1.4\n')) expect({ id: c.id, text: shown?.text?.includes('51.91') || shown?.text?.includes('18 October') || shown?.text?.includes('Ferrowick') }).toEqual({ id: c.id, text: true });
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
