import { beforeEach, describe, expect, it, vi } from 'vitest';

// The repo's cache test setup: a `Map` stands in for IndexedDB.
const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    store.clear();
    return Promise.resolve();
  }),
}));

const getText = vi.fn<(id: string) => Promise<string>>();
vi.mock('../src/drive.js', () => ({
  getText: (id: string) => getText(id),
  thumbnailLinkOf: vi.fn(),
}));

const { loadNoteMeta, noteMetaFrom, recordNoteMeta } =
  await import('../src/note-meta.js');

const NOTE = [
  '---',
  'kind: invoice',
  'status: draft',
  'bower_origins:',
  '  rent: file',
  '  bike_to_office: notes',
  '  x: bogus',
  'not_stated: [due date]',
  'original: Scan.pdf',
  'type: summary',
  'pages: 3',
  'total: 120',
  '---',
  'Body text.',
].join('\n');

beforeEach(() => {
  store.clear();
  getText.mockReset();
});

describe('noteMetaFrom', () => {
  it('picks the named fields and keeps the raw ones', () => {
    const meta = noteMetaFrom({
      kind: 'invoice',
      status: ' draft ',
      bower_origins: { rent: 'file', bike: 'notes', x: 'bogus', y: 5 },
      not_stated: 'due date',
      pages: '3',
      total: 120,
    });
    expect(meta).toMatchObject({
      kind: 'invoice',
      status: 'draft',
      bowerOrigins: { rent: 'file', bike: 'notes' },
      not_stated: ['due date'],
      pages: 3,
      fields: { total: 120 },
    });
    expect(meta.original).toBeUndefined();
  });

  it('gives empty lists when the note has no frontmatter', () => {
    expect(noteMetaFrom({})).toEqual({
      fields: {},
      bowerOrigins: {},
      not_stated: [],
    });
  });
});

describe('loadNoteMeta', () => {
  it('reads the frontmatter once per modifiedTime', async () => {
    getText.mockResolvedValue(NOTE);
    const file = { id: 'n1', modifiedTime: '2026-01-01T00:00:00Z' };

    const first = await loadNoteMeta(file);
    const second = await loadNoteMeta(file);

    expect(getText).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      kind: 'invoice',
      status: 'draft',
      bowerOrigins: { rent: 'file', bike_to_office: 'notes' },
      not_stated: ['due date'],
      original: 'Scan.pdf',
      type: 'summary',
      pages: 3,
    });
  });

  it('reads again once the note was modified', async () => {
    getText.mockResolvedValueOnce(NOTE);
    getText.mockResolvedValueOnce('---\nkind: letter\n---\n');

    await loadNoteMeta({ id: 'n1', modifiedTime: 'T1' });
    const later = await loadNoteMeta({ id: 'n1', modifiedTime: 'T2' });

    expect(getText).toHaveBeenCalledTimes(2);
    expect(later.kind).toBe('letter');
  });

  it('never trusts the cache for a file without a modifiedTime', async () => {
    getText.mockResolvedValue(NOTE);
    await loadNoteMeta({ id: 'n1' });
    await loadNoteMeta({ id: 'n1' });
    expect(getText).toHaveBeenCalledTimes(2);
  });

  it('serves a write-through at the new modifiedTime without reading Drive', async () => {
    getText.mockResolvedValueOnce(NOTE);
    await loadNoteMeta({ id: 'n1', modifiedTime: 'T1' });

    await recordNoteMeta('n1', 'T2', '---\nkind: invoice\nstatus: paid\n---\n');
    const meta = await loadNoteMeta({ id: 'n1', modifiedTime: 'T2' });

    expect(getText).toHaveBeenCalledTimes(1);
    expect(meta.status).toBe('paid');
  });
});
