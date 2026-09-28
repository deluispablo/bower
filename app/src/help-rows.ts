/**
 * The help sheets' copy (#330): one sheet per tab plus one for a folder
 * screen, verbatim from the boards (`docs/design/v3/boards/Help-Home`,
 * `Help-Notes`, `Help-Add`, `Help-Bower` and `Help-Q-Folder`). The top
 * bar's "?" opens the sheet for the screen on show; the tour after
 * onboarding is the four tab sheets in a row (`TOUR_TABS`). Plain data and
 * pure helpers, so the copy is unit-testable without rendering anything;
 * `components/help-sheet.tsx` draws it.
 *
 * The demo build (`isDemo()`) shows the same sheets with a few lines swapped
 * for ones about Alex's sample things (`DEMO_COPY`).
 */

/** The four tabs at the bottom of the phone (#317), in their order. */
export type HelpTab = 'home' | 'notes' | 'add' | 'bower';

/** A screen with a help sheet: a tab, or a folder (reached from Notes). */
export type HelpScreen = HelpTab | 'folder';

/** The stroke icon in front of a row (`components/icons.tsx`). */
export type HelpIcon =
  | 'inbox'
  | 'clock'
  | 'pin'
  | 'note'
  | 'folder'
  | 'search'
  | 'eye-off'
  | 'file'
  | 'edit'
  | 'sparkle'
  | 'chat'
  | 'shield';

export interface HelpRow {
  icon: HelpIcon;
  /** The bold opening words: the part of the screen the row is about. */
  lead: string;
  /** The rest of the sentence, after the lead and a space. */
  text: string;
}

export interface HelpSheetCopy {
  title: string;
  /** The one line under the title. */
  lede: string;
  /** The tab the sheet sits over, highlighted while it is open. */
  tab: HelpTab;
  rows: readonly HelpRow[];
}

/** The tour: these four sheets, one after the other. */
export const TOUR_TABS: readonly HelpTab[] = ['home', 'notes', 'add', 'bower'];

export const HELP_ROWS: Readonly<Record<HelpScreen, HelpSheetCopy>> = {
  home: {
    title: 'Home',
    lede: 'Where Bower tells you what is going on.',
    tab: 'home',
    rows: [
      {
        icon: 'inbox',
        lead: 'Inbox',
        text: 'is what you added and Bower has not filed yet. Its Tidy up button files it all, once, when you are ready.',
      },
      {
        icon: 'clock',
        lead: 'Last tidy-up',
        text: 'shows what happened last time; tap it for the full list.',
      },
      {
        icon: 'pin',
        lead: 'Pinned',
        text: 'is what you chose to keep at hand.',
      },
      {
        icon: 'note',
        lead: 'Recent',
        text: 'is what changed lately, by you or by Bower.',
      },
    ],
  },
  notes: {
    title: 'Notes',
    lede: 'Your folder, as it is in Drive.',
    tab: 'notes',
    rows: [
      {
        icon: 'folder',
        lead: 'Four folders',
        text: 'sort a life: Projects end, Areas go on, Resources are kept, the Archive is done. Bower files into them; you can move anything.',
      },
      {
        icon: 'note',
        lead: 'Files and notes',
        text: 'live together. A PDF stays a PDF; a note is what Bower writes when you ask.',
      },
      {
        icon: 'search',
        lead: 'Search',
        text: 'finds files, notes and your requests.',
      },
      {
        icon: 'eye-off',
        lead: 'Hidden',
        text: "are Bower's own files and dot-folders; show them from the bottom.",
      },
    ],
  },
  add: {
    title: 'Add',
    lede: 'Fill the inbox; tidy up once.',
    tab: 'add',
    rows: [
      {
        icon: 'file',
        lead: 'Photo, files, your Drive, a link',
        text: 'all land in the inbox. Nothing runs yet.',
      },
      {
        icon: 'file',
        lead: 'Share from any app',
        text: 'to Bower: it lands here too.',
      },
      {
        icon: 'edit',
        lead: 'What is this?',
        text: 'is optional: say what to do with these things, or nothing. "From now on…" becomes a rule.',
      },
      {
        icon: 'sparkle',
        lead: 'Tidy up',
        text: 'files the whole pile in one go. Add everything first: each run takes a few minutes and uses your Claude plan.',
      },
    ],
  },
  bower: {
    title: 'Bower',
    lede: 'Talk to it; see what it knows.',
    tab: 'bower',
    rows: [
      {
        icon: 'chat',
        lead: 'The box',
        text: 'takes a rule, a job or a question in your words. Bower works out which.',
      },
      {
        icon: 'shield',
        lead: 'Rules',
        text: 'are yours, grouped by topic. They start at once. Tap one to change it.',
      },
      {
        icon: 'clock',
        lead: 'Requests',
        text: 'are your jobs and questions, waiting or answered.',
      },
      {
        icon: 'inbox',
        lead: 'Activity',
        text: 'is what each tidy-up did: what went where, what was set aside.',
      },
    ],
  },
  folder: {
    title: 'A folder',
    lede: 'What is inside, and why it is here.',
    tab: 'notes',
    rows: [
      {
        icon: 'folder',
        lead: 'The line at the top',
        text: 'says what this folder is for.',
      },
      {
        icon: 'note',
        lead: 'Rows',
        text: 'are files and notes, newest first, with who put them there.',
      },
      {
        icon: 'chat',
        lead: 'Ask Bower about it',
        text: 'starts a request with this folder in mind: "compare", "summarise", "what is missing".',
      },
    ],
  },
};

/**
 * The demo's lines (C.3, "Alex's things, a sample"): the sheets name the
 * sample, and Tidy up says it plays a recording instead of using a plan.
 * Rows are swapped by their lead; everything else is the app's copy.
 */
const DEMO_COPY: Readonly<
  Partial<Record<HelpScreen, { lede?: string; rows?: readonly HelpRow[] }>>
> = {
  home: { lede: "These are Alex's things, a sample." },
  notes: { lede: "Alex's folder, a sample of what yours looks like in Drive." },
  add: {
    rows: [
      {
        icon: 'sparkle',
        lead: 'Tidy up',
        text: 'files the whole pile in one go. Here it plays a recording; nothing is saved.',
      },
    ],
  },
};

/** The sheet for `screen`, with the demo's lines when `demo` is true. */
export function helpSheet(screen: HelpScreen, demo: boolean): HelpSheetCopy {
  const sheet = HELP_ROWS[screen];
  const swap = demo ? DEMO_COPY[screen] : undefined;
  if (swap === undefined) return sheet;
  const rows = sheet.rows.map(
    (row) => swap.rows?.find((other) => other.lead === row.lead) ?? row,
  );
  return { ...sheet, lede: swap.lede ?? sheet.lede, rows };
}

/** The kicker over a tour sheet: "Tour · 2 of 4". */
export function tourLabel(index: number): string {
  return `Tour · ${index + 1} of ${TOUR_TABS.length}`;
}

/** The tour's main button: "Next: Notes" on every sheet but the last. */
export function tourNextLabel(index: number): string {
  const next = TOUR_TABS[index + 1];
  return next === undefined ? "Let's go" : `Next: ${HELP_ROWS[next].title}`;
}
