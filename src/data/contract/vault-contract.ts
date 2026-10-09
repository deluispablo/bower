/**
 * The vault contract: what every source behind `VaultSource` must do, the
 * demo and Drive alike. The demo is the reference; a source is ready when
 * this whole suite passes on it. Every world starts from Alex's folder
 * (the demo fixture) in the `default` scenario.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Sources } from '../sources';
import { findNode } from '../tree';
import type { RunState, TreeNode } from '../types';

export interface ContractWorld {
  sources: Sources;
  dispose(): void;
  /** Runs one tidy-up to its end on the world's own clock; `during` runs while it is going. */
  tidyUp(during?: () => Promise<void>): Promise<RunState | null>;
  /** Waits for work a source finishes after answering (uploads); the demo has none. */
  settle?(): Promise<void>;
}

const LEASE = 'Projects/Flat hunt/Lease draft.pdf';
const TART = 'Resources/Cooking/Lemon tart.md';
const PASSPORT = 'Areas/Documents/Passport renewal.md';
const LARKSPUR = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
const COBBLE = 'Projects/Flat hunt/Flat 7, Cobble Row.md';

const names = (tree: TreeNode[], folder: string): string[] => (findNode(tree, folder)?.children ?? []).map((n) => n.name);

/** Groups a source can leave out while it is being built (the harness removes the skips). */
export type ContractGroup = 'inbox' | 'bower' | 'tidy';

export function describeVaultContract(name: string, make: () => Promise<ContractWorld>, opts: { skip?: ContractGroup[] } = {}): void {
  const group = (g: ContractGroup): typeof describe | typeof describe.skip => (opts.skip?.includes(g) ? describe.skip : describe);
  describe(`vault contract: ${name}`, () => {
    let world: ContractWorld | null = null;
    const open = async (): Promise<Sources> => {
      world = await make();
      return world.sources;
    };
    afterEach(() => {
      world?.dispose();
      world = null;
    });

    describe('move and rename', () => {
      it("move keeps a note's content", async () => {
        const { vault } = await open();
        const before = await vault.note(TART);
        const to = await vault.move(TART, 'Areas');
        expect(to).toBe('Areas/Lemon tart.md');
        const after = await vault.note(to);
        expect(after.summary).toBe(before.summary);
        expect(after.body).toBe(before.body);
      });

      it('rename keeps the extension', async () => {
        const { vault } = await open();
        expect(await vault.rename(LEASE, 'Lease, second draft')).toBe('Projects/Flat hunt/Lease, second draft.pdf');
        expect(names(await vault.tree(), 'Projects/Flat hunt')).toContain('Lease, second draft.pdf');
      });

      it('rename refuses a case-insensitive clash', async () => {
        const { vault } = await open();
        await expect(vault.rename(LARKSPUR, 'flat 7, cobble row')).rejects.toMatchObject({ code: 'conflict' });
      });

      it('rename refuses a name longer than 120 characters', async () => {
        const { vault } = await open();
        await expect(vault.rename(TART, 'a'.repeat(121))).rejects.toThrow(/too long/);
        expect(await vault.rename(TART, 'a'.repeat(120))).toBe(`Resources/Cooking/${'a'.repeat(120)}.md`);
      });

      it('create refuses a name longer than 120 characters', async () => {
        const { vault } = await open();
        await expect(vault.create('Resources', 'note', `${'a'.repeat(121)}.md`)).rejects.toThrow(/too long/);
        await expect(vault.create('Resources', 'folder', 'b'.repeat(121))).rejects.toThrow(/too long/);
      });

      it('rename refuses a leading dot', async () => {
        const { vault } = await open();
        await expect(vault.rename(TART, '.md')).rejects.toThrow(/dot/);
        await expect(vault.rename(TART, '  ')).rejects.toThrow(/empty/);
      });

      it('Rules.md and About me.md cannot be moved, renamed or binned', async () => {
        const { vault } = await open();
        await expect(vault.trash('Rules.md')).rejects.toThrow(/Bower needs it/);
        await expect(vault.move('About me.md', 'Areas')).rejects.toThrow(/Bower needs it/);
        await expect(vault.rename('Rules.md', 'My rules')).rejects.toThrow(/Bower needs it/);
      });

      it('a move never makes names that differ only by case', async () => {
        const { vault } = await open();
        const p = await vault.rename('Resources/Ideas/Weekend projects.md', 'flat 7, cobble row');
        expect(await vault.move(p, 'Projects/Flat hunt')).toBe('Projects/Flat hunt/flat 7, cobble row (2).md');
      });
    });

    describe('create, bin and restore', () => {
      it('create gives a free name', async () => {
        const { vault } = await open();
        const a = await vault.create('Resources', 'note');
        const b = await vault.create('Resources', 'note');
        expect(a).toBe('Resources/Untitled.md');
        expect(b).toBe('Resources/Untitled (2).md');
        expect(await vault.create('Resources', 'folder', 'Garden')).toBe('Resources/Garden');
      });

      it('trash then restore puts it back', async () => {
        const { vault } = await open();
        await vault.trash(TART);
        expect(findNode(await vault.tree(), TART)).toBeNull();
        await vault.restore(TART);
        expect(findNode(await vault.tree(), TART)).not.toBeNull();
        expect((await vault.note(TART)).body.length).toBeGreaterThan(0);
      });

      it('restore never overwrites', async () => {
        const { vault } = await open();
        const larkspur = (await vault.note(LARKSPUR)).summary;
        await vault.trash(COBBLE);
        await vault.rename(LARKSPUR, 'Flat 7, Cobble Row');
        await vault.restore(COBBLE);
        const ns = names(await vault.tree(), 'Projects/Flat hunt');
        expect(ns).toContain('Flat 7, Cobble Row.md');
        expect(ns).toContain('Flat 7, Cobble Row (2).md');
        expect((await vault.note(COBBLE)).summary).toBe(larkspur);
      });
    });

    group('inbox')('piles', () => {
      it('piles are listed newest first', async () => {
        const { vault } = await open();
        const at = (await vault.piles()).map((p) => p.createdAt);
        expect(at).toEqual([...at].sort((x, y) => y - x));
      });

      it('addPile with a line makes Inbox/<day> <line>/ with Pile note.md', async () => {
        const { vault } = await open();
        await vault.addPile({ text: 'Receipts from the weekend', items: [{ name: 'a.pdf', kind: 'pdf', origin: 'x' }, { name: 'b.jpg', kind: 'image', origin: 'x' }] });
        await world?.settle?.();
        const folder = findNode(await vault.tree(), 'Inbox')?.children?.find((n) => / Receipts from the weekend$/.test(n.name));
        expect(folder?.name).toMatch(/^\d{4}-\d{2}-\d{2} Receipts from the weekend$/);
        expect(folder?.children?.map((n) => n.name).sort()).toEqual(['Pile note.md', 'a.pdf', 'b.jpg']);
        expect((await vault.note(`${folder?.path}/Pile note.md`)).body).toBe('Receipts from the weekend');
        const pile = (await vault.piles()).find((p) => p.text === 'Receipts from the weekend');
        expect(pile?.items.map((i) => i.name).sort()).toEqual(['a.pdf', 'b.jpg']);
        expect(pile?.path).toBe(folder?.path);
      });

      it('a lone thing with no line sits at the inbox root', async () => {
        const { vault } = await open();
        await vault.addPile({ text: '', items: [{ name: 'lonely.pdf', kind: 'pdf', origin: 'x' }] });
        await world?.settle?.();
        expect(names(await vault.tree(), 'Inbox')).toContain('lonely.pdf');
        expect((await vault.piles()).find((p) => p.path === 'Inbox/lonely.pdf')?.items).toHaveLength(1);
      });

      it('a pasted link becomes a .url file inside its pile folder', async () => {
        const { vault } = await open();
        await vault.addPile({ text: 'Car insurance renewal', items: [{ name: 'insurer.example/renewal', kind: 'link', origin: 'x', url: 'https://insurer.example/renewal' }] });
        await world?.settle?.();
        const folder = findNode(await vault.tree(), 'Inbox')?.children?.find((n) => / Car insurance renewal$/.test(n.name));
        expect(folder?.children?.map((n) => n.name).sort()).toEqual(['Pile note.md', 'insurer.example - renewal.url']);
      });

      it('a pile can be only a note', async () => {
        const { vault } = await open();
        const p = await vault.addPile({ text: 'Bins go out on Tuesday nights', items: [] });
        await world?.settle?.();
        expect(p.items).toEqual([]);
        expect((await vault.piles()).find((x) => x.id === p.id)?.text).toBe('Bins go out on Tuesday nights');
        await expect(vault.addPile({ text: '  ', items: [] })).rejects.toMatchObject({ code: 'conflict' });
      });

      it('removePile bins the whole pile', async () => {
        const { vault } = await open();
        const p = await vault.addPile({ text: 'Old letters', items: [{ name: 'c.pdf', kind: 'pdf', origin: 'x' }] });
        await world?.settle?.();
        await vault.removePile(p.id);
        expect((await vault.piles()).some((x) => x.id === p.id)).toBe(false);
        expect(names(await vault.tree(), 'Inbox').some((n) => n.endsWith('Old letters'))).toBe(false);
      });

      it('updatePile changes the note', async () => {
        const { vault } = await open();
        const p = await vault.addPile({ text: 'Bins on Tuesday', items: [] });
        await world?.settle?.();
        await vault.updatePile(p.id, 'Bins on Tuesday nights');
        expect((await vault.piles()).find((x) => x.id === p.id)?.text).toBe('Bins on Tuesday nights');
        await expect(vault.updatePile(p.id, '  ')).rejects.toThrow(/needs its note/);
      });

      it('binning a pile folder removes the pile, and restore brings it back', async () => {
        const { vault } = await open();
        const pile = (await vault.piles()).find((p) => p.path && p.items.length > 1);
        if (!pile?.path) throw new Error('no pile folder in the fixture');
        await vault.trash(pile.path);
        expect((await vault.piles()).some((p) => p.path === pile.path)).toBe(false);
        await vault.restore(pile.path);
        expect((await vault.piles()).some((p) => p.path === pile.path)).toBe(true);
      });
    });

    describe('tasks', () => {
      it('toggleTask flips the n-th body task only', async () => {
        const { vault } = await open();
        await vault.toggleTask(PASSPORT, 4);
        const n = await vault.note(PASSPORT);
        expect(n.body).toContain('- [x] Photo form signed by a witness');
        await vault.toggleTask(PASSPORT, 4);
        expect((await vault.note(PASSPORT)).body).toContain('- [ ] Photo form signed by a witness');
      });

      it('toggleTask never touches Current state or Timeline', async () => {
        const { vault } = await open();
        const before = await vault.note(PASSPORT);
        await vault.toggleTask(PASSPORT, 0);
        const after = await vault.note(PASSPORT);
        expect(after.currentState).toEqual(before.currentState);
        expect(after.timeline).toEqual(before.timeline);
        expect(after.summary).toBe(before.summary);
      });
    });

    describe('the journal', () => {
      it('every change writes one journal entry', async () => {
        const { vault } = await open();
        const n = (await vault.changes()).length;
        await vault.move(LEASE, 'Areas');
        const after = await vault.changes();
        expect(after).toHaveLength(n + 1);
        expect(after.at(-1)?.kind).toBe('move');
        expect(after.at(-1)?.path).toBe('Areas/Lease draft.pdf');
      });

      // TL-P4-27 addenda 2 and 3: an Undo records the inverse line (or drops a line never sent); the pair is not shown.
      it('undo of a move or a Bin shows no entry for either', async () => {
        const { vault } = await open();
        const n = (await vault.changes()).length;
        const to = await vault.move(LEASE, 'Areas/Home');
        await vault.move(to, 'Projects/Flat hunt', { undo: true });
        await vault.trash(TART);
        await vault.restore(TART);
        expect(await vault.changes()).toHaveLength(n);
      });

      // TL-P4-27 addendum 4 (3): one line when its making was never sent; once sent, history is kept: the making, then
      // the rename, never a deleted line.
      it('a new thing named straight away: one line under its name, or its making and then its rename', async () => {
        const { vault } = await open();
        const n = (await vault.changes()).length;
        const p = await vault.create('Resources', 'note');
        const named = await vault.rename(p, 'Soup ideas');
        const after = (await vault.changes()).slice(n);
        if (after.length === 1) expect(after[0]).toMatchObject({ kind: 'create', path: named });
        else expect(after.map((c) => [c.kind, c.path])).toEqual([['create', p], ['rename', named]]);
        expect(after.at(-1)?.what).toMatch(/Soup ideas/);
      });

      // TL-P4-27 addendum 4 (3): no trace when its making was never sent; once sent, its making and then its Bin.
      it('made and binned straight away: no trace, or its making and then its Bin', async () => {
        const { vault } = await open();
        const n = (await vault.changes()).length;
        const p = await vault.create('Resources', 'note');
        await vault.trash(p);
        const after = (await vault.changes()).slice(n);
        if (after.length) expect(after.map((c) => [c.kind, c.path])).toEqual([['create', p], ['trash', p]]);
      });
    });

    group('bower')('rules, requests and questions', () => {
      it('addRule shows as pending with your words', async () => {
        const { vault } = await open();
        await vault.addRule('anything from the dentist goes in health');
        const r = (await vault.rules())[0];
        expect(r?.pending).toBe(true);
        expect(r?.yourWords).toBe('anything from the dentist goes in health');
        expect((await vault.changes()).at(-1)?.kind).toBe('rule');
      });

      it('a rule is kept once: the same words again, or its suggestion, add no second rule', async () => {
        const { vault } = await open();
        const sug = (await vault.suggestions())[0];
        if (!sug) throw new Error('no suggestion in the fixture');
        await vault.addRule(sug.title);
        await expect(vault.addRule(`  ${sug.title.toLowerCase()}. `)).rejects.toThrow(/already/);
        expect((await vault.suggestions()).some((x) => x.id === sug.id)).toBe(false);
        const n = (await vault.rules()).length;
        await vault.dismissSuggestion(sug.id, true);
        expect(await vault.rules()).toHaveLength(n);
      });

      it('a rule can be removed, worded or waiting, and Undo brings it back', async () => {
        const { vault } = await open();
        const worded = (await vault.rules()).find((r) => !r.pending);
        if (!worded) throw new Error('no worded rule in the fixture');
        const undo = await vault.removeRule(worded.id);
        expect((await vault.rules()).some((r) => r.text === worded.text)).toBe(false);
        expect((await vault.changes()).at(-1)?.kind).toBe('rule');
        await undo();
        expect((await vault.rules()).some((r) => r.text === worded.text)).toBe(true);
        const waiting = await vault.addRule('anything from the dentist goes in health');
        const undo2 = await vault.removeRule(waiting.id);
        expect((await vault.rules()).some((r) => r.yourWords === 'anything from the dentist goes in health')).toBe(false);
        await undo2();
        expect((await vault.rules()).some((r) => r.yourWords === 'anything from the dentist goes in health')).toBe(true);
      });

      it('removing a waiting rule leaves no line in your changes', async () => {
        const { vault } = await open();
        const n = (await vault.changes()).length;
        const r = await vault.addRule('anything from the dentist goes in health');
        expect(await vault.changes()).toHaveLength(n + 1);
        await vault.removeRule(r.id);
        expect(await vault.changes()).toHaveLength(n);
      });

      it('addRequest keeps what you asked, not yet done', async () => {
        const { vault } = await open();
        await vault.addRequest('Put my id papers together');
        const r = (await vault.requests()).find((x) => x.text === 'Put my id papers together');
        expect(r?.done).toBeUndefined();
      });

      it('answer removes the question and journals it', async () => {
        const { vault } = await open();
        const q = (await vault.questions())[0];
        if (!q) throw new Error('no question in the fixture');
        await vault.answer(q.id, true);
        expect((await vault.questions()).some((x) => x.id === q.id)).toBe(false);
        expect((await vault.changes()).at(-1)?.kind).toBe('answer');
      });

    });

    describe('search', () => {
      it('search finds what waits in the inbox, by its name', async () => {
        const { vault } = await open();
        const hits = await vault.search('dentist reminder');
        expect(hits.some((h) => h.path.startsWith('Inbox/'))).toBe(true);
      });

      it("search finds words in a note's Timeline and its tags", async () => {
        const { vault } = await open();
        expect((await vault.search('Tally')).map((h) => h.title)).toContain('CV insights');
        expect((await vault.search('#career')).map((h) => h.title)).toContain('CV insights');
      });

      it('search reads text, not markdown', async () => {
        const { vault } = await open();
        expect(await vault.search('[ ]')).toEqual([]);
        const hits = await vault.search('Planned');
        expect(hits.length).toBeGreaterThan(0);
        for (const h of hits) expect(h.snippet).not.toMatch(/^[\s,|]/);
      });

      it('search snippets are plain text', async () => {
        const { vault } = await open();
        const hits = [...(await vault.search('£1,450')), ...(await vault.search('reference letter'))];
        expect(hits.length).toBeGreaterThan(1);
        for (const h of hits) expect(h.snippet).not.toMatch(/\[[ x]\]|\||\[\[/);
      });

      it('search finds note text and skips the inbox', async () => {
        const { vault } = await open();
        const hits = await vault.search('£1,450');
        expect(hits.map((h) => h.title)).toContain('Flat 3, 12 Larkspur Lane');
        expect((await vault.search('larkspur'))[0]?.title).toBe('Flat 3, 12 Larkspur Lane');
        expect(hits.every((h) => !h.path.startsWith('Inbox/'))).toBe(true);
      });
    });

    group('tidy')('a tidy-up', () => {
      it('after tidyUp the journal is empty and the piles taken are gone', async () => {
        const { vault } = await open();
        await vault.move(LEASE, 'Areas');
        await vault.addRule('anything from the dentist goes in health');
        const run = await world?.tidyUp();
        expect(run?.phase).toBe('done');
        expect(await vault.piles()).toEqual([]);
        expect(await vault.changes()).toEqual([]);
        const r = (await vault.rules()).find((x) => x.yourWords === 'anything from the dentist goes in health');
        expect(r?.pending).toBeFalsy();
      });

      it('answering yes to a merge makes the next tidy-up keep one note', async () => {
        const { vault } = await open();
        await vault.answer('q1', true);
        const run = await world?.tidyUp();
        expect(run?.phase).toBe('done');
        expect(names(await vault.tree(), 'Projects/Flat hunt')).not.toContain('Flat 9, Wrenfield Road.md');
        expect((await vault.note(LARKSPUR)).timeline.map((t) => t.text).join(' ')).toMatch(/Wrenfield Road/);
      });

      it("a tidy-up's report lists only the new questions it asked", async () => {
        const { vault } = await open();
        const before = new Set((await vault.questions()).map((q) => q.id));
        const run = await world?.tidyUp();
        const asked = run?.report?.questions ?? [];
        expect(asked.length).toBeGreaterThan(0);
        expect(asked.every((q) => !before.has(q.id))).toBe(true);
        const now = (await vault.questions()).map((q) => q.id);
        expect(now).toEqual(expect.arrayContaining([...before, ...asked.map((q) => q.id)]));
      });

      it('a pile added during a run waits for the next one', async () => {
        const { vault } = await open();
        const run = await world?.tidyUp(async () => {
          await vault.addPile({ text: 'Late arrival', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x' }] });
          await world?.settle?.();
        });
        expect(run?.phase).toBe('done');
        const left = await vault.piles();
        expect(left.map((p) => p.text)).toEqual(['Late arrival']);
      });
    });
  });
}
