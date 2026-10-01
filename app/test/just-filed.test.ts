// @vitest-environment jsdom

/**
 * Just filed (#616): the groups from a run report, the set-aside list, the
 * headings, the fallback to Activity lines for a report without `to`, and the
 * Done sheet's "See where everything went" link.
 */

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Run } from '../src/api.js';
import type { DriveFile } from '../src/drive.js';
import {
  EARLIER_LIMIT,
  asideLabel,
  earlierHeading,
  earlierRuns,
  fallbackLines,
  filedCount,
  groupHeading,
  hasDestinations,
  justFiledRows,
  latestRun,
  linkAddress,
  rowLabel,
  rowSub,
  setAsideRows,
  unseenIds,
  wasLabel,
  noListLine,
  earlierSub,
  moreLabel,
  previewRows,
  runBadge,
  runLine,
} from '../src/just-filed.js';
import { outcomeFromRun } from '../src/run-outcome.js';
import { buildVaultIndex } from '../src/vault-index.js';

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: [] }),
}));

const { WorkingSheet } = await import('../src/components/working-sheet.js');
const { OverlayHost } = await import('../src/components/overlay.js');
const { resetOverlayQueue } = await import('../src/overlay-queue.js');

const NOW = new Date('2026-09-27T10:44:00+01:00').getTime();

function file(
  id: string,
  path: string,
  mimeType = 'application/pdf',
): DriveFile {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType,
    parents: [],
    path,
  };
}

const index = buildVaultIndex([
  file('a', '1-Projects/Flat hunt/Arlington Road, 2 bed.pdf'),
  file(
    'b',
    '1-Projects/Flat hunt/Arlington Road, window sign.jpg',
    'image/jpeg',
  ),
  file('c', '3-Resources/Links/Kentish Town photos.md', 'text/markdown'),
  file('d', '1-Projects/Flat hunt/Walk-through.mp4', 'video/mp4'),
]);

const run: Run = {
  state: 'done',
  requestedAt: '2026-09-27T09:40:00.000Z',
  finishedAt: '2026-09-27T09:42:00.000Z',
  processed: [
    '0-Inbox/Arlington Road.pdf',
    '0-Inbox/IMG_4471.jpg',
    'Clippings/a link',
    '0-Inbox/Walk-through.mp4',
  ],
  items: [
    {
      path: '0-Inbox/Arlington Road.pdf',
      kind: 'file',
      to: '1-Projects/Flat hunt/Arlington Road, 2 bed.pdf',
      renamedFrom: 'Arlington Road.pdf',
    },
    {
      path: '0-Inbox/IMG_4471.jpg',
      kind: 'file',
      to: '1-Projects/Flat hunt/Arlington Road, window sign.jpg',
      renamedFrom: 'IMG_4471.jpg',
    },
    {
      path: 'Clippings/a link',
      kind: 'file',
      to: '3-Resources/Links/Kentish Town photos.md',
      renamedFrom: 'a link',
    },
    {
      path: '0-Inbox/Walk-through.mp4',
      kind: 'file',
      to: '1-Projects/Flat hunt/Walk-through.mp4',
    },
  ],
  setAside: [
    { path: '1-Projects/Flat hunt/Walk-through.mp4', reason: 'kept-not-read' },
  ],
};

describe('linkAddress', () => {
  it('shows host and path, eliding the middle of a long path', () => {
    expect(
      linkAddress('https://www.rightmove.example.com/properties/kentish-town'),
    ).toBe('rightmove.example.com/…/kentish-town');
    expect(linkAddress('https://example.com/a')).toBe('example.com/a');
    expect(linkAddress('https://example.com/')).toBe('example.com');
  });

  it('is null for a source that is not an http address', () => {
    expect(linkAddress('not a url')).toBeNull();
    expect(linkAddress('ftp://example.com/x')).toBeNull();
    expect(linkAddress(undefined)).toBeNull();
  });

  it('keeps a rename whose old name equals the new file name', () => {
    const same: Run = {
      ...run,
      items: [
        {
          path: '0-Inbox/x.pdf',
          kind: 'file',
          to: '1-Projects/Flat hunt/Arlington Road, 2 bed.pdf',
          renamedFrom: 'Arlington Road, 2 bed.pdf',
        },
      ],
    };
    expect(justFiledRows(same, index)[0]?.oldName).toBe(
      'Arlington Road, 2 bed.pdf',
    );
  });
});

describe('justFiledRows', () => {
  const rows = justFiledRows(run, index);

  it('lists old name, new name and folder, without the set-aside item', () => {
    expect(rows.map((r) => r.title)).toEqual([
      'Arlington Road, 2 bed',
      'Arlington Road, window sign',
      'Kentish Town photos',
    ]);
    expect(rows[0]?.oldName).toBe('Arlington Road.pdf');
    expect(rows[0]?.folder).toBe('Projects › Flat hunt');
    expect(rows[0]?.para).toBe('projects');
    expect(rows[2]?.para).toBe('resources');
    expect(rows[2]?.folder).toBe('Resources › Links');
  });

  it('never shows the numeric prefix, and links what the index knows', () => {
    for (const row of rows) expect(row.folder).not.toMatch(/\d-/);
    expect(rows[0]?.href).toBe('/file/a');
    expect(rows[2]?.href).toBe('/note/c');
  });

  it('points at the note beside a file for its key facts', () => {
    expect(rows[0]?.notePath).toBe(
      '1-Projects/Flat hunt/Arlington Road, 2 bed.md',
    );
    expect(rows[2]?.notePath).toBe('3-Resources/Links/Kentish Town photos.md');
  });
});

describe('setAsideRows', () => {
  it('gives the folder, the reason sentence and the Say what it is link', () => {
    const [row] = setAsideRows(run, index);
    expect(row?.folder).toBe('Projects › Flat hunt');
    expect(row?.sentence).toBe("Bower can't watch videos.");
    expect(row?.sayHref).toBe('/bower?text=About%20Walk-through.mp4%3A%20');
  });
});

describe('counts and headings', () => {
  it('counts every filed thing, set aside included', () => {
    expect(filedCount(run)).toBe(4);
    expect(rowLabel(6)).toBe('Just filed · 6');
    expect(asideLabel(1)).toBe('Set aside · 1');
    expect(wasLabel('a link')).toBe('was “a link”');
  });

  it('heads the latest group like the boards', () => {
    expect(groupHeading(run, NOW).endsWith(' · 4 things')).toBe(true);
    expect(groupHeading(run, NOW, 3).endsWith('4 things · 3 new to you')).toBe(
      true,
    );
    expect(rowSub('Today, 10:42', false)).toBe(
      "Today's tidy-up: see where everything went",
    );
    expect(rowSub('Today, 10:42', true)).toBe("Today's tidy-up");
  });

  it('names the things of a one- or two-item earlier tidy-up', () => {
    const small: Run = {
      ...run,
      processed: ['0-Inbox/Arlington Road.pdf'],
      items: run.items?.slice(0, 1),
      setAside: [],
    };
    expect(earlierHeading(small, NOW, index)).toMatch(
      /1 thing · Arlington Road$/,
    );
    expect(earlierHeading(run, NOW, index)).not.toContain('Arlington Road');
  });
});

describe('unseen ids', () => {
  it('is the run’s items the device has not opened', () => {
    expect([...unseenIds(run, index, new Set())].sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect([...unseenIds(run, index, new Set(['a', 'b', 'c', 'd']))]).toEqual(
      [],
    );
  });
});

describe('earlier tidy-ups (#913, S-JF-5..7, R-JF-4, R-JF-5, R-API-2)', () => {
  it('gives each run its Badge: Done, Did not finish', () => {
    expect(runBadge(outcomeFromRun(run))).toEqual({
      tone: 'done',
      label: 'Done',
    });
    const failed: Run = {
      requestedAt: run.requestedAt,
      state: 'failed',
      reason: 'drive_unavailable',
    };
    expect(runBadge(outcomeFromRun(failed))).toEqual({
      tone: 'failed',
      label: 'Did not finish',
    });
  });

  it('says the outcome once: "n filed", or that nothing was lost', () => {
    expect(runLine(run, Date.parse(run.finishedAt ?? '')).counts).toBe(
      `${String(filedCount(run))} filed`,
    );
    const failed: Run = {
      requestedAt: run.requestedAt,
      state: 'failed',
      reason: 'drive_unavailable',
    };
    expect(runLine(failed, Date.now()).counts).toBe(
      'nothing was lost; the things stayed in the inbox',
    );
  });

  it('shows up to three things, then "and N more"', () => {
    expect(previewRows([1, 2, 3, 4, 5, 6])).toEqual({
      shown: [1, 2, 3],
      more: 3,
    });
    expect(previewRows([1, 2])).toEqual({ shown: [1, 2], more: 0 });
    expect(moreLabel(3)).toBe('and 3 more');
  });

  it('falls back for an old run without destinations', () => {
    const old: Run = {
      ...run,
      items: (run.items ?? []).map(({ path, kind }) => ({ path, kind })),
    };
    expect(hasDestinations(old)).toBe(false);
    expect(noListLine(old)).toBe('Bower did not keep a list for this one.');
  });

  it('says "Nothing was filed." for a failed run that filed nothing', () => {
    const failed: Run = {
      state: 'failed',
      requestedAt: run.requestedAt,
      reason: 'drive_unavailable',
    };
    expect(hasDestinations(failed)).toBe(false);
    expect(noListLine(failed)).toBe('Nothing was filed.');
  });

  it('says tap on the phone and click on desktop (K-27)', () => {
    expect(earlierSub(false)).toBe('Newest first. Tap one to see what it did.');
    expect(earlierSub(true)).toBe(
      'Newest first. Click one to see what it did.',
    );
  });
});

describe('latest and earlier runs', () => {
  const older: Run = { ...run, requestedAt: '2026-09-26T17:00:00.000Z' };
  const failed: Run = { ...run, state: 'failed', requestedAt: '2026-09-25' };

  it('prefers the run store’s last run, else the newest of GET /runs', () => {
    expect(latestRun(older, [run])).toBe(older);
    expect(latestRun(null, [failed, run, older])).toBe(run);
    expect(latestRun(null, [])).toBeNull();
  });

  it('lists the others, failed ones too, at most the last 20', () => {
    expect(earlierRuns(run, [run, older, failed])).toEqual([older, failed]);
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...run,
      requestedAt: `2026-08-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`,
    }));
    expect(earlierRuns(null, many)).toHaveLength(EARLIER_LIMIT);
  });
});

describe('a run report without `to`', () => {
  const old: Run = {
    state: 'done',
    requestedAt: '2026-06-12T19:40:00.000Z',
    finishedAt: '2026-06-12T19:45:00.000Z',
    processed: ['0-Inbox/Offer letter.pdf'],
  };

  it('has no destinations and falls back to its Activity lines', () => {
    expect(hasDestinations(old)).toBe(false);
    expect(hasDestinations(run)).toBe(true);
    const log =
      '- 2026-06-12 19:44 · Filed: Offer letter, Northwind.pdf → 2-Areas/Work\n';
    const lines = fallbackLines(old, log, NOW);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.title).toBe('Offer letter.pdf');
  });
});

describe('the Done sheet', () => {
  let root: HTMLDivElement;

  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    document.body.replaceChildren();
    resetOverlayQueue();
  });

  it('links to Just filed', () => {
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(
        h(
          Fragment,
          null,
          h(WorkingSheet, {
            phase: 'done',
            run,
            now: NOW,
            open: true,
            onDismiss: vi.fn(),
          }),
          h(OverlayHost, null),
        ),
        root,
      );
    });
    const link = document.body.querySelector('a[href^="/just-filed"]');
    expect(link?.textContent).toBe('See what changed');
    expect(link?.getAttribute('href')).toBe(
      `/just-filed?run=${encodeURIComponent(run.requestedAt)}`,
    );
  });
});
