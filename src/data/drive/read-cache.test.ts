/**
 * One Drive read cache, keyed by file id and modifiedTime, for the app and the runner (TL-P4-14 c2-read-cache). The
 * app's side (a refresh in the middle of Home's read) is in `live/home-cache.test.ts`; this is the runner's plan reads
 * and the cache's own rules.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BowerError } from '../types';
import type { DriveFile } from './drive-api';
import { ReadCache } from './read-cache';
import { RunnerDrive } from '../../../runner/src/drive';
import { RunnerToken } from '../../../runner/src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from '../../../runner/test/drive-v3';

afterEach(() => {
  vi.restoreAllMocks();
});

function adapterOn(wire: DriveV3): RunnerDrive {
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  return new RunnerDrive({ token, attempt: 1, fetch: wire.fetch });
}

async function seeded(): Promise<{ wire: DriveV3; folder: DriveFile; note: DriveFile }> {
  const drive = fixedDrive();
  const folder = await drive.createFolder('root', 'Bower');
  const note = await drive.createText(folder.id, 'Note.md', 'First words.');
  return { wire: driveV3(drive), folder, note };
}

/** How many times the runner asked Drive for this file's content. */
const contentReads = (wire: DriveV3, id: string): number => wire.requests.filter((r) => r.method === 'GET' && r.url.pathname.endsWith(`/files/${id}`) && r.url.searchParams.get('alt') === 'media').length;

describe('one read cache serves app and runner', () => {
  it('the runner reads a file once per modifiedTime, however long its plan takes and whatever it writes meanwhile', async () => {
    const { wire, folder, note } = await seeded();
    const drive = adapterOn(wire);
    const reads = drive.planReads();
    await reads.listAll('root');
    expect(await reads.readText(note.id)).toBe('First words.');
    // A model's turn takes minutes: the plan reads the same note again later, at the version the listing shows.
    const later = Date.now() + 120_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    expect(await reads.readText(note.id)).toBe('First words.');
    // A write of the run's own elsewhere: the listing is read again, the unchanged note is not.
    await drive.get(folder.id);
    await (await drive.batch()).createFolder(folder.id, 'Made');
    await reads.listAll('root');
    expect(await reads.readText(note.id)).toBe('First words.');
    expect(contentReads(wire, note.id), 'the note read from Drive, at one modifiedTime').toBe(1);
  });

  it('the runner reads a file changed elsewhere again once the listing shows its new modifiedTime', async () => {
    const { wire, folder, note } = await seeded();
    const drive = adapterOn(wire);
    const reads = drive.planReads();
    await reads.listAll('root');
    expect(await reads.readText(note.id)).toBe('First words.');
    await wire.drive.writeText(note.id, 'Other words.', note.modifiedTime);
    await drive.get(folder.id);
    await (await drive.batch()).createFolder(folder.id, 'Made');
    await reads.listAll('root');
    expect(await reads.readText(note.id)).toBe('Other words.');
    expect(contentReads(wire, note.id)).toBe(2);
  });

  it('a kept read never stands in for the fence: a runner write over a file changed since is refused', async () => {
    const { wire, note } = await seeded();
    const drive = adapterOn(wire);
    const reads = drive.planReads();
    await reads.listAll('root');
    await reads.readText(note.id);
    await wire.drive.writeText(note.id, 'Their words.', note.modifiedTime);
    const writes = await drive.batch();
    await expect(writes.writeText(note.id, 'Our words.', note.modifiedTime)).rejects.toMatchObject({ code: 'conflict' });
    expect(await wire.drive.readText(note.id)).toBe('Their words.');
  });

  it('keeps one read per version, shared while in flight; a failed read is not kept', async () => {
    const cache = new ReadCache();
    let n = 0;
    const read = async (): Promise<string> => `read ${++n}`;
    const v1 = { id: 'FILE', modifiedTime: '2026-10-08T10:00:00.000Z' };
    const [a, b] = await Promise.all([cache.text(v1, read), cache.text(v1, read)]);
    expect([a, b, n]).toEqual(['read 1', 'read 1', 1]);
    expect(await cache.text({ ...v1, modifiedTime: '2026-10-08T10:00:01.000Z' }, read)).toBe('read 2');
    // An id with no version known is read, never kept.
    expect(await cache.text({ id: 'FILE', modifiedTime: undefined }, read)).toBe('read 3');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = async (): Promise<string> => { throw new BowerError('offline', 'Bower could not reach Google Drive.'); };
    const v2 = { id: 'OTHER', modifiedTime: '2026-10-08T10:00:00.000Z' };
    await expect(cache.text(v2, failing)).rejects.toMatchObject({ code: 'offline' });
    expect(await cache.text(v2, read)).toBe('read 4');
  });
});
