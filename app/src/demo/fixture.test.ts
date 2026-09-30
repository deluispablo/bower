/**
 * The v6 demo world (#903): the folders, counts, status lists and run
 * history the v6 boards draw, read straight from the fixture.
 */

import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../markdown/frontmatter.js';
import {
  DEMO_EMAIL,
  DEMO_NAME,
  DEMO_RUNS,
  EMPTY_INBOX_FILES,
  FIXTURE_FILES,
  FOLDER_STATUSES,
  JOB_OFFERS,
  MOONEE_PONDS_FLATS,
} from './fixture.js';
import { DEMO_INBOX_KEY, DemoServer } from './server.js';

const HOUSING = '1-Projects/Housing Search Australia';
const MOONEE_PONDS = `${HOUSING}/Moonee Ponds`;
const JOBS = '1-Projects/Job Search Australia';
const APPLICATIONS = `${JOBS}/Applications`;
const VISA = '2-Areas/Visa & Immigration';

const paths = FIXTURE_FILES.map((file) => file.path);

/** The last segment of `path`. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The folder's hub note: the note named after the folder. */
function isHub(folder: string, path: string): boolean {
  return path === `${folder}/${nameOf(folder)}.md`;
}

/**
 * What a folder holds directly, as its meta line counts it (K-31): each
 * file and each subfolder once, the folder's own hub note and `_` notes
 * left out.
 */
function thingsIn(folder: string): string[] {
  const things = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith(`${folder}/`) || isHub(folder, path)) continue;
    const first = path.slice(folder.length + 1).split('/')[0] ?? '';
    if (first.startsWith('_')) continue;
    things.add(first);
  }
  return [...things];
}

function frontmatterOf(path: string): Record<string, unknown> {
  const file = FIXTURE_FILES.find((f) => f.path === path);
  if (file === undefined || typeof file.content !== 'string') {
    throw new Error(`no note at ${path}`);
  }
  return parseFrontmatter(file.content).data;
}

/** Top-level folders, in the tree's order (PARA first, then the rest). */
function roots(): string[] {
  const tops = new Set(
    paths.filter((p) => p.includes('/')).map((p) => p.split('/')[0] ?? ''),
  );
  return [...tops].filter((t) => !t.startsWith('.')).sort();
}

describe('the v6 demo world (#903)', () => {
  it('is Alex, whose avatar reads "A"', () => {
    expect(DEMO_NAME).toBe('Alex');
    expect(DEMO_EMAIL).toBe('alex@example.com');
  });

  it('has the roots of the boards, Projects and Areas as drawn', () => {
    expect(roots()).toEqual([
      '0-Inbox',
      '1-Projects',
      '2-Areas',
      '3-Resources',
      '4-Archives',
      'Answers',
      'Clippings',
    ]);
    expect(thingsIn('1-Projects').sort()).toEqual([
      'Housing Search Australia',
      'Job Search Australia',
    ]);
    expect(thingsIn('2-Areas')).toEqual(['Visa & Immigration']);
    expect(thingsIn(HOUSING)).toEqual(['Moonee Ponds']);
  });

  it('gives Moonee Ponds 7 things: the Listings subfolder and six flat notes', () => {
    const things = thingsIn(MOONEE_PONDS);
    expect(things).toHaveLength(7);
    // Originals 1 (the subfolder, E-12: "Listings", not "Originals") +
    // By Bower 6.
    expect(things).toContain('Listings');
    expect(things).not.toContain('Originals');
    expect(thingsIn(`${MOONEE_PONDS}/Listings`)).toHaveLength(6);
    const notes = things.filter((t) => t.endsWith('.md'));
    expect(notes.map((n) => n.replace(/\.md$/, ''))).toEqual(
      MOONEE_PONDS_FLATS.map((flat) => flat.name),
    );
    for (const note of notes) {
      expect(frontmatterOf(`${MOONEE_PONDS}/${note}`).kind).toBe(
        'rental-listing',
      );
    }
    // Home's pinned card: "Projects · 14 things", everything below it.
    expect(paths.filter((p) => p.startsWith(`${HOUSING}/`))).toHaveLength(14);
  });

  it('draws the flats with the Compare values of PF-Compare-1280', () => {
    const first = frontmatterOf(
      `${MOONEE_PONDS}/10-43 Buckley St, Moonee Ponds.md`,
    );
    expect(first.rent).toBe('460 AUD/week');
    expect(first.against_area).toBe('−15% vs area median');
    expect(first.fit).toBe(73);
    expect(first.status).toBe('to view');
    expect(String(first.available)).toContain('2026-10-07');
    expect(String(first.viewing)).toContain('2026-10-01');
    expect(MOONEE_PONDS_FLATS.map((flat) => flat.fit)).toEqual([
      73, 72, 72, 66, 60, 58,
    ]);
  });

  it('gives Applications 9 things by Bower, four of them job offers', () => {
    const things = thingsIn(APPLICATIONS);
    expect(things).toHaveLength(9);
    const offers = things.filter(
      (t) => frontmatterOf(`${APPLICATIONS}/${t}`).kind === 'job-offer',
    );
    expect(offers).toHaveLength(4);
    expect(JOB_OFFERS).toHaveLength(4);
  });

  it('writes the per-folder status lists into the hub notes, and every status is in its list', () => {
    const housing = frontmatterOf(`${MOONEE_PONDS}/Moonee Ponds.md`);
    expect(housing.statuses).toEqual([
      'new',
      'to view',
      'viewed',
      'applied',
      'approved',
      'signed',
      'not for me',
      'turned down',
    ]);
    const jobs = frontmatterOf(`${APPLICATIONS}/Applications.md`);
    expect(jobs.statuses).toEqual([
      'new',
      'applied',
      'interview',
      'offer',
      'accepted',
      'not for me',
      'turned down',
    ]);
    expect(FOLDER_STATUSES[MOONEE_PONDS]).toEqual(housing.statuses);
    expect(FOLDER_STATUSES[APPLICATIONS]).toEqual(jobs.statuses);

    for (const flat of MOONEE_PONDS_FLATS) {
      expect(housing.statuses).toContain(flat.status);
    }
    for (const offer of JOB_OFFERS) {
      if (
        offer.name === 'Senior Consultant - Data Engineer, Altis Consulting'
      ) {
        // The old value LI-Compare-375 draws: an extra option (#916).
        expect(offer.status).toBe('declined');
        expect(jobs.statuses).not.toContain('declined');
      } else {
        expect(jobs.statuses).toContain(offer.status);
      }
    }
  });

  it('holds Job Search Australia and Visa & Immigration as drawn, with the stand-ins', () => {
    expect(thingsIn(JOBS).sort()).toEqual([
      'Applications',
      'CV Australia.docx',
      'CV insights.md',
      'Cover Letter - Alex.pdf',
      'LinkedIn profile.md',
      'SEEK profile.md',
    ]);
    // AR-Sub-375 counts the note named after the folder as one of the
    // "2 things" (Originals 2), unlike the hub notes of Moonee Ponds and
    // Applications: both files are here; how the note counts is #905's.
    expect(paths.filter((p) => p.startsWith(`${VISA}/`)).sort()).toEqual([
      `${VISA}/Passport copy.pdf`,
      `${VISA}/Visa & Immigration.md`,
    ]);
    expect(frontmatterOf(`${JOBS}/CV insights.md`).tags).toEqual([
      'summary',
      'career',
    ]);
  });

  it('keeps the run history of JF-Main and JF-Earlier, each run with its start', () => {
    const yesterday = DEMO_RUNS.filter((run) =>
      run.runId.startsWith('demo-run-yesterday-'),
    );
    expect(yesterday).toHaveLength(10);
    const [last] = DEMO_RUNS;
    expect(last?.startedAt).toBe('2026-09-29T14:01:00.000Z');
    expect(last?.finishedAt).toBe('2026-09-29T14:03:00.000Z');
    expect(last?.items).toEqual([
      {
        path: '0-Inbox/Passport copy.pdf',
        kind: 'file',
        to: `${VISA}/Passport copy.pdf`,
      },
    ]);
    expect(
      yesterday.map((run) => [
        run.state,
        run.items?.filter((i) => i.kind === 'file').length,
        run.items?.filter((i) => i.kind === 'request').length,
      ]),
    ).toEqual([
      ['done', 1, 0],
      ['done', 6, 0],
      ['failed', 0, 0],
      ['done', 0, 0],
      ['done', 5, 0],
      ['failed', 0, 0],
      ['done', 0, 1],
      ['done', 2, 0],
      ['done', 2, 1],
      ['done', 3, 0],
    ]);
    for (const run of DEMO_RUNS) {
      expect(run.startedAt, run.runId).toBeDefined();
      for (const item of run.items ?? []) {
        expect(paths, item.to).toContain(item.to);
      }
    }
  });

  it('starts on the last tidy-up, with three things waiting or none', () => {
    const now = (): number => new Date('2026-09-30T12:10:00+01:00').getTime();
    const waiting = new DemoServer(now);
    expect(waiting.status().run?.runId).toBe('demo-run-yesterday-10');

    const store = new Map<string, string>([[DEMO_INBOX_KEY, 'empty']]);
    const storage = {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
    } as unknown as Storage;
    const empty = new DemoServer(now, storage);
    const inboxOf = (server: DemoServer): string[] => {
      const inbox = server.vault.byPath('0-Inbox');
      if (inbox === undefined) return [];
      return server.vault
        .children(inbox.id)
        .map((child) => child.name)
        .filter((name) => !name.startsWith('_') && name !== 'Processed');
    };
    expect(inboxOf(waiting)).toHaveLength(3);
    expect(inboxOf(empty)).toEqual([]);
    expect(EMPTY_INBOX_FILES.length).toBeLessThan(FIXTURE_FILES.length);
  });
});
