import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savedLinkKey } from '../contracts/note-edit';
import { parseNote } from '../contracts/note-format';
import { FakeDrive, type FencedCall } from '../drive/fake-drive';
import { FakeRunService, RETRY_MS, type DispatchAt } from '../fake/fake-run-service';
import * as runner from '../fake/fake-runner';
import { FakeWorker } from '../fake/fake-worker';
import { DriveVault } from '../vault/drive-vault';
import type { JournalRecord } from '../vault/journal';
import { PROP, SYSTEM } from '../vault/layout';
import { modelDecisions, planScripted } from './scripted';

const CONTEXT = 'check before booking the April service';
const URL = 'https://service.example/booking/?month=April#details';
const NAME = 'April service.md';
const PATH = `Resources/${NAME}`;

beforeEach(() => {
  localStorage.clear();
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(runner, 'planRun').mockImplementation((drive, root, opts) => planScripted(runner.fakeScripted(drive), root, {
    ...opts,
    decisions: modelDecisions({ thing: () => ({ to: 'Resources', name: NAME }), words: () => null, note: () => null }),
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function world(text = CONTEXT, declared = true) {
  let now = Date.now();
  const drive = new FakeDrive();
  const act: { at?: (at: DispatchAt) => Promise<void> } = {};
  const runs = new FakeRunService({ drive, clock: () => now, scale: 'instant', hooks: { beforeDispatch: async (at) => { await act.at?.(at); } } });
  const worker = new FakeWorker({ drive, scenario: 'first', rootId: null, runs });
  const root = (await worker.createFolder()).id;
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: declared, device: 'DEVICE_A' });
  await vault.addPile({ text, items: [{ name: 'April service', kind: 'link', origin: 'Pasted', url: URL }] });
  await vault.settled();
  const listing = await drive.listAll(root);
  const link = listing.find((f) => f.name.endsWith('.url'));
  if (!link) throw new Error('Missing saved link');
  const original = await drive.readText(link.id);
  const calls: FencedCall[] = [];
  drive.fault = { before: (call) => { calls.push(call); return 'pass'; } };
  const key = await savedLinkKey(link.id);
  const notes = async () => (await drive.listAll(root)).filter((f) => f.appProperties?.[PROP.item] === key);
  const note = async () => {
    const found = await notes();
    expect(found).toHaveLength(1);
    if (!found[0]) throw new Error('Missing saved-link note');
    return found[0];
  };
  const tidy = async () => {
    const run = (await worker.process('all')).run;
    await runs.settled();
    expect((await worker.status()).run).toMatchObject({ id: run.id, phase: 'done' });
    return run;
  };
  return { drive, root, link, original, calls, key, notes, note, tidy, worker, runs, act, later: () => { now += RETRY_MS + 1; } };
}

describe('saved link context', () => {
  it('saved_link_keeps_exact_person_context', async () => {
    const w = await world();
    await w.tidy();
    const note = await w.note();
    const text = await w.drive.readText(note.id);
    const parsed = parseNote(PATH, text);
    expect(parsed.body).toBe(CONTEXT);
    expect(text).toContain(`\n${CONTEXT}\n`);
    expect(parsed.properties.find((p) => p.key === 'source')?.value).toBe(URL);
    expect(parsed.summary).toBe(`Saved from ${URL.slice(8)}.`);
    expect(parsed.timeline).toContainEqual(expect.objectContaining({ source: URL.slice(8) }));
    expect(await w.drive.readText(w.link.id)).toBe(w.original);
    expect(w.drive.pathOf(w.link.id, w.root)).toBe(`Resources/${w.link.name}`);
  });

  it.each([
    ['multiline prose', '  "Check  the quote"\r\n\r\nBring\tthe papers.\r\nThen book.  ', '"Check  the quote"\n\nBring\tthe papers.\nThen book.'],
    ['ordinary heading', '## Before booking\n\nCheck the service.', '## Before booking\n\nCheck the service.'],
    ['same words as summary', `Saved from ${URL.slice(8)}.`, `Saved from ${URL.slice(8)}.`],
    ['empty context', '', ''],
  ])('round-trips %s through the writer and note parser', async (_label, input, expected) => {
    const w = await world(input);
    await w.tidy();
    const text = await w.drive.readText((await w.note()).id);
    expect(parseNote(PATH, text).body).toBe(expected);
    if (expected) expect(text).toContain(`\n${expected}\n`);
  });

  it.each(['bound', 'removed'] as const)('uses only the declared %s context and leaves an unbound note untouched', async (context) => {
    const w = await world();
    const folder = w.link.parents[0] ?? '';
    const bound = (await w.drive.listAll(w.root)).find((f) => f.parents[0] === folder && f.name === 'Pile note.md');
    if (!bound) throw new Error('Missing bound context');
    const unbound = await w.drive.createText(folder, 'Pile note.md', 'Unrelated words');
    const before = await w.drive.evidence(unbound.id);
    if (context === 'bound') {
      await w.drive.createText(folder, 'Pile note.md', await w.drive.readText(bound.id), { ...bound.appProperties });
    } else {
      const changes = (await w.drive.listAll(w.root)).find((f) => w.drive.pathOf(f.id, w.root) === SYSTEM.changes);
      if (!changes) throw new Error('Missing changes folder');
      const archive = await w.drive.createFolder(changes.id, 'archive');
      const rec: JournalRecord = { v: 1, id: 'LINE_CONTEXT_GONE', at: 1, kind: 'trash', what: 'Removed the note of a pile', device: 'DEVICE_A', path: `${w.drive.pathOf(folder, w.root)}/Pile note.md` };
      await w.drive.createText(archive.id, 'LINE_CONTEXT_GONE.json', `${JSON.stringify(rec)}\n`);
    }
    await w.drive.trash(bound.id);
    await w.tidy();
    expect(parseNote(PATH, await w.drive.readText((await w.note()).id)).body).toBe(context === 'bound' ? CONTEXT : '');
    expect(await w.drive.evidence(unbound.id)).toEqual(before);
    expect(await w.drive.readText(unbound.id)).toBe('Unrelated words');
  });

  it('saved_link_retry_reuses_note_without_rewriting_context', async () => {
    const w = await world();
    let lost = false;
    w.drive.fault = { before: (call) => {
      w.calls.push(call);
      if (!lost && call.op === 'create-text' && call.name === NAME) {
        lost = true;
        w.drive.failNext('unknown');
        return 'lose-reply';
      }
      return 'pass';
    } };
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
    const note = await w.note();
    const text = await w.drive.readText(note.id);
    expect(parseNote(PATH, text).body).toBe(CONTEXT);
    const edited = text.replace(CONTEXT, `${CONTEXT}\n\nI called; book on April 12.`);
    await w.drive.writeText(note.id, edited, note.modifiedTime);
    for (let i = 0; i < 4 && (await w.worker.status()).run?.phase !== 'done'; i++) {
      w.later();
      await w.worker.status();
      await w.runs.settled();
    }
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(await w.note()).toMatchObject({ id: note.id, appProperties: { [PROP.item]: w.key } });
    expect(await w.drive.readText(note.id)).toBe(edited);
    expect(w.calls.filter((c) => c.op === 'create-text' && c.name === NAME)).toHaveLength(1);
    expect(w.calls.filter((c) => c.op === 'write-text' && c.id === note.id)).toEqual([]);
    expect(await w.drive.readText(w.link.id)).toBe(w.original);
  });

  it('reuses the personally edited keyed note in a new run after a rejected link move', async () => {
    const w = await world();
    w.act.at = async (at) => {
      if (at.effect.kind !== 'move' || at.effect.before.fileId !== w.link.id) return;
      delete w.act.at;
      await w.drive.update(w.link.id, { name: 'My service.url' });
    };
    const first = await w.tidy();
    expect(w.drive.pathOf(w.link.id, w.root)).toMatch(/^Inbox\//);
    const note = await w.note();
    const text = await w.drive.readText(note.id);
    expect(parseNote(PATH, text).body).toBe(CONTEXT);
    const edited = text.replace(CONTEXT, 'Booked for April 12.');
    await w.drive.writeText(note.id, edited, note.modifiedTime);
    await w.drive.update(w.link.id, { name: w.link.name });
    const second = await w.tidy();
    expect(second.id).not.toBe(first.id);
    expect(await w.note()).toMatchObject({ id: note.id, appProperties: { [PROP.item]: w.key } });
    expect(await w.drive.readText(note.id)).toBe(edited);
    expect(w.calls.filter((c) => c.op === 'create-text' && c.name === NAME)).toHaveLength(1);
    expect(w.calls.filter((c) => c.op === 'write-text' && c.id === note.id)).toEqual([]);
    expect(w.drive.pathOf(w.link.id, w.root)).toBe(`Resources/${w.link.name}`);
    expect(await w.drive.readText(w.link.id)).toBe(w.original);
  });

  it('keeps the source fallback for a link without an HTTP(S) URL', async () => {
    const w = await world('', false);
    await w.drive.writeText(w.link.id, '[InternetShortcut]\nURL=ftp://service.example/booking\n', w.link.modifiedTime);
    await w.tidy();
    const parsed = parseNote(PATH, await w.drive.readText((await w.note()).id));
    expect(parsed.properties.find((p) => p.key === 'source')?.value).toBe('April service');
    expect(parsed.summary).toBe('Saved from April service.');
  });
});
