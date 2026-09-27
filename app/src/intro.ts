/**
 * "What is Bower" (#207, spec §14): whether this device has already seen
 * the four-page intro, and the intro's own copy — verbatim from the design
 * boards (`docs/design/screens/Intro-1.dc.html` to `Intro-4.dc.html`) — in
 * one file, so `routes/intro.tsx` and any later README section say the
 * same thing.
 *
 * `introSeen`/`markIntroSeen` take a `Storage` (not the `localStorage`
 * global) so they are unit-testable against a storage that throws, without
 * touching the real browser storage.
 */

const INTRO_SEEN_KEY = 'bower:intro:seen';

/**
 * Whether `storage` already has the seen flag. A storage that throws
 * (private browsing with storage blocked, or any other failure) counts as
 * "not seen": the intro shows again rather than risk hiding it for good.
 */
export function introSeen(storage: Storage): boolean {
  try {
    return storage.getItem(INTRO_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

/** Sets the seen flag; a throwing `storage` is silently ignored (best effort). */
export function markIntroSeen(storage: Storage): void {
  try {
    storage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Storage blocked or full: worst case the intro shows again next time.
  }
}

/** One of the four pages' heading and, where the board has one, its body copy. */
export interface IntroPage {
  /** May hold a `\n`, rendered as a line break (`white-space: pre-line`). */
  heading: string;
  body?: string;
}

/** Exactly the four pages, so indexing one by its literal position is safe. */
export type IntroPages = readonly [IntroPage, IntroPage, IntroPage, IntroPage];

export const INTRO_PAGES: IntroPages = [
  {
    heading: 'Drop it.\nBower files it.',
    body: 'Photos, PDFs, links, voice memos, half-thoughts. Add a pile, tap once, and everything ends up where it belongs, as notes in one folder of your own Google Drive.',
  },
  { heading: 'Six things it does with what you save' },
  {
    heading: 'A window onto your own Drive',
    body: 'Bower does not hold your things. Same files on both sides of the glass.',
  },
  {
    heading: 'What people use it for',
    body: 'Anything you save more than once. It remembers how you like things done and joins the dots between everything it keeps.',
  },
];

/** The six verb cards on page 2, in the board's order. */
export interface IntroVerb {
  verb: string;
  detail: string;
}

export const INTRO_VERBS: readonly IntroVerb[] = [
  { verb: 'Reads', detail: 'every word of what you save, photos included.' },
  {
    verb: 'Files',
    detail: 'it in the right folder: yours if you said, PARA if not.',
  },
  {
    verb: 'Looks up',
    detail: 'what the thing left out: the walk to the station, the company.',
  },
  {
    verb: 'Writes',
    detail: 'the note you would have written with a free afternoon.',
  },
  { verb: 'Remembers', detail: 'how you like things done. Ask once.' },
  {
    verb: 'Connects',
    detail: 'it to everything else it keeps for you, and says so.',
  },
];

/** Page 1's sort-strip: what lands in the inbox, and where it ends up. */
export const INTRO_INBOX_ITEMS: readonly string[] = [
  'IMG_2231',
  'Lease.pdf',
  'nytimes.com/…',
  'voice memo',
];

export const INTRO_SORTED_FOLDERS: readonly string[] = [
  'Home',
  'Finance',
  'Reading',
  'Answers',
];

/** Page 3's two mirrored windows: the same rows, in the app and in Drive. */
export const INTRO_DRIVE_ROWS: readonly string[] = [
  '1-Projects',
  '2-Areas',
  '3-Resources',
  '4-Archive',
  'Flat hunt',
];

/** The three "not" rows on page 3. */
export const INTRO_NOT_ROWS: readonly string[] = [
  'Not an editor',
  'Not a place your things are stored',
  'Not another app to move your life into',
];

/** Page 4's one card per PARA letter. */
export interface IntroParaItem {
  letter: string;
  color: string;
  title: string;
  detail: string;
}

export const INTRO_PARA: readonly IntroParaItem[] = [
  {
    letter: 'P',
    color: '#5fcfbc',
    title: 'A project',
    detail:
      'Flat hunting, a job hunt, a trip: every listing ranked, every ad measured against the flats.',
  },
  {
    letter: 'A',
    color: '#f0b64f',
    title: 'An area of life',
    detail:
      'Health, money, home: each paper filed, one note that shows what changed over the year.',
  },
  {
    letter: 'R',
    color: '#93c5fd',
    title: 'A resource',
    detail: 'Articles and recipes, kept clean, digested when a topic grows.',
  },
  {
    letter: 'A',
    color: '#c4b5fd',
    title: 'The archive',
    detail:
      'Finished things filed away with what to remember. Nothing deleted.',
  },
];

export const INTRO_INVITED_LINE = 'Only people who were invited can sign in';
