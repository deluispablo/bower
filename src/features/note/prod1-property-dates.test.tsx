import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Note, TreeNode } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { NoteScreen } from './NoteScreen';

const PATH = 'Projects/Flat hunt/Flat hunt.md';
const node = { path: PATH, name: 'Flat hunt.md', type: 'file', kind: 'note', modified: 0, created: 0 } as TreeNode;
const hub = { path: 'Projects/Flat hunt', name: 'Flat hunt', type: 'folder', modified: 0, created: 0, children: [node] } as TreeNode;
const projects = { path: 'Projects', name: 'Projects', type: 'folder', modified: 0, created: 0, children: [hub] } as TreeNode;

const noteWith = (properties: [string, string][]): Note => ({
  path: PATH, title: 'Flat hunt', summary: 'Flats we looked at.', tags: [], currentState: [], body: 'Your own words.', timeline: [], links: [], backlinks: [], byBower: true,
  properties: properties.map(([key, value]) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), value })),
});

async function renderProps(note: Note): Promise<HTMLElement> {
  const base = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'tree') return async () => [projects];
      if (k === 'note') return async () => note;
      if (k === 'changes') return async () => [];
      if (k === 'markSeen') return async () => undefined;
      return () => new Promise(() => undefined);
    },
  });
  const { container } = render(
    <MemoryRouter initialEntries={[`/note/${PATH}`]}>
      <DataProvider sources={{ ...base, vault } as unknown as Sources}>
        <NoteScreen />
      </DataProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Properties' });
  return container.querySelector('dl') as HTMLElement;
}

const valueOf = (dl: HTMLElement, label: string) => within(dl).getByText(label).nextElementSibling?.textContent;

describe('note properties show dates readably', () => {
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });
  afterEach(cleanup);

  it('created_and_updated_use_readable_calendar_dates', async () => {
    const note = noteWith([['created', '2026-10-18'], ['updated', '2026-01-01']]);
    const dl = await renderProps(note);
    expect(valueOf(dl, 'Created')).toBe('18 Oct');
    expect(valueOf(dl, 'Updated')).toBe('1 Jan');
    expect(within(dl).queryByText('2026-10-18')).toBeNull();
    expect(within(dl).queryByText('2026-01-01')).toBeNull();
    expect(note.properties[0]?.value).toBe('2026-10-18'); // storage stays raw
  });

  // guard: already passes on the unchanged code
  it('nondate_property_values_are_unchanged', async () => {
    for (const v of ['2026-02-30', '2026-13-01', '2026-10-6', ' 2026-10-06', '2026-10-18T09:00:00Z', '', '2026-02-29']) {
      const dl = await renderProps(noteWith([['created', v]]));
      expect(dl.querySelector('dd')?.textContent).toBe(v);
      cleanup();
    }
    const dl = await renderProps(noteWith([['updated', 'Today'], ['notes', 'Call Alex'], ['due', '2026-10-18']]));
    expect(valueOf(dl, 'Updated')).toBe('Today');
    expect(valueOf(dl, 'Notes')).toBe('Call Alex');
    expect(valueOf(dl, 'Due')).toBe('2026-10-18');
  });
});
