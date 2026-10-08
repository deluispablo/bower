import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FakeDrive, FaultHook, FencedCall, FencedDrive } from '../../src/data/drive/fake-drive';
import { RunnerDrive } from '../src/drive';
import { driveEffects } from '../src/effects';
import type { Checkpoint } from '../../src/data/contracts/run-checkpoint';
import type { OperationV2 } from '../../src/data/contracts/run-manifest';
import type { RunManifest } from '../../src/data/spine/records';
import { SeenFiles, targetOf } from '../src/still-as-seen';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const STALE = { code: 'conflict', message: 'This tidy-up was taken over.' };

function adapterOn(wire: DriveV3, attempt = 1): RunnerDrive {
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  return new RunnerDrive({ token, attempt, fetch: wire.fetch });
}

async function seeded(): Promise<{ wire: DriveV3; folder: DriveFile; note: DriveFile; other: DriveFile }> {
  const drive = fixedDrive();
  const folder = await drive.createFolder('root', 'Bower');
  const other = await drive.createFolder('root', 'Elsewhere');
  const note = await drive.createText(folder.id, 'Note.md', 'First words.');
  return { wire: driveV3(drive), folder, note, other };
}

const writesSent = (wire: DriveV3): string[] => wire.requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.url.pathname}`);

describe('runner drive adapter', () => {
  it('the adapter refuses a write when the file moved since it was read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, folder, note, other } = await seeded();
    const adapter = adapterOn(wire);
    const seenNote = await adapter.get(note.id);
    await adapter.get(folder.id);
    const writes = await adapter.batch();

    // Renamed elsewhere since the run read it.
    await wire.drive.update(note.id, { name: 'Renamed elsewhere.md' });
    await expect(writes.update(note.id, { name: 'Mine.md' })).rejects.toMatchObject({ code: 'conflict' });
    // Its text changed elsewhere: a move is refused too, as is a write.
    const now = await adapter.get(note.id);
    wire.drive.touch(note.id);
    await expect(writes.update(note.id, { addParent: other.id, removeParent: folder.id })).rejects.toMatchObject({ code: 'conflict' });
    await expect(writes.writeText(note.id, 'Over it.', now.modifiedTime)).rejects.toMatchObject({ code: 'conflict' });
    // Moved to another folder elsewhere.
    await adapter.get(note.id);
    await wire.drive.update(note.id, { addParent: other.id, removeParent: folder.id });
    await expect(writes.trash(note.id)).rejects.toMatchObject({ code: 'conflict' });
    // Its folder went to the Bin elsewhere: nothing is made inside it.
    await wire.drive.trash(folder.id);
    await expect(writes.createText(folder.id, 'New.md', 'Words.')).rejects.toMatchObject({ code: 'conflict' });
    // A file the run never read is never written.
    await expect(writes.trash(other.id)).rejects.toMatchObject({ code: 'conflict' });

    expect(writesSent(wire)).toEqual([]);
    expect((await wire.drive.get(note.id)).name).toBe('Renamed elsewhere.md');
    expect(seenNote.name).toBe('Note.md');
  });

  it('a person change between the check and the send is refused (edit)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, note: first } = await seeded();
    const adapter = adapterOn(wire);
    const note = await wire.drive.writeText(first.id, 'See [[Old]].', first.modifiedTime);
    const sha = (t: string): string => createHash('sha256').update(t).digest('hex');
    const sized = (t: string) => ({ encoding: 'utf8' as const, size: new TextEncoder().encode(t).byteLength, sha256: sha(t) });
    const text = 'See [[New]].';
    const op = {
      operationId: 'e'.repeat(64),
      ordinal: 0,
      dependsOn: [],
      effect: {
        kind: 'edit-text',
        before: { fileId: note.id, name: note.name, parents: note.parents, modifiedTime: note.modifiedTime },
        path: 'Note.md',
        beforeContent: sized('See [[Old]].'),
        changes: [{ kind: 'link-rewrite', recordIds: ['r'], renames: [{ from: 'Old', to: 'New' }] }],
        text,
        content: sized(text),
      },
    } as unknown as OperationV2;
    const head = { runId: RUN_ID, outcomes: [] } as unknown as Checkpoint;
    const manifest = { operations: [op] } as unknown as RunManifest;
    // The person writes between the check and the send (the effect's `sending` is awaited after its check).
    const settled = await driveEffects(adapter).apply(op, head, await adapter.batch(), manifest, async () => {
      await wire.drive.writeText(note.id, 'The person wrote this.', (await wire.drive.get(note.id)).modifiedTime);
    });
    expect(settled.state).toBe('rejected');
    expect(await wire.drive.readText(note.id)).toBe('The person wrote this.');
  });

  it('the adapter refuses a write after a newer attempt took over, even in a batch it began before', async () => {
    const { wire, note } = await seeded();
    const adapter = adapterOn(wire, 1);
    await adapter.get(note.id);
    const before = wire.attemptCalls;
    const writes = await adapter.batch();
    // One attempt read per batch, and one more right before each write (TL-P3-23).
    expect(wire.attemptCalls).toBe(before + 1);
    const renamed = await writes.update(note.id, { name: 'Kept.md' });
    expect(renamed.name).toBe('Kept.md');
    expect(wire.attemptCalls).toBe(before + 2);

    // The Worker started attempt 2: this runner's next batch is refused before any write, and so is a write of a
    // batch it began before the takeover.
    wire.attempt = 2;
    const sent = writesSent(wire).length;
    await expect(adapter.batch()).rejects.toMatchObject(STALE);
    await expect(writes.update(note.id, { name: 'Late.md' })).rejects.toMatchObject(STALE);
    // The Worker itself refuses an older ticket the same way.
    wire.attempt = 1;
    wire.tokenRefusal = { status: 409, error: 'stale-attempt' };
    await expect(adapter.batch()).rejects.toMatchObject(STALE);
    expect(writesSent(wire).length).toBe(sent);
    expect((await wire.drive.get(note.id)).name).toBe('Kept.md');
  });

  it('the attempt check before a write does not fetch a token', async () => {
    const { wire, note, folder } = await seeded();
    const adapter = adapterOn(wire, 1);
    await adapter.get(note.id);
    await adapter.get(folder.id);
    // One token for the reads; it is kept until shortly before it expires.
    expect(wire.tokenCalls).toBe(1);
    const writes = await adapter.batch();
    await writes.update(note.id, { name: 'One.md' });
    await writes.createText(folder.id, 'Two.md', 'Words.');
    await (await adapter.batch()).update(note.id, { name: 'Three.md' });
    // Each batch and each write asked the attempt route (2 batches, 3 writes); none fetched a token.
    expect(wire.attemptCalls).toBe(5);
    expect(wire.tokenCalls).toBe(1);
    // Near its expiry the token is asked for again, once.
    wire.now += 3_600_000 - 30_000;
    await (await adapter.batch()).update(note.id, { name: 'Four.md' });
    expect(wire.tokenCalls).toBe(2);
    expect((await wire.drive.get(note.id)).name).toBe('Four.md');
  });

  it('a stale attempt is still refused before any write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, note } = await seeded();
    const adapter = adapterOn(wire, 1);
    await adapter.get(note.id);
    const writes = await adapter.batch();
    const sent = writesSent(wire).length;
    const tokens = wire.tokenCalls;
    // A newer attempt holds the run: the attempt route names it, and nothing more is sent.
    wire.attempt = 2;
    await expect(adapter.batch()).rejects.toMatchObject(STALE);
    await expect(writes.update(note.id, { name: 'Late.md' })).rejects.toMatchObject(STALE);
    // The Worker answers this runner's superseded ticket 409 stale-attempt: refused the same way.
    wire.attempt = 1;
    wire.tokenRefusal = { status: 409, error: 'stale-attempt' };
    await expect(adapter.batch()).rejects.toMatchObject(STALE);
    await expect(writes.update(note.id, { name: 'Later.md' })).rejects.toMatchObject(STALE);
    // A refused ticket stays an auth error, never a takeover.
    wire.tokenRefusal = { status: 401, error: 'signed-out' };
    await expect(writes.update(note.id, { name: 'Latest.md' })).rejects.toMatchObject({ code: 'auth' });
    expect(writesSent(wire).length).toBe(sent);
    expect(wire.attemptCalls).toBe(6);
    expect(wire.tokenCalls).toBe(tokens);
    expect((await wire.drive.get(note.id)).name).toBe('Note.md');
  });

  it('the adapter refuses with stale-attempt on the Worker\'s real reply', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, note } = await seeded();
    const adapter = adapterOn(wire, 1);
    await adapter.get(note.id);
    await adapter.batch();
    // The Worker answers a superseded attempt's ticket 409 with a nested code.
    wire.tokenRefusal = { status: 409, error: 'stale-attempt' };
    const sent = writesSent(wire).length;
    await expect(adapter.batch()).rejects.toMatchObject(STALE);
    expect(writesSent(wire).length).toBe(sent);
  });

  it('a refused ticket stays an auth error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, note } = await seeded();
    const adapter = adapterOn(wire, 1);
    await adapter.get(note.id);
    await adapter.batch();
    // A 401 is never read as a takeover, even after an earlier grant.
    wire.tokenRefusal = { status: 401, error: 'signed-out' };
    await expect(adapter.batch()).rejects.toMatchObject({ code: 'auth' });
  });

  it('the adapter and the fake agree on the fenced scenario', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = fixedDrive();
    const wire = driveV3(fixedDrive());
    const adapter = adapterOn(wire);
    const viaFake = await scenario(fakeSide(fake));
    const viaAdapter = await scenario({ outside: wire.drive, get: (id) => adapter.get(id), batch: () => adapter.batch(), setFault: (h) => { adapter.fault = h; } });

    expect(viaAdapter.steps).toEqual(viaFake.steps);
    expect(viaFake.steps.map((s) => s.error ?? 'ok')).toEqual(['ok', 'ok', 'ok', 'ok', 'unknown', 'unknown', 'conflict', 'ok']);
    expect(await visible(wire.drive)).toEqual(await visible(fake));
    expect([...fake.dump().entries()]).toEqual([['Tidy/Lost.md', 'Lost words.']]);
    expect(viaAdapter.applied).toEqual(viaFake.applied);
    expect(viaFake.applied).toEqual(['create-folder', 'create-text', 'update', 'write-text', 'create-text', 'trash']);
    // The evidence reads see the same Drive.
    const lost = (await adapter.list(viaFake.folderId)).map((f) => f.name);
    expect(lost).toEqual(['Lost.md']);
    const lostId = (await fake.listAll('root')).find((f) => f.name === 'Lost.md')?.id ?? '';
    expect(await adapter.readText(lostId)).toBe('Lost words.');
    expect(await adapter.md5(lostId)).toBe(createHash('md5').update('Lost words.').digest('hex'));
  });

  it('lists every page of a folder', async () => {
    const drive = fixedDrive();
    const folder = await drive.createFolder('root', 'Bower');
    for (const name of ['a.md', 'b.md', 'c.md', 'd.md', 'e.md']) await drive.createText(folder.id, name, name);
    await drive.createText('root', 'outside.md', 'not in it');
    const wire = driveV3(drive);
    expect((await adapterOn(wire).list(folder.id)).map((f) => f.name)).toEqual(['a.md', 'b.md', 'c.md', 'd.md', 'e.md']);
    expect(wire.requests.filter((r) => r.url.pathname === '/drive/v3/files').length).toBe(3);
  });

  it('keeps the token until shortly before it expires', async () => {
    const wire = driveV3();
    const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
    const first = await token.token(false);
    expect(await token.token(false)).toBe(first);
    expect(wire.tokenCalls).toBe(1);
    wire.now += 3_600_000 - 30_000;
    const second = await token.token(false);
    expect(second).not.toBe(first);
    expect(await token.token(true)).not.toBe(second);
    expect(wire.tokenCalls).toBe(3);
  });

  it('a plan read of a file changed since gives its new digest, never one kept for its older version', async () => {
    const { wire, note } = await seeded();
    const reads = adapterOn(wire).planReads();
    const first = await reads.digest(note);
    // The note changes within the few seconds a plan read is kept; the listing now shows its new modifiedTime.
    const changed = await wire.drive.writeText(note.id, 'Other words, longer than before.', note.modifiedTime);
    const now = await reads.digest(changed);
    expect(first?.sha256).toBe(createHash('sha256').update('First words.').digest('hex'));
    expect(now?.sha256).toBe(createHash('sha256').update('Other words, longer than before.').digest('hex'));
  });
});

interface Side {
  /** The stored Drive, as another client changes it. */
  outside: FakeDrive;
  get(id: string): Promise<DriveFile>;
  batch(): Promise<FencedDrive>;
  setFault(hook: FaultHook | null): void;
}

interface Step {
  name: string;
  error?: string;
  message?: string;
}

/** The fake's `fenced()` with the same still-as-seen check the adapter runs. */
function fakeSide(drive: FakeDrive): Side {
  const seen = new SeenFiles();
  let hook: FaultHook | null = null;
  let call: FencedCall | null = null;
  drive.fault = {
    before: (c) => {
      call = c;
      return hook?.before?.(c) ?? 'pass';
    },
    applied: (c) => hook?.applied?.(c),
  };
  const fenced = drive.fenced((peek) => {
    if (!call) return;
    const target = targetOf(call);
    const now = peek(target.id);
    seen.assert(target, now ? { file: now.file, trashed: now.trashed } : null);
  });
  return {
    outside: drive,
    get: async (id) => seen.note(await drive.get(id)),
    batch: async () => seen.wrap(fenced),
    setFault: (h) => {
      hook = h;
    },
  };
}

/** One run: create a folder and a note, rename, write, a refused write, a lost reply, a clash and a Bin. */
async function scenario(side: Side): Promise<{ steps: Step[]; applied: string[]; folderId: string }> {
  const steps: Step[] = [];
  const applied: string[] = [];
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      const out = await run();
      steps.push({ name });
      return out;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      steps.push({ name, error: err.code ?? 'thrown', message: err.message ?? '' });
      return null;
    }
  };
  const faults = (rules: Partial<Record<string, 'refuse' | 'lose-reply'>>): FaultHook => ({
    before: (c) => ('name' in c ? (rules[c.name] ?? 'pass') : 'pass'),
    applied: (c) => applied.push(c.op),
  });
  side.setFault(faults({}));
  await side.get('root');
  const w = await side.batch();
  const folder = await step('create folder', () => w.createFolder('root', 'Tidy'));
  const folderId = folder?.id ?? '';
  const note = await step('create note', () => w.createText(folderId, 'Note.md', 'First words.'));
  const noteId = note?.id ?? '';
  const renamed = await step('rename', () => w.update(noteId, { name: 'Renamed.md' }));
  const written = await step('write', () => w.writeText(noteId, 'Second words.', renamed?.modifiedTime ?? ''));
  side.setFault(faults({ 'Refused.md': 'refuse', 'Lost.md': 'lose-reply' }));
  await step('refused', () => w.createText(folderId, 'Refused.md', 'Never kept.'));
  await step('lost reply', () => w.createText(folderId, 'Lost.md', 'Lost words.'));
  side.setFault(faults({}));
  side.outside.touch(noteId);
  await step('clash', () => w.writeText(noteId, 'Third words.', written?.modifiedTime ?? ''));
  await side.get(noteId);
  const again = await side.batch();
  await step('bin', () => again.trash(noteId));
  return { steps, applied, folderId };
}

/** Every file below the root as stored, and the note in the Bin. */
async function visible(drive: FakeDrive): Promise<unknown> {
  const live = await drive.listAll('root');
  const binned = [];
  for (const id of ['f1', 'f2', 'f3', 'f4']) binned.push({ id, trashed: (await drive.evidence(id))?.trashed ?? null });
  return { live, binned, text: [...drive.dump().entries()] };
}
