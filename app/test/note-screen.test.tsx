// @vitest-environment jsdom

/**
 * The note screen's layout (#609, boards `Phone-Note-Details` and
 * `Flow-07-Answer`): the props line, the question box of an answer, key
 * facts with their caption and Details, the title once, the About panel and
 * "seen" on open. Hermetic: the vault store, the note cache and the seen set
 * are mocked.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

function md(path: string): DriveFile {
  return {
    id: `id-${path.replace(/[^w]/g, '-')}`,
    name: path.split('/').pop() ?? path,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: '2026-09-26T10:00:00Z',
  };
}

const LISTING = md('1-Projects/Flat hunt/Arlington Road, 2 bed.md');
const ANSWER = md('Answers/Which flat should we view first.md');
const CHECKLIST = md('3-Resources/Viewing checklist.md');
const SCAN: DriveFile = {
  id: 'id-scan',
  name: 'Arlington Road, 2 bed.pdf',
  mimeType: 'application/pdf',
  parents: ['FOLDER_ID'],
  path: '1-Projects/Flat hunt/Arlington Road, 2 bed.pdf',
  modifiedTime: '2026-09-26T10:00:00Z',
};

const texts = new Map<string, string>([
  [
    LISTING.id,
    `---
kind: rental-listing
tags: [housing]
created: 2026-09-26
original: "[[Arlington Road, 2 bed.pdf]]"
pages: 2
rent: 2150
rooms: 2 bed, 1 bath
status: to view
not_stated: [pets, bills]
---

> [!bower] Bower's note
> Rent £2,150 a month. (from the file)
> 14 minutes by bike to your office. (from your notes)

# Arlington Road, 2 bed

## At the viewing

Check the bathroom.
`,
  ],
  [
    ANSWER.id,
    `---
type: answer
tags: [answer]
created: 2026-09-28
question: Which two should we view first?
---

> [!bower] Bower's note
> Arlington Road first. (from the file)

Intro paragraph before the heading.

# Which flat should we view first?

## At the viewing, check
- The bathroom

More in [[Viewing checklist]].

Used: the four listings.
`,
  ],
  [CHECKLIST.id, '# Viewing checklist\n\nAsk about the deposit.'],
]);

const route = { params: { id: LISTING.id } };
vi.mock('preact-iso', () => ({ useRoute: () => route }));

vi.mock('../src/cache.js', () => ({
  loadNote: () => Promise.resolve(undefined),
}));
const markSeen = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());
vi.mock('../src/seen.js', () => ({ markSeen }));

const index = buildVaultIndex([LISTING, ANSWER, CHECKLIST, SCAN]);
const noop = (): Promise<void> => Promise.resolve();
const saveEditedNote =
  vi.fn<
    (
      id: string,
      text: string,
    ) => Promise<{ text: string; modifiedTime: string }>
  >();
const getNoteText = (id: string): Promise<string> =>
  Promise.resolve(texts.get(id) ?? '');

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({
    index,
    getNoteText,
    appendToNote: getNoteText,
    openNoteForEdit: () => Promise.reject(new Error('not used')),
    saveEditedNote,
    pinNote: noop,
    unpinNote: noop,
  }),
}));

const { Note } = await import('../src/routes/note.js');
const { AboutPanel } = await import('../src/components/about-panel.js');
const { renderNote } = await import('../src/markdown/render.js');
const { noteMetaFrom } = await import('../src/note-meta.js');

let root: HTMLDivElement;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(predicate: () => boolean, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return;
    await flush();
  }
  if (!predicate()) throw new Error('waitFor: condition never became true');
}

async function mount(id: string): Promise<void> {
  route.params.id = id;
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Note, {}), root);
  });
  await waitFor(() => root.querySelector('.bower-note-box') !== null);
}

beforeEach(() => {
  markSeen.mockClear();
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
});

describe('Note screen (#609)', () => {
  it('lays out props line, then one box with key facts once and Details open', async () => {
    await mount(LISTING.id);

    // R-NOTE-2: kind row, meta line, Made from (the original by name).
    const row = root.querySelector('.note-kind-row');
    expect(row?.querySelector('.note-kind-chip')?.textContent).toBe(
      'Rental listing',
    );
    expect(row?.textContent).toContain('Bower');
    expect(row?.querySelector('select')?.getAttribute('aria-label')).toBe(
      'Status: To view. Change',
    );
    const meta = root.querySelector('.note-meta-line');
    expect(meta?.textContent).toContain('Flat hunt');
    expect(meta?.textContent).toContain('Filed 26 Sep');
    const original = root.querySelector('.made-from a[href="/file/id-scan"]');
    expect(original?.textContent).toContain('Arlington Road, 2 bed.pdf');
    expect(root.querySelector('.note-props')).toBeNull();

    expect(root.querySelector('.bower-note-box')).not.toBeNull();
    // R-INS-2: no caption, and the key facts are in the box only.
    expect(root.querySelector('.note-keyfacts-caption')).toBeNull();
    expect(root.querySelectorAll('.key-facts')).toHaveLength(1);
    expect(root.querySelector('.bower-note-box .key-facts')).not.toBeNull();
    // R-INS-7: no Details toggle; the fields are shown while the box is open.
    expect(root.querySelector('.details-toggle')).toBeNull();
    expect(root.querySelector('.bower-note-box .details')).not.toBeNull();
    const head = root.querySelector('.bower-note-box-head');
    expect(head?.getAttribute('aria-expanded')).toBe('true');

    // Box (summary, key facts, details), then the body: in that order.
    const order = [
      '.bower-note-box-summary',
      '.key-facts',
      '.details',
      '.markdown h2',
    ];
    const positions = order.map((selector) => {
      const element = root.querySelector(selector);
      return element === null
        ? -1
        : Array.from(root.querySelectorAll('*')).indexOf(element);
    });
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('shows the title once on a note that opens with a box and repeats it as H1', async () => {
    await mount(LISTING.id);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')?.textContent).toBe('Arlington Road, 2 bed');
  });

  it('shows an answer with the question, the lists, the checklist link and the Used line', async () => {
    await mount(ANSWER.id);

    expect(root.querySelector('.note-asked-label')?.textContent).toBe(
      'You asked, 28 Sep',
    );
    expect(root.querySelector('.note-asked-text')?.textContent).toBe(
      'Which two should we view first?',
    );
    expect(root.querySelector('.bower-note-box')).not.toBeNull();
    expect(root.textContent).toContain('At the viewing, check');
    expect(
      root.querySelector(`a[href="/note/${CHECKLIST.id}"]`)?.textContent,
    ).toBe('Viewing checklist · in Resources');
    expect(root.textContent).toContain('Used: the four listings.');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
  });

  it('names an answer "Answer" with no status select, and "Written" in its meta line', async () => {
    await mount(ANSWER.id);
    expect(root.querySelector('.note-kind-chip')?.textContent).toBe('Answer');
    expect(root.querySelector('.note-status')).toBeNull();
    expect(root.querySelector('.note-meta-line')?.textContent).toContain(
      'Written 28 Sep',
    );
    expect(root.querySelector('.made-from')).toBeNull();
  });

  it('writes the chosen status to the note (R-NOTE-2)', async () => {
    await mount(LISTING.id);
    const select = root.querySelector<HTMLSelectElement>('.note-status');
    if (select === null) throw new Error('no status select');
    saveEditedNote.mockImplementation((_id: string, text: string) =>
      Promise.resolve({ text, modifiedTime: '2026-09-29T09:00:00Z' }),
    );
    await act(() => {
      select.value = 'viewed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(saveEditedNote).toHaveBeenCalledTimes(1);
    const saved = saveEditedNote.mock.calls[0]?.[1] ?? '';
    expect(saved).toContain('status: viewed');
    expect(saved).not.toContain('status: to view');
  });

  it('marks the note seen when it opens', async () => {
    await mount(LISTING.id);
    expect(markSeen).toHaveBeenCalledWith(LISTING.id);
  });

  it("also marks the note's original seen, so its folder row stops saying New (#686)", async () => {
    await mount(LISTING.id);
    await waitFor(() => markSeen.mock.calls.some(([id]) => id === SCAN.id));
    expect(markSeen).toHaveBeenCalledWith(SCAN.id);
  });
});

describe('About panel (#609)', () => {
  it('holds About this note, Details, Original, Outline and In this folder, and no key facts (R-NOTE-5)', async () => {
    const text = texts.get(LISTING.id) ?? '';
    const rendered = renderNote(text, index, { path: LISTING.path });
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(
        h(AboutPanel, {
          index,
          file: LISTING,
          html: rendered.html,
          properties: { tags: ['housing'] },
          folder: { name: 'Flat hunt', href: '/folder/x' },
          meta: noteMetaFrom(rendered.frontmatter),
        }),
        root,
      );
    });

    const headings = Array.from(root.querySelectorAll('.about-heading')).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual([
      'About this note',
      'Details',
      'Original',
      'Outline',
      'In this folder',
    ]);
    expect(root.querySelector('[aria-label="Key facts"]')).toBeNull();
    expect(root.querySelector('.about-not-stated')?.textContent).toContain(
      'pets, bills',
    );
    expect(root.querySelector('.about-original')?.textContent).toBe(
      'PDF, 2 pages',
    );
    expect(root.querySelector('.about-detail dt')?.textContent).toBeDefined();
  });
});

describe('About panel names (R-NOTE-5)', () => {
  it('reads wikilinks as the names they point to', async () => {
    const { plainNames } = await import('../src/components/about-panel.js');
    expect(plainNames('[[1-Projects/Flat/Lease.pdf|the lease]]')).toBe(
      'the lease',
    );
    expect(plainNames('See [[1-Projects/Flat/Lease.pdf]] now')).toBe(
      'See Lease.pdf now',
    );
    expect(plainNames('no links')).toBe('no links');
  });

  it('resolves the original the way the folder screen does', async () => {
    const { originalFileOf } = await import('../src/components/about-panel.js');
    expect(originalFileOf(index, LISTING, '[[Arlington Road, 2 bed.pdf]]')).toBe(
      index.byPath.get(SCAN.path),
    );
    expect(originalFileOf(index, ANSWER, '[[Missing.pdf]]')).toBeUndefined();
  });
});
