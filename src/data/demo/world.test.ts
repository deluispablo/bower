import { afterEach, describe, expect, it, vi } from 'vitest';
import { findNode } from '../tree';
import { DemoWorld } from './world';
import type { RunState } from '../types';

afterEach(() => vi.useRealTimers());

describe('the demo world', () => {
  it.each(['note', 'folder'] as const)('creation refuses a leading dot without writing (%s)', async (type) => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
    const { vault } = w.sources();
    try {
      const before = await vault.tree();
      const changes = await vault.changes();
      for (const name of [type === 'note' ? '.Garden.md' : '.Garden', ' \t.Garden \n', '.', '..Garden']) {
        await expect(vault.create('Resources/Cooking', type, name)).rejects.toMatchObject({ name: 'BowerError', code: 'conflict', message: 'A name cannot start with a dot.' });
        expect(await vault.tree()).toEqual(before);
        expect(await vault.changes()).toEqual(changes);
      }
    } finally {
      w.dispose();
    }
  });

  it.each(['note', 'folder'] as const)('creation keeps dotted names defaults and length limits (%s)', async (type) => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
    const { vault } = w.sources();
    try {
      const suffix = type === 'note' ? '.md' : '';
      expect(await vault.create('Resources/Cooking', type, `Garden.2026${suffix}`)).toBe(`Resources/Cooking/Garden.2026${suffix}`);
      expect(await vault.create('Resources/Cooking', type)).toBe(`Resources/Cooking/${type === 'note' ? 'Untitled.md' : 'New folder'}`);
      const limit = `${'a'.repeat(120)}${suffix}`;
      expect(await vault.create('Resources/Cooking', type, limit)).toBe(`Resources/Cooking/${limit}`);
      await expect(vault.create('Resources/Cooking', type, `${'a'.repeat(121)}${suffix}`)).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('too long') });
    } finally {
      w.dispose();
    }
  });

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
    expect(findNode(tree, 'Areas/Money/Receipts/2026-09/Saltmere weekend, taxi, 13 Sep.pdf')).not.toBeNull();
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

  it('a set-aside sample pile keeps its reason after a tidy-up, as Drive would', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'empty', scale: 'demo', latency: 0 });
    const { vault, runs } = w.sources();
    const aside = SAMPLE_PILES.find((x) => x.setAside);
    const note = SAMPLE_PILES.find((x) => !x.items.length);
    if (!aside || !note) throw new Error('no samples');
    w.addSample(aside);
    w.addSample(note);
    await runs.start('all');
    await vi.runAllTimersAsync();
    const r = await runs.current();
    expect(r?.report?.filed.map((f) => f.name)).toEqual(['Your note']);
    expect(r?.report?.setAside).toEqual([{ name: aside.text, why: 'Some of its things changed after they were added. Remove it and add them again.' }]);
    const left = await vault.piles();
    expect(left.map((p) => [p.text, p.setAside])).toEqual([[aside.text, 'changed']]);
    expect(left[0]?.items.map((i) => i.changed)).toEqual([true, undefined]);
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

  // The demo writes no comparison and looks nothing up, so it never claims to (TL-P2-40: never contradict the fake).
  it.each([false, true])('names no note it did not write and no lookup it did not make (web %s)', async (allowWeb) => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault, runs } = w.sources();
    await vault.addRequest('Compare the flats on the shortlist');
    await vault.addRequest('Look up the council tax band for Flat 3');
    await vault.addRequest('Which flat is closest to Ferrowick?');
    await runs.start('instructions', { allowWeb });
    await vi.runAllTimersAsync();
    const done = new Map((await vault.requests()).map((r) => [r.text, r.done]));
    expect(done.get('Compare the flats on the shortlist')).toBe('Done. See what changed in your folders.');
    expect(done.get('Look up the council tax band for Flat 3')).toBe(allowWeb ? 'Bower did not look anything up.' : 'Bower did not look anything up. Web lookups are off in Settings.');
    expect(done.get('Which flat is closest to Ferrowick?')).toContain('[[Flat 7, Cobble Row]] has the shortest commute');
    expect(findNode(await vault.tree(), 'Projects/Flat hunt/Flats on the shortlist, compared.md')).toBeNull();
    w.dispose();
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
    await expect(vault.rename('Resources/Cooking/Lemon tart.md', '.md')).rejects.toThrow(/dot/);
    await expect(vault.rename('Resources/Cooking/Lemon tart.md', '  ')).rejects.toThrow(/empty/);
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

describe('round three', () => {
  it('an Undo never overwrites a note that took the name meanwhile', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const seven = 'Projects/Flat hunt/Flat 7, Cobble Row.md';
    await vault.trash(seven);
    await vault.rename('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', 'Flat 7, Cobble Row');
    await vault.restore(seven);
    const names = (findNode(await vault.tree(), 'Projects/Flat hunt')?.children ?? []).map((n) => n.name);
    expect(names).toContain('Flat 7, Cobble Row.md');
    expect(names).toContain('Flat 7, Cobble Row (2).md');
    expect((await vault.note(seven)).summary).toMatch(/Two-bed flat near the station/);
  });

  it('a move never makes names that differ only by case', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const p = await vault.rename('Resources/Ideas/Weekend projects.md', 'flat 7, cobble row');
    expect(await vault.move(p, 'Projects/Flat hunt')).toBe('Projects/Flat hunt/flat 7, cobble row (2).md');
  });

  it('says a dot is the problem for ".git"', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const f = await vault.create('Resources', 'folder');
    await expect(vault.rename(f, '.git')).rejects.toThrow(/dot/);
  });
});

import { RULE_EXAMPLES } from '../examples';
import { RULE_WORDING } from './fixture';

describe('rule examples', () => {
  it('the demo knows how to word every example the Bower tab offers', () => {
    for (const r of RULE_EXAMPLES) expect(RULE_WORDING[r]).toBeDefined();
  });
});

describe('the demo notes', () => {
  it('no timeline date is after the day the demo was written', () => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const [path, n] of Object.entries(NOTES)) {
      for (const t of n.timeline) {
        const m = /^(\d{1,2}) ([A-Z][a-z]{2})$/.exec(t.date);
        if (!m) continue;
        const at = Date.UTC(2026, MONTHS.indexOf(m[2] ?? ''), Number(m[1]));
        expect(at, `${path}: ${t.date}`).toBeLessThanOrEqual(Date.UTC(2026, 9, 4));
      }
    }
  });
});

import { seedQuestions, seedRules } from './fixture';

describe('the demo questions', () => {
  it('no question asks for a rule that exists (none repeats a rule)', () => {
    const words = (t: string): string[] => t.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    const questions = seedQuestions(0);
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions)
      for (const r of seedRules(0)) {
        // Most of a rule's words in a question means the question asks for that rule again.
        const rw = new Set(words(r.text));
        const shared = words(q.text).filter((w) => rw.has(w));
        expect(new Set(shared).size / rw.size, `${q.text} / ${r.text}`).toBeLessThan(0.5);
      }
  });

});

it('plain action names preserve dots in folder names', async () => {
  const world = new DemoWorld({ scenario: 'default', scale: 'instant' });
  const { vault } = world.sources();
  try {
    const folder = await vault.create('Projects', 'folder', 'Garden.md');
    expect((await vault.changes()).some((c) => c.what === 'New folder "Garden.md" in Projects')).toBe(true);
    await vault.move(folder, 'Areas');
    expect((await vault.changes()).some((c) => c.what === 'Moved Garden.md to Areas')).toBe(true);
    await vault.rename('Areas/Garden.md', 'Garden.2026');
    expect((await vault.changes()).some((c) => c.what === 'Renamed Garden.md to Garden.2026')).toBe(true);
  } finally { world.dispose(); }
});

it('search finds a full file name while showing its plain name', async () => {
  const world = new DemoWorld({ scenario: 'default', scale: 'instant' });
  const { vault } = world.sources();
  try {
    const hits = await vault.search('Lease draft.pdf');
    expect(hits.find((h) => h.path === 'Projects/Flat hunt/Lease draft.pdf')?.title).toBe('Lease draft');
  } finally { world.dispose(); }
});

describe('what a tidy-up reports, as the run over Drive does', () => {
  const run = async (w: DemoWorld): Promise<NonNullable<RunState['report']>> => {
    const { runs } = w.sources();
    await runs.start('all');
    await vi.runAllTimersAsync();
    const r = await runs.current();
    if (!r?.report) throw new Error('no report');
    await runs.markSeen(r.id);
    return r.report;
  };

  it('lists a saved link written as a note, and the note a thing joined; a line already there is never added or reported again', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault } = w.sources();
    try {
      await vault.answer('q1', true);
      const first = await run(w);
      expect(first.created.map((c) => c.path)).toContain('Resources/Cooking/Weeknight curry, clipping.md');
      // One row per Timeline line written (report-misses-hub-line): the listing joined Flat 3, so Job hunt got one line.
      expect(first.updated).toEqual([
        { path: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', what: 'The Wrenfield Road listing is the same building; kept here, as you asked.' },
        { path: 'Projects/Flat hunt/Flat hunt.md', what: 'A new listing added to the shortlist.' },
        { path: 'Projects/Job hunt/Job hunt.md', what: 'New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.' },
      ]);
      await vault.addPile({ text: 'Ask the landlord about the heating', items: [] });
      const second = await run(w);
      expect(second.updated).toEqual([]);
      const hub = await vault.note('Projects/Flat hunt/Flat hunt.md');
      expect(hub.timeline.filter((t) => t.text === 'A new listing added to the shortlist.')).toHaveLength(1);
    } finally {
      w.dispose();
    }
  });
});
