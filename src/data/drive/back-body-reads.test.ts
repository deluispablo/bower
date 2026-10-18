import { afterEach, expect, it, vi } from 'vitest';
import { DriveHttp } from './drive-http';
import { FakeDrive } from './fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { seedFakeDrive } from '../fake/seed';
import { updateByStamp } from '../spine/write-once';

const broken = (status = 200): Response => new Response(new ReadableStream({ start(c) { c.error(new TypeError('Interrupted body')); } }), { status });
afterEach(() => vi.restoreAllMocks());

it('a landed rename with a broken 200 body is done and journaled once', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fake = new FakeDrive();
  const root = (await seedFakeDrive(fake, 'default', Date.now())) ?? '';
  const path = 'Resources/Cooking/Lemon tart.md';
  const file = (await fake.listAll(root)).find((f) => fake.pathOf(f.id, root) === path);
  if (!file) throw new Error('Missing seeded note');
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const patch = JSON.parse(String(init?.body)) as { name: string; appProperties: Record<string, string> };
    await fake.update(file.id, patch);
    return broken();
  });
  const http = new DriveHttp({ token: async () => 'token', fetch });
  const drive = Object.create(fake) as FakeDrive;
  drive.update = http.update.bind(http);
  const get = vi.spyOn(drive, 'get');
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  await vault.tree();
  await expect(vault.rename(path, 'Lemon cake')).resolves.toBe('Resources/Cooking/Lemon cake.md');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith(file.id, { checksums: true, binned: true });
  expect((await vault.changes()).filter((line) => line.kind === 'rename')).toMatchObject([
    { from: path, path: 'Resources/Cooking/Lemon cake.md' },
  ]);
});

it.each(['media', 'multipart', 'resumable'] as const)('%s body loss reconciles the stamp without replay', async (kind) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fake = new FakeDrive();
  const file = await fake.createText('root', 'note.md', 'old');
  let op: Record<string, string> = {};
  const fetch = vi.fn(async () => {
    await fake.writeText(file.id, 'new', file.modifiedTime, op);
    // Truncated JSON exercises decoding as well as the stream failure above; completion may be 201.
    return new Response('{"id":', { status: kind === 'resumable' ? 201 : 200 });
  });
  const http = new DriveHttp({ token: async () => 'token', fetch });
  const get = vi.spyOn(fake, 'get');
  const result = updateByStamp(fake, file, { text: 'new' }, async (stamp) => {
    op = stamp;
    if (kind === 'resumable') {
      const result = await http.putChunk('https://www.googleapis.com/upload/session', 0, new Blob(['new']), 3);
      if (result.kind !== 'done') throw new Error('Expected completion');
      return result.file;
    }
    return http.writeText(file.id, 'new', file.modifiedTime, kind === 'multipart' ? stamp : undefined, { current: file });
  });
  const landed = await result;
  expect(landed).toMatchObject({ id: file.id, appProperties: op });
  expect(op.bowerOp).toEqual(expect.any(String));
  expect(get).toHaveBeenCalledWith(file.id, { checksums: true, binned: true });
  expect(fetch).toHaveBeenCalledTimes(1);
});
