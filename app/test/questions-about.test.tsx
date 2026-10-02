// @vitest-environment jsdom

/**
 * #1003: a file or note shows the questions asked about it. Rules v26 books
 * an answer about a filed item with the item as its original, so the
 * answer's `index.md` row ends `· [[<item path>]]`; that row ties it here.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestRow } from '../src/bower-tab.js';
import {
  QuestionsAbout,
  answersAbout,
  questionLines,
  waitingAbout,
} from '../src/components/questions-about.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

const LISTING_PATH = '1-Projects/Flat hunt/Arlington Road, listing.pdf';
const ANSWER_PATH = 'Answers/2026-10-02 When can I move in.md';

/** `index.md` in the v26 row form. */
const CATALOGUE = [
  '# Index',
  '',
  '## 1-Projects',
  `- [[${LISTING_PATH}]] · PDF · #rental-listing · Two-bed flat on Arlington Road · filed by Bower`,
  '',
  '## Answers',
  `- [[${ANSWER_PATH}]] · Note · #rental-listing #flat-hunt · When the Arlington Road flat is free to move into · [[${LISTING_PATH}]]`,
  '- [[Answers/2026-09-30 Best bike route.md]] · Note · #commute · The quickest way to the office · filed by Bower',
  '- [[Answers/2026-09-29 Deposit.md]] · Note · #flat-hunt · How much deposit · [[1-Projects/Flat hunt/Other flat.pdf]]',
].join('\n');

function file(id: string, path: string, mimeType: string): DriveFile {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    mimeType,
    parents: ['FOLDER_ID'],
    modifiedTime: '2026-10-02T09:00:00Z',
  };
}

const LISTING = file('LISTING_ID', LISTING_PATH, 'application/pdf');
const ANSWER = file('ANSWER_ID', ANSWER_PATH, 'text/markdown');
const CATALOGUE_FILE = file('INDEX_ID', 'index.md', 'text/markdown');
const index = buildVaultIndex([LISTING, ANSWER, CATALOGUE_FILE]);

function row(text: string, state: RequestRow['state']): RequestRow {
  return {
    key: `row:${text}`,
    state,
    text,
    kind: 'question',
    since: '2026-10-02T08:30:00Z',
    fileId: 'REQUEST_ID',
  };
}

let host: HTMLElement | undefined;

/** Lets the catalogue read land and the block render again. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
});

async function mount(
  path: string,
  names: string[],
  rows: RequestRow[] = [],
): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  const getNoteText = vi.fn((id: string) =>
    id === 'INDEX_ID'
      ? Promise.resolve(CATALOGUE)
      : Promise.reject(new Error('no such note')),
  );
  await act(async () => {
    render(
      h(QuestionsAbout, { path, names, index, rows, getNoteText }),
      host as HTMLElement,
    );
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
  await settle();
  return host;
}

describe('answersAbout', () => {
  it('reads the answers whose row ends with a link to the item', () => {
    expect(answersAbout(CATALOGUE, LISTING_PATH)).toEqual([
      { path: ANSWER_PATH, title: 'When can I move in', day: '2026-10-02' },
    ]);
  });

  it('matches the path in any letter case, and only answer rows', () => {
    expect(answersAbout(CATALOGUE, LISTING_PATH.toUpperCase())).toHaveLength(1);
    const note = `- [[2-Areas/Home/Flat notes.md]] · Note · #home · Notes · [[${LISTING_PATH}]]`;
    expect(answersAbout(note, LISTING_PATH)).toEqual([]);
  });

  it('finds nothing for an item no answer is about', () => {
    expect(answersAbout(CATALOGUE, '2-Areas/Money/Payslip.pdf')).toEqual([]);
  });
});

describe('QuestionsAbout (AC1)', () => {
  it('shows the answer about a file with a link to its note', async () => {
    const view = await mount(LISTING_PATH, [
      LISTING.name,
      'Arlington Road, listing',
    ]);
    const section = view.querySelector('section.questions-about');
    expect(section?.querySelector('h2')?.textContent).toBe(
      'Questions about this',
    );
    const link = section?.querySelector('a');
    expect(link?.textContent).toMatch(/^When can I move in · /);
    expect(link?.getAttribute('href')).toBe('/note/ANSWER_ID');
  });

  it('shows the answer about a note the same way', async () => {
    const catalogue = `- [[${ANSWER_PATH}]] · Note · #cv · How to sharpen it · [[1-Projects/Jobs/CV insights.md]]`;
    host = document.createElement('div');
    document.body.append(host);
    const notes = buildVaultIndex([
      ANSWER,
      file('CV_ID', '1-Projects/Jobs/CV insights.md', 'text/markdown'),
      // Another version of the catalogue: the tab keeps each one it read.
      { ...CATALOGUE_FILE, modifiedTime: '2026-10-02T10:00:00Z' },
    ]);
    await act(async () => {
      render(
        h(QuestionsAbout, {
          path: '1-Projects/Jobs/CV insights.md',
          names: ['CV insights'],
          index: notes,
          rows: [],
          getNoteText: () => Promise.resolve(catalogue),
        }),
        host as HTMLElement,
      );
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    await settle();
    expect(host.querySelector('a')?.getAttribute('href')).toBe(
      '/note/ANSWER_ID',
    );
  });

  it('is hidden when nothing was asked about the item', async () => {
    const view = await mount('2-Areas/Money/Payslip.pdf', ['Payslip.pdf']);
    expect(view.querySelector('section')).toBeNull();
  });
});

describe('waiting questions (AC2)', () => {
  const rows = [
    row('About Arlington Road, listing.pdf: is there parking?', 'waiting'),
    row('About Arlington Road, listing: pets allowed?', 'waiting'),
    row('About Other flat.pdf: how far is it?', 'waiting'),
    row('About Arlington Road, listing.pdf: answered already', 'answered'),
  ];

  it('keeps the waiting requests asked about the item by one of its names', () => {
    expect(
      waitingAbout(rows, [LISTING.name, 'Arlington Road, listing']).map(
        (q) => q.question,
      ),
    ).toEqual(['is there parking?', 'pets allowed?']);
  });

  it('writes each as "Asked <day>: <question> · waiting for the next tidy-up"', () => {
    const lines = questionLines(
      [],
      waitingAbout(rows.slice(0, 1), [LISTING.name]),
      index.byPath,
      Date.parse('2026-10-02T12:00:00'),
    );
    expect(lines).toEqual([
      {
        key: 'waiting:row:About Arlington Road, listing.pdf: is there parking?',
        text: 'Asked today: is there parking? · waiting for the next tidy-up',
        href: null,
      },
    ]);
  });

  it('shows them in the block, after the answers, without a link', async () => {
    const view = await mount(LISTING_PATH, [LISTING.name], rows);
    const lines = [...view.querySelectorAll('li')].map((li) => li.textContent);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^When can I move in/);
    expect(lines[1]).toMatch(
      /^Asked .+: is there parking\? · waiting for the next tidy-up$/,
    );
    expect(view.querySelectorAll('a')).toHaveLength(1);
  });
});
