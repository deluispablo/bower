import { describe, expect, it } from 'vitest';

import { isBowerWritten } from '../src/bower-written';
import type { DriveFile } from '../src/drive';
import { buildFolderModel, isFolderPage } from '../src/folder-view';
import { noteMetaFrom } from '../src/note-meta';

const meta = (data: Record<string, unknown>) => noteMetaFrom(data);

describe('isBowerWritten', () => {
  it('is true for each mark on its own', () => {
    expect(isBowerWritten(meta({ by: 'bower' }))).toBe(true);
    expect(isBowerWritten(meta({ by: ' Bower ' }))).toBe(true);
    expect(isBowerWritten(meta({ type: 'answer' }))).toBe(true);
    expect(isBowerWritten(meta({ kind: 'listing' }))).toBe(true);
    expect(isBowerWritten(meta({ original: '[[Lease.pdf]]' }))).toBe(true);
    expect(isBowerWritten(meta({ bower_origins: { rent: 'file' } }))).toBe(
      true,
    );
  });

  it('is true for a legacy body that opens with the callout', () => {
    const plain = meta({});
    expect(
      isBowerWritten(plain, { body: "> [!bower] Bower's note\n> x" }),
    ).toBe(true);
    expect(isBowerWritten(plain, { body: "\n> [!bower]- Bower's note" })).toBe(
      true,
    );
    expect(isBowerWritten(undefined, { body: '> [!bower] Hi' })).toBe(true);
  });

  it("is false for a person's own note", () => {
    expect(isBowerWritten(meta({ tags: ['idea'], by: 'Alex' }))).toBe(false);
    expect(isBowerWritten(meta({ type: 'journal' }))).toBe(false);
    expect(isBowerWritten(meta({}), { body: '# Plan\n> [!bower] later' })).toBe(
      false,
    );
    expect(isBowerWritten(undefined)).toBe(false);
    expect(isBowerWritten(null, {})).toBe(false);
  });
});

describe('K-31 on real data: a note named after its folder (#922)', () => {
  // Shapes only: an older rulebook's hub note and a summary, no `by:`.
  const hubData = {
    tags: ['project', 'home'],
    status: 'active',
    created: '2026-09-01',
    updated: '2026-09-02',
    related: [],
  };
  const summaryData = { tags: ['summary', 'home'], created: '2026-09-01' };
  const file = (path: string, id: string): DriveFile => ({
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: '2026-09-02T10:00:00Z',
  });
  const hub = file('1-Projects/Flat hunt/Flat hunt.md', 'hub');
  const other = file('1-Projects/Flat hunt/Inspection notes.md', 'other');

  it("is the folder's page, Bower's, with no `by:` at all", () => {
    expect(isBowerWritten(meta(hubData), hub)).toBe(true);
    expect(isBowerWritten(meta(summaryData), hub)).toBe(true);
    expect(isFolderPage(hub, meta(hubData))).toBe(true);
  });

  it("stays the person's with `by: person`", () => {
    const mine = meta({ ...hubData, by: 'person' });
    expect(isBowerWritten(mine, hub)).toBe(false);
    expect(isFolderPage(hub, mine)).toBe(false);
  });

  it('leaves other notes without `by:` to the person', () => {
    expect(isBowerWritten(meta(hubData), other)).toBe(false);
    expect(isFolderPage(other, meta(hubData))).toBe(false);
  });

  it('is neither listed nor counted in its folder', () => {
    const model = buildFolderModel({
      items: [hub, other],
      byPath: new Map([
        [hub.path, hub],
        [other.path, other],
      ]),
      metas: new Map([
        [hub.id, meta(hubData)],
        [other.id, meta(summaryData)],
      ]),
      origins: new Map(),
      catalogueFiles: new Map(),
    });
    const listed = [...model.originals, ...model.bower].map((f) => f.id);
    expect(listed).toEqual(['other']);
  });
});
