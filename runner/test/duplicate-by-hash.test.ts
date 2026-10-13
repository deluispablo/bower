/**
 * A thing already saved (TL-P4-10 addendum 2, `duplicate-by-hash`; the local second brain's method, TL-P4-08): a thing
 * whose stored content (Drive's md5Checksum, from the listing) equals a file already filed in the folder goes to the
 * Drive Bin, is reported "already saved as <name>", and gets no note and no Timeline line. The spine decides it, not
 * the model, which never sees it. No live call: `claude` is answered by scripted proposals for what it is shown.
 */
import { phaseAwareClaude } from './b1-planning-support';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { EMPTY_MD5 } from '../../src/data/contracts/hashes';
import { duplicatesOf } from '../../src/data/spine/duplicates';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { runWithClaude, type CaseRun } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
afterEach(() => vi.restoreAllMocks());

const OFFER = 'Offer_letter_final(2).pdf';
const FILED = 'Projects/Job hunt/Offer letter.pdf';
const HUB = 'Projects/Job hunt/Job hunt.md';

interface Shown { piles: Array<{ pileId: string; words: string; things: Array<{ fileId: string; name: string }> }> }
const shownOf = (input: string): Shown => JSON.parse(input.split('\n').at(-1) ?? '{}') as Shown;
const envelope = (result: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result, usage: { input_tokens: 10, output_tokens: 10 } });

/** Plain names for what the model files, by the name it was added under. */
const NAMES: Record<string, { to: string; name: string }> = {
  [OFFER]: { to: 'Projects/Job hunt', name: 'Offer letter.pdf' },
  'Offer copy.pdf': { to: 'Projects/Job hunt', name: 'Offer letter.pdf' },
  'Payslip_Aug.pdf': { to: 'Resources/Pay', name: 'Payslip August.pdf' },
  'listing-88213.example.url': { to: 'Projects/Flat hunt', name: 'Flat listing.url' },
  'empty.txt': { to: 'Resources/Notes', name: 'Empty page.txt' },
};

/**
 * Files every thing it is shown, with a note for each one that takes one, and (as on staging) a confirmation line on
 * the job hunt note for the offer when it is shown the offer. Keeps what it was shown, by name.
 */
function modelFiling(shown: string[], act?: () => Promise<void>): ClaudeSpawn {
  return phaseAwareClaude(async (call, _step, _attempt, phase) => {
    if (phase === 'execution') await act?.();
    const things = shownOf(call.input).piles.flatMap((p) => p.things);
    if (phase === 'execution') shown.push(...things.map((t) => t.name));
    const offer = things.find((t) => NAMES[t.name]?.name === 'Offer letter.pdf');
    const intent = {
      kind: 'tidy-intent',
      v: 1,
      things: things.map((t) => ({
        fileId: t.fileId,
        ...(NAMES[t.name] ?? { to: 'Resources/Notes', name: 'Something kept.txt' }),
        ...(t.name.endsWith('.url') ? {} : { note: { name: `${(NAMES[t.name]?.name ?? 'Something kept').replace(/\.[a-z]+$/, '')}.md`, summary: 'Something kept.', body: 'Something kept.' } }),
      })),
      ...(offer ? { lines: [{ note: HUB, text: 'The offer letter came in again.', cites: offer.fileId }] } : {}),
    };
    return { code: 0, stderr: '', cut: null, stdout: envelope(JSON.stringify(intent)) };
  });
}

/** The model's filing, after something the person does in the folder while the model works. */
const during = (act: () => Promise<void>): ClaudeSpawn => modelFiling([], act);

async function offerCase(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('no corpus case c04-offer-and-flat');
  c.folder[HUB] = (c.folder[HUB] ?? '').replace('Applications and offers.', 'Applications and offer letters.');
  return c;
}

/** The offer's bytes, as the case keeps them (as text when they read as text). */
const offerBytes = (c: LoadedCase): Uint8Array => c.inboxBinary[OFFER] ?? new TextEncoder().encode(c.inboxFiles[OFFER] ?? '');

/** The offer already filed under the job hunt, the same bytes as the one in the inbox. */
async function offerFiled(): Promise<LoadedCase> {
  const c = await offerCase();
  return { ...c, folderBinary: { ...c.folderBinary, [FILED]: offerBytes(c) } };
}

interface Report { filed: Array<{ name: string; to: string }>; created: unknown[]; updated: unknown[]; setAside: Array<{ name: string; why: string }>; alreadySaved?: Array<{ name: string; as: string }> }
const reportOf = (run: CaseRun): Report => (run.lastRun as { run: { report: Report } }).run.report;
const inFolder = (run: CaseRun, under: string): string[] => Object.keys(run.after).filter((p) => p.startsWith(`${under}/`)).sort();

interface Op { effect: { kind: string; before?: { fileId: string; name: string; parents: string[] } } }
interface ManifestShape { operations: Op[]; capture: { members: Array<{ file: { fileId: string } }> } }
const manifestOf = (run: CaseRun): ManifestShape => {
  const path = Object.keys(run.after).find((p) => /^\.bower\/runs\/[^/]+\/manifest-[0-9a-f]+\.json$/.test(p));
  return JSON.parse(path ? (run.after[path] ?? '{}') : '{"operations":[],"capture":{"members":[]}}') as ManifestShape;
};

/** Every live file and folder under the root, by path. */
async function byPath(drive: FakeDrive, root: string): Promise<Map<string, DriveFile>> {
  const all = await drive.listAll(root);
  const byId = new Map(all.map((f) => [f.id, f]));
  const out = new Map<string, DriveFile>();
  for (const f of all) {
    const parts: string[] = [];
    for (let x: DriveFile | undefined = f; x; x = byId.get(x.parents[0] ?? '')) parts.unshift(x.name);
    out.set(parts.join('/'), f);
  }
  return out;
}

describe('a thing already saved (duplicate-by-hash)', () => {
  it('a thing whose content is already filed goes to the Bin as already saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    const shown: string[] = [];
    const run = await runWithClaude({ ...c, inbox: [{ line: 'The signed offer, and my payslip.', files: [OFFER, 'Payslip_Aug.pdf'] }] }, modelFiling(shown));
    expect(run.code).toBe(0);
    // The model never sees it: the spine decided.
    expect(shown).toEqual(['Payslip_Aug.pdf']);
    // Nothing of it is left in the inbox, nothing new under the job hunt, and its note keeps its text (no line).
    expect(inFolder(run, 'Inbox')).toEqual([]);
    expect(inFolder(run, 'Projects/Job hunt')).toEqual([HUB, FILED].sort());
    expect(run.after[HUB]).toBe(c.folder[HUB]);
    const report = reportOf(run);
    expect(report.alreadySaved).toEqual([{ name: OFFER, as: 'Offer letter.pdf' }]);
    expect(report.filed.map((f) => f.name)).toEqual(['Payslip_Aug.pdf']);
    expect(report.updated).toEqual([]);
    // In the Drive Bin, never deleted.
    const bin = manifestOf(run).operations.find((o) => o.effect.kind === 'bin' && o.effect.before?.name === OFFER);
    expect(bin).toBeDefined();
    await expect(run.drive.untrash(bin?.effect.before?.fileId ?? '')).resolves.toMatchObject({ name: OFFER });
  });

  it('undo brings an already-saved thing back to the inbox', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    const run = await runWithClaude({ ...c, inbox: [{ line: '', files: [OFFER] }] }, modelFiling([]));
    expect(run.code).toBe(0);
    expect(reportOf(run).alreadySaved).toEqual([{ name: OFFER, as: 'Offer letter.pdf' }]);
    const m = manifestOf(run);
    const bin = m.operations.find((o) => o.effect.kind === 'bin' && o.effect.before?.name === OFFER);
    // The manifest records what undo needs: the thing as the run saw it (its id, name and inbox place), captured.
    const before = bin?.effect.before;
    expect(before).toBeDefined();
    expect(m.capture.members.map((x) => x.file.fileId)).toContain(before?.fileId);
    const inbox = (await byPath(run.drive, run.root)).get('Inbox');
    expect(before?.parents).toEqual([inbox?.id]);
    expect((await byPath(run.drive, run.root)).has(`Inbox/${OFFER}`)).toBe(false);
    // Undo restores it from the Bin: Drive puts it back where it was, in the inbox, as it was.
    await run.drive.untrash(before?.fileId ?? '');
    const back = (await byPath(run.drive, run.root)).get(`Inbox/${OFFER}`);
    expect(back?.id).toBe(before?.fileId);
    expect(new Uint8Array(await run.drive.readBytes(back?.id ?? ''))).toEqual(offerBytes(c));
  });

  it('a copy inside the same pile keeps one and bins the other as already saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerCase();
    const bytes = offerBytes(c);
    const shown: string[] = [];
    const run = await runWithClaude({ ...c, inboxBinary: { ...c.inboxBinary, 'Offer copy.pdf': bytes }, inbox: [{ line: 'The offer, twice.', files: [OFFER, 'Offer copy.pdf'] }] }, modelFiling(shown));
    expect(run.code).toBe(0);
    expect(shown).toHaveLength(1);
    const kept = shown[0] ?? '';
    const copy = kept === OFFER ? 'Offer copy.pdf' : OFFER;
    expect(inFolder(run, 'Inbox')).toEqual([]);
    expect(inFolder(run, 'Projects/Job hunt').filter((p) => p.endsWith('.pdf'))).toEqual([FILED]);
    expect(reportOf(run).alreadySaved).toEqual([{ name: copy, as: 'Offer letter.pdf' }]);
    expect(reportOf(run).filed.map((f) => f.name)).toEqual([kept]);
  });

  it('an empty file is never taken for one already saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerCase();
    const shown: string[] = [];
    const run = await runWithClaude({ ...c, folder: { ...c.folder, 'Resources/Notes/Blank.txt': '' }, inboxFiles: { ...c.inboxFiles, 'empty.txt': '' }, inbox: [{ line: '', files: ['empty.txt'] }] }, modelFiling(shown));
    expect(run.code).toBe(0);
    expect(shown).toEqual(['empty.txt']);
    expect(reportOf(run).alreadySaved ?? []).toEqual([]);
    expect(reportOf(run).filed.map((f) => f.name)).toEqual(['empty.txt']);
  });

  it('a saved link with the same address as a filed one is filed as usual', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerCase();
    const link = c.inboxFiles['listing-88213.example.url'] ?? '';
    const shown: string[] = [];
    const run = await runWithClaude({ ...c, folder: { ...c.folder, 'Projects/Flat hunt/Listing.url': link }, inbox: [{ line: '', files: ['listing-88213.example.url'] }] }, modelFiling(shown));
    expect(run.code).toBe(0);
    expect(shown).toEqual(['listing-88213.example.url']);
    expect(reportOf(run).alreadySaved ?? []).toEqual([]);
  });

  it('a filed copy the person already binned does not count', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    const shown: string[] = [];
    const binFiled = async (drive: FakeDrive, root: string): Promise<void> => {
      const f = (await byPath(drive, root)).get(FILED);
      if (!f) throw new Error('no filed offer');
      await drive.trash(f.id);
    };
    const run = await runWithClaude({ ...c, inbox: [{ line: '', files: [OFFER] }] }, modelFiling(shown), undefined, binFiled);
    expect(run.code).toBe(0);
    expect(shown).toEqual([OFFER]);
    expect(reportOf(run).alreadySaved ?? []).toEqual([]);
    expect(reportOf(run).filed.map((f) => f.name)).toEqual([OFFER]);
  });

  it("a binned duplicate's open question closes", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    const hash = createHash('md5').update(offerBytes(c)).digest('hex');
    // Asked about an earlier upload of the same offer (since filed); this upload of it goes to the Bin.
    const question = { id: 'q-ask-earlier', text: 'Is this the signed offer?', yes: 'Yes', no: 'No', subject: 'earlier-upload', hash, askedAt: 1 };
    const run = await runWithClaude({ ...c, questions: [question] as never, inbox: [{ line: '', files: [OFFER] }, { line: '', files: ['Payslip_Aug.pdf'] }] }, modelFiling([]));
    expect(run.code).toBe(0);
    expect(reportOf(run).alreadySaved).toEqual([{ name: OFFER, as: 'Offer letter.pdf' }]);
    expect((JSON.parse(run.after['.bower/questions.json'] ?? '{}') as { questions: unknown[] }).questions).toEqual([]);
  });

  it('a refused Bin keeps its question open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    const hash = createHash('md5').update(offerBytes(c)).digest('hex');
    // Asked about an earlier upload of the same offer; this upload of it is saved already, so its Bin would close it.
    const question = { id: 'q-ask-earlier', text: 'Is this the signed offer?', yes: 'Yes', no: 'No', subject: 'earlier-upload', hash, askedAt: 1 };
    let at: { drive: FakeDrive; root: string } | null = null;
    // While the model works, the person saves other words over the inbox copy: the engine refuses its Bin.
    const copyChanges = async (): Promise<void> => {
      const f = at ? (await byPath(at.drive, at.root)).get(`Inbox/${OFFER}`) : undefined;
      if (!at || !f) throw new Error('no inbox offer');
      await at.drive.writeText(f.id, 'A different signed offer.', f.modifiedTime);
    };
    const run = await runWithClaude({ ...c, questions: [question] as never, inbox: [{ line: '', files: [OFFER] }, { line: '', files: ['Payslip_Aug.pdf'] }] }, during(copyChanges), undefined, async (drive, root) => { at = { drive, root }; });
    expect(run.code).toBe(0);
    expect(reportOf(run).alreadySaved ?? []).toEqual([]);
    expect(run.after[`Inbox/${OFFER}`]).toBe('A different signed offer.');
    // The thing stayed in the inbox, so its question stays open.
    expect((JSON.parse(run.after['.bower/questions.json'] ?? '{}') as { questions: Array<{ id: string }> }).questions.map((q) => q.id)).toEqual(['q-ask-earlier']);
  });

  it('a Google Doc, a saved link, an empty file and a file in the inbox or Bower\'s own files are never saved copies', () => {
    const at = '2026-10-07T09:00:00.000Z';
    const file = (id: string, name: string, parent: string, more: Partial<DriveFile> = {}): DriveFile => ({ id, name, parents: [parent], folder: false, modifiedTime: at, createdTime: at, ...more });
    const folder = (id: string, name: string, parent: string): DriveFile => ({ ...file(id, name, parent), folder: true });
    const same = '0123456789abcdef0123456789abcdef';
    const listing = [
      folder('inbox', 'Inbox', 'root'), folder('projects', 'Projects', 'root'), folder('own', '.bower', 'root'),
      // A Google Doc has no md5Checksum: never compared.
      file('doc-filed', 'Plan', 'projects'), file('doc-new', 'Plan', 'inbox'),
      file('link-filed', 'Listing.url', 'projects', { md5Checksum: same }), file('link-new', 'listing.url', 'inbox', { md5Checksum: same, appProperties: { kind: 'link' } }),
      file('empty-filed', 'Blank.txt', 'projects', { md5Checksum: EMPTY_MD5 }), file('empty-new', 'empty.txt', 'inbox', { md5Checksum: EMPTY_MD5 }),
      file('own-copy', 'hashes.json', 'own', { md5Checksum: 'aa'.repeat(16) }), file('inbox-other', 'other.json', 'inbox', { md5Checksum: 'aa'.repeat(16) }),
      file('own-new', 'notes.json', 'inbox', { md5Checksum: 'aa'.repeat(16), createdTime: '2026-10-07T09:00:01.000Z' }),
    ];
    const ix = VaultIndex.build('root', listing);
    const dups = duplicatesOf(listing, ix, ['doc-new', 'link-new', 'empty-new', 'own-new']);
    // Only the second of two copies the run took is one: the file in Bower's own files is not filed, and the other
    // inbox file was not taken.
    expect([...dups.keys()]).toEqual([]);
    expect([...duplicatesOf(listing, ix, ['inbox-other', 'own-new'])]).toEqual([['own-new', { of: 'run', keptId: 'inbox-other' }]]);
    // A file at the top of the folder (Rules.md) is not a filed copy either.
    const rules = [...listing, file('rules', 'Rules.md', 'root', { md5Checksum: 'bb'.repeat(16) }), file('rules-copy', 'Rules copy.md', 'inbox', { md5Checksum: 'bb'.repeat(16) })];
    expect([...duplicatesOf(rules, VaultIndex.build('root', rules), ['rules-copy']).keys()]).toEqual([]);
  });

  it('a copy whose twin left during the run is not binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    let at: { drive: FakeDrive; root: string } | null = null;
    // While the model works, the person puts the filed offer in the Bin.
    const twinLeaves = async (): Promise<void> => {
      const f = at ? (await byPath(at.drive, at.root)).get(FILED) : undefined;
      if (!at || !f) throw new Error('no filed offer');
      await at.drive.trash(f.id);
    };
    const run = await runWithClaude({ ...c, inbox: [{ line: '', files: [OFFER] }, { line: '', files: ['Payslip_Aug.pdf'] }] }, during(twinLeaves), undefined, async (drive, root) => { at = { drive, root }; });
    expect(run.code).toBe(0);
    expect(reportOf(run).alreadySaved ?? []).toEqual([]);
    expect(inFolder(run, 'Inbox')).toEqual([`Inbox/${OFFER}`]);
    expect(reportOf(run).setAside.map((a) => a.name)).toEqual([OFFER]);
  });

  it('a copy changed during the run is not binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    let at: { drive: FakeDrive; root: string } | null = null;
    // While the model works, the person saves other words over the inbox copy, under the same name.
    const copyChanges = async (): Promise<void> => {
      const f = at ? (await byPath(at.drive, at.root)).get(`Inbox/${OFFER}`) : undefined;
      if (!at || !f) throw new Error('no inbox offer');
      await at.drive.writeText(f.id, 'A different signed offer.', f.modifiedTime);
    };
    const run = await runWithClaude({ ...c, inbox: [{ line: '', files: [OFFER] }, { line: '', files: ['Payslip_Aug.pdf'] }] }, during(copyChanges), undefined, async (drive, root) => { at = { drive, root }; });
    expect(run.code).toBe(0);
    expect(reportOf(run).alreadySaved ?? []).toEqual([]);
    expect(run.after[`Inbox/${OFFER}`]).toBe('A different signed offer.');
  });

  it('pile words with only a saved copy are kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await offerFiled();
    const run = await runWithClaude({ ...c, inbox: [{ line: 'Signed on Friday, start 2 November.', files: [OFFER] }] }, modelFiling([]));
    expect(run.code).toBe(0);
    expect(reportOf(run).alreadySaved).toEqual([{ name: OFFER, as: 'Offer letter.pdf' }]);
    // The words stay, live, for the next tidy-up to read.
    expect(Object.entries(run.after).filter(([p, text]) => !p.startsWith('.bower/') && text.includes('start 2 November')).map(([p]) => p)).not.toEqual([]);
  });
});

