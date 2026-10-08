/**
 * A write that gets no answer must end (TL-P3-28 point 4). C16: adding a pile sat on "Saving…" for over
 * 100 s with no request in flight and no error, because no `fetch` the app makes had a bounded wait.
 * A timeout is told as "offline", the one the lost-reply path already reads back and words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from './fake-drive';
import { DriveHttp } from './drive-http';
import { DriveVault } from '../vault/drive-vault';
import { WorkerHttp } from '../worker/worker-http';
import { BowerError } from '../types';
import { seedFakeDrive } from '../fake/seed';

const TART = 'Resources/Cooking/Lemon tart.md';

/** Ten minutes: far past any sensible bound, so a write still pending then has no bound at all. */
const LONG = 600_000;

/** A network that takes the request and never answers (a stalled connection ignores the signal). */
const silent = ((): Promise<Response> => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

/** Reads answer, writes never do. */
const readsOnly = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  void input;
  if ((init?.method ?? 'GET') === 'GET') return Promise.resolve(Response.json({ files: [] }));
  return new Promise<Response>(() => undefined);
}) as typeof fetch;

/** The outcome of a promise after `ms` of fake time: settled with a value, rejected, or still pending. */
async function after<T>(p: Promise<T>, ms: number): Promise<{ state: 'pending' } | { state: 'ok'; value: T } | { state: 'rejected'; error: unknown }> {
  let out: { state: 'pending' } | { state: 'ok'; value: T } | { state: 'rejected'; error: unknown } = { state: 'pending' };
  p.then(
    (value) => { out = { state: 'ok', value }; },
    (error: unknown) => { out = { state: 'rejected', error }; },
  );
  await vi.advanceTimersByTimeAsync(ms);
  return out;
}

afterEach(() => vi.useRealTimers());

describe('a write that gets no answer', () => {
  it('a write that gets no answer ends in the lost-reply path after the bounded wait', async () => {
    vi.useFakeTimers();
    const drive = new DriveHttp({ token: async () => 'TOKEN', fetch: silent });
    const rename = await after(drive.update('FILE_ID', { name: 'Lemon cake.md' }), LONG);
    expect(rename.state).toBe('rejected');
    expect((rename as { error: unknown }).error).toBeInstanceOf(BowerError);
    expect((rename as { error: BowerError }).error).toMatchObject({ code: 'unknown', message: "Bower couldn't confirm that change. Refresh to check." });

    const text = await after(drive.writeText('FILE_ID', 'Words', 'T'), LONG);
    expect(text.state).toBe('rejected');

    const worker = new WorkerHttp('https://api.example.com', silent);
    const run = await after(worker.process('all'), LONG);
    expect(run.state).toBe('rejected');
    expect((run as { error: unknown }).error).toMatchObject({ code: 'offline' });
  });

  it('a write that is answered in time is not cut short', async () => {
    vi.useFakeTimers();
    const slow = (async () => {
      await new Promise((r) => setTimeout(r, 5_000));
      return Response.json({ id: 'FILE_ID', name: 'Lemon cake.md', parents: ['P'], modifiedTime: '2026-10-07T10:00:00.000Z', createdTime: '2026-10-07T10:00:00.000Z' });
    }) as unknown as typeof fetch;
    const drive = new DriveHttp({ token: async () => 'TOKEN', fetch: slow });
    const done = await after(drive.update('FILE_ID', { name: 'Lemon cake.md' }), 6_000);
    expect(done.state).toBe('ok');
  });

  it('a lost reply on the way ends as unconfirmed', async () => {
    vi.useFakeTimers();
    // The rename never answers; reading it back is answered too, but shows the old name: unconfirmed, not "sure".
    const fake = new FakeDrive();
    const root = (await seedFakeDrive(fake, 'default', Date.now())) ?? '';
    const tart = (await fake.listAll(root)).find((f) => fake.pathOf(f.id, root) === TART);
    const http = {
      update: () => new DriveHttp({ token: async () => 'TOKEN', fetch: silent }).update(tart?.id ?? '', { name: 'Lemon cake.md' }),
    };
    const gets: string[] = [];
    const wrapped = Object.create(fake) as FakeDrive;
    wrapped.update = http.update;
    const get = fake.get.bind(fake);
    wrapped.get = async (id) => (gets.push(id), get(id));
    const vault = new DriveVault({ drive: wrapped, rootId: async () => root, runningPiles: () => new Set() });
    await vault.tree();
    const moved = await after(vault.rename(TART, 'Lemon cake'), LONG);
    expect(moved.state).toBe('rejected');
    expect((moved as { error: unknown }).error).toMatchObject({ name: 'BowerError', code: 'unknown', message: "Bower couldn't confirm that change. Refresh to check." });
    // It was read back after the wait, not assumed.
    expect(gets.length).toBeGreaterThan(1);
  });

  it('adding a pile never sits on saving without an outcome', async () => {
    vi.useFakeTimers();
    const drive = new DriveHttp({ token: async () => 'TOKEN', fetch: readsOnly });
    const vault = new DriveVault({ drive, rootId: async () => 'FOLDER_ID', runningPiles: () => new Set() });
    const adding = vault.addPile({ text: 'Job hunt notes', items: [{ name: 'cv.pdf', kind: 'pdf', origin: 'From this device', body: new Blob(['x'], { type: 'application/pdf' }) }] });
    const outcome = await after(adding, LONG);
    expect(outcome.state).not.toBe('pending');
    expect(outcome.state).toBe('rejected');
    expect((outcome as { error: unknown }).error).toMatchObject({ name: 'BowerError', code: 'unknown', message: "Bower couldn't confirm that change. Refresh to check." });
  });
});
