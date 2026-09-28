// @vitest-environment jsdom

/**
 * Demo mode end to end (#192): `VITE_DEMO=1` switches `api.ts` to the demo
 * module, and the six main flows run through the same exported functions
 * the app calls, with `fetch` stubbed to fail the test on any call. Time is
 * faked so the scripted Tidy up run can be stepped through.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '../src/api.js';
import type * as DriveModule from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { contextNote, contextNoteName } from '../src/add.js';
import { summarise } from '../src/health-report.js';
import { runCounts } from '../src/home.js';
import { parseFrontmatter } from '../src/markdown/frontmatter.js';
import { instructionFileName, instructionNote } from '../src/tell.js';
import { pinnedOf } from '../src/pins.js';
import { DONE_MS, QUEUED_MS } from '../src/demo/server.js';

const START = new Date('2026-09-27T10:00:00.000Z');

let api: typeof ApiModule;
let drive: typeof DriveModule;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers({ now: START });
  localStorage.clear();
  fetchMock = vi.fn(() => {
    throw new Error('The demo must not fetch.');
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_DEMO', '1');
  vi.resetModules();
  api = await import('../src/api.js');
  drive = await import('../src/drive.js');
});

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function me(): Promise<ApiModule.Me> {
  const answer = await api.getMe();
  if (api.isNotInvited(answer)) throw new Error('expected Alex');
  return answer;
}

async function folders(): Promise<ApiModule.Vault> {
  const vault = (await me()).vault;
  if (vault === null) throw new Error('expected a folder');
  return vault;
}

async function paths(): Promise<string[]> {
  return (await drive.listVault((await folders()).folderId)).map((f) => f.path);
}

async function fileAt(path: string): Promise<DriveFile> {
  const files = await drive.listVault((await folders()).folderId);
  const file = files.find((f) => f.path === path);
  if (file === undefined) throw new Error(`no ${path}`);
  return file;
}

/** A file waiting directly in the inbox (not a folder note, not `Processed`). */
function isInboxItem(path: string): boolean {
  return /^0-Inbox\/[^_/][^/]*$/.test(path) && path !== '0-Inbox/Processed';
}

/** Starts Tidy up and runs it to the end. */
async function tidyUp(): Promise<ApiModule.Run> {
  await api.startProcess();
  vi.advanceTimersByTime(DONE_MS);
  const { run } = await api.getStatus();
  if (run === null) throw new Error('expected a run');
  return run;
}

describe('demo mode', () => {
  it('signs in as Alex with the sample notes and the health report', async () => {
    const alex = await me();
    expect(alex.name).toBe('Alex');
    expect(alex.tourSeenAt).toBeUndefined();

    const all = await paths();
    const notes = all.filter((p) => p.endsWith('.md'));
    expect(notes.length).toBeGreaterThanOrEqual(30);
    for (const top of ['1-Projects', '2-Areas', '3-Resources', '4-Archives']) {
      expect(all).toContain(top);
    }
    expect(all.filter(isInboxItem)).toHaveLength(3);

    const hub = await drive.getText(
      (await fileAt('1-Projects/Lisbon Trip/Lisbon Trip.md')).id,
    );
    expect(parseFrontmatter(hub).data.tags).toContain('travel');
    expect(hub).toContain('[[Flights and stays]]');

    const report = await drive.getText((await fileAt('Lint Report.md')).id);
    expect(summarise(parseFrontmatter(report))).toEqual({
      notes: 34,
      findings: 3,
      brokenLinks: 1,
    });

    const image = await drive.getBlob(
      (await fileAt('2-Areas/Garden/Garden plan.svg')).id,
    );
    expect(image.type).toBe('image/svg+xml');

    const rulebook = await drive.getText((await fileAt('CLAUDE.md')).id);
    expect(rulebook).toContain('Vault rulebook');

    const found = await drive.searchFullText('sintra');
    expect(found.map((f) => f.name)).toContain('Things to see in Lisbon.md');
  });

  it('pins Flat hunt and Shopping list from the fixture (#489, #539, Demo-Home board)', async () => {
    // A note pin on the hub note itself, not a folder pin (#489): the
    // folder note map is hydrated after every regular note
    // (`hydratePinnedAt`, `vault-store.tsx`).
    const flatHuntPin = await drive.getText(
      (await fileAt('1-Projects/Flat hunt/Flat hunt.md')).id,
    );
    expect(pinnedOf(flatHuntPin)).not.toBeNull();

    // Lisbon Trip carried the fixture's only pin before #489; the board
    // pins Flat hunt instead.
    const lisbonHub = await drive.getText(
      (await fileAt('1-Projects/Lisbon Trip/Lisbon Trip.md')).id,
    );
    expect(pinnedOf(lisbonHub)).toBeNull();

    // Shopping list (2-Areas/Home) sorts well past
    // `PINNED_HYDRATION_FETCH_CAP` by path; pinned now that #539 makes
    // hydration find it via search first, ahead of the capped walk.
    const shoppingList = await drive.getText(
      (await fileAt('2-Areas/Home/Shopping list.md')).id,
    );
    expect(pinnedOf(shoppingList)).not.toBeNull();
  });

  it('plays Tidy up: queued, running filing one by one, done', async () => {
    const { run } = await api.startProcess();
    expect(run.state).toBe('queued');

    vi.advanceTimersByTime(QUEUED_MS);
    const running = (await api.getStatus()).run;
    expect(running?.state).toBe('running');
    expect(running?.processed).toEqual([]);

    vi.advanceTimersByTime(3_000);
    const midway = (await api.getStatus()).run?.processed ?? [];
    expect(midway.length).toBeGreaterThan(0);
    expect(midway.length).toBeLessThan(3);

    vi.advanceTimersByTime(DONE_MS);
    const done = (await api.getStatus()).run;
    expect(done?.state).toBe('done');
    expect(done?.processed).toHaveLength(6);
    expect(done?.processed).toContain('0-Inbox/Tomato seedlings.md');
    // Each item says where it went (New, #652); none was renamed.
    expect(done?.items).toContainEqual({
      path: '0-Inbox/Tomato seedlings.md',
      kind: 'file',
      to: '2-Areas/Garden/Tomato seedlings.md',
    });
    for (const item of done?.items ?? []) {
      expect(item.to).toEqual(expect.any(String));
    }
    // The flat listings come with the run (#674), each with its note.
    expect(done?.added).toBe('I added bike times to the flats');
    expect(done?.processed).toContain('0-Inbox/Arlington Road, 2 bed.pdf');

    const after = await paths();
    expect(after.filter(isInboxItem)).toHaveLength(0);
    expect(after).toContain('2-Areas/Garden/Tomato seedlings.md');
    expect(after).toContain('2-Areas/Home/Boiler service invoice.pdf');
    expect(
      after.some((p) => /^Answers\/2026-09-27 What do I still need/.test(p)),
    ).toBe(true);
    expect((await me()).quota.used).toBe(1);

    const again = await tidyUp();
    expect(again.processed).toEqual([]);
  });

  it('Do it now: an instructions-only run answers the request and leaves the rest of the inbox (#344)', async () => {
    await api.startProcess('instructions');
    vi.advanceTimersByTime(DONE_MS);
    const done = (await api.getStatus()).run;
    expect(done?.state).toBe('done');
    expect(done?.processed).toHaveLength(1);

    const after = await paths();
    expect(after.filter(isInboxItem)).toEqual([
      '0-Inbox/Boiler service invoice.pdf',
      '0-Inbox/Tomato seedlings.md',
    ]);
    expect(
      after.some((p) => /^Answers\/2026-09-27 What do I still need/.test(p)),
    ).toBe(true);
  });

  it('answers Tell Bower: scripted replies for the chips, a generic one otherwise', async () => {
    const { inboxFolderId } = await folders();
    const messages = [
      'From now on, file recipes under Cooking and tag them #recipe',
      'What did I save about trip planning last month?',
      'Plan a picnic for Saturday',
    ];
    for (const [i, text] of messages.entries()) {
      const now = new Date(START.getTime() + i * 60_000);
      await drive.createTextFile(
        inboxFolderId,
        instructionFileName(text, '', now),
        instructionNote(text, now),
      );
    }
    await tidyUp();

    const rules = await drive.getText((await fileAt('Rules.md')).id);
    expect(rules).toMatch(/## Recipes \(owner's request, 2026-09-27\)/);

    const answers = (await paths()).filter((p) =>
      p.startsWith('Answers/2026-09-27'),
    );
    const texts = await Promise.all(
      answers.map(async (p) => drive.getText((await fileAt(p)).id)),
    );
    expect(texts.some((t) => t.includes('[[Things to see in Lisbon]]'))).toBe(
      true,
    );
    expect(texts.some((t) => t.includes('This is the demo'))).toBe(true);
    expect(
      (await paths()).filter((p) => /^0-Inbox\/Processed\/Bower - /.test(p)),
    ).toHaveLength(5);
  });

  it('files the "What is this?" context note without answering it as a question (#444)', async () => {
    const { inboxFolderId } = await folders();
    const now = new Date(START.getTime());
    await drive.createTextFile(
      inboxFolderId,
      contextNoteName(now),
      contextNote('Test receipt from a shop', ['Receipt.txt'], now),
    );

    const run = await tidyUp();

    // The context note is filed out of the inbox like everything else...
    expect(run.processed).toContain(`0-Inbox/${contextNoteName(now)}`);
    expect(
      (await paths()).some(
        (p) => p === `0-Inbox/Processed/${contextNoteName(now)}`,
      ),
    ).toBe(true);
    // ...but it is not a question: no answer note for it, and only the
    // fixture's one real question (`INBOX_QUESTION`) counts as answered.
    const answers = (await paths()).filter((p) =>
      p.startsWith('Answers/2026-09-27'),
    );
    expect(answers.some((p) => /Context/.test(p))).toBe(false);
    expect(answers).toHaveLength(1);
    expect(runCounts(run)).toEqual({ filed: 5, answered: 1 });
  });

  it('adds files to the inbox, and the next run files them', async () => {
    const { inboxFolderId } = await folders();
    const onProgress = vi.fn();
    const added = await drive.upload(
      inboxFolderId,
      new File(['a receipt'], 'Receipt.txt', { type: 'text/plain' }),
      onProgress,
    );
    expect(onProgress).toHaveBeenCalledWith(9, 9);
    const inbox = await drive.listFolder(inboxFolderId);
    expect(inbox.map((f) => f.name)).toContain('Receipt.txt');

    const run = await tidyUp();
    expect(run.processed).toContain('0-Inbox/Receipt.txt');
    await expect(drive.getText(added.id)).resolves.toBe('a receipt');
    expect(await paths()).toContain('3-Resources/Receipt.txt');
  });

  it('edits and appends to a note, and still catches a conflict', async () => {
    const target = await fileAt('3-Resources/Cooking/Sourdough.md');
    const opened = await drive.readNoteForEdit(target.id);
    await drive.saveNoteText(target, `${opened.text}\nMore water.\n`, {
      baseModifiedTime: opened.modifiedTime,
    });
    await expect(
      drive.saveNoteText(target, 'stale', {
        baseModifiedTime: opened.modifiedTime,
      }),
    ).rejects.toMatchObject({ name: 'SaveError', code: 'conflict' });

    const appended = await drive.appendToFile(target, 'Try rye next time.');
    expect(appended.text).toMatch(/More water\.\n\nTry rye next time\.\n$/);
    await expect(
      drive.appendToFile(await fileAt('index.md'), 'no'),
    ).rejects.toMatchObject({ code: 'protected' });
  });

  it('keeps settings in memory and refuses what the demo cannot do', async () => {
    await api.updateSettings({ tourSeenAt: START.toISOString() });
    await expect(
      api.updateSettings({ apiKey: 'sk-ant-test' }),
    ).resolves.toEqual({ hasApiKey: true, allowWeb: false });
    const alex = await me();
    expect(alex.tourSeenAt).toBe(START.toISOString());
    expect(alex.hasApiKey).toBe(true);

    await expect(api.deleteAccount()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'demo',
    });
    await expect(api.getPushPublicKey()).rejects.toMatchObject({
      code: 'demo',
    });
    await expect(api.unsubscribePush('https://push.example/x')).resolves.toBe(
      undefined,
    );
    await expect(api.logout()).resolves.toBeUndefined();
    await expect(drive.getToken()).resolves.toMatchObject({
      accessToken: 'demo',
    });
  });
});
