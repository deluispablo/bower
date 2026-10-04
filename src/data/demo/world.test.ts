import { afterEach, describe, expect, it, vi } from 'vitest';
import { findNode } from '../tree';
import { DemoWorld } from './world';

afterEach(() => vi.useRealTimers());

describe('the demo world', () => {
  it('walks the real phases and files the inbox', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { runs, vault } = w.sources();
    const seen: string[] = [];
    runs.subscribe(() => void runs.current().then((r) => r && seen.push(r.phase)));
    const before = (await vault.piles()).reduce((s, p) => s + p.items.length, 0);
    const r = await runs.start('all');
    expect(r.phase).toBe('queued');
    await vi.runAllTimersAsync();
    const done = await runs.current();
    expect(done?.phase).toBe('done');
    expect(done?.total).toBe(before);
    expect(done?.report?.filed).toHaveLength(before);
    expect(await vault.piles()).toEqual([]);
    expect(seen).toContain('writing');
    const tree = await vault.tree();
    expect(findNode(tree, 'Areas/Money/Receipts/2026-10/Taxi.pdf')).not.toBeNull();
    w.dispose();
  });

  it('refuses a tidy-up with nothing waiting', async () => {
    const w = new DemoWorld({ scenario: 'empty', scale: 'instant' });
    await expect(w.sources().runs.start('all')).rejects.toThrow(/Nothing/);
  });

  it('fails a run in the fail-run scenario and moves nothing', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'fail-run', scale: 'demo', latency: 0 });
    const { runs, vault } = w.sources();
    await runs.start('all');
    await vi.runAllTimersAsync();
    const r = await runs.current();
    expect(r?.phase).toBe('failed');
    expect((await vault.piles()).length).toBeGreaterThan(0);
  });

  it('comes back with a finished run that has not been seen', async () => {
    const w = new DemoWorld({ scenario: 'back', scale: 'instant' });
    const r = await w.sources().runs.current();
    expect(r?.phase).toBe('done');
    expect(r?.seen).toBe(false);
    expect(r?.report?.filed.length).toBeGreaterThan(5);
  });
});

import { NOTES } from './notes';
import { SEEDS } from './fixture';

describe('the demo folder', () => {
  it('every wikilink in a note points at a note that exists', () => {
    const names = new Set(SEEDS.map((x) => x.path).filter((p) => p.endsWith('.md')).map((p) => p.slice(p.lastIndexOf('/') + 1, -3).toLowerCase()));
    const texts = Object.values(NOTES).flatMap((n) => [n.body, n.summary, ...n.currentState, ...n.timeline.map((t) => t.text), n.bowerNote?.text ?? '']);
    const broken = texts.flatMap((t) => [...t.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1] ?? '')).filter((l) => !names.has(l.toLowerCase()));
    expect(broken).toEqual([]);
  });

  it('ticks a task in a note and writes it in the journal', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const path = 'Areas/Documents/Passport renewal.md';
    await vault.toggleTask(path, 4);
    expect((await vault.note(path)).body).toContain('- [x] Photo form signed by a witness');
    const j = await vault.changes();
    expect(j.at(-1)?.what).toBe('Ticked "Photo form signed by a witness" in Passport renewal');
  });

  it('keeps a typed rule as pending until a run words it', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault, runs } = w.sources();
    await vault.addRule('anything from the dentist goes in health');
    expect((await vault.rules())[0]?.pending).toBe(true);
    expect((await vault.note('Rules.md')).body).toContain('Waiting for the next tidy-up');
    await runs.start('instructions');
    await vi.runAllTimersAsync();
    const r = (await vault.rules())[0];
    expect(r?.pending).toBe(false);
    expect(r?.text).toMatch(/^Letters, reminders and invoices from the dentist/);
    expect(r?.yourWords).toBe('anything from the dentist goes in health');
    expect(await vault.changes()).toEqual([]);
  });
});

import { SAMPLE_PILES } from './fixture';

describe('piles and failures', () => {
  it('fails one tidy-up in the fail-run scenario, then the next one works', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'fail-run', scale: 'demo', latency: 0 });
    const { runs, vault } = w.sources();
    await runs.start('all');
    await vi.runAllTimersAsync();
    expect((await runs.current())?.phase).toBe('failed');
    await runs.start('all');
    await vi.runAllTimersAsync();
    expect((await runs.current())?.phase).toBe('done');
    expect(await vault.piles()).toEqual([]);
  });

  it('keeps a pile with a note as an inbox folder with its pile note', async () => {
    const w = new DemoWorld({ scenario: 'empty', scale: 'instant' });
    const { vault } = w.sources();
    await vault.addPile({ text: 'Receipts from the weekend', items: [{ name: 'a.pdf', kind: 'pdf', origin: 'x' }, { name: 'b.jpg', kind: 'image', origin: 'x' }] });
    await vault.addPile({ text: '', items: [{ name: 'lonely.pdf', kind: 'pdf', origin: 'x' }] });
    const inbox = findNode(await vault.tree(), 'Inbox');
    const names = (inbox?.children ?? []).map((n) => n.name).sort();
    expect(names).toHaveLength(2);
    expect(names).toContain('lonely.pdf');
    const folder = inbox?.children?.find((n) => n.type === 'folder');
    expect(folder?.name).toMatch(/^\d{4}-\d{2}-\d{2} Receipts from the weekend$/);
    expect(folder?.children?.map((n) => n.name).sort()).toEqual(['Pile note.md', 'a.pdf', 'b.jpg']);
    expect((await vault.note(`${folder?.path}/Pile note.md`)).body).toBe('Receipts from the weekend');
  });

  it('edits a pile note before the tidy-up and refuses to empty a note-only pile', async () => {
    const w = new DemoWorld({ scenario: 'empty', scale: 'instant' });
    const { vault } = w.sources();
    const p = await vault.addPile({ text: 'Bins on Tuesday', items: [] });
    await vault.updatePile(p.id, 'Bins on Tuesday nights');
    expect((await vault.piles())[0]?.text).toBe('Bins on Tuesday nights');
    await expect(vault.updatePile(p.id, '  ')).rejects.toThrow(/needs its note/);
  });

  it('files a note-only sample pile as a note where it belongs', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'empty', scale: 'demo', latency: 0 });
    const { vault, runs } = w.sources();
    const sample = SAMPLE_PILES.find((x) => !x.items.length);
    if (!sample) throw new Error('no note-only sample');
    w.addSample(sample);
    await runs.start('all');
    await vi.runAllTimersAsync();
    const r = await runs.current();
    expect(r?.report?.filed[0]?.to).toBe('Areas/Home');
    expect(findNode(await vault.tree(), 'Areas/Home/Bins and recycling.md')).not.toBeNull();
  });
});

describe('what the testers found', () => {
  it('binning a pile folder removes the pile, and undo brings it back', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const p2 = (await vault.piles()).find((p) => p.id === 'p2');
    if (!p2?.path) throw new Error('p2 has no folder');
    await vault.trash(p2.path);
    expect((await vault.piles()).some((p) => p.id === 'p2')).toBe(false);
    await vault.restore(p2.path);
    expect((await vault.piles()).some((p) => p.id === 'p2')).toBe(true);
  });

  it('undoing a move or a Bin leaves no journal line', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const to = await vault.move('Projects/Flat hunt/Lease draft.pdf', 'Areas/Home');
    await vault.move(to, 'Projects/Flat hunt', { undo: true });
    await vault.trash('Resources/Cooking/Lemon tart.md');
    await vault.restore('Resources/Cooking/Lemon tart.md');
    expect(await vault.changes()).toEqual([]);
  });

  it('a note made and binned straight away leaves no trace', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const p = await vault.create('Resources', 'note');
    await vault.trash(p);
    expect(await vault.changes()).toEqual([]);
  });

  it('keeps what you ask and marks it done after a run', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault, runs } = w.sources();
    await vault.addRequest('Put my id papers together');
    expect((await vault.requests())[0]?.done).toBeUndefined();
    await runs.start('instructions');
    await vi.runAllTimersAsync();
    expect((await vault.requests())[0]?.done).toMatch(/^Done/);
  });

  it('finds notes by what they say, names first', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const hits = await w.sources().vault.search('£1,450');
    expect(hits.map((h) => h.title)).toContain('Flat 3, 12 Larkspur Lane');
    expect((await w.sources().vault.search('larkspur'))[0]?.title).toBe('Flat 3, 12 Larkspur Lane');
    expect(hits.every((h) => !h.path.startsWith('Inbox/'))).toBe(true);
  });

  it('refuses a name that is only an extension, and keeps Rules where it is', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    await expect(vault.rename('Resources/Cooking/Lemon tart.md', '.md')).rejects.toThrow(/empty/);
    await expect(vault.trash('Rules.md')).rejects.toThrow(/Bower needs it/);
  });
});

describe('round two', () => {
  it('each undo brings back only its own pile', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const piles = await vault.piles();
    const a = piles.find((p) => p.id === 'p1')?.path;
    const b = piles.find((p) => p.id === 'p2')?.path;
    if (!a || !b) throw new Error('no pile folders');
    await vault.trash(b);
    await vault.trash(a);
    await vault.restore(b);
    const ids = (await vault.piles()).map((p) => p.id);
    expect(ids).toContain('p2');
    expect(ids).not.toContain('p1');
    await vault.restore(a);
    expect((await vault.piles()).map((p) => p.id)).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('a pasted link with a path stays inside its pile folder', async () => {
    const w = new DemoWorld({ scenario: 'empty', scale: 'instant' });
    const { vault } = w.sources();
    await vault.addPile({ text: 'Car insurance renewal', items: [{ name: 'insurer.example/renewal', kind: 'link', origin: 'x' }] });
    const folder = findNode(await vault.tree(), 'Inbox')?.children?.find((n) => n.type === 'folder');
    expect(folder?.children?.map((n) => n.name).sort()).toEqual(['Pile note.md', 'insurer.example - renewal.url']);
  });
});
