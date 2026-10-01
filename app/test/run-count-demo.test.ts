import { describe, expect, it } from 'vitest';

import { runningTotal } from '../src/components/working-sheet.js';
import { FIXTURE_FILES } from '../src/demo/fixture.js';
import type { DriveFile } from '../src/drive.js';
import { inboxCount, inboxTotal } from '../src/inbox-count.js';

/**
 * R-AD-8 on the demo path (#914 design gate): the sticky "Tidy up <n>
 * things", the confirm and "Tidying up <n> things" read one count. The demo
 * run's own `total` also counts its scripted listings, so the running title
 * must not take it while the inbox count is known.
 */
describe('one count from start to finish, demo data', () => {
  const inbox: DriveFile[] = FIXTURE_FILES.filter((file) =>
    file.path.startsWith('0-Inbox/'),
  ).map((file, index) => ({
    id: `ID_${index}`,
    name: file.path.slice(file.path.lastIndexOf('/') + 1),
    path: file.path,
    mimeType: file.mimeType ?? 'text/markdown',
    modifiedTime: file.modifiedTime,
    parents: ['INBOX_ID'],
  }));

  it('gives the running title the same number as the sticky and the confirm', () => {
    const sticky = inboxTotal(inboxCount(inbox, false));
    expect(sticky).toBeGreaterThan(0);
    // The demo server's total is larger (scripted listings).
    expect(runningTotal(sticky, sticky + 2)).toBe(sticky);
  });

  it('falls back to the run total only without a listing', () => {
    expect(runningTotal(0, 5)).toBe(5);
    expect(runningTotal(0, undefined, 2)).toBe(2);
    expect(runningTotal(0, undefined)).toBeUndefined();
  });
});
