/**
 * The v4 sample folder (#583): the demo's fixture and Drive stub carry the
 * story of the v4 boards (Alex's flat hunt, the June papers, every file
 * kind) with what the explorer screens read: companion notes in the v4
 * format, media metadata, thumbnails, and the run report v2 fields.
 */

import { describe, expect, it } from 'vitest';

import { createDemo } from '../src/demo/index.js';
import { previewUrlOf } from '../src/demo/drive.js';
import { FLAT_BUDGET_ROWS } from '../src/demo/fixture.js';
import type { DriveFile } from '../src/drive.js';
import { FOLDER_MIME } from '../src/drive.js';
import {
  formatFieldValue,
  kindById,
  keyFactsFor,
  statusLabel,
} from '../src/kinds.js';
import { parseFrontmatter } from '../src/markdown/frontmatter.js';
import { noteMetaFrom } from '../src/note-meta.js';
import { isHidden } from '../src/vault-index.js';

const NOW = new Date('2026-09-27T10:30:00+01:00').getTime();

function demo(): ReturnType<typeof createDemo> {
  return createDemo(() => NOW);
}

async function listing(
  d: ReturnType<typeof createDemo>,
): Promise<Map<string, DriveFile>> {
  const files = await d.drive.listVault(d.server.me.vault?.folderId ?? '');
  return new Map(files.map((f) => [f.path, f]));
}

const FLAT = '4-Archives/Flat hunt';

describe('the v4 sample folder', () => {
  it('lists every file and folder of the story, system files hidden in the app', async () => {
    const d = demo();
    const files = await listing(d);
    const expected = [
      `${FLAT}/Arlington Road, 2 bed.pdf`,
      `${FLAT}/Arlington Road, 2 bed.md`,
      `${FLAT}/Kentish Town, 2 bed.pdf`,
      `${FLAT}/Kentish Town, 2 bed.md`,
      `${FLAT}/Camden Mews, 1 bed.pdf`,
      `${FLAT}/Camden Mews, 1 bed.md`,
      `${FLAT}/Holloway Road, 2 bed.pdf`,
      `${FLAT}/Holloway Road, 2 bed.md`,
      `${FLAT}/Arlington Road, window sign.jpg`,
      `${FLAT}/Arlington Road, window sign.md`,
      `${FLAT}/Lease agreement 2026.pdf`,
      `${FLAT}/Lease agreement 2026.md`,
      `${FLAT}/Flat budget.csv`,
      `${FLAT}/Walk-through, Arlington Road.mp4`,
      `${FLAT}/Photos from the viewing.zip`,
      `${FLAT}/Notes from the viewing.md`,
      '4-Archives/Work/Offer letter, Northwind Data.pdf',
      '4-Archives/Work/Offer letter, Northwind Data.md',
      '4-Archives/Work/Cycle to Work agreement.pdf',
      '4-Archives/Work/Cycle to Work agreement.md',
      '4-Archives/Work/Job offer, Northwind Data.md',
      '3-Resources/Money/Household costs 2026.xlsx',
      '3-Resources/Garden/Tomato seedlings.jpg',
      '3-Resources/Garden/Front bed.heic',
      '3-Resources/Links/Kentish Town photos.md',
      '3-Resources/Viewing checklist.md',
      'Answers/Which flat should we view first.md',
    ];
    for (const path of expected) expect(files.has(path), path).toBe(true);

    // An empty folder: a folder entry and nothing under it.
    const empty = [...files.values()].filter(
      (f) => f.mimeType === FOLDER_MIME && !isHidden(f),
    );
    const emptyFolders = empty.filter(
      (f) => ![...files.keys()].some((p) => p.startsWith(`${f.path}/`)),
    );
    expect(emptyFolders.map((f) => f.path)).toContain('3-Resources/Car');

    // System files exist in the Drive listing and the app hides them.
    const system = [
      `${FLAT}/desktop.ini`,
      '4-Archives/Work/desktop.ini',
      '3-Resources/Garden/desktop.ini',
      `${FLAT}/~$Lease agreement 2026.docx`,
    ];
    for (const path of system) {
      const file = files.get(path);
      expect(file, path).toBeDefined();
      expect(isHidden(file as DriveFile), path).toBe(true);
    }
    for (const path of expected) {
      expect(isHidden(files.get(path) as DriveFile), path).toBe(false);
    }
  });

  it('gives the four listing notes the Compare values of Desktop-Compare', async () => {
    const d = demo();
    const files = await listing(d);
    const kind = kindById('rental-listing');
    expect(kind).toBeDefined();
    if (kind === undefined) return;

    const rows: Record<string, string>[] = [];
    for (const path of [...files.keys()].filter(
      (p) => p.startsWith(`${FLAT}/`) && p.endsWith('.md'),
    )) {
      const file = files.get(path) as DriveFile;
      const { data } = parseFrontmatter(await d.drive.getText(file.id));
      if (data.kind !== 'rental-listing') continue;
      const row: Record<string, string> = {
        listing: file.name.replace(/\.md$/, ''),
        status: statusLabel(kind, data),
      };
      for (const key of kind.compareFields) {
        const field = kind.fields.find((f) => f.key === key);
        if (field !== undefined) row[key] = formatFieldValue(field, data[key]);
      }
      rows.push(row);
    }
    rows.sort((a, b) => Number(b.fit) - Number(a.fit));

    expect(rows).toEqual([
      {
        listing: 'Kentish Town, 2 bed',
        rent: '£2,400',
        rooms: '2 bed',
        available: '15 Nov',
        against_area: '+1 %',
        bike_to_office: '22 min',
        fit: '81',
        status: 'Viewing Sat',
      },
      {
        listing: 'Arlington Road, 2 bed',
        rent: '£2,150',
        rooms: '2 bed',
        available: '1 Nov',
        against_area: '−10 %',
        bike_to_office: '14 min',
        fit: '72',
        status: 'To view',
      },
      {
        listing: 'Camden Mews, 1 bed',
        rent: '£1,850',
        rooms: '1 bed',
        available: 'Now',
        against_area: '−4 %',
        bike_to_office: '18 min',
        fit: '64',
        status: 'New',
      },
      {
        listing: 'Holloway Road, 2 bed',
        rent: '£1,990',
        rooms: '2 bed',
        available: '1 Dec',
        against_area: '−12 %',
        bike_to_office: '27 min',
        fit: '58',
        status: 'New',
      },
    ]);
  });

  it('writes the companion notes in the v4 format, callouts included', async () => {
    const d = demo();
    const files = await listing(d);
    const text = async (path: string): Promise<string> =>
      d.drive.getText((files.get(path) as DriveFile).id);

    const arlington = await text(`${FLAT}/Arlington Road, 2 bed.md`);
    const meta = noteMetaFrom(parseFrontmatter(arlington).data);
    expect(meta.kind).toBe('rental-listing');
    expect(meta.original).toBe('[[Arlington Road, 2 bed.pdf]]');
    expect(meta.not_stated).toEqual(['pets', 'bills_included', 'agency_fee']);
    expect(meta.status).toBe('to view');
    expect(meta.pages).toBe(2);
    expect(arlington).toContain("> [!bower] Bower's note");
    const kind = kindById('rental-listing');
    if (kind === undefined) throw new Error('rental-listing is a kind');
    expect(keyFactsFor(kind, meta.fields).map((fact) => fact.value)).toEqual([
      '£2,150',
      '2 bed',
      '1 Nov',
      '14 min',
    ]);

    // Every callout line ends with an origin; one line asks for a check.
    const origins = [
      /\(from the file\)$/,
      /\(from your notes: \[\[[^\]]+\]\](, \[\[[^\]]+\]\])*\)$/,
      /\(looked up\)$/,
      /\(from what you told me\)$/,
    ];
    const callouts = (
      await Promise.all(
        [...files.keys()]
          .filter((p) => p.startsWith(`${FLAT}/`) && p.endsWith('.md'))
          .map(text),
      )
    )
      .flatMap((t) => t.split('\n'))
      .filter((l) => l.startsWith('> ') && !l.startsWith('> [!'))
      .map((l) => l.replace(/ — Check$/, ''));
    expect(callouts.length).toBeGreaterThan(8);
    for (const line of callouts) {
      expect(
        origins.some((re) => re.test(line)),
        line,
      ).toBe(true);
    }
    const all = (
      await Promise.all(
        [...files.keys()]
          .filter((p) => p.startsWith(`${FLAT}/`) && p.endsWith('.md'))
          .map(text),
      )
    ).join('\n');
    expect(all).toContain(
      '(from your notes: [[Offer letter, Northwind Data]], [[Cycle to Work agreement]])',
    );
    expect(all).toContain('(looked up)');
    expect(all).toContain('(from what you told me)');
    expect(all).toMatch(/\) — Check$/m);

    // The lease is long: its note has the page count and "Where to look".
    const lease = await text(`${FLAT}/Lease agreement 2026.md`);
    expect(noteMetaFrom(parseFrontmatter(lease).data).pages).toBe(42);
    expect(lease).toContain('## Where to look');

    // The June papers: a job offer and a contract.
    const offer = noteMetaFrom(
      parseFrontmatter(
        await text('4-Archives/Work/Offer letter, Northwind Data.md'),
      ).data,
    );
    expect(offer.kind).toBe('job-offer');
    const contract = noteMetaFrom(
      parseFrontmatter(await text('4-Archives/Work/Cycle to Work agreement.md'))
        .data,
    );
    expect(contract.kind).toBe('contract');

    // The long note has a top box and collapsed section callouts.
    const long = await text('4-Archives/Work/Job offer, Northwind Data.md');
    expect(long).toContain("> [!bower] Bower's note");
    expect(long).toContain('> [!bower]- Bower on this section');

    // The answer names its sources.
    const answer = await text('Answers/Which flat should we view first.md');
    expect(parseFrontmatter(answer).data.type).toBe('answer');
    expect(answer).toContain('Used: ');

    // The budget is a 24-row CSV copy of a sheet.
    const csv = await text(`${FLAT}/Flat budget.csv`);
    expect(csv.trim().split('\n')).toHaveLength(FLAT_BUDGET_ROWS + 1);
  });

  it('offers the suggested rule of Flow-08 next to the older ones', async () => {
    const d = demo();
    const files = await listing(d);
    const proposals = await d.drive.getText(
      (files.get('Answers/Bower - Proposals.md') as DriveFile).id,
    );
    expect(proposals).toContain(
      'For every flat listing, add the bike time to your office.',
    );
    expect(proposals).toContain(
      'You asked about bike times twice this week, and you cycle to work.',
    );
  });
});

describe('the demo API report v2', () => {
  it('returns the last run and the London ones with to, renamedFrom, setAside and added', async () => {
    const d = demo();
    // Home starts on yesterday's last tidy-up (#903, "Done 21 h ago");
    // the flat hunt's tidy-up is the newest of the London ones.
    expect((await d.worker.getStatus()).run?.runId).toBe(
      'demo-run-yesterday-10',
    );
    const { runs: all } = await d.worker.getRuns();
    const runs = all.filter((r) =>
      (r.runId ?? '').startsWith('demo-run-earlier-'),
    );
    const run = runs[0];
    expect(run?.state).toBe('done');
    expect(run?.finishedAt).toBe('2026-09-27T09:42:00.000Z');
    expect(run?.added).toBe('I added bike times to the flats');
    expect(run?.items).toHaveLength(6);
    expect(run?.processed).toHaveLength(6);
    expect(run?.items?.slice(0, 5)).toEqual([
      {
        path: '0-Inbox/Arlington Road, 2 bed.pdf',
        kind: 'file',
        to: `${FLAT}/Arlington Road, 2 bed.pdf`,
        renamedFrom: 'Arlington Road, 2 bed.pdf',
      },
      {
        path: '0-Inbox/Kentish Town flat.pdf',
        kind: 'file',
        to: `${FLAT}/Kentish Town, 2 bed.pdf`,
        renamedFrom: 'Kentish Town flat.pdf',
      },
      {
        path: '0-Inbox/Camden Mews studio.pdf',
        kind: 'file',
        to: `${FLAT}/Camden Mews, 1 bed.pdf`,
        renamedFrom: 'Camden Mews studio.pdf',
      },
      {
        path: '0-Inbox/IMG_4471.jpg',
        kind: 'file',
        to: `${FLAT}/Arlington Road, window sign.jpg`,
        renamedFrom: 'IMG_4471.jpg',
      },
      {
        path: 'Clippings/a link',
        kind: 'file',
        to: '3-Resources/Links/Kentish Town photos.md',
        renamedFrom: 'a link',
      },
    ]);
    expect(run?.setAside).toEqual([
      {
        path: `${FLAT}/Walk-through, Arlington Road.mp4`,
        reason: 'kept-not-read',
      },
    ]);

    expect(runs).toHaveLength(4);
    expect(runs.map((r) => r.finishedAt)).toEqual([
      '2026-09-27T09:42:00.000Z',
      '2026-09-26T17:10:00.000Z',
      '2026-09-21T08:02:00.000Z',
      '2026-06-12T19:45:00.000Z',
    ]);
    expect(runs.slice(1).map((r) => r.items?.length)).toEqual([3, 7, 2]);
    for (const earlier of runs) {
      for (const item of earlier.items ?? []) {
        expect(item.to, item.path).toBeDefined();
      }
    }
  });

  it('points every processed item at a file the folder holds', async () => {
    const d = demo();
    const files = await listing(d);
    const { runs } = await d.worker.getRuns();
    for (const run of runs) {
      for (const item of run.items ?? []) {
        expect(files.has(item.to ?? ''), item.to).toBe(true);
      }
    }
  });
});

describe('the demo Drive stub', () => {
  it('returns thumbnails, media metadata, appProperties and preview URLs', async () => {
    const d = demo();
    const files = await listing(d);
    const get = (path: string): DriveFile => files.get(path) as DriveFile;

    // A photo: thumbnail, taken time and size, 2.4 MB.
    const photo = get(`${FLAT}/Arlington Road, window sign.jpg`);
    expect(photo.thumbnailLink).toMatch(/^data:image\/svg\+xml,/);
    expect(photo.imageMediaMetadata?.time).toBe('2026:09:26 10:14:00');
    expect(photo.imageMediaMetadata?.width).toBeGreaterThan(0);
    expect(photo.size).toBe(Math.round(2.4 * 1024 * 1024));

    // A PDF and the Office file have thumbnails.
    expect(get(`${FLAT}/Lease agreement 2026.pdf`).thumbnailLink).toBeDefined();
    const excel = get('3-Resources/Money/Household costs 2026.xlsx');
    expect(excel.thumbnailLink).toBeDefined();
    expect(excel.size).toBe(18 * 1024);

    // The video: 2 min 14 s, 86 MB, and a Drive preview URL.
    const video = get(`${FLAT}/Walk-through, Arlington Road.mp4`);
    expect(video.videoMediaMetadata?.durationMillis).toBe(134_000);
    expect(video.size).toBe(86 * 1024 * 1024);
    expect(previewUrlOf(d.server, video.id)).toBe(
      `https://drive.google.com/file/d/${video.id}/preview`,
    );
    expect(previewUrlOf(d.server, excel.id)).toMatch(/\/preview$/);
    expect(previewUrlOf(d.server, photo.id)).toBeNull();

    // The ZIP has no preview; the HEIC photo has metadata but no thumbnail.
    const zip = get(`${FLAT}/Photos from the viewing.zip`);
    expect(zip.size).toBe(38 * 1024 * 1024);
    expect(zip.thumbnailLink).toBeUndefined();
    expect(previewUrlOf(d.server, zip.id)).toBeNull();
    expect(get('3-Resources/Garden/Front bed.heic').mimeType).toBe(
      'image/heic',
    );

    // The CSV copy remembers the Google Sheet it came from.
    const csv = get(`${FLAT}/Flat budget.csv`);
    expect(csv.appProperties).toEqual({
      bowerSource: 'Flat budget',
      bowerSourceKind: 'sheet',
    });
    expect(csv.size).toBe(3 * 1024);

    // thumbnailLinkOf answers the same link as the listing, or null.
    expect(await d.drive.thumbnailLinkOf(photo.id)).toBe(photo.thumbnailLink);
    expect(await d.drive.thumbnailLinkOf(zip.id)).toBeNull();
  });
});
