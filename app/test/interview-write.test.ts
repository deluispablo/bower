/**
 * The first-run interview's write (#198), through the same exported Drive
 * functions the app calls, over the demo's in-memory Drive (`src/demo/`):
 * hermetic, no network. Alex's demo folder starts from `vault-template/`,
 * same as `rules-update.test.ts`'s own setup for the rulebook update.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getText,
  httpDriveClient,
  listVault,
  setDriveClient,
} from '../src/drive.js';
import type { DriveClient, DriveFile } from '../src/drive.js';
import { createDemo } from '../src/demo/index.js';
import { ROOT_ID } from '../src/demo/vault.js';
import type { InterviewAnswers } from '../src/interview.js';
import { runInterview } from '../src/vault-store.js';
import type { InterviewInput } from '../src/vault-store.js';

// Alex's demo folder (`demo/fixture.ts`) already has real `2-Areas/Home` and
// `2-Areas/Health` folders (a hub note each, no leading underscore): these
// area names are chosen to have nothing in the fixture, so a run always
// creates all three, and a separate test below answers with one of Alex's
// own areas (`Home`) to check the "already exists" skip against something
// real rather than something this same test just created.
const ANSWERS: InterviewAnswers = {
  keep: 'Everything I capture',
  languages: 'English and Spanish',
  areas: ['Career', 'Learning', 'Family'],
  titleStyle: 'Short and plain',
  example: '2026-09-27 Dentist',
};

let drive: DriveClient;

beforeEach(() => {
  drive = createDemo().drive;
  setDriveClient(drive);
});

afterEach(() => {
  setDriveClient(httpDriveClient);
});

async function fileAt(path: string): Promise<DriveFile | undefined> {
  return (await listVault(ROOT_ID)).find((f) => f.path === path);
}

async function mustFileAt(path: string): Promise<DriveFile> {
  const file = await fileAt(path);
  if (file === undefined) throw new Error(`${path} missing`);
  return file;
}

async function baseInput(
  answers: InterviewAnswers,
  existingAreaNames: ReadonlySet<string> = new Set(),
): Promise<InterviewInput> {
  const areasFolder = await mustFileAt('2-Areas');
  return {
    folderId: ROOT_ID,
    aboutFile: await fileAt('About-Me.md'),
    rulesFile: await fileAt('Rules.md'),
    areasFolderId: areasFolder.id,
    existingAreaNames,
    answers,
    on: '2026-09-28',
  };
}

describe('runInterview', () => {
  it('writes About-Me.md and Rules.md and creates one folder note per area', async () => {
    const writes = await runInterview(await baseInput(ANSWERS));

    expect(writes.result).toEqual({
      areasCreated: ['Career', 'Learning', 'Family'],
      areasSkipped: [],
    });
    expect(writes.createdAbout).toBe(false);
    expect(writes.createdRules).toBe(false);

    const aboutMe = await getText((await mustFileAt('About-Me.md')).id);
    expect(aboutMe).toContain('- What to keep here: Everything I capture');
    expect(aboutMe).toContain('## Who I am');

    const rules = await getText((await mustFileAt('Rules.md')).id);
    expect(rules).toContain(
      '- Titles and tags: Short and plain, e.g. `2026-09-27 Dentist`',
    );

    for (const name of ['Career', 'Learning', 'Family']) {
      const note = await mustFileAt(`2-Areas/${name}/_${name}.md`);
      expect(await getText(note.id)).toContain(`# ${name}`);
    }
  });

  it("skips an area whose folder already exists (one of Alex's own), still creates the others", async () => {
    const homeBefore = await getText(
      (await mustFileAt('2-Areas/Home/Home.md')).id,
    );

    const writes = await runInterview(
      await baseInput(
        { ...ANSWERS, areas: ['Career', 'Home'] },
        new Set(['Home']),
      ),
    );

    expect(writes.result).toEqual({
      areasCreated: ['Career'],
      areasSkipped: ['Home'],
    });
    expect(await fileAt('2-Areas/Career/_Career.md')).toBeDefined();
    // Alex's real Home area is untouched: no `_Home.md` folder note was
    // added next to it, and its own hub note is exactly as it was.
    expect(await fileAt('2-Areas/Home/_Home.md')).toBeUndefined();
    expect(await getText((await mustFileAt('2-Areas/Home/Home.md')).id)).toBe(
      homeBefore,
    );
  });

  it('writes nothing at all when every answer is blank', async () => {
    const blank: InterviewAnswers = {
      keep: '',
      languages: '',
      areas: [],
      titleStyle: '',
      example: '',
    };
    const aboutBefore = await getText((await mustFileAt('About-Me.md')).id);
    const rulesBefore = await getText((await mustFileAt('Rules.md')).id);

    const writes = await runInterview(await baseInput(blank));

    expect(writes.result).toEqual({ areasCreated: [], areasSkipped: [] });
    expect(writes.aboutMe).toBeNull();
    expect(writes.rules).toBeNull();
    expect(await getText((await mustFileAt('About-Me.md')).id)).toBe(
      aboutBefore,
    );
    expect(await getText((await mustFileAt('Rules.md')).id)).toBe(rulesBefore);
  });

  it('running it again with new answers replaces the section and skips the areas already made', async () => {
    await runInterview(await baseInput(ANSWERS));

    const replay = await runInterview(
      await baseInput(
        { ...ANSWERS, keep: 'Work notes', areas: ['Career', 'Finance'] },
        new Set(['Career', 'Learning', 'Family']),
      ),
    );

    expect(replay.result).toEqual({
      areasCreated: ['Finance'],
      areasSkipped: ['Career'],
    });
    const aboutMe = await getText((await mustFileAt('About-Me.md')).id);
    expect(aboutMe.match(/## From the interview/g)).toHaveLength(1);
    expect(aboutMe).toContain('- What to keep here: Work notes');
    expect(aboutMe).not.toContain('Everything I capture');
    expect(await fileAt('2-Areas/Finance/_Finance.md')).toBeDefined();
  });

  it('creates About-Me.md and Rules.md from nothing when the folder has neither', async () => {
    const aboutFile = await mustFileAt('About-Me.md');
    const rulesFile = await mustFileAt('Rules.md');
    await drive.deleteFile(aboutFile.id);
    await drive.deleteFile(rulesFile.id);

    const writes = await runInterview({
      ...(await baseInput(ANSWERS)),
      aboutFile: undefined,
      rulesFile: undefined,
    });

    expect(writes.createdAbout).toBe(true);
    expect(writes.createdRules).toBe(true);
    const about = await mustFileAt('About-Me.md');
    expect(await getText(about.id)).toContain(
      '- What to keep here: Everything I capture',
    );
  });
});
