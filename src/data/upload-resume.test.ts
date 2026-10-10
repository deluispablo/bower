import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeDrive } from './drive/fake-drive';
import type { NewPile, Pile } from './types';
import * as queueModule from './upload-queue';
import type { LocksLike, UploadQueue } from './upload-queue';
import * as storeModule from './upload-store';
import type { PendingUpload, UploadStore } from './upload-store';
import * as vaultModule from './vault/drive-vault';
import type { DriveVault } from './vault/drive-vault';
import { sha256 } from './vault/hashes';
import { PROP } from './vault/layout';

const ACCOUNT = 'ACCOUNT_A';
const CHUNK = 4;
const AT = Date.parse('2026-10-10T12:00:00Z');
const clock = (): number => AT;

/** Missing APIs fail an assertion here, rather than making the suite fail to load. */
function exported<T>(module: object, key: string): T {
  const value: unknown = Reflect.get(module, key);
  expect(typeof value, `public export ${key}`).toBe('function');
  return value as T;
}

function barrier() {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
}

function present<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).toBeDefined();
  return value as T;
}

async function bytes(body: Blob | null | undefined): Promise<number[]> {
  return [...new Uint8Array(await present(body).arrayBuffer())];
}

interface Env {
  drive: FakeDrive;
  root: string;
  inbox: string;
  idb: IDBFactory;
}

interface Page {
  store: UploadStore;
  queue: UploadQueue;
  vault: DriveVault;
}

/** These sequential pages have Web Lock ownership; this is not a no-lock-policy test. */
const locks: LocksLike = { request: async (name, _options, callback) => callback({ name }) };

async function environment(): Promise<Env> {
  const drive = new FakeDrive({ chunkMultiple: CHUNK, clock });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  return { drive, root, inbox, idb: new IDBFactory() };
}

function storeFor(env: Env): UploadStore {
  return exported<typeof storeModule.indexedDbUploadStore>(storeModule, 'indexedDbUploadStore')(env.idb);
}

function page(env: Env, store = storeFor(env)): Page {
  const queue = exported<typeof queueModule.createUploadQueue>(queueModule, 'createUploadQueue')({
    drive: env.drive, store, locks, chunkSize: CHUNK, now: () => new Date(AT),
  });
  const Vault = exported<typeof vaultModule.DriveVault>(vaultModule, 'DriveVault');
  const vault = new Vault({
    drive: env.drive, rootId: async () => env.root, runningPiles: () => new Set<string>(),
    declarePiles: true, uploads: { queue, account: async () => ACCOUNT },
  });
  return { store, queue, vault };
}

function input(count: number, loose = false): NewPile {
  return {
    text: loose ? '' : 'Papers from Alex',
    items: Array.from({ length: count }, (_, i) => ({
      name: `scan-${i}.pdf`, kind: 'pdf', origin: 'From this computer',
      body: new Blob([new Uint8Array(Array.from({ length: 10 }, (_, byte) => 1 + byte + i))], { type: 'application/pdf' }),
    })),
  };
}

/** The first transfer reaches this exact chunk; no polling or elapsed-time assumption. */
function holdFirst(env: Env, offset: number) {
  const reached = barrier();
  const release = barrier();
  let session: string | null = null;
  env.drive.beforeChunk = async (call) => {
    session ??= call.session;
    if (call.session === session && call.start === offset) {
      reached.open();
      await release.wait;
    }
  };
  return { reached: reached.wait, open: release.open };
}

async function close(p: Page): Promise<void> {
  p.queue.stop();
  p.vault.dispose();
  await p.queue.idle();
  await p.vault.settled();
}

async function members(env: Env, pile: Pile) {
  const keys = new Set(pile.items.map((item) => item.id));
  return (await env.drive.listAll(env.root)).filter((file) => keys.has(file.appProperties?.[PROP.item] ?? ''));
}

async function arrived(env: Env, pile: Pile, submitted: NewPile): Promise<void> {
  const files = await members(env, pile);
  expect(files.map((file) => file.appProperties?.[PROP.item]).sort()).toEqual(pile.items.map((item) => item.id).sort());
  for (const [i, item] of pile.items.entries()) {
    const file = files.find((file) => file.appProperties?.[PROP.item] === item.id);
    expect(file, `one logical file for ${item.id}`).toBeDefined();
    const body = submitted.items[i]?.body;
    expect(body).toBeInstanceOf(Blob);
    expect([...(await env.drive.readBytes(present(file).id))]).toEqual(await bytes(body));
  }
}

/** Positive control: without an interrupted transfer, the same real app sends every member exactly once. */
async function sentControl(count: number): Promise<void> {
  const env = await environment();
  const p = page(env);
  try {
    const submitted = input(count);
    const pile = await p.vault.addPile(submitted);
    await p.vault.settled();
    await p.queue.idle();
    await arrived(env, pile, submitted);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
  } finally {
    await close(p);
  }
}

/** Positive control: a direct real queue add waits for its device transaction, even while transfer is held. */
async function committedControl(): Promise<void> {
  const env = await environment();
  const real = storeFor(env);
  const entered = barrier();
  const commit = barrier();
  const hold = holdFirst(env, 4);
  const p = page(env, { ...real, add: async (record, body) => {
    entered.open();
    await commit.wait;
    await real.add(record, body);
  } });
  let accepted = false;
  try {
    await p.queue.start(ACCOUNT, env.root);
    const body = new Blob(['0123456789']);
    const adding = p.queue.add({
      declarationId: 'DECLARATION_ID', memberKey: 'MEMBER_ID', sha256: await sha256(body),
      pileId: 'PILE_ID', parentId: env.inbox,
      name: 'scan.pdf', body,
    }).then((item) => { accepted = true; return item; });
    await entered.wait;
    // An independent IndexedDB transaction is a deterministic event-loop checkpoint, not a timer.
    expect(await real.list(ACCOUNT, env.root)).toEqual([]);
    expect(accepted).toBe(false);
    commit.open();
    await adding;
    await hold.reached;
    const records = await storeFor(env).list(ACCOUNT, env.root);
    expect(records).toHaveLength(1);
    expect(await present(await real.body(present(records[0]))).text()).toBe('0123456789');
  } finally {
    p.queue.stop();
    commit.open();
    hold.open();
    await close(p);
  }
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(clock);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

it('upload-resume-after-reload: upload save retains every member before reporting saved', async () => {
  await sentControl(2);
  const env = await environment();
  const hold = holdFirst(env, 4);
  const p = page(env);
  try {
    const submitted = input(2);
    const pile = await p.vault.addPile(submitted);
    await hold.reached;
    const records = await storeFor(env).list(ACCOUNT, env.root);
    expect(records[0]?.confirmed).toBe(4);
    expect(await bytes(await p.store.body(present(records[0])))).toEqual(await bytes(present(submitted.items[0]).body));
    expect(records.map((record) => record.memberKey).sort(), 'saved means every declared Blob is staged')
      .toEqual(pile.items.map((item) => item.id).sort());
    for (const record of records) {
      const i = pile.items.findIndex((item) => item.id === record.memberKey);
      expect(await bytes(await p.store.body(record))).toEqual(await bytes(present(submitted.items[i]).body));
    }
  } finally {
    p.queue.stop();
    hold.open();
    await close(p);
  }
});

it('upload-resume-after-reload: upload reload resumes all saved members without a picker or duplicate', async () => {
  await sentControl(2);
  await reloadCase(1, 4, false);
  await reloadCase(2, 4, false);
});

async function reloadCase(count: number, offset: number, staleOffset: boolean): Promise<void> {
  const env = await environment();
  const hold = holdFirst(env, offset);
  const first = page(env);
  let second: Page | undefined;
  try {
    const submitted = input(count);
    const pile = await first.vault.addPile(submitted);
    await hold.reached;
    const [record] = await first.store.list(ACCOUNT, env.root);
    expect(record).toMatchObject({ confirmed: offset, session: expect.any(String), fileId: expect.any(String) });
    const reserved = present(present(record).fileId);
    first.queue.stop();
    first.vault.dispose();
    hold.open();
    await first.queue.idle();
    await first.vault.settled();
    if (staleOffset) await first.store.save({ ...present(record), confirmed: 0 });
    const from = env.drive.resumableCalls.length;
    second = page(env);
    await second.vault.piles();
    // Synchronize on the real queue's public start, then idle; idle alone can precede startup.
    await second.queue.start(ACCOUNT, env.root);
    await second.queue.idle();
    const files = await members(env, pile);
    const firstFile = files.find((file) => file.appProperties?.[PROP.item] === pile.items[0]?.id);
    expect(firstFile?.id, 'the retained first member keeps its reserved identity').toBe(reserved);
    expect([...(await env.drive.readBytes(reserved))]).toEqual(await bytes(present(submitted.items[0]).body));
    const calls = env.drive.resumableCalls.slice(from);
    expect(calls[0]?.op).toBe('status');
    expect(calls.find((call) => call.op === 'put')?.start, 'Drive, not the saved offset, decides the next chunk').toBe(offset);
    expect(calls.filter((call) => call.op === 'open' && call.id === reserved)).toEqual([]);
    await second.vault.refresh();
    const rows = (await second.vault.piles()).find((p) => p.id === pile.id)?.items ?? [];
    expect(rows.filter((item) => item.chooseAgain), 'all saved members resume without another picker').toEqual([]);
    await arrived(env, pile, submitted);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
  } finally {
    first.queue.stop();
    hold.open();
    await close(first);
    if (second) await close(second);
  }
}

it('upload-resume-after-reload: upload first full read waits for retained queue hydration', async () => {
  const env = await environment();
  const hold = holdFirst(env, 4);
  const first = page(env);
  let control: Page | undefined;
  let second: Page | undefined;
  let keepWaiting: ReturnType<typeof holdFirst> | undefined;
  const hydration = barrier();
  const entered = barrier();
  try {
    const pile = await first.vault.addPile(input(1, true));
    await hold.reached;
    first.queue.stop();
    first.vault.dispose();
    hold.open();
    await first.queue.idle();
    await first.vault.settled();
    // Positive control: the same loose declaration shows a queued row once real hydration has completed.
    keepWaiting = holdFirst(env, 4);
    control = page(env);
    await control.queue.start(ACCOUNT, env.root);
    await keepWaiting.reached;
    const rows = (await control.vault.piles()).find((p) => p.id === pile.id)?.items;
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.chooseAgain).not.toBe(true);
    expect(rows?.[0]?.upload).toBeGreaterThanOrEqual(0);
    control.queue.stop();
    control.vault.dispose();
    keepWaiting.open();
    await close(control);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toHaveLength(1);
    const real = storeFor(env);
    let initial = true;
    second = page(env, { ...real, list: async (account, folder) => {
      const records = await real.list(account, folder);
      if (initial) {
        initial = false;
        entered.open();
        await hydration.wait;
      }
      return records;
    } });
    const reading = second.vault.piles();
    await entered.wait;
    // A separate committed IDB read drains the pure fake-Drive read without letting startup hydrate.
    // Releasing here also lets an implementation that correctly awaits hydration finish normally.
    expect(await storeFor(env).list(ACCOUNT, env.root)).toHaveLength(1);
    hydration.open();
    keepWaiting?.open();
    const firstRows = (await reading).find((p) => p.id === pile.id)?.items;
    expect(firstRows).toHaveLength(1);
    expect(firstRows?.[0]?.chooseAgain, 'retained bytes must not ask for a picker on the first full read').not.toBe(true);
  } finally {
    hydration.open();
    keepWaiting?.open();
    first.queue.stop();
    hold.open();
    await close(first);
    if (control) await close(control);
    if (second) await close(second);
  }
});

it('upload-resume-after-reload: accepted durable members survive generated transfer reloads', async () => {
  await sentControl(3);
  await reloadCase(1, 8, true);
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 2, max: 5 }), fc.constantFrom(4, 8), fc.boolean(),
    async (count, offset, staleOffset) => { await reloadCase(count, offset, staleOffset); },
  ), { seed: 531, numRuns: 12, examples: [[3, 8, true]] });
});

it('upload-resume-after-reload: save waits for committed bytes across generated staging barriers', async () => {
  await committedControl();
  await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (count) => {
    const env = await environment();
    const real = storeFor(env);
    const entered = barrier();
    const commit = barrier();
    const hold = holdFirst(env, 4);
    const p = page(env, { ...real, add: async (record: PendingUpload, body: Blob) => {
      entered.open();
      await commit.wait;
      await real.add(record, body);
    } });
    let accepted = false;
    try {
      const saving = p.vault.addPile(input(count)).then((pile) => { accepted = true; return pile; });
      await entered.wait;
      expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
      const savedBeforeCommit = accepted;
      commit.open();
      await saving;
      await hold.reached;
      expect(savedBeforeCommit, 'an accepted save cannot precede its pending device transaction').toBe(false);
    } finally {
      commit.open();
      p.queue.stop();
      hold.open();
      await close(p);
    }
  }), { seed: 532, numRuns: 12 });
});
