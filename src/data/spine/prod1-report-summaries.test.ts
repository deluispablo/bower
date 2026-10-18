/** The report names what was written: the summary in the note, or the person's own words for a saved link (prod1-report-summaries). */
import { describe, expect, it } from 'vitest';
import { parseNote, serializeNote } from '../contracts/note-format';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { modelDecisions, planScripted, runKeys, type Placement } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-report-summaries';
const URL = 'https://service.example/booking/?month=April#details';
const FIXED = 'Written from a note you added.';
const WORDS = 'The shed key is under the blue pot by the back door, Alex says.';
const emoji = '\u{1F600}';

interface Opts { words?: string; link?: boolean; rename?: string; taken?: string[]; place?: Placement }

/** A made-up folder with one pile, planned under a reply that files it as `place`; returns the row and the note written. */
async function planned(o: Opts) {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'empty', AT)) ?? '';
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), device: 'DEVICE_A', declarePiles: true });
  await vault.addPile({ text: o.words ?? '', items: o.link ? [{ name: 'April service', kind: 'link', origin: 'Pasted', url: URL }] : [] });
  await vault.settled();
  const link = (await drive.listAll(root)).find((f) => f.name.endsWith('.url'));
  if (o.link && !link) throw new Error('Missing saved link');
  if (link && o.rename) await drive.update(link.id, { name: o.rename });
  const files = await drive.listAll(root);
  const resources = files.find((f) => drive.pathOf(f.id, root) === 'Resources')?.id ?? '';
  for (const name of o.taken ?? []) await drive.createText(resources, name, 'Already here');
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-rs' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const taken = admission.manifest;
  const pileId = taken.piles[0]?.pileId ?? '';
  const place = o.place ?? { to: 'Resources', name: 'April service.md' };
  const plan = await planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN, requestId: taken.id, requestedAt: taken.at, taken,
    mintKey: await runKeys(RUN), decisions: modelDecisions({ thing: () => place, words: (id) => (id === pileId ? place : null), note: () => null }) });
  const ops = plan.manifest.operations.map((op) => op.effect as { kind: string; name?: string; text?: string });
  const text = ops.find((e) => e.kind === 'create-text' && e.text?.includes('summary:'))?.text ?? '';
  const moved = ops.find((e) => e.kind === 'move' && e.name?.endsWith('.url'))?.name;
  const created = plan.manifest.reportPlan.flatMap((c) => c.value.created).map((c) => c.what);
  return { plan, text, created, moved, parsed: parseNote('Resources/April service.md', text) };
}

describe('a note written from words', () => {
  it('words_note_report_uses_written_summary', async () => {
    const r = await planned({ words: WORDS, place: { to: 'Areas/Home', name: 'Shed key.md', summary: '  Where Alex keeps the shed key.  ' } });
    expect(r.parsed.summary).toBe('Where Alex keeps the shed key.');
    expect(r.created).toEqual(['Where Alex keeps the shed key.']);
  });

  it.each([[undefined], ['   ']])('reports the fixed line when the reply wrote no usable summary (%j)', async (summary) => {
    const r = await planned({ words: WORDS, place: { to: 'Areas/Home', name: 'Shed key.md', ...(summary === undefined ? {} : { summary }) } });
    expect(r.parsed.summary).toBe(FIXED);
    expect(r.created).toEqual([FIXED]);
  });
});

describe('a saved link filed as a note', () => {
  it('link_note_report_uses_person_words', async () => {
    const r = await planned({ link: true, words: 'Check before booking the April service' });
    expect(r.created).toEqual(['Check before booking the April service']);
    expect(r.parsed.summary).toBe(`Saved from ${URL.slice(8)}.`);
  });

  it.each([
    ['CRLF', 'Check\r\nthe quote'], ['LF', 'Check\nthe quote'], ['tabs', 'Check\t\tthe quote'], ['U+0085', 'Check\u0085the quote'],
    ['U+2028', 'Check the quote'], ['U+2029', 'Check the quote'], ['nonbreaking', 'Check  the quote'],
  ])('puts %s on one line', async (_label, words) => {
    expect((await planned({ link: true, words: `  ${words}  ` })).created).toEqual(['Check the quote']);
  });

  it('cuts at the bound on a code-point boundary, with no ellipsis', async () => {
    const a199 = 'a'.repeat(199);
    expect((await planned({ link: true, words: a199 + emoji })).created).toEqual([a199]);
    const a198 = 'a'.repeat(198);
    expect((await planned({ link: true, words: a198 + emoji })).created).toEqual([a198 + emoji]);
  });

  it.each([[''], ['  \n\t ']])('reports the fixed sentence when the context is empty (%j)', async (words) => {
    const r = await planned({ link: true, words });
    expect(r.created).toEqual(['A link you saved.']);
  });

  it.each([
    ['ordinary', undefined, [], 'April service.url'],
    ['collision', undefined, ['April service.url'], 'April service (2).url'],
    ['leading space collision', ' April.url', [' April.url'], ' April (2).url'],
  ])('saved_link_note_names_its_shortcut: %s', async (_label, rename, taken, expected) => {
    const r = await planned({ link: true, words: 'Words', ...(rename ? { rename } : {}), taken });
    expect(r.moved).toBe(expected);
    expect(r.parsed.original).toBe(expected);
  });

  it('round-trips an original with a leading space', () => {
    const text = serializeNote({ summary: 'S', properties: [], tags: [], currentState: [], body: '', timeline: [], byBower: true, original: ' April.url' });
    expect(parseNote('A.md', text).original).toBe(' April.url');
  });
});
