/**
 * qa7-drafts (qa-7 Claude F1, P1): a reload that cuts a slow send short leaves the line in this device's outbox, but the
 * intent that ties it to the press lives only in the old page's memory. Send pressed again with the same words (the
 * same intent, kept in the tab by Tell Bower) then makes a second line: the request is made twice. Made-up words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { pretendDrive } from './pretend';

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

/** Presses Send on a slow Drive, then reloads while the send is still on its way; returns the page after the reload. */
async function sendCutByReload(): Promise<DriveVault> {
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
  // The reload: the old page stops (its in-memory intent goes with it) and lets go of the outbox.
  alive = false;
  await vi.advanceTimersByTimeAsync(10_000);
  const again = await pretendDrive('slow');
  expect(again.fresh).toBe(false);
  return page(again.drive, again.rootId ?? '');
}

const count = async (vault: DriveVault): Promise<number> => (await vault.requests()).filter((r) => r.text === WORDS).length;

describe('qa7-drafts: Send pressed again after a reload is the same request', () => {
  it('AC1 qa7-drafts-resend-waiting: the line still waits in the outbox when Send is pressed again', async () => {
    const vault = await sendCutByReload();
    await vault.addRequest(WORDS, INTENT);
    expect(await count(vault)).toBe(1);
  });

  it('AC1 qa7-drafts-resend-flushed: the outbox was sent at start before Send is pressed again', async () => {
    const vault = await sendCutByReload();
    // The page sends what waits once at start (`live/index.ts`), before the person presses Send again.
    await vault.flushJournal();
    expect(await count(vault)).toBe(1);
    await vault.addRequest(WORDS, INTENT);
    expect(await count(vault)).toBe(1);
  });

  it('AC1 qa7-drafts-resend-new-intent: other words, or the same words with a new intent, are a new request', async () => {
    const vault = await sendCutByReload();
    await vault.addRequest(WORDS, 'INTENT_QA7_B');
    expect(await count(vault)).toBe(2);
  });
});
