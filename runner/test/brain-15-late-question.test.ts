/**
 * brain-15: a doubt only execution's reading can see gets one question (rulings 0-12, R2-1, R2-2, R3-1). An execution ask
 * the selection did not ask (a late ask) quotes, word for word, what was supplied for its source; it gives no options
 * (Bower offers them), files nothing of its source and never reopens a stored answer.
 * Harness: b1-planning-support. Made-up homes and names only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lintFacts, parseNote, searchTokens } from '../../src/data/contracts/note-format';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { REFUSALS } from '../src/claude';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { empty, note, run, setup, type Base } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

// Ruling 11's exact text.
const ASK_OPTIONS = 'a question the selection did not ask without "evidence":{"quote"} copied word for word from what was supplied for that source, or with options other than the selection gave (a new question gives none)';

const HOME = 'Areas/Home';
const HUB = `${HOME}/Home.md`;
const ELM = `${HOME}/Elm Street`;
const BIRCH = `${HOME}/Birch Lane`;
const GARDEN = 'Resources/Gardening';
const GARDEN_HUB = `${GARDEN}/Gardening.md`;
const QUOTE = 'the Elm Street flat and the Birch Lane cottage';
const GARDEN_QUOTE = 'We plant tomatoes along the south fence';
const BOILER = 'Boiler service.txt';
const BOILER_TEXT = 'Annual boiler service is due next month.';
const BOILER_LINE = 'Boiler service reminder.';
const SEEDS = 'Seed order.txt';
const FOLDER: Record<string, string> = {
  [HUB]: note('Alex keeps the household papers here.', 'We own two homes: the Elm Street flat and the Birch Lane cottage.\n'),
  [`${ELM}/Elm Street boiler.md`]: note('The gas boiler at the Elm Street flat.'),
  [`${BIRCH}/Birch Lane boiler.md`]: note('The oil boiler at the Birch Lane cottage.'),
  [GARDEN_HUB]: note('Alex plans the vegetable garden.', 'We plant tomatoes along the south fence every spring.\n'),
};

async function homes() {
  const b = await setup({ folder: FOLDER, inbox: [{ line: BOILER_LINE, files: [BOILER] }, { line: 'Seeds for the garden.', files: [SEEDS] }],
    inboxFiles: { [BOILER]: `${BOILER_TEXT}\n`, [SEEDS]: 'Tomato seeds arrive on Friday.\n' } });
  const idOf = (name: string): string => b.sources.find((s) => s.name === name)?.itemId ?? `no ${name}`;
  return { b, boiler: idOf(BOILER), seeds: idOf(SEEDS) };
}
type Homes = Awaited<ReturnType<typeof homes>>;
type R = Awaited<ReturnType<typeof run>>;

const selection = ({ b, boiler, seeds }: Homes, asks: unknown[] = []) => ({ items: [
  { itemId: boiler, kind: 'unknown', destination: b.id(HOME), wants: [] },
  { itemId: seeds, kind: 'unknown', destination: b.id(GARDEN), wants: [] },
], asks });
const seedsFiled = ({ seeds }: Homes) => ({ fileId: seeds, to: GARDEN, name: SEEDS,
  note: { name: 'Seed order.md', summary: 'Tomato seeds arrive on Friday.', body: 'Tomato seeds arrive on Friday.' } });
const boilerFiled = ({ boiler }: Homes) => ({ fileId: boiler, to: HOME, name: BOILER,
  note: { name: 'Boiler service.md', summary: BOILER_TEXT, body: BOILER_TEXT } });
const question = { text: 'Which home is this boiler service for?', yes: 'Yes', no: 'No' };
const lateAsk = (fileId: string, extra: Record<string, unknown> = {}) => ({ fileId, ...question, evidence: { quote: QUOTE }, ...extra });
const late = (h: Homes, asks: unknown[], things = [seedsFiled(h)]) => ({ ...empty, things, asks });
const good = (h: Homes) => ({ ...empty, things: [seedsFiled(h), boilerFiled(h)] });

const refusedAs = (r: R): string => /\((\w+)\)/.exec(r.errors.split('\n').find((l) => /asking once more/.test(l)) ?? '')?.[1] ?? 'none';
const told = (r: R, text: string): boolean => r.frames.some((f) => f.prompt.includes(`Your reply was refused: ${text}. Reply again`));
const inInbox = (r: R, id: string): boolean => (r.pathsById[id] ?? '').startsWith('Inbox/');
const filed = (r: R, path: string): boolean => path in r.after;
interface Stored { id: string; about?: string; subject?: string; options?: Array<{ id: string; label: string; action: { folderId: string } }> }
const stored = (r: R): Stored[] => (JSON.parse(r.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Stored[] }).questions;

/** R2-2, R3-1: the facts the offered options and the quote rest on, checked before the run. */
function fixtureFacts(b: Base, r: R, boiler: string) {
  const hub = parseNote(HUB, FOLDER[HUB] ?? '');
  const indexedWords = new Set(searchTokens(`Home ${hub.summary} ${hub.tags.join(' ')} ${(lintFacts(HUB, FOLDER[HUB] ?? '')?.terms ?? []).join(' ')}`));
  const sourceWords = searchTokens(`${BOILER} ${BOILER_TEXT} ${BOILER_LINE}`);
  expect(sourceWords.filter((w) => indexedWords.has(w)), 'fixture: Home.md\'s indexed text shares no word with the boiler source or its pile').toEqual([]);
  for (const path of [`${ELM}/Elm Street boiler.md`, `${BIRCH}/Birch Lane boiler.md`]) {
    expect(parseNote(path, FOLDER[path] ?? '').summary, `fixture: ${path} names a boiler`).toMatch(/boiler/i);
  }
  const map = (r.frames[0]?.value.map as Array<{ path: string; hub?: { id: string; path: string } }> | undefined) ?? [];
  expect(map.find((row) => row.path === HOME)?.hub?.path, 'fixture: Home.md is the hub of Areas/Home').toBe(HUB);
  expect(FOLDER[HUB], 'fixture: Home.md is not a moc').not.toMatch(/^type: *moc$/m);
  const sources = (r.frames[0]?.value.sources as Array<{ itemId: string; candidates: Array<{ id: string }> }> | undefined) ?? [];
  const candidates = sources.find((s) => s.itemId === boiler)?.candidates.map((c) => c.id) ?? [];
  expect(candidates, 'fixture: both boiler notes are candidates').toEqual(expect.arrayContaining([b.id(`${ELM}/Elm Street boiler.md`), b.id(`${BIRCH}/Birch Lane boiler.md`)]));
  expect(candidates, 'fixture: Home.md is not a candidate').not.toContain(b.id(HUB));
  const notes = (r.frames[1]?.value.notes as Array<{ path: string }> | undefined) ?? [];
  expect(notes.map((n) => n.path), 'fixture: Home.md is read for execution as the destination\'s hub').toContain(HUB);
}

describe('a late question (brain-15)', () => {
  it('AC1 newly read evidence can trigger a filing question', async () => {
    const h = await homes();
    const r = await run(h.b, [selection(h), late(h, [lateAsk(h.boiler)])]);
    fixtureFacts(h.b, r, h.boiler);
    expect(refusedAs(r), r.errors).toBe('none');
    expect(r.frames, 'accepted on the first call').toHaveLength(2);
    expect(r.code).toBe(0);
    expect(inInbox(r, h.boiler), 'the boiler file is not moved').toBe(true);
    const open = stored(r);
    expect(open).toHaveLength(1);
    expect(open[0]?.id).toBe(`q-ask-${h.boiler}`);
    expect(open[0]?.options?.map((o) => o.action.folderId), 'the options are the two homes, by path').toEqual([h.b.id(BIRCH), h.b.id(ELM)]);
    expect(filed(r, `${GARDEN}/${SEEDS}`), 'the unrelated pile is filed').toBe(true);
  });

  describe('AC1b a late question needs supplied evidence', () => {
    it('REFUSALS.askOptions is ruling 11\'s text', () => {
      expect(REFUSALS.askOptions).toBe(ASK_OPTIONS);
    });

    it('(a) a quote in no supplied evidence is refused askOptions', async () => {
      const h = await homes();
      const r = await run(h.b, [selection(h), late(h, [lateAsk(h.boiler, { evidence: { quote: 'the Maple Road house and the Oak Lane cabin' } })]), good(h)]);
      expect(refusedAs(r)).toBe('askOptions');
      expect(told(r, ASK_OPTIONS)).toBe(true);
      expect(r.code).toBe(0);
    });

    it('(b) a quote only in a note shown for another source is refused askOptions', async () => {
      const h = await homes();
      const r = await run(h.b, [selection(h), late(h, [lateAsk(h.boiler, { evidence: { quote: GARDEN_QUOTE } })]), good(h)]);
      const notes = (r.frames[1]?.value.notes as Array<{ path: string; text: string }> | undefined) ?? [];
      expect(notes.find((n) => n.path === GARDEN_HUB)?.text, 'fixture: the garden note is shown in the same call').toContain(GARDEN_QUOTE);
      expect(refusedAs(r)).toBe('askOptions');
      expect(told(r, ASK_OPTIONS)).toBe(true);
      expect(r.code).toBe(0);
    });

    // guard
    it('(c) a valid quote with options is refused askOptions', async () => {
      const h = await homes();
      const options = [{ folderId: h.b.id(BIRCH), label: 'Birch Lane' }, { folderId: h.b.id(ELM), label: 'Elm Street' }];
      const r = await run(h.b, [selection(h), late(h, [lateAsk(h.boiler, { options })]), good(h)]);
      expect(refusedAs(r)).toBe('askOptions');
      expect(told(r, REFUSALS.askOptions)).toBe(true);
      expect(r.code).toBe(0);
    });

    // guard
    it('(d) a selection ask carrying evidence is refused selectionKeys', async () => {
      const h = await homes();
      const r = await run(h.b, [selection(h, [lateAsk(h.boiler)]), selection(h), good(h)]);
      expect(refusedAs(r)).toBe('selectionKeys');
      expect(told(r, REFUSALS.selectionKeys)).toBe(true);
    });
  });

  // guard
  it('AC2 a late question cannot also file its source', async () => {
    const h = await homes();
    const r = await run(h.b, [selection(h), late(h, [lateAsk(h.boiler)], [seedsFiled(h), boilerFiled(h)]), good(h)]);
    expect(refusedAs(r)).toBe('askAlsoFiles');
  });

  describe('AC3 a late question stays bound and unique', () => {
    // guard
    it('(a) a late ask on an unadmitted thing is refused askNotAdmitted', async () => {
      const h = await homes();
      const r = await run(h.b, [selection(h), late(h, [lateAsk('f-none')], [seedsFiled(h), boilerFiled(h)]), good(h)]);
      expect(refusedAs(r)).toBe('askNotAdmitted');
      expect(r.code).toBe(0);
      expect(filed(r, `${GARDEN}/${SEEDS}`)).toBe(true);
    });

    // guard
    it('(b) two late asks on one thing are refused askTwice', async () => {
      const h = await homes();
      const r = await run(h.b, [selection(h), late(h, [lateAsk(h.boiler), lateAsk(h.boiler)]), good(h)]);
      expect(refusedAs(r)).toBe('askTwice');
      expect(r.code).toBe(0);
      expect(filed(r, `${GARDEN}/${SEEDS}`)).toBe(true);
    });

    it('(c) a late ask on a thing with a stored answer is refused askTwice', async () => {
      const h = await homes();
      // One run asks about the boiler file as selected; the person answers yes.
      const ask = { fileId: h.boiler, ...question };
      const first = await run(h.b, [selection(h, [ask]), late(h, [ask])]);
      expect(first.code, first.errors).toBe(0);
      const [asked] = stored(first);
      expect(asked?.id, 'setup: the boiler file was asked about').toBe(`q-ask-${h.boiler}`);
      await h.b.drive.createText(h.b.id(SYSTEM.changes), 'brain-15-answer.json', JSON.stringify({
        v: 1, id: 'brain-15-answer', device: 'device-1', kind: 'answer', questionId: asked?.id,
        askedAt: (asked as { askedAt?: number } | undefined)?.askedAt, at: AT - 1, what: 'Answered a question', text: 'yes' }));
      const admitted = await planAdmission(fakeRead(h.b.drive), h.b.root, { scope: 'all', clock: () => AT + 1, newId: () => 'brain-15-admission' });
      if (admitted.kind !== 'manifest') throw new Error('setup: the answer is admitted');
      // The next run (another press): a late ask with a valid quote reopens nothing; its retry files the boiler file.
      const second = { items: [{ itemId: h.boiler, kind: 'unknown', destination: h.b.id(HOME), wants: [] }], asks: [] };
      const r = await run(h.b, [second, late(h, [lateAsk(h.boiler)], []), { ...empty, things: [boilerFiled(h)] }], { admission: admitted.manifest, press: 2 });
      expect(refusedAs(r), r.errors).toBe('askTwice');
      expect(r.code, r.errors).toBe(0);
      expect(filed(r, `${HOME}/${BOILER}`)).toBe(true);
    });
  });
});
