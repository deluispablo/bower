/**
 * qa7-drafts (qa-7 Claude F1, P1): a reload that cuts a slow send short leaves the line in this device's outbox, but the
 * intent that ties it to the press lives only in the old page's memory. Send pressed again with the same words (the
 * same intent, kept in the tab by Tell Bower) then makes a second line: the request is made twice. Made-up words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import type { DriveFile } from '../drive/drive-api';
import { DriveHttp } from '../drive/drive-http';
import { DriveVault } from '../vault/drive-vault';
import { pretendDrive } from './pretend';
import { BowerError } from '../types';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A Bower page over the pretend Drive this tab keeps, with its own memory (a reload starts a new one). */
const page = (drive: FakeDrive, rootId: string, alive: () => boolean = () => true): DriveVault =>
  new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set() }, alive, async () => rootId, {} as FakeDrive);

const WORDS = 'Beta slow words about the lease for Alex';
const INTENT = 'INTENT_QA7_A';

/** The page after a reload, over the Drive this tab keeps. */
interface Reloaded { vault: DriveVault; drive: FakeDrive; rootId: string }

/**
 * Presses Send on a slow Drive, then reloads while the send is still on its way; returns the page after the reload.
 * `lands: false`: the first page's send never reaches Drive (it goes offline as the reload comes). `reserved`: the reload
 * comes once Drive reserved the line's id, with its create on its way.
 */
async function sendCutByReload(lands = true, reservedFirst = false): Promise<Reloaded> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const first = await pretendDrive('slow');
  const rootId = first.rootId ?? '';
  await first.drive.persist?.();
  first.drive.latency = 1500;
  let alive = true;
  // expected: this page goes with the reload; its press never ends for the person.
  void page(first.drive, rootId, () => alive).addRequest(WORDS, INTENT).catch(() => undefined);
  // Positive control: the line waits in this device's outbox, as a reload finds it.
  await vi.waitFor(() => expect(Object.keys(localStorage).some((k) => k.startsWith('bower:outbox:') && (localStorage.getItem(k) ?? '').includes(WORDS))).toBe(true));
  for (let i = 0; reservedFirst && i < 40 && reserved() === undefined; i++) await vi.advanceTimersByTimeAsync(250);
  // The reload: the old page stops (its in-memory intent goes with it) and lets go of the outbox.
  alive = false;
  if (!lands) first.drive.offline = true;
  await vi.advanceTimersByTimeAsync(10_000);
  const again = await pretendDrive('slow');
  expect(again.fresh).toBe(false);
  return { vault: page(again.drive, again.rootId ?? ''), drive: again.drive, rootId: again.rootId ?? '' };
}

const count = async (vault: DriveVault): Promise<number> => (await vault.requests()).filter((r) => r.text === WORDS).length;

/** The physical journal files in the changes folder that carry these words (not the merged listing). */
async function files(drive: FakeDrive, rootId: string): Promise<DriveFile[]> {
  const all = (await drive.listAll(rootId)).filter((f) => !f.folder && drive.pathOf(f.id, rootId).startsWith('.bower/changes/'));
  const texts = await Promise.all(all.map((f) => drive.readText(f.id)));
  return all.filter((_f, i) => (texts[i] ?? '').includes(WORDS));
}

/** The Drive id the outbox keeps reserved for this request's line, if any. */
function reserved(): string | undefined {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('bower:outbox:')) continue;
    const lines = JSON.parse(localStorage.getItem(k) ?? '[]') as Array<{ line: { text?: string }; reserved?: string }>;
    const r = lines.find((w) => w.line.text === WORDS);
    if (r) return r.reserved;
  }
  return undefined;
}

/** A permanent refusal, as Drive answers one: a 403 that is not a rate limit (through the real transport). */
const REFUSED = (): DriveHttp => new DriveHttp({
  token: async () => 't',
  fetch: async () => new Response(JSON.stringify({ error: { code: 403, errors: [{ reason: 'insufficientFilePermissions' }] } }), { status: 403 }),
  pacing: { baseMs: 0, sleep: async () => {} },
});

describe('qa7-drafts: Send pressed again after a reload is the same request', () => {
  it('AC1 qa7-drafts-resend-waiting: the line still waits in the outbox when Send is pressed again', async () => {
    const { vault, drive, rootId } = await sendCutByReload();
    await vault.addRequest(WORDS, INTENT);
    expect(await count(vault)).toBe(1);
    // review-gaps 1: one physical file, under the request's own id.
    expect(await files(drive, rootId)).toHaveLength(1);
    expect((await vault.requests()).find((r) => r.text === WORDS)?.id).toBe(INTENT);
  });

  it('AC1 qa7-drafts-resend-reserved: the reload came after Drive reserved the line its id; Send again reuses it', async () => {
    const { vault, drive, rootId } = await sendCutByReload(true, true);
    // Positive control: the outbox kept the id Drive reserved for the line before the reload.
    const held = reserved();
    expect(held).toBeDefined();
    await vault.addRequest(WORDS, INTENT);
    expect(await count(vault)).toBe(1);
    // review-gaps 1: one physical file, the one made with the id reserved before the reload.
    expect((await files(drive, rootId)).map((f) => f.id)).toEqual([held]);
    expect((await vault.requests()).find((r) => r.text === WORDS)?.id).toBe(INTENT);
  });

  it('AC1 qa7-drafts-resend-flushed: the outbox was sent at start before Send is pressed again', async () => {
    const { vault, drive, rootId } = await sendCutByReload();
    // The page sends what waits once at start (`live/index.ts`), before the person presses Send again.
    await vault.flushJournal();
    expect(await count(vault)).toBe(1);
    const flushed = (await files(drive, rootId)).map((f) => f.id);
    expect(flushed).toHaveLength(1);
    await vault.addRequest(WORDS, INTENT);
    expect(await count(vault)).toBe(1);
    // review-gaps 1: the file the start flush made is the one request; nothing new is written.
    expect((await files(drive, rootId)).map((f) => f.id)).toEqual(flushed);
    expect((await vault.requests()).find((r) => r.text === WORDS)?.id).toBe(INTENT);
  });

  it('AC1 qa7-drafts-resend-other-tab: loaded, then another tab flushes the outbox, then Send again: one file (review-gaps 19)', async () => {
    const { vault, drive, rootId } = await sendCutByReload(false);
    // Positive control: nothing landed yet; this page loads its requests (the waiting line), so its listing predates the flush.
    expect(await files(drive, rootId)).toHaveLength(0);
    expect(await count(vault)).toBe(1);
    // Another tab of the same person sends what waits in the shared outbox.
    await page(drive, rootId).flushJournal();
    expect(await files(drive, rootId)).toHaveLength(1);
    await vault.addRequest(WORDS, INTENT);
    expect(await files(drive, rootId)).toHaveLength(1);
    // The copy found is on this page's list too, as the one request.
    expect(await count(vault)).toBe(1);
  });

  it('AC1 qa7-drafts-resend-lookup-fails: sent at start, reload, Send again while the listing fails once: one file (review-gaps 21)', async () => {
    const { vault, drive, rootId } = await sendCutByReload();
    await vault.flushJournal();
    const flushed = (await files(drive, rootId)).map((f) => f.id);
    expect(flushed).toHaveLength(1);
    const changes = (await drive.listAll(rootId)).find((f) => f.folder && drive.pathOf(f.id, rootId) === '.bower/changes');
    if (!changes) throw new Error('no changes folder');
    // The reload: a new page whose fresh lookup of the changes folder fails once; writes still succeed.
    const list = drive.listAll.bind(drive);
    let failures = 0;
    drive.listAll = async (...a: Parameters<FakeDrive['listAll']>) => {
      if (a[0] === changes.id && failures === 0) {
        failures++;
        throw new BowerError('offline', 'Drive did not answer.');
      }
      return list(...a);
    };
    const again = page(drive, rootId);
    await again.addRequest(WORDS, INTENT);
    // Positive control: the lookup did fail, and the line waits for the next flush instead of being written.
    expect(failures).toBe(1);
    expect((await files(drive, rootId)).map((f) => f.id)).toEqual(flushed);
    await again.flushJournal();
    expect((await files(drive, rootId)).map((f) => f.id)).toEqual(flushed);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('bower:outbox:'))).toEqual([]);
  });

  it('AC1 qa7-drafts-resend-new-intent: other words, or the same words with a new intent, are a new request', async () => {
    const { vault } = await sendCutByReload();
    await vault.addRequest(WORDS, 'INTENT_QA7_B');
    expect(await count(vault)).toBe(2);
  });

  it('AC1 qa7-drafts-resend-offline-replay: sent at start, Send again offline, back online: one file (review-gaps 15)', async () => {
    const { vault, drive, rootId } = await sendCutByReload();
    await vault.flushJournal();
    const flushed = (await files(drive, rootId)).map((f) => f.id);
    expect(flushed).toHaveLength(1);
    // A reload offline: the page cannot see the changes folder, so only the outbox is asked; the press is kept to send.
    drive.offline = true;
    const offline = page(drive, rootId);
    await offline.addRequest(WORDS, INTENT);
    drive.offline = false;
    await offline.flushJournal();
    expect((await files(drive, rootId)).map((f) => f.id)).toEqual(flushed);
    expect(await count(offline)).toBe(1);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('bower:outbox:'))).toEqual([]);
  });

  it('AC1 qa7-drafts-resend-no-refusal: offline, and beside a malformed unrelated line, a send still goes once (review-gaps 5)', async () => {
    const { vault, drive, rootId } = await sendCutByReload();
    await vault.flushJournal();
    const changes = (await drive.listAll(rootId)).find((f) => f.folder && drive.pathOf(f.id, rootId) === '.bower/changes');
    if (!changes) throw new Error('no changes folder');
    await drive.createText(changes.id, 'NOT_A_LINE.json', '{ not json');
    // The same press again beside it, on a new page: still one, and no refusal.
    await expect(page(drive, rootId).addRequest(WORDS, INTENT)).resolves.toMatchObject({ id: INTENT });
    expect(await files(drive, rootId)).toHaveLength(1);
    // A new request offline is kept, and goes once when the Drive answers again.
    const OTHER = 'INTENT_QA7_C';
    drive.offline = true;
    const offline = page(drive, rootId);
    await expect(offline.addRequest(WORDS, OTHER)).resolves.toMatchObject({ id: OTHER });
    drive.offline = false;
    await offline.flushJournal();
    expect(await files(drive, rootId)).toHaveLength(2);
  });

  it('AC1 qa7-drafts-resend-refused: a line refused for good at start is never reported sent by Send again (review-gaps 6)', async () => {
    const { vault, drive, rootId } = await sendCutByReload(false);
    expect(await files(drive, rootId)).toHaveLength(0);
    const create = drive.createText.bind(drive);
    drive.createText = (...a: Parameters<FakeDrive['createText']>) => REFUSED().createText(...a);
    await vault.flushJournal();
    expect(await vault.failedChanges()).toHaveLength(1);
    // Drive would take it now: a resend that made the line anew would succeed, and must not.
    drive.createText = create;
    await expect(vault.addRequest(WORDS, INTENT)).rejects.toThrow();
    expect(await files(drive, rootId)).toHaveLength(0);
    expect(await count(vault)).toBe(0);
  });
});
