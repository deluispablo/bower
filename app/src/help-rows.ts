/**
 * Every Help text (#919, spec §3.7, boards *-Help-Fixed-375/1280): one Help
 * per screen and per kind of folder, note and file, word for word from the
 * boards (the spec's copy tables where a board has none). The ⋯ menu's
 * "Help and about this" opens the Help of the screen on show; the tour is
 * the four tab Helps in a row (`TOUR_TABS`, K-28: the same words).
 *
 * One source string per row: the phone says "tap" and desktop "click"
 * (K-27, R-HELP-5). A row writes `{tap}` or `{Tap}`, and `helpSheet` fills
 * it in for the width it is asked for.
 *
 * Some Helps name the thing on show ("Ask Bower sends a question about
 * everything in Areas"). The screen says what it is with `useHelpTopic`;
 * the Help reads it back with `currentHelpTopic`. In the demo build a few
 * ledes name the demo's own folders, as the boards do (`DEMO_LEDES`).
 */

import { useEffect } from 'preact/hooks';

/** The four tabs at the bottom of the phone (#317), in their order. */
export type HelpTab = 'home' | 'notes' | 'add' | 'bower';

/**
 * A screen with its own Help: a tab (`notes` is the Folders tab), Just
 * filed, Settings, the three kinds of folder, the two kinds of note and a
 * file (R-HELP-2).
 */
export type HelpScreen =
  | HelpTab
  | 'justFiled'
  | 'settings'
  | 'projectFolder'
  | 'folderOfFolders'
  | 'folder'
  | 'bowerNote'
  | 'note'
  | 'file';

/** The stroke icon in front of a row (`components/icons.tsx`). */
export type HelpIcon =
  | 'bird'
  | 'inbox'
  | 'clock'
  | 'pin'
  | 'folder'
  | 'search'
  | 'eye'
  | 'external'
  | 'chevron'
  | 'file'
  | 'edit'
  | 'sparkle'
  | 'chat'
  | 'shield'
  | 'document'
  | 'check'
  | 'bolt'
  | 'sun'
  | 'play'
  | 'compare';

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
  /** The tab the screen belongs to. */
  tab: HelpTab;
  rows: readonly HelpRow[];
}

/** What a screen tells its Help about the thing on show. */
export interface HelpContext {
  /** The folder's or the note's name, as shown: "Areas", "CV insights". */
  name?: string;
  /** The folder a note or a file is in, as shown. */
  folder?: string;
  /** A project folder's Compare tab: "Compare 6 flats". */
  compare?: string;
  /** A file's kind word: "PDF", "Word", "Photo". */
  kind?: string;
  /** Who filed a file: Bower, the person, or nobody says. */
  by?: 'bower' | 'you' | null;
}

/** The Help a screen asks for: its kind, and what it shows. */
export interface HelpTopic {
  screen: HelpScreen;
  context?: HelpContext;
}

export interface HelpOptions {
  /** From 900 px: "click" where the phone says "tap". */
  desktop?: boolean;
  /** The demo build: ledes that name the demo's folders. */
  demo?: boolean;
  context?: HelpContext;
}

/** The tour: these four Helps, one after the other. */
export const TOUR_TABS: readonly HelpTab[] = ['home', 'notes', 'add', 'bower'];

/** "By Bower" on the folder Helps (PF, LI, GR-Help). */
const BY_BOWER_ROW: HelpRow = {
  icon: 'bird',
  lead: 'By Bower',
  text: 'marks what Bower wrote. Everything else is yours.',
};

const ASK_FOLDER_ROW: HelpRow = {
  icon: 'chat',
  lead: 'Ask Bower',
  text: 'sends a question about this folder: “compare”, “what is missing”.',
};

/**
 * The fixed part of every Help. Ledes and rows that name the thing on show
 * are filled in by `helpSheet`; here they hold the words used when the
 * screen says nothing.
 */
export const HELP_ROWS: Readonly<Record<HelpScreen, HelpSheetCopy>> = {
  home: {
    title: 'Home',
    lede: 'Where Bower tells you what is going on.',
    tab: 'home',
    rows: [
      {
        icon: 'bird',
        lead: "The bird's bubble",
        text: 'says what is happening: a tidy-up in progress, or its result until you open it.',
      },
      {
        icon: 'inbox',
        lead: 'Inbox',
        text: 'is what waits for the next tidy-up.',
      },
      {
        icon: 'clock',
        lead: 'Last tidy-up',
        text: 'is what it did: filed, new notes, updated, needs you.',
      },
      {
        icon: 'pin',
        lead: 'Pinned and Recent',
        text: 'take you back to what you use.',
      },
    ],
  },
  notes: {
    title: 'Folders',
    lede: 'Your Bower folder, as it is in Drive.',
    tab: 'notes',
    rows: [
      {
        icon: 'folder',
        lead: 'Four folders',
        text: 'sort a life: Projects end, Areas go on, Resources are kept, the Archive is done. Bower files into them; you can move anything.',
      },
      {
        icon: 'bird',
        lead: 'The bird',
        text: 'marks what Bower wrote; everything else is yours, as you added it.',
      },
      {
        icon: 'search',
        lead: 'Search',
        text: 'finds folders, notes and files.',
      },
      {
        icon: 'eye',
        lead: "Bower's own files",
        text: 'are hidden; show them from ⋯.',
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
        icon: 'document',
        lead: 'What is this pile?',
        text: 'is optional: say what to do with these things, or nothing. "From now on…" becomes a rule.',
      },
      {
        icon: 'sparkle',
        lead: 'Tidy up',
        text: 'files the whole pile in one go. Add everything first: a tidy-up takes a few minutes and uses the Claude plan this Bower runs on.',
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
        text: 'are yours, grouped by topic. They start at once. {Tap} one to change it.',
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
  justFiled: {
    title: 'Just filed',
    lede: 'What each tidy-up did, newest first.',
    tab: 'home',
    rows: [
      {
        icon: 'check',
        lead: 'Filed, New notes, Updated, Needs you',
        text: 'count what the last tidy-up did.',
      },
      {
        icon: 'document',
        lead: 'Each thing',
        text: 'shows where it went. {Tap} it to open it.',
      },
      {
        icon: 'clock',
        lead: 'Earlier tidy-ups',
        text: 'open to show what each one did. One that did not finish lost nothing.',
      },
      {
        icon: 'check',
        lead: 'Mark all seen',
        text: 'clears the Just filed badge.',
      },
    ],
  },
  settings: {
    title: 'Settings',
    lede: 'How Bower works for you, on this device and in your Drive.',
    tab: 'home',
    rows: [
      {
        icon: 'bolt',
        lead: 'Tidying up',
        text: 'says when Bower pings you and whether it may look things up on the web.',
      },
      {
        icon: 'sun',
        lead: 'Look',
        text: 'picks light or dark, or follows your device.',
      },
      {
        icon: 'play',
        lead: 'Learn Bower',
        text: 'replays the intro and the tour.',
      },
      {
        icon: 'shield',
        lead: 'Advanced',
        text: "is for your own Claude key and Bower's own files.",
      },
    ],
  },
  projectFolder: {
    title: 'A project folder',
    lede: 'Things Bower found for you, each scored against what you asked for.',
    tab: 'notes',
    rows: [
      BY_BOWER_ROW,
      ASK_FOLDER_ROW,
      {
        icon: 'compare',
        lead: 'Compare',
        text: 'puts them side by side. Change a status there and Bower keeps it.',
      },
    ],
  },
  folderOfFolders: {
    title: 'A folder of folders',
    lede: 'A folder that holds folders, one per subject.',
    tab: 'notes',
    rows: [
      {
        icon: 'folder',
        lead: 'Folders',
        text: 'show what is inside and when it changed. {Tap} one to open it.',
      },
      {
        icon: 'document',
        lead: 'Recently changed',
        text: 'lists the newest things in every folder below this one.',
      },
      {
        icon: 'chat',
        lead: 'Ask Bower',
        text: 'sends a question about everything in this folder.',
      },
    ],
  },
  folder: {
    title: 'A folder',
    lede: 'What is inside, and who put it there.',
    tab: 'notes',
    rows: [BY_BOWER_ROW, ASK_FOLDER_ROW],
  },
  bowerNote: {
    title: 'A note by Bower',
    lede: 'Bower wrote it from your files and your notes.',
    tab: 'notes',
    rows: [
      {
        icon: 'bird',
        lead: "Bower's note",
        text: 'is the short version. Fold it away if you only want the text; it stays folded.',
      },
      {
        icon: 'check',
        lead: 'Check',
        text: 'marks a point worth checking before you use it.',
      },
      {
        icon: 'document',
        lead: 'Source and Used',
        text: 'link to the files Bower read.',
      },
    ],
  },
  note: {
    title: 'A note',
    lede: 'A note of yours.',
    tab: 'notes',
    rows: [
      {
        icon: 'edit',
        lead: 'Add a paragraph… and Edit the text',
        text: 'in ⋯ change it; Bower reads it at the next tidy-up.',
      },
      {
        icon: 'chat',
        lead: 'Ask Bower',
        text: 'in ⋯ sends a question about it; the answer lands next to it.',
      },
    ],
  },
  file: {
    title: 'A file',
    lede: 'A file Bower filed as it is.',
    tab: 'notes',
    rows: [
      {
        icon: 'bird',
        lead: 'Want a note on it?',
        text: 'Ask Bower: it writes a note next to the file and keeps the file as it is.',
      },
      {
        icon: 'external',
        lead: 'Open in Drive',
        text: 'or Download it from ⋯.',
      },
      {
        icon: 'chevron',
        lead: 'The arrows',
        text: 'at the end go to the next thing in the folder.',
      },
    ],
  },
};

/**
 * The ledes that name a demo folder or note, as the boards draw them
 * (PF-Help, LI-Help, GR-Help, NO-Help). Keyed by screen, then by the
 * name on show. Only the demo build reads them: a real folder that happens
 * to share a name keeps the plain words.
 */
const DEMO_LEDES: Readonly<
  Partial<Record<HelpScreen, Readonly<Record<string, string>>>>
> = {
  projectFolder: {
    'Moonee Ponds':
      'Flats Bower found for you in Moonee Ponds, scored against what you asked for.',
    Applications:
      'Job offers Bower found for you, each scored against your CV, plus the letters and answers it wrote for them.',
  },
  bowerNote: {
    'CV insights':
      'Bower wrote it from your CV and your notes, for Job Search Australia.',
  },
};

/** What a folder of folders holds, by its name (AR-Help). */
const HOLDS: Readonly<Record<string, string>> = {
  Inbox: 'Inbox holds what waits for the next tidy-up.',
  Projects: 'Projects holds things with an end date, one folder per project.',
  Areas:
    'Areas holds the parts of life that go on (home, health, money), one folder per area.',
  Resources:
    'Resources holds things to keep (articles, recipes, manuals), one folder per topic.',
  Archives: 'Archives holds what is finished, kept and never deleted.',
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "a PDF", "an Excel file": the article for a kind word. */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/** The kind word in a sentence: "PDF", "Word document", "photo". */
function kindInSentence(kind: string | undefined): string {
  if (kind === undefined || kind === '' || kind === 'File') return 'file';
  if (kind === 'PDF') return 'PDF';
  if (kind === 'Word') return 'Word document';
  return kind.toLowerCase();
}

/** "Compare 6 flats" → "flats". */
function compareNoun(label: string | undefined): string | undefined {
  const match = label?.match(/^Compare\s+\d+\s+(.+)$/);
  return match?.[1];
}

/** The lede and rows of `screen` for what the screen said it shows. */
function withContext(
  screen: HelpScreen,
  sheet: HelpSheetCopy,
  context: HelpContext,
  demo: boolean,
): HelpSheetCopy {
  const name = context.name;
  const demoLede =
    demo && name !== undefined ? DEMO_LEDES[screen]?.[name] : undefined;
  switch (screen) {
    case 'projectFolder': {
      const noun = compareNoun(context.compare);
      const lede =
        demoLede ??
        (noun === undefined
          ? sheet.lede
          : `${capitalise(noun)} Bower found for you, each scored against what you asked for.`);
      const rows = sheet.rows.map((row) =>
        row.lead === 'Compare' && context.compare !== undefined
          ? { ...row, lead: context.compare }
          : row,
      );
      return { ...sheet, lede, rows };
    }
    case 'folderOfFolders': {
      if (name === undefined) return sheet;
      const lede =
        HOLDS[name] ?? `${name} holds folders of its own, one per subject.`;
      const rows = sheet.rows.map((row) =>
        row.lead === 'Ask Bower'
          ? { ...row, text: `sends a question about everything in ${name}.` }
          : row,
      );
      return { ...sheet, lede, rows };
    }
    case 'bowerNote': {
      const lede =
        demoLede ??
        (context.folder === undefined
          ? sheet.lede
          : `Bower wrote it from your files and your notes, for ${context.folder}.`);
      return { ...sheet, lede };
    }
    case 'note':
      return context.folder === undefined
        ? sheet
        : { ...sheet, lede: `A note of yours in ${context.folder}.` };
    case 'file': {
      const kind = kindInSentence(context.kind);
      const where =
        context.folder === undefined ? '' : `, in ${context.folder}`;
      const lede =
        context.by === 'you'
          ? `${capitalise(withArticle(kind))} of yours, kept as it is${where}.`
          : `${capitalise(withArticle(kind))} Bower filed as it is${where}.`;
      return { ...sheet, lede };
    }
    default:
      return sheet;
  }
}

/** Fills `{tap}` / `{Tap}` for the width: "tap" on the phone, "click" on desktop. */
export function forWidth(text: string, desktop: boolean): string {
  return text
    .replace(/\{tap\}/g, desktop ? 'click' : 'tap')
    .replace(/\{Tap\}/g, desktop ? 'Click' : 'Tap');
}

/**
 * The Help of `screen`: its title, lede and rows for the width asked for,
 * with the lede and rows that name what the screen shows (`context`).
 */
export function helpSheet(
  screen: HelpScreen,
  options: HelpOptions = {},
): HelpSheetCopy {
  const desktop = options.desktop === true;
  const base = HELP_ROWS[screen];
  const sheet =
    options.context === undefined
      ? base
      : withContext(screen, base, options.context, options.demo === true);
  return {
    ...sheet,
    lede: forWidth(sheet.lede, desktop),
    rows: sheet.rows.map((row) => ({
      ...row,
      lead: forWidth(row.lead, desktop),
      text: forWidth(row.text, desktop),
    })),
  };
}

/**
 * What a tour step shows: the tab's own Help, same words and order (K-28,
 * R-TR-2). Step 2's title is "Folders" because the Help's is.
 */
export function tourSheet(
  tab: HelpTab,
  options: Omit<HelpOptions, 'context'> = {},
): HelpSheetCopy {
  return helpSheet(tab, options);
}

/** The kicker over a tour step: "Tour · 2 of 4". */
export function tourLabel(index: number): string {
  return `Tour · ${index + 1} of ${TOUR_TABS.length}`;
}

/** The tour's main button: "Next: Folders" on every step but the last. */
export function tourNextLabel(index: number): string {
  const next = TOUR_TABS[index + 1];
  return next === undefined ? "Let's go" : `Next: ${HELP_ROWS[next].title}`;
}

/**
 * A path's last name as shown: no "1-" prefix, no extension ("1-Projects"
 * → "Projects"). `navigation.ts`'s `displayName` in short; this module
 * stays free of the Drive imports so any screen can load it.
 */
function shownName(path: string): string {
  const last = path.slice(path.lastIndexOf('/') + 1);
  const shown = last
    .replace(/^\d{1,2}-/, '')
    .replace(/\.[^./]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return shown === '' ? last : shown;
}

/** The folder a path sits in, as shown: "Job Search Australia". */
function shownFolder(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const slash = path.lastIndexOf('/');
  return slash === -1 ? undefined : shownName(path.slice(0, slash));
}

/** A folder screen's Help (R-HELP-3: one text for List and Grid). */
export function folderHelpTopic(
  name: string,
  folderOfFolders: boolean,
  compare: string | undefined,
): HelpTopic {
  if (folderOfFolders) return { screen: 'folderOfFolders', context: { name } };
  if (compare !== undefined) {
    return { screen: 'projectFolder', context: { name, compare } };
  }
  return { screen: 'folder', context: { name } };
}

/** A note's Help: Bower's or yours, in its folder (R-NO-4). */
export function noteHelpTopic(
  path: string | undefined,
  byBower: boolean,
): HelpTopic {
  const folder = shownFolder(path);
  const name = path === undefined ? undefined : shownName(path);
  return {
    screen: byBower ? 'bowerNote' : 'note',
    context: {
      ...(folder !== undefined && { folder }),
      ...(name !== undefined && { name }),
    },
  };
}

/** A file's Help: its kind word, its folder and who filed it (R-FI-3). */
export function fileHelpTopic(
  path: string | undefined,
  kind: string | undefined,
  by: 'bower' | 'you' | null,
): HelpTopic {
  const folder = shownFolder(path);
  return {
    screen: 'file',
    context: {
      ...(folder !== undefined && { folder }),
      ...(kind !== undefined && { kind }),
      by,
    },
  };
}

/** The screens that share one route: a folder's three kinds, a note's two. */
function familyOf(screen: HelpScreen): string {
  if (screen === 'projectFolder' || screen === 'folderOfFolders') {
    return 'folder';
  }
  if (screen === 'bowerNote') return 'note';
  return screen;
}

let registered: HelpTopic | null = null;

/**
 * The Help to open over `screen` (the route's, `helpScreenFor`): the topic
 * the screen on show registered when it is of the same family, else
 * `screen` itself.
 */
export function currentHelpTopic(screen: HelpScreen): HelpTopic {
  if (registered !== null && familyOf(registered.screen) === familyOf(screen)) {
    return registered;
  }
  return { screen };
}

/**
 * A screen says which Help is its own and what it shows (R-HELP-2). Held
 * while the screen is mounted; the last one mounted wins.
 */
export function useHelpTopic(topic: HelpTopic): void {
  const key = JSON.stringify(topic);
  useEffect(() => {
    registered = topic;
    return () => {
      if (registered === topic) registered = null;
    };
  }, [key]);
}
