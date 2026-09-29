// @vitest-environment jsdom

/**
 * `useRequestRows` (#759, for #784): a note's box reads the requests store
 * off the Bower tab. The run in flight turns a waiting instruction note into
 * a tidying row, and `requestsForNote` finds it by the note's title.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestRow } from '../src/bower-tab.js';
import type { DriveFile } from '../src/drive.js';

const instruction: DriveFile = {
  id: 'id-instruction',
  name: 'Bower - 2026-09-29 1000 Rename the offer.md',
  mimeType: 'text/markdown',
  parents: ['FOLDER_ID'],
  path: '0-Inbox/Bower - 2026-09-29 1000 Rename the offer.md',
  modifiedTime: '2026-09-29T10:00:00Z',
};

const runState = {
  phase: 'running',
  run: { requestedAt: '2026-09-29T10:05:00Z' },
  lastFinished: null,
};

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({
    index: null,
    files: [instruction],
    fetchedAt: '2026-09-29T10:06:00Z',
    getNoteText: () =>
      Promise.resolve(
        '---\ntags: [instruction]\nvia: app\n---\n\n[[Data Lead, Northwind]] rename it to Northwind\n',
      ),
  }),
}));
vi.mock('../src/run-store.js', () => ({ useRun: () => runState }));
vi.mock('../src/components/activity-panel.js', () => ({
  useRuns: () => ({ status: 'ready', runs: [] }),
}));
vi.mock('../src/components/rules-panel.js', () => ({
  useFileText: () => ({ status: 'loading' }),
}));

const { useRequestRows } = await import('../src/use-request-rows.js');
const { requestsForNote } = await import('../src/bower-tab.js');

let root: HTMLDivElement;
let seen: readonly RequestRow[] = [];

function Probe(): null {
  seen = useRequestRows();
  return null;
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
});

describe('useRequestRows', () => {
  it('lists the waiting instruction as tidying while a run is in flight', async () => {
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(h(Probe, {}), root);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.state).toBe('tidying');
    expect(
      requestsForNote(seen, '1-Projects/Jobs/offer.md', [
        'Data Lead, Northwind',
      ]),
    ).toHaveLength(1);
    expect(requestsForNote(seen, '1-Projects/Jobs/offer.md')).toHaveLength(0);
  });
});
