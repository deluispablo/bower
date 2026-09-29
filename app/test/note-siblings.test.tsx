// @vitest-environment jsdom

/**
 * The previous/next nav under a note (#423): it must walk the same notes
 * the folder screen itself shows (Bower's own files hidden unless
 * `showAppFiles` is on) and label each link with the note's real title
 * (`noteTitle`, #306) rather than the file name — `siblings` (its own
 * filtering rule) is unit-tested directly in `navigation.test.ts`; this
 * checks the route wires it, and the note cache, into what actually
 * renders.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { resetPrefs, setPref } from '../src/prefs.js';
import { buildVaultIndex } from '../src/vault-index.js';

const FIRST_QUESTION_TEXT =
  "# What's my Wi-Fi password?\n\nIt's on the router.";
const SUBSCRIPTIONS_TEXT =
  '# Which subscriptions renew this autumn?\n\nJust the streaming service.';

function note(path: string, modifiedTime: string): DriveFile {
  return {
    id: `id-${path}`,
    name: path.split('/').pop() ?? path,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
    modifiedTime,
  };
}

// Alphabetically: the Wi-Fi question, then the subscriptions question,
// then Bower's own file — matching the issue's own repro (folder Answers,
// one real note plus a "Bower - Proposals.md").
const WIFI = note(
  'Answers/2026-09-05 Wi-Fi question.md',
  '2026-09-05T00:00:00Z',
);
const SUBSCRIPTIONS = note(
  'Answers/2026-09-21 Which subscriptions renew this autumn.md',
  '2026-09-21T00:00:00Z',
);
const PROPOSALS = note('Answers/Bower - Proposals.md', '2026-09-26T00:00:00Z');

const route = { params: { id: SUBSCRIPTIONS.id } };

vi.mock('preact-iso', () => ({ useRoute: () => route }));

const noteText = new Map<string, string>([
  [WIFI.id, FIRST_QUESTION_TEXT],
  [SUBSCRIPTIONS.id, SUBSCRIPTIONS_TEXT],
]);
const getNoteText = (id: string): Promise<string> =>
  Promise.resolve(noteText.get(id) ?? '');

// `useNoteTitles` (`components/use-note-titles.js`) resolves a sibling's
// real title from this cache; a file with nothing cached, or a stale
// `modifiedTime`, falls back to `noteTitle`'s file-name reading instead.
const loadNote = vi.fn(
  (id: string): Promise<{ text: string; modifiedTime: string } | undefined> => {
    const file = [WIFI, SUBSCRIPTIONS, PROPOSALS].find((f) => f.id === id);
    const text = noteText.get(id);
    if (file === undefined || text === undefined) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({ text, modifiedTime: file.modifiedTime ?? '' });
  },
);
vi.mock('../src/cache.js', () => ({ loadNote }));
vi.mock('../src/seen.js', () => ({ markSeen: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/use-request-rows.js', () => ({ useRequestRows: () => [] }));

const index = buildVaultIndex([WIFI, SUBSCRIPTIONS, PROPOSALS]);
const noop = (): Promise<void> => Promise.resolve();

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({
    index,
    getNoteText,
    appendToNote: getNoteText,
    openNoteForEdit: () => Promise.reject(new Error('not used')),
    saveEditedNote: () => Promise.reject(new Error('not used')),
    pinNote: noop,
    unpinNote: noop,
  }),
}));

const { Note, walkFolder, pagerCount, pagerLabel } = await import(
  '../src/routes/note.js'
);
const { kindById } = await import('../src/kinds.js');
const { noteMetaFrom } = await import('../src/note-meta.js');

let root: HTMLDivElement;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Flushes until `predicate` is true, or fails after `tries` rounds. */
async function waitFor(predicate: () => boolean, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return;
    await flush();
  }
  if (!predicate()) throw new Error('waitFor: condition never became true');
}

async function mount(): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Note, {}), root);
  });
  await flush();
}

beforeEach(() => {
  route.params.id = SUBSCRIPTIONS.id;
});

afterEach(() => {
  resetPrefs();
  void act(() => {
    render(null, root);
  });
  root.remove();
  loadNote.mockClear();
});

describe('Note: previous/next (#423)', () => {
  it("hides Bower's own file and labels the sibling with its real title, not the file name", async () => {
    await mount();

    const nav = root.querySelector('.note-siblings');
    if (nav === null) throw new Error('note-siblings nav missing');

    // Only the Wi-Fi question shows, as "prev" (alphabetically first);
    // Bower - Proposals never appears. Its resolved title, not the file
    // name with its date prefix, is what the link reads, once the cache
    // read behind `useNoteTitles` settles.
    await waitFor(
      () =>
        nav.querySelector('a')?.textContent === "‹ What's my Wi-Fi password?",
    );
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(`/note/${WIFI.id}`);
  });

  it('says where the note is in the folder, "n of m", in the folder\'s sort (#609)', async () => {
    await mount();
    // By name (the default): Wi-Fi, then Subscriptions — this note is 2nd.
    expect(root.querySelector('.note-siblings-count')?.textContent).toBe(
      '2 of 2',
    );
    await act(() => {
      render(null, root);
    });
    root.remove();

    // Newest first: Subscriptions (this note) leads, Wi-Fi follows it.
    setPref('explorerSort', 'modified');
    await mount();
    expect(root.querySelector('.note-siblings-count')?.textContent).toBe(
      '1 of 2',
    );
    const links = Array.from(root.querySelectorAll('.note-siblings a'));
    expect(links).toHaveLength(1);
    await waitFor(
      () =>
        root.querySelector('.note-siblings a')?.textContent ===
        "What's my Wi-Fi password? ›",
    );
    expect(links[0]?.getAttribute('href')).toBe(`/note/${WIFI.id}`);
  });
});

describe('The pager counts the same kind only (R-NOTE-4)', () => {
  const offer = (name: string): DriveFile =>
    note(`Applications/${name}.md`, '2026-09-20T00:00:00Z');
  const A = offer('A offer');
  const B = offer('B offer');
  const C = offer('C offer');
  const CV = offer('CV 2026');
  const applications = buildVaultIndex([A, B, C, CV]);
  const meta = (
    kind: string,
    score?: number,
  ): ReturnType<typeof noteMetaFrom> =>
    noteMetaFrom({ kind, ...(score === undefined ? {} : { score }) });
  const metas = new Map([
    [A.id, meta('job-offer', 60)],
    [B.id, meta('job-offer', 90)],
    [C.id, meta('job-offer')],
    [CV.id, meta('cv')],
  ]);

  it('leaves the CV and the letters out and ranks the offers by score', () => {
    const walk = walkFolder(applications, A.id, false, 'name', {
      kind: 'job-offer',
      metas,
      byScore: true,
    });
    // B (90), A (60), then C with no score: A is 2nd of 3.
    expect(walk.total).toBe(3);
    expect(walk.position).toBe(2);
    expect(walk.prev?.id).toBe(B.id);
    expect(walk.next?.id).toBe(C.id);
  });

  it('walks every note of the folder when the note has no kind', () => {
    expect(walkFolder(applications, A.id, false, 'name').total).toBe(4);
  });

  it('words the count and the label by kind', () => {
    const jobOffer = kindById('job-offer');
    expect(pagerCount(1, 4, jobOffer, true)).toBe('1 of 4 offers, by score');
    expect(pagerCount(2, 5, undefined, false)).toBe('2 of 5');
    expect(pagerLabel(jobOffer)).toBe('Offers in this folder');
    expect(pagerLabel(undefined)).toBe('Notes in this folder');
  });
});
