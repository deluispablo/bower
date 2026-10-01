import { describe, expect, it } from 'vitest';

import {
  HELP_ROWS,
  fileHelpTopic,
  folderHelpTopic,
  forWidth,
  helpSheet,
  noteHelpTopic,
} from '../src/help-rows.js';
import type { HelpScreen, HelpSheetCopy } from '../src/help-rows.js';
import { helpScreenFor } from '../src/shell-routes.js';

const SCREENS = Object.keys(HELP_ROWS) as HelpScreen[];

function words(sheet: HelpSheetCopy): string[] {
  return [
    sheet.title,
    sheet.lede,
    ...sheet.rows.map((row) => `${row.lead} ${row.text}`),
  ];
}

describe('HELP_ROWS', () => {
  it('has a Help for every screen kind, each titled by its subject', () => {
    expect(
      Object.fromEntries(SCREENS.map((s) => [s, HELP_ROWS[s].title])),
    ).toEqual({
      home: 'Home',
      notes: 'Folders',
      add: 'Add',
      bower: 'Bower',
      justFiled: 'Just filed',
      settings: 'Settings',
      projectFolder: 'A project folder',
      folderOfFolders: 'A folder of folders',
      folder: 'A folder',
      bowerNote: 'A note by Bower',
      note: 'A note',
      file: 'A file',
    });
    for (const screen of SCREENS) {
      expect(HELP_ROWS[screen].rows.length).toBeGreaterThan(0);
    }
  });

  it('never says "PARA", "vault", "Four folders" or "the Archive"', () => {
    for (const screen of SCREENS) {
      for (const desktop of [false, true]) {
        const text = words(helpSheet(screen, { desktop })).join(' ');
        expect(text).not.toMatch(/PARA|vault|Four folders|the Archive\b/);
        expect(text).not.toContain('{');
      }
    }
  });

  it('has the rows of every board, in order', () => {
    const leads = (screen: HelpScreen): string[] =>
      HELP_ROWS[screen].rows.map((r) => r.lead);
    expect(leads('home')).toEqual([
      "The bird's bubble",
      'Inbox',
      'Last tidy-up',
      'Pinned and Recent',
    ]);
    expect(leads('notes')).toEqual([
      'Your Inbox and four folders',
      'The bird',
      'Search',
      "Bower's own files",
    ]);
    expect(leads('add')).toEqual([
      'Photo, files, your Drive, a link',
      'Share from any app',
      'What is this pile?',
      'Tidy up',
    ]);
    expect(leads('bower')).toEqual([
      'The box',
      'Rules',
      'Requests',
      'Activity',
    ]);
    expect(leads('justFiled')).toEqual([
      'Filed, New notes, Updated, Needs you',
      'Each thing',
      'Earlier tidy-ups',
      'Mark all seen',
    ]);
    expect(leads('settings')).toEqual([
      'Tidying up',
      'Look',
      'Learn Bower',
      'Advanced',
    ]);
    expect(leads('bowerNote')).toEqual([
      "Bower's note",
      'Check',
      'Source and Used',
    ]);
    expect(leads('file')).toEqual([
      'Want a note on it?',
      'Open in Drive',
      'The arrows',
    ]);
  });

  it('says Archives are done in the Folders Help (S-NT-6)', () => {
    expect(words(helpSheet('notes'))[2]).toBe(
      'Your Inbox and four folders sort a life: Projects end, Areas go on, Resources are kept, Archives are done. Bower files into them; you can move anything.',
    );
    expect(words(helpSheet('notes'))[3]).toBe(
      'The bird marks what Bower wrote; everything else is yours, as you added it.',
    );
  });
});

describe('tap and click (K-27, R-HELP-5)', () => {
  it('fills one source string for the width', () => {
    expect(forWidth('{Tap} one to open it; {tap} twice.', false)).toBe(
      'Tap one to open it; tap twice.',
    );
    expect(forWidth('{Tap} one to open it; {tap} twice.', true)).toBe(
      'Click one to open it; click twice.',
    );
  });

  it('says "click" on desktop wherever the phone says "tap"', () => {
    for (const screen of SCREENS) {
      const phone = words(helpSheet(screen, { desktop: false }));
      const desktop = words(helpSheet(screen, { desktop: true }));
      expect(desktop.join(' ')).not.toMatch(/\btap\b/i);
      phone.forEach((line, i) => {
        expect(desktop[i]).toBe(
          line.replace(/\bTap\b/g, 'Click').replace(/\btap\b/g, 'click'),
        );
      });
    }
    expect(helpSheet('bower', { desktop: true }).rows[1]?.text).toBe(
      'are yours, grouped by topic. They start at once. Click one to change it.',
    );
    expect(helpSheet('justFiled').rows[1]?.text).toBe(
      'shows where it went. Tap it to open it.',
    );
  });
});

describe('the Help of a folder, a note and a file', () => {
  it('gives List and Grid one text (R-HELP-3): the folder decides, not the layout', () => {
    const topic = folderHelpTopic(
      'Applications',
      false,
      'Compare 4 job offers',
    );
    for (const demo of [false, true]) {
      const phone = helpSheet(topic.screen, { demo, context: topic.context });
      const desktop = helpSheet(topic.screen, {
        demo,
        desktop: true,
        context: topic.context,
      });
      expect(desktop).toEqual(phone);
    }
  });

  it('draws the project folder boards in the demo (PF-Help, LI-Help, GR-Help)', () => {
    const flats = folderHelpTopic('Moonee Ponds', false, 'Compare 6 flats');
    const sheet = helpSheet(flats.screen, {
      demo: true,
      context: flats.context,
    });
    expect(words(sheet)).toEqual([
      'A project folder',
      'Flats Bower found for you in Moonee Ponds, scored against what you asked for.',
      'By Bower marks what Bower wrote. Everything else is yours.',
      'Ask Bower sends a question about this folder: “compare”, “what is missing”.',
      'Compare 6 flats puts them side by side. Change a status there and Bower keeps it.',
    ]);
    const jobs = folderHelpTopic('Applications', false, 'Compare 4 job offers');
    expect(
      helpSheet(jobs.screen, { demo: true, context: jobs.context }).lede,
    ).toBe(
      'Job offers Bower found for you, each scored against your CV, plus the letters and answers it wrote for them.',
    );
    // Outside the demo a folder of the same name keeps the plain words.
    expect(helpSheet(jobs.screen, { context: jobs.context }).lede).toBe(
      'Job offers Bower found for you, each scored against what you asked for.',
    );
  });

  it('draws the folder of folders board (AR-Help)', () => {
    const areas = folderHelpTopic('Areas', true, undefined);
    expect(areas.screen).toBe('folderOfFolders');
    expect(words(helpSheet(areas.screen, { context: areas.context }))).toEqual([
      'A folder of folders',
      'Areas holds the parts of life that go on (home, health, money), one folder per area.',
      'Folders show what is inside and when it changed. Tap one to open it.',
      'Recently changed lists the newest things in every folder below this one.',
      'Ask Bower sends a question about everything in Areas.',
    ]);
    expect(
      helpSheet(areas.screen, { desktop: true, context: areas.context }).rows[0]
        ?.text,
    ).toBe('show what is inside and when it changed. Click one to open it.');
  });

  it('opens a plain folder on "A folder"', () => {
    expect(folderHelpTopic('Lisbon trip', false, undefined).screen).toBe(
      'folder',
    );
  });

  it('gives a note by Bower and a note of yours their own Help (NO-Help)', () => {
    const cv = noteHelpTopic(
      '1-Projects/Job Search Australia/CV insights.md',
      true,
    );
    expect(cv.screen).toBe('bowerNote');
    expect(helpSheet(cv.screen, { demo: true, context: cv.context }).lede).toBe(
      'Bower wrote it from your CV and your notes, for Job Search Australia.',
    );
    const mine = noteHelpTopic('3-Resources/Recipes/Pancakes.md', false);
    expect(mine.screen).toBe('note');
    expect(helpSheet(mine.screen, { context: mine.context }).lede).toBe(
      'A note of yours in Recipes.',
    );
  });

  it('gives a file its own Help (FI-Help)', () => {
    const pdf = fileHelpTopic(
      '1-Projects/Job Search Australia/Passport copy.pdf',
      'PDF',
      'bower',
    );
    expect(words(helpSheet(pdf.screen, { context: pdf.context }))).toEqual([
      'A file',
      'A PDF Bower filed as it is, in Job Search Australia.',
      'Want a note on it? Ask Bower: it writes a note next to the file and keeps the file as it is.',
      'Open in Drive or Download it from ⋯.',
      'The arrows at the end go to the next thing in the folder.',
    ]);
    const photo = fileHelpTopic('0-Inbox/Receipt.jpg', 'Photo', 'you');
    expect(helpSheet(photo.screen, { context: photo.context }).lede).toBe(
      'A photo of yours, kept as it is, in Inbox.',
    );
  });

  it('maps every route to its own Help kind (R-HELP-2)', () => {
    expect(helpScreenFor('/')).toBe('home');
    expect(helpScreenFor('/notes')).toBe('notes');
    expect(helpScreenFor('/add')).toBe('add');
    expect(helpScreenFor('/bower')).toBe('bower');
    expect(helpScreenFor('/just-filed')).toBe('justFiled');
    expect(helpScreenFor('/settings')).toBe('settings');
    expect(helpScreenFor('/note/abc')).toBe('note');
    expect(helpScreenFor('/file/abc')).toBe('file');
    expect(helpScreenFor('/folder/2-Areas')).toBe('folder');
  });
});

describe('Help row icons follow the boards (#950 F-24)', () => {
  const icons = (screen: HelpScreen): string[] =>
    HELP_ROWS[screen].rows.map((row) => row.icon);

  it('draws the bird on the rows about what Bower wrote', () => {
    expect(icons('home')[0]).toBe('bird');
    expect(icons('folder')[0]).toBe('bird');
  });

  it('uses the icons the NO-, FI-, NT-, AR- and JF-Help boards draw', () => {
    expect(icons('bowerNote')).toEqual(['bird', 'check', 'document']);
    expect(icons('file')).toEqual(['bird', 'external', 'chevron']);
    expect(icons('notes')).toEqual(['folder', 'bird', 'search', 'eye']);
    expect(icons('folderOfFolders')).toEqual(['folder', 'document', 'chat']);
    expect(icons('justFiled')).toEqual(['check', 'document', 'clock', 'check']);
  });
});
