import { beforeEach, describe, expect, it } from 'vitest';
import type { DriveFile } from '../drive/drive-api';
import { VaultIndex } from './vault-index';
import { markSeen } from './seen';

let t = 0;
const f = (id: string, name: string, parent: string, more: Partial<DriveFile> = {}): DriveFile => {
  const at = new Date(Date.UTC(2026, 9, 1) + ++t * 1000).toISOString();
  return { id, name, folder: false, parents: [parent], modifiedTime: at, createdTime: at, ...more };
};
const dir = (id: string, name: string, parent: string): DriveFile => f(id, name, parent, { folder: true });

beforeEach(() => {
  t = 0;
  localStorage.clear();
});

describe('VaultIndex', () => {
  it('maps paths to ids and back', () => {
    const ix = VaultIndex.build('R', [dir('p', 'Projects', 'R'), dir('fh', 'Flat hunt', 'p'), f('n', 'Flat hunt.md', 'fh', { appProperties: { by: 'bower' } })]);
    expect(ix.idOf('Projects/Flat hunt/Flat hunt.md')).toBe('n');
    expect(ix.pathOf('fh')).toBe('Projects/Flat hunt');
    const e = ix.entries().get('Projects/Flat hunt/Flat hunt.md');
    expect(e).toMatchObject({ type: 'file', kind: 'note', byBower: true, hub: true });
    expect(ix.entries().get('Projects')?.type).toBe('folder');
  });

  it('same-name siblings get distinct paths', () => {
    const ix = VaultIndex.build('R', [f('a', 'Lease.pdf', 'R'), f('b', 'Lease.pdf', 'R'), f('c', 'lease.pdf', 'R')]);
    expect(ix.pathOf('a')).toBe('Lease.pdf');
    expect(ix.pathOf('b')).toBe('Lease (2).pdf');
    expect(ix.pathOf('c')).toBe('lease (3).pdf');
    expect(ix.idOf('Lease (2).pdf')).toBe('b');
    expect(ix.file('Lease (2).pdf')?.name).toBe('Lease.pdf');
  });

  it('hidden files are kept out of entries but reachable by systemId', () => {
    const ix = VaultIndex.build('R', [
      dir('s', '.bower', 'R'), f('q', 'questions.json', 's'),
      f('si', 'index.md', 's'), f('sh', 'hot.md', 's'), f('sl', 'log.md', 's'),
      f('i', 'index.md', 'R'), f('h', 'hot.md', 'R'), f('l', 'log.md', 'R'), f('r', 'Rules.md', 'R'),
    ]);
    expect.soft([...ix.entries().keys()]).toEqual(['index.md', 'hot.md', 'log.md', 'Rules.md']);
    expect(ix.systemId('.bower/questions.json')).toBe('q');
    expect(ix.systemId('.bower/index.md')).toBe('si');
    expect(ix.systemId('.bower/hot.md')).toBe('sh');
    expect(ix.systemId('.bower/log.md')).toBe('sl');
    expect.soft(ix.systemId('index.md')).toBeUndefined();
    expect.soft(ix.systemId('hot.md')).toBeUndefined();
    expect.soft(ix.systemId('log.md')).toBeUndefined();
    expect(ix.systemId('Rules.md')).toBeUndefined();
  });

  it('put after a rename moves the subtree paths', () => {
    const p = dir('p', 'Projects', 'R');
    const fh = dir('fh', 'Flat hunt', 'p');
    const ix = VaultIndex.build('R', [p, fh, f('n', 'Plan.md', 'fh')]);
    ix.put({ ...fh, name: 'Flat search' });
    expect(ix.pathOf('n')).toBe('Projects/Flat search/Plan.md');
    expect(ix.idOf('Projects/Flat hunt/Plan.md')).toBeUndefined();
  });

  it('drop removes a folder and everything under it', () => {
    const ix = VaultIndex.build('R', [dir('p', 'Projects', 'R'), dir('fh', 'Flat hunt', 'p'), f('n', 'Plan.md', 'fh')]);
    ix.drop('fh');
    expect(ix.idOf('Projects/Flat hunt/Plan.md')).toBeUndefined();
    expect([...ix.entries().keys()]).toEqual(['Projects']);
  });

  it('new until this device opens it, and new again when it changes', () => {
    const n = f('n', 'Taxi.pdf', 'R', { appProperties: { bowerNew: '1' } });
    expect(VaultIndex.build('R', [n]).entries().get('Taxi.pdf')?.isNew).toBe(true);
    markSeen('n', n.modifiedTime);
    expect(VaultIndex.build('R', [n]).entries().get('Taxi.pdf')?.isNew).toBeFalsy();
    expect(VaultIndex.build('R', [{ ...n, modifiedTime: '2026-10-05T00:00:00.000Z' }]).entries().get('Taxi.pdf')?.isNew).toBe(true);
  });

  it('times come from Drive as epoch ms', () => {
    const n = f('n', 'a.md', 'R');
    expect(VaultIndex.build('R', [n]).entries().get('a.md')?.modified).toBe(Date.parse(n.modifiedTime));
  });
});

import { vi } from 'vitest';

describe('reading what this device has seen', () => {
  it('entries reads the seen list once, however many things are new', () => {
    const files = Array.from({ length: 50 }, (_, i) => f(`n${i}`, `Thing ${i}.pdf`, 'R', { appProperties: { bowerNew: '1' } }));
    const ix = VaultIndex.build('R', files);
    const spy = vi.spyOn(Storage.prototype, 'getItem');
    ix.entries();
    expect(spy.mock.calls.filter((c) => c[0] === 'bower:seen').length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });
});

describe('audit-write-speed', () => {
  it('AC2 audit-write-speed-linear-reindex: a folder of many things is indexed without copying its list once per thing', () => {
    const many = 2000;
    const files = [dir('d', 'Big', 'R'), ...Array.from({ length: many }, (_, i) => f(`n${i}`, `Note ${i}.md`, 'd'))];
    // A spread of an array calls its iterator: counted (by hand, since a spy itself spreads), a list copied per child
    // shows as one call per child.
    // `concat` and `slice` copy a list without its iterator: counted too, so either one per child shows the same.
    const original = { iterator: Array.prototype[Symbol.iterator], concat: Array.prototype.concat, slice: Array.prototype.slice };
    let calls = 0;
    let ix: VaultIndex;
    Array.prototype[Symbol.iterator] = function (this: unknown[]) {
      calls++;
      return original.iterator.call(this);
    };
    Array.prototype.concat = function (this: unknown[], ...items: unknown[]) {
      calls++;
      return original.concat.apply(this, items);
    };
    Array.prototype.slice = function (this: unknown[], start?: number, end?: number) {
      calls++;
      return original.slice.call(this, start, end);
    };
    try {
      ix = VaultIndex.build('R', files);
    } finally {
      Array.prototype[Symbol.iterator] = original.iterator;
      Array.prototype.concat = original.concat;
      Array.prototype.slice = original.slice;
    }
    expect(ix.pathOf(`n${many - 1}`)).toBe(`Big/Note ${many - 1}.md`);
    expect(calls).toBeLessThan(many / 10);
  });

  it('index_keeps_no_write_log (guard)', () => {
    const start = [dir('p', 'Projects', 'R'), f('a', 'a.md', 'p'), f('b', 'b.md', 'R')];
    const sizes = (ix: VaultIndex): Record<string, number> => Object.fromEntries(Object.entries(ix).flatMap(([k, v]: [string, unknown]) =>
      (v instanceof Map || v instanceof Set ? [[k, v.size]] : Array.isArray(v) ? [[k, v.length]] : [])));
    const ix = VaultIndex.build('R', start);
    const was = sizes(ix);
    for (let k = 0; k < 500; k++) {
      ix.put(f(`k${k}`, `n${k}.md`, 'p'));
      ix.drop(`k${k}`);
    }
    expect(Object.keys(ix).sort()).toEqual(['files', 'ids', 'onWrite', 'paths', 'rootId']);
    for (const [k, n] of Object.entries(sizes(ix))) expect(n, k).toBeLessThanOrEqual(was[k] ?? 0);

    const seen = VaultIndex.build('R', start);
    const onWrite = vi.fn();
    seen.onWrite = onWrite;
    for (let k = 0; k < 500; k++) {
      seen.put(f(`k${k}`, `n${k}.md`, 'p'));
      seen.drop(`k${k}`);
    }
    expect(onWrite).toHaveBeenCalledTimes(1000);
    expect(onWrite.mock.calls.filter(([op]) => 'put' in op)).toHaveLength(500);
    expect(onWrite).toHaveBeenLastCalledWith({ drop: 'k499' });
  });
});
