/**
 * "What is Bower" (#207, #327): whether this device has already seen the
 * five-page intro, and the intro's own copy — verbatim from the design
 * boards (the v5 Intro boards) —
 * in one file, so `routes/intro.tsx` and any later README section say the
 * same thing.
 *
 * Prose strings may wrap a phrase in `**` for bold, as the boards do; the
 * route renders it with `<b>`.
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

/** One page's heading and the paragraph under it. */
export interface IntroPage {
  /** May hold a `
`, rendered as a line break (`white-space: pre-line`). */
  heading: string;
  body: string;
}

/** Exactly five pages, so indexing one by its literal position is safe. */
export type IntroPages = readonly [
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
];

export const INTRO_PAGES: IntroPages = [
  {
    heading: 'Drop a pile.\nBower files it.',
    body: 'Add files and links, say in a line what they are, and tap Tidy up. Bower puts each thing in the right folder of your own Google Drive.',
  },
  {
    heading: "Every file gets\nBower's note",
    body: 'A short summary, the key facts and what to check, with where each line comes from. Your original stays exactly as it was. Fold the note away when you do not need it.',
  },
  {
    heading: 'It joins\nthe dots',
    body: 'Bower checks each new thing against what you already keep, adds what follows from it, and tells you when two notes disagree.',
  },
  {
    heading: 'Ask in your\nown words',
    body: 'A question, a job or a rule (“from now on…”). It waits in your inbox and Bower does it at the next tidy-up; the tidy-up bar shows how it goes.',
  },
  {
    heading: 'Only your Drive',
    body: 'Your notes live in a folder you own, readable in Drive and Obsidian. A tidy-up works on a temporary copy that is deleted when it ends; Claude, the AI behind Bower, reads your files to write Bower’s notes.',
  },
];

/** How many pages there are. */
export const INTRO_PAGE_COUNT = INTRO_PAGES.length;

/**
 * The page (0-based) a `?page=` value names. Anything that is not a whole
 * number from 1 to 5 is clamped into that range; a missing or unreadable
 * value is page 1.
 */
export function introPageFromQuery(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(INTRO_PAGE_COUNT, Math.max(1, n)) - 1;
}

/** The two-word status next to the dots: "2 of 5" for the 0-based page 1. */
export function introPageLabel(index: number): string {
  return `${index + 1} of ${INTRO_PAGE_COUNT}`;
}

/**
 * The four PARA colours, as the boards use them. They read the theme tokens
 * (`tokens.css`), so the intro keeps its look in dark and takes the darker
 * marks in light.
 */
export const PARA_COLORS = {
  projects: 'var(--color-para-projects)',
  areas: 'var(--color-para-areas)',
  resources: 'var(--color-para-resources)',
  archive: 'var(--color-para-archives)',
} as const;

/** Page 1: the pile, its one line, the button and two PARA chips. */
export const INTRO_PILE = {
  title: 'Your pile',
  line: 'My move: the new job and a flat near it',
  files: ['Lease 2026.pdf', 'flat-camden.example', 'IMG_2231.jpg'],
  button: 'Tidy up',
  chips: [
    { name: 'Projects', color: PARA_COLORS.projects },
    { name: 'Areas', color: PARA_COLORS.areas },
  ],
} as const;

/** Page 2: the original above Bower's note. */
export const INTRO_NOTE = {
  original: 'Lease 2026.pdf',
  originalCaption: 'the original, untouched',
  title: 'Lease 2026',
  summary: 'A 12-month lease for the flat in Camden.',
  facts: [
    { label: 'Rent', value: '£1,450 a month' },
    { label: 'Notice', value: 'Two months' },
  ],
  origins: ['From your file', 'From the web', 'From your notes'],
  check: 'Check: who pays the agency fee.',
} as const;

/** Page 3: two notes joining into one line. */
export const INTRO_JOIN = {
  notes: ['Flat in Camden', 'New job offer'],
  result: 'From your notes: the flat is 25 minutes from the new job.',
  disagree: 'Two notes give a different start date: Bower tells you.',
} as const;

/** Page 4: a request, where it waits, and the bar when it is done. */
export const INTRO_REQUEST = {
  bubble: 'Which flat is closest to the new job?',
  waits: 'Waits in your inbox for the tidy-up',
  barTitle: 'Tidy up',
  counts: ['2 filed', '3 new', '2 updated', '1 needs you'],
} as const;

/** Page 5: the same folder in three places. */
export const INTRO_FOLDER = {
  places: ['Drive', 'Bower', 'Obsidian'],
  rows: ['0-Inbox', '1-Projects', '2-Areas', '3-Resources', '4-Archives'],
  caption: 'The same folder, in Drive, in Bower and in Obsidian.',
} as const;

/** The last page's link to Learn Bower. */
export const INTRO_LEARN_LABEL = 'See examples and use cases';

/** One run of a prose string: plain, or bold (a `**…**` span). */
export interface IntroRun {
  text: string;
  bold: boolean;
}

/**
 * Splits a prose string on its `**` markers into plain and bold runs, in
 * order, dropping empty ones. An unmatched `**` leaves the rest bold.
 */
export function introRuns(text: string): IntroRun[] {
  return text
    .split('**')
    .map((part, index) => ({ text: part, bold: index % 2 === 1 }))
    .filter((run) => run.text !== '');
}

/**
 * Where the intro's Close and Done go when it was opened from inside the
 * app (`/welcome?from=…`): `settings` (Settings and the help sheets) goes back to Settings; `login` (the
 * sign-in's "What is Bower?") back to `/login`; `run-your-own` (the
 * demo's Run your own Bower, #366) back to it at `/login`. `null` for a
 * first visit, which has Skip and the sign-in instead.
 */
export function introReturnPath(from: string | undefined): string | null {
  if (from === 'settings') return '/settings';
  if (from === 'login') return '/login';
  if (from === 'run-your-own') return '/login';
  return null;
}
