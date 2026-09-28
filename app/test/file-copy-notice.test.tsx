// @vitest-environment jsdom

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';

const driveFetch = vi.hoisted(() => vi.fn());

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  driveFetch,
}));

import { CopyNotice } from '../src/routes/file.js';

const COPY: DriveFile = {
  id: 'COPY_ID',
  name: 'Flat budget.csv',
  path: 'Flat hunt/Flat budget.csv',
  mimeType: 'text/csv',
  parents: [],
  webViewLink: 'https://drive.example/copy',
  appProperties: { bowerSource: 'SOURCE_ID', bowerSourceKind: 'sheet' },
};

let host: HTMLElement | undefined;

async function mount(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  render(
    h(CopyNotice, { file: COPY, kind: 'sheet', source: 'SOURCE_ID' }),
    host,
  );
  await vi.waitFor(() => {
    expect(host?.textContent).not.toBe('');
  });
  return host;
}

beforeEach(() => {
  driveFetch.mockReset();
});

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
});

describe('CopyNotice', () => {
  it('names the original Sheet and offers both links', async () => {
    driveFetch.mockResolvedValue(
      new Response(JSON.stringify({ name: 'Flat budget' })),
    );
    const view = await mount();
    expect(driveFetch).toHaveBeenCalledWith(
      '/drive/v3/files/SOURCE_ID?fields=name',
    );
    expect(view.textContent).toContain(
      'A copy of your Google Sheet “Flat budget”. Bower keeps the first sheet only, as a table. The original, with all its sheets, stays where it was in your Drive.',
    );
    const links = [...view.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual([
      'Open the original',
      'Open this copy in Drive',
    ]);
    expect(links[0]?.getAttribute('href')).toBe(
      'https://docs.google.com/spreadsheets/d/SOURCE_ID/edit',
    );
    expect(links[1]?.getAttribute('href')).toBe('https://drive.example/copy');
  });

  it('drops "Open the original" when the original is gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    driveFetch.mockRejectedValue(new Error('not found'));
    const view = await mount();
    expect(view.textContent).toContain('A copy of your Google Sheet. ');
    expect(
      [...view.querySelectorAll('a')].map((link) => link.textContent),
    ).toEqual(['Open this copy in Drive']);
  });
});
