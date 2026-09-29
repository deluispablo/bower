import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive';
import { FOLDER_MIME } from '../src/drive';
import { inboxCount, inboxTotal } from '../src/inbox-count';
import { visiblePendingCount } from '../src/run-progress';

function file(path: string, mimeType = 'text/markdown'): DriveFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return { id: path, name, mimeType, parents: [], path };
}

const FILES: DriveFile[] = [
  file('0-Inbox', FOLDER_MIME),
  file('0-Inbox/_Inbox.md'),
  file('0-Inbox/Lease.pdf', 'application/pdf'),
  file('Clippings/Notes from the viewing.md'),
  file('0-Inbox/Bower - 2026-09-28 0930 Compare flats.md'),
  file('0-Inbox/Bower - 2026-09-28 0931 Context.md'),
  file('0-Inbox/Processed/Old.pdf', 'application/pdf'),
  file('0-Inbox/Quarantine/Bad.pdf', 'application/pdf'),
  file('Projects/Plan.md'),
];

describe('inboxCount', () => {
  it('counts things and requests apart, leaving the context note out', () => {
    expect(inboxCount(FILES, false)).toEqual({
      status: 'ready',
      things: 2,
      requests: 1,
      total: 3,
    });
  });

  it('reports loading, never 0, while the listing loads', () => {
    expect(inboxCount([], true)).toEqual({ status: 'loading' });
    expect(inboxTotal(inboxCount([], true))).toBe(0);
  });

  it('is an empty inbox, not loading, once the listing is in', () => {
    expect(inboxCount([], false)).toEqual({
      status: 'ready',
      things: 0,
      requests: 0,
      total: 0,
    });
  });

  it('gives Home, Add and the confirm dialog one value', () => {
    const value = inboxTotal(inboxCount(FILES, false));
    // The three call sites read `inboxTotal`; the old rule agrees with it.
    expect(value).toBe(visiblePendingCount(FILES));
    expect(value).toBe(3);
  });
});
