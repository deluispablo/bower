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
    body: 'A question, a job or a rule (“from now on…”). It waits in your inbox and Bower does it at the next tidy-up; the bird on Home tells you how it goes.',
  },
  {
    heading: 'Only your Drive',
    body: 'Your notes live in a folder you own, readable in Drive and Obsidian. A tidy-up works on a temporary copy that is deleted when it ends; Claude, the AI behind Bower, reads your files to write Bower’s notes.',
  },
];

/**
 * A page's body for the layout it shows in: the desktop says "click" where
 * the phone says "tap" (K-27).
 */
export function introBody(page: IntroPage, desktop: boolean): string {
  return desktop ? page.body.replace(/\btap\b/g, 'click') : page.body;
}

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
 * Page 1: the pile. The names have no extension (K-17): the kind word says
 * what a thing is, never `.pdf`.
 */
export const INTRO_PILE = {
  title: 'Your pile',
  line: 'My move: the new job and a flat near it',
  files: ['Lease 2026', 'flat-camden.example', 'IMG_2231'],
  button: 'Tidy up',
} as const;

/** One summary point of the page-2 note: where it comes from, and Check. */
export interface IntroNotePoint {
  origin: 'file' | 'notes';
  /** The point's words; `link` names the note in them that is a link. */
  text: string;
  check?: boolean;
  link?: string;
}

/** Page 2: the original above Bower's note. */
export const INTRO_NOTE: {
  original: string;
  originalCaption: string;
  points: readonly IntroNotePoint[];
} = {
  original: 'Lease 2026',
  originalCaption: 'the original, untouched',
  points: [
    {
      origin: 'file',
      text: 'A 12-month lease for the flat in Camden: £1,450 a month, two months’ notice.',
    },
    { origin: 'file', text: 'Check who pays the agency fee.', check: true },
    {
      origin: 'notes',
      text: 'The flat is 25 minutes from the new job in your offer letter note.',
      link: 'offer letter',
    },
  ],
};

/** Page 3: two notes joining into one line. */
export const INTRO_JOIN = {
  notes: ['Flat in Camden', 'New job offer'],
  result: 'From your notes: the flat is 25 minutes from the new job.',
  disagree: 'Two notes give a different start date: Bower tells you.',
} as const;

/** Page 4: a request, where it waits, and the bird on Home when it is done. */
export const INTRO_REQUEST = {
  question: 'Which flat is closest to the new job?',
  waits: 'Waits in your inbox for the tidy-up',
  done: 'Done: 2 filed, 3 new, 2 updated, 1 needs you.',
  link: 'See what changed',
} as const;

/** Page 5: the same folder in three places. */
export const INTRO_FOLDER = {
  places: ['Drive', 'Bower', 'Obsidian'],
  rows: ['0-Inbox', '1-Projects', '2-Areas', '3-Resources', '4-Archives'],
  /** The Bower column: each top folder by its plain name, with its disc. */
  roots: [
    { kind: 'inbox', name: 'Inbox' },
    { kind: 'projects', name: 'Projects' },
    { kind: 'areas', name: 'Areas' },
    { kind: 'resources', name: 'Resources' },
    { kind: 'archives', name: 'Archives' },
  ],
  caption: 'The same folder, in Drive, in Bower and in Obsidian.',
} as const;

/**
 * The page-2 note box's HTML in the renderer's own shape (a `.bower-note`
 * box with its legend and rows), so `BowerNoteBox` draws it like any note.
 * The strings are this file's own and hold nothing to escape.
 */
export function introNoteHtml(): string {
  const rows = INTRO_NOTE.points
    .map((point) => {
      const text =
        point.link === undefined
          ? point.text
          : point.text.replace(
              point.link,
              `<a class="wikilink" href="#" tabindex="-1">${point.link}</a>`,
            );
      const check = point.check === true ? ' bower-note-check' : '';
      return `<li class="bower-note-row${check}"><span class="bower-origin bower-origin-${point.origin}"></span><div class="bower-note-text">${text}</div></li>`;
    })
    .join('');
  return (
    '<div class="bower-note"><div class="bower-note-head">' +
    '<div class="bower-note-title">Bower’s note</div>' +
    '<div class="bower-note-legend">· from <em class="bower-legend-file">the file</em>, <em class="bower-legend-notes">your notes</em></div></div>' +
    `<ul class="bower-note-rows">${rows}</ul></div>`
  );
}

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

/**
 * Page 5's last button. Replayed from inside the app while signed in
 * (`from=settings`, which Settings and Learn use when signed in): "Back to
 * Bower", which goes Home. Opened from the sign-in or the demo's Run your
 * own: Done, back there. A first visit: the sign-in, or Try the demo in a
 * demo build.
 */
export type IntroLastAction = 'back-to-bower' | 'done' | 'try-demo' | 'sign-in';

export function introLastAction(
  from: string | undefined,
  demo: boolean,
): IntroLastAction {
  if (from === 'settings') return 'back-to-bower';
  if (introReturnPath(from) !== null) return 'done';
  return demo ? 'try-demo' : 'sign-in';
}

/** The words on each last button. */
export const INTRO_LAST_LABEL: Readonly<Record<IntroLastAction, string>> = {
  'back-to-bower': 'Back to Bower',
  done: 'Done',
  'try-demo': 'Try the demo',
  'sign-in': 'Sign in with Google',
};
