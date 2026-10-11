/** TL-P4-41 addendum 24: independent reds through runner main. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import * as moc from '../src/moc';
import { candidates, fileIntent, folder, HUB, note, report, run, select, setup } from './b1-planning-support';
import { AT } from './corpus-run';
import { paging } from './drive-v3';

const pageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = pageSize; });

it('b1d-r7 1 request pin is only a candidate', async () => {
  for (const selected of [true, false]) {
    const b = await setup();
    const source = b.sources[0]?.itemId ?? '';
    const requestText = JSON.stringify({ v: 1, id: 'r7-request', device: 'device-1', kind: 'request',
      at: AT - 1, what: 'Asked Bower to update notes', text: 'Update [[Remote search]]' });
    const request = await b.drive.createText(b.id(SYSTEM.changes), 'r7-request.json', requestText);
    const admitted = await planAdmission(fakeRead(b.drive), b.root, {
      scope: 'all', clock: () => AT, newId: () => 'r7-admission',
    });
    expect(admitted.kind).toBe('manifest');
    if (admitted.kind !== 'manifest') throw new Error('Expected request admission.');
    expect(admitted.manifest.journal.map((line) => line.fileId)).toContain(request.id);
    const selection = select(b, [], 'Resources/Careers');
    if (selected) selection.items.push({ itemId: request.id, kind: 'unknown',
      destination: b.id('Projects/Remote search'), wants: [b.id(HUB)] });
    const filing = fileIntent(b, 'Resources/Careers');
    const line = 'Alex received a remote developer offer.';
    const intent = { ...filing, lines: [{ note: HUB, text: line, cites: source }] };
    // If the unauthorized append is refused, the existing retry can still file the clear offer.
    const r = await run(b, [selection, intent, filing], { admission: admitted.manifest });
    expect(r.code, r.errors).toBe(0);
    expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(r.frames[1]?.value.selection).toEqual(selection);
    expect(candidates(r.frames[0], request.id), 'the pin remains a candidate').toContain(b.id(HUB));
    expect(report(r).filed).toHaveLength(1);
    expect(r.pathsById[source]).toBe('Resources/Careers/Offer.txt');
    expect(r.after['Resources/Careers/Offer.txt']).toBe(b.c.inboxFiles['Offer.txt']);
    if (selected) {
      expect(r.frames, 'explicitly selected request control needs no retry').toHaveLength(2);
      expect(r.after[HUB]).toContain(line);
      expect(r.pathsById[request.id]).toBe(`${SYSTEM.archive}/r7-request.json`);
    } else {
      expect.soft(r.after[HUB], 'a request pin alone cannot authorize an append').toBe(folder[HUB]);
      expect.soft(r.pathsById[request.id], 'the omitted request stays in the request inbox')
        .toBe(`${SYSTEM.changes}/r7-request.json`);
      expect.soft(r.after[`${SYSTEM.changes}/r7-request.json`], 'the unconsumed request keeps its exact bytes')
        .toBe(requestText);
    }
  }
});

it('b1d-r7 2 personal type moc is not a Bower MOC', async () => {
  const path = 'Resources/Collection/Collection.md';
  const snapshot = vi.spyOn(moc, 'mocSnapshot');
  for (const type of ['concept', 'moc']) {
    const text = note('Remote developer offers.', '# Collection\nAlex keeps personal offer notes.\n')
      .replace('---\n', `---\ntype: ${type}\n`);
    expect(text).not.toContain('by: bower');
    const b = await setup({ folder: { ...folder, [path]: text } });
    snapshot.mockClear();
    const r = await run(b, [select(b, [b.id(HUB)]), fileIntent(b)]);
    expect(r.code, r.errors).toBe(0);
    expect(r.frames, 'both valid replies succeed without retries').toHaveLength(2);
    expect(candidates(r.frames[0], b.sources[0]?.itemId ?? '')).toContain(b.id(path));
    expect(r.after[path], 'personal note bytes remain intact').toBe(text);
    const personalSnapshots = snapshot.mock.calls.filter(([bytes]) => bytes === text);
    if (type === 'concept') {
      expect(personalSnapshots).toHaveLength(0);
      expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
      expect(report(r).filed).toHaveLength(1);
      expect(r.after['Projects/Remote search/Offer.txt']).toBe(b.c.inboxFiles['Offer.txt']);
    } else {
      expect.soft(personalSnapshots, 'personal type moc is never captured as a Bower MOC').toHaveLength(0);
      expect.soft(r.wire?.statuses.at(-1)?.phase, 'personal type moc cannot fail manifest encoding').toBe('done');
      expect.soft(report(r).filed, 'the offer still files beside the personal note').toHaveLength(1);
      expect.soft(r.after['Projects/Remote search/Offer.txt']).toBe(b.c.inboxFiles['Offer.txt']);
    }
  }
});
