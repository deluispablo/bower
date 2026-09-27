/**
 * "What is Bower" (#207, #327): whether this device has already seen the
 * nine-page intro, and the intro's own copy — verbatim from the design
 * boards (`docs/design/v3/boards/Intro-1.dc.html` to `Intro-9.dc.html`) —
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
  /** May hold a `\n`, rendered as a line break (`white-space: pre-line`). */
  heading: string;
  body: string;
}

/** Exactly the nine pages, so indexing one by its literal position is safe. */
export type IntroPages = readonly [
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
  IntroPage,
];

export const INTRO_PAGES: IntroPages = [
  {
    heading: 'Drop it.\nBower files it.',
    body: 'Photos, PDFs, links, screenshots. Add a pile, tap once, and each thing lands in the right folder of your own Google Drive. Nothing else happens unless you ask.',
  },
  {
    heading: 'Where does it go?',
    body: 'Four folders, the way PARA sorts a life: **Projects** with an end date, **Areas** that go on, **Resources** to keep, an **Archive** for what is done. Bower reasons the folder, or follows what you told it.',
  },
  {
    heading: 'Ask, and it does more',
    body: 'In your own words, whenever you want. No menus to learn.',
  },
  {
    heading: 'A window onto your own Drive',
    body: 'Bower does not hold your things. Same files on both sides of the glass; open the folder with anything else too.',
  },
  {
    heading: 'A project: flat hunting',
    body: 'Every listing you like goes in as you find it: a link, a screenshot, a photo of a sign. Bower files them under Flat hunt and stops there.',
  },
  {
    heading: 'An area: your health',
    body: 'Areas are the parts of life with no end date. Each lab report or letter goes in as it comes and is filed under Health, untouched.',
  },
  {
    heading: 'A resource: what you read',
    body: 'Articles and recipes you save are kept as clean notes under a topic. When a topic grows, ask for a digest.',
  },
  {
    heading: 'The archive: finished, kept',
    body: 'When a project has no dates left, Bower asks once and moves it to the archive, together. Nothing is ever deleted.',
  },
  {
    heading: 'What will you start with?',
    body: 'Anything you save more than once. Three things people do on day one:',
  },
];

/** The four PARA colours, as the boards use them (letters, folder names). */
export const PARA_COLORS = {
  projects: '#5fcfbc',
  areas: '#f0b64f',
  resources: '#93c5fd',
  archive: '#c4b5fd',
} as const;

/** Page 1's sort strip at rest: each folder with its cards stacked above it. */
export interface IntroSortFolder {
  name: string;
  color: string;
  cards: readonly string[];
}

export const INTRO_SORT_FOLDERS: readonly IntroSortFolder[] = [
  {
    name: 'Home',
    color: PARA_COLORS.projects,
    cards: ['call the vet', 'IMG_2231'],
  },
  {
    name: 'Finance',
    color: PARA_COLORS.areas,
    cards: ['receipt.jpg', 'Lease.pdf'],
  },
  { name: 'Reading', color: PARA_COLORS.resources, cards: ['nytimes.com/…'] },
  { name: 'Answers', color: PARA_COLORS.archive, cards: ['voice memo'] },
];

export const INTRO_SORT_DONE = 'All tidy';

export const INTRO_SORT_CAPTION =
  'A month of clutter, sorted while you make a coffee. The bird does the carrying.';

/** Page 2: what arrives in the inbox, the folder it lands in, and why. */
export const INTRO_ARRIVALS_TITLE = 'Arrives in the inbox';

export const INTRO_ARRIVALS: readonly string[] = [
  'rentradar.example',
  'IMG_4471.jpg',
  'receipt.pdf',
];

export const INTRO_TREE_TITLE = 'Your Bower folder';

export interface IntroTreeRow {
  name: string;
  /** 0 for a top-level folder, 1 and 2 for folders inside it. */
  depth: 0 | 1 | 2;
  /** Where one of the arrivals lands (bold, highlighted). */
  lit?: boolean;
}

export const INTRO_TREE: readonly IntroTreeRow[] = [
  { name: '0-Inbox', depth: 0 },
  { name: '1-Projects', depth: 0 },
  { name: 'Flat hunt', depth: 1 },
  { name: 'Camden', depth: 2, lit: true },
  { name: 'Job hunt', depth: 1 },
  { name: '2-Areas', depth: 0 },
  { name: 'Cooking', depth: 1, lit: true },
  { name: 'Finance', depth: 1, lit: true },
  { name: 'Health', depth: 1 },
];

export interface IntroWhy {
  /** Reasoned by Bower, or told by you (a rule). */
  kind: 'reasoned' | 'told';
  text: string;
}

export const INTRO_WHYS: readonly IntroWhy[] = [
  {
    kind: 'reasoned',
    text: '**Reasoned.** A rental listing, and you have a project called Flat hunt: it goes there.',
  },
  {
    kind: 'reasoned',
    text: '**Reasoned.** A photo of a recipe, no project mentions it: Areas / Cooking.',
  },
  {
    kind: 'told',
    text: '**Told.** You said "receipts go to Finance": the receipt lands there, named by shop and date.',
  },
];

/** Page 3: the six verb cards, in the board's order, and three things to say. */
export interface IntroVerb {
  verb: string;
  detail: string;
}

export const INTRO_VERBS: readonly IntroVerb[] = [
  {
    verb: 'Reads',
    detail:
      'every word of a file, photos included, when you ask for a summary.',
  },
  {
    verb: 'Looks up',
    detail: 'what a thing leaves out: the walk to the station, the company.',
  },
  {
    verb: 'Writes',
    detail: 'the note you would have written with a free afternoon.',
  },
  { verb: 'Remembers', detail: 'how you like things done. Say it once.' },
  {
    verb: 'Connects',
    detail: 'it to everything else it keeps for you, and says so.',
  },
  {
    verb: 'Answers',
    detail: 'questions about your own things, with links to the notes it used.',
  },
];

export const INTRO_SAY_TITLE = 'Say things like';

export const INTRO_SAY: readonly string[] = [
  '"Summarise this lease and list what to check"',
  '"From now on, receipts go under Finance"',
  '"Make a document that analyses the job offers I saved"',
];

/** Page 4: the same folder in Drive and in the app, and the three "not"s. */
export interface IntroWindowRow {
  name: string;
  /** A date in Drive; a count, an age or "hidden" in the app. */
  meta: string;
  kind: 'folder' | 'file' | 'hidden';
}

export const INTRO_DRIVE_TITLE = 'My Drive › Bower';

export const INTRO_DRIVE_ROWS: readonly IntroWindowRow[] = [
  { name: '1-Projects', meta: '26 Sep', kind: 'folder' },
  { name: '2-Areas', meta: '22 Sep', kind: 'folder' },
  { name: '3-Resources', meta: '26 Sep', kind: 'folder' },
  { name: '4-Archive', meta: '18 Nov', kind: 'folder' },
  { name: 'Flat hunt.md', meta: '4 min ago', kind: 'file' },
  { name: 'About me.md', meta: '2 Aug', kind: 'file' },
  { name: 'CLAUDE.md', meta: '26 Sep', kind: 'file' },
];

export const INTRO_APP_TITLE = 'Your notes';

export const INTRO_APP_ROWS: readonly IntroWindowRow[] = [
  { name: '1-Projects', meta: '3', kind: 'folder' },
  { name: '2-Areas', meta: '4', kind: 'folder' },
  { name: '3-Resources', meta: '2', kind: 'folder' },
  { name: '4-Archive', meta: '1', kind: 'folder' },
  { name: 'Flat hunt', meta: '4 min', kind: 'file' },
  { name: 'About me', meta: 'Aug', kind: 'file' },
  { name: "Bower's own files", meta: 'hidden', kind: 'hidden' },
];

export interface IntroNotRow {
  title: string;
  detail: string;
}

export const INTRO_NOT_ROWS: readonly IntroNotRow[] = [
  {
    title: 'Not an editor',
    detail: 'Write in Obsidian, Google Docs, anything: it is plain text.',
  },
  {
    title: 'Not a place your things are stored',
    detail: 'Nothing of yours lives on a Bower server.',
  },
  {
    title: 'Not another app to move your life into',
    detail: 'Delete the app tomorrow and the folder is still there.',
  },
];

/**
 * Pages 5 to 8: one case per PARA letter, each in three acts (you add and
 * Bower files, you ask, you get a note) and a closing line.
 */
export interface IntroAdded {
  title: string;
  detail: string;
}

export interface IntroTable {
  head: readonly string[];
  rows: readonly (readonly string[])[];
  /** The highlighted row, if any (the one worth acting on). */
  best?: number;
}

export interface IntroNote {
  path: string;
  title: string;
  /** A line between the title and the table or the checklist. */
  lead?: string;
  table?: IntroTable;
  /** What the note concludes, after the table. */
  summary?: string;
  checklistTitle?: string;
  checklist: readonly string[];
  /** A line after the checklist. */
  after?: string;
}

export interface IntroCase {
  letter: string;
  color: string;
  added: readonly IntroAdded[];
  ask: string;
  note: IntroNote;
  /** The amber box under the three acts. */
  closing: string;
}

export const INTRO_ACTS = [
  'You add, and Bower files',
  'You ask',
  'You get',
] as const;

export const INTRO_ASK_LINE =
  'Reads, looks up, writes: on the next tidy-up, or now if you say so.';

export type IntroCases = readonly [IntroCase, IntroCase, IntroCase, IntroCase];

export const INTRO_CASES: IntroCases = [
  {
    letter: 'P',
    color: PARA_COLORS.projects,
    added: [
      {
        title: 'rentradar.example',
        detail: 'Arlington Road, Camden · £2,150 pcm',
      },
      { title: 'Screenshot from a chat', detail: 'Kingsland Road, Shoreditch' },
      { title: 'Photo of a window sign', detail: 'Portobello Road' },
    ],
    ask: 'Compare the flats I saved and tell me which to visit first',
    note: {
      path: '1-Projects / Flat hunt / Flat hunt.md',
      title: 'Flat hunt: 3 saved, 1 worth visiting first',
      table: {
        head: ['Flat', '£ / mo', 'm²', 'Tube', 'vs area', 'Rating'],
        rows: [
          [
            'Arlington Rd, Camden',
            '2,150',
            '68',
            '6 min',
            '−10 %',
            '★★★★½ 8.6',
          ],
          [
            'Kingsland Rd, Shoreditch',
            '2,400',
            '62',
            '4 min',
            '+3 %',
            '★★★½ 7.2',
          ],
          [
            'Portobello Rd, Notting Hill',
            '2,600',
            '71',
            '8 min',
            '−2 %',
            '★★★ 6.5',
          ],
        ],
        best: 0,
      },
      summary:
        '**Visit first: Camden.** Best price for the size, closest to the offices you are interviewing at, and the quietest street. The one unknown is the bathroom.',
      checklistTitle: 'Before you sign, check',
      checklist: [
        'Bathroom vs the "newly refurbished" claim',
        'Water pressure and boiler age',
        'Noise with the windows open at 9 pm',
        'Council tax band and bills included?',
        'Who pays the agency fee',
      ],
    },
    closing:
      '**And it remembers.** Say "from now on, do this with every listing" and it does, without asking.',
  },
  {
    letter: 'A',
    color: PARA_COLORS.areas,
    added: [
      { title: 'Lab report, PDF', detail: 'Riverside Clinic · 22 September' },
      { title: 'Photo of a letter', detail: 'Appointment on 14 October' },
      { title: 'Two older reports', detail: 'February and June' },
    ],
    ask: 'Keep a table of my lab results over time and tell me what changed',
    note: {
      path: '2-Areas / Health / Health.md',
      title: 'Health: what has changed',
      table: {
        head: ['', 'Feb', 'Jun', 'Sep', 'Range'],
        rows: [
          ['Ferritin', '41', '29', '18', '30 to 300'],
          ['Iron', '62', '55', '48', '40 to 160'],
          ['B12', '380', '395', '410', '200 to 900'],
        ],
        best: 0,
      },
      summary:
        'Not advice, a summary of your own papers: **one value is now out of range and has been falling all year.**',
      checklistTitle: 'To ask Dr Okafor on the 14th',
      checklist: [
        'Is the ferritin trend related to the running?',
        'Should the next test be sooner than six months?',
        'Diet: three iron-rich recipes are already in Cooking',
      ],
    },
    closing:
      '**Private by construction.** The files never leave your Drive; the tidy-up works on a temporary copy that is deleted when it ends.',
  },
  {
    letter: 'R',
    color: PARA_COLORS.resources,
    added: [
      { title: 'bakeblog.example', detail: 'Hydration, a long read · 11 min' },
      {
        title: 'Five earlier articles',
        detail: 'Saved between May and August',
      },
      { title: 'Sourdough starter', detail: 'Your own note, day 9' },
    ],
    ask: 'Digest everything I saved about sourdough',
    note: {
      path: '3-Resources / Reading / Sourdough / Sourdough, digest.md',
      title: 'Sourdough: six articles, one page',
      lead: 'What they agree on, what they do not, and what none of them says. Written by Bower from your own saves, with a link back to each.',
      table: {
        head: ['Question', 'They say', 'Sources'],
        rows: [
          ['Hydration', '70 to 80 %, beginners lower', '4 of 6'],
          ['Bulk time', 'All agree: watch the dough, not the clock', '6 of 6'],
          ['Dutch oven', 'Needed for the crust', '5 of 6'],
        ],
        best: 1,
      },
      summary:
        '**You have the Dutch oven** (Finance, August) and a starter ready since day nine. Nothing is stopping you.',
      checklistTitle: 'First bake, this weekend',
      checklist: [
        'Feed the starter Friday night',
        'Buy 1 kg bread flour (on the shopping list)',
        'Start at 75 % hydration, the middle of the two',
      ],
    },
    closing:
      '**It joins the dots.** The Dutch oven from a receipt in Finance, the starter from your own note: it says where each thing comes from.',
  },
  {
    letter: 'A',
    color: PARA_COLORS.archive,
    added: [
      { title: 'Boarding pass, return', detail: 'LIS → MAD · 17 November' },
      { title: 'Two photos', detail: 'From the trip' },
      { title: 'Lisbon.md', detail: 'The itinerary you used' },
    ],
    ask: 'The trip is over, tidy it up',
    note: {
      path: '1-Projects / Next trip.md',
      title: 'Next trip: what Lisbon taught you',
      lead: 'Started by Bower when it archived Lisbon, empty except for what carried over:',
      checklist: [
        'Book the one-thing-that-closes-on-Mondays first',
        'Hotels without a lift: pack the small bag',
        'Budget 60 € a day in cash worked; 50 did not',
        'Keep the receipts in the inbox as you go, not at the end',
      ],
      after:
        '**Nothing is deleted.** Archive is a folder like any other; search still finds every Lisbon note.',
    },
    closing:
      '**It asks before it archives.** "Lisbon looks finished, shall I file it away?" on Home; one tap.',
  },
];

/** Page 9: three ways to start, the tip, and the invited-only line. */
export const INTRO_STARTS: readonly string[] = [
  'The five files sitting in your downloads',
  'A photo of every receipt from this month, then "how much did I spend?"',
  'The listings, the offers, the reports you keep losing',
];

export const INTRO_TIP =
  'Every screen has a "?" that explains it, and Settings keeps these nine pages and an Ideas list for whenever you want them.';

export const INTRO_INVITED_LINE = 'Only people who were invited can sign in';

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
