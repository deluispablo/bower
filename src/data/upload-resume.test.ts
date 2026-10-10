import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeDrive } from './drive/fake-drive';
import type { NewPile, Pile } from './types';
import * as queueModule from './upload-queue';
import type { LocksLike, UploadQueue, UploadQueueDeps } from './upload-queue';
import * as storeModule from './upload-store';
import type { UploadStore } from './upload-store';
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

function page(env: Env, store = storeFor(env), options: Pick<UploadQueueDeps, 'locks' | 'bus'> = {}): Page {
  const queue = exported<typeof queueModule.createUploadQueue>(queueModule, 'createUploadQueue')({
    drive: env.drive, store, locks, chunkSize: CHUNK, now: () => new Date(AT), ...options,
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
  const p = page(env, { ...real, add: async (...args) => {
    entered.open();
    await commit.wait;
    await real.add(...args);
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
    expect(await present(await real.body(present(records.find((record) => record.memberKey === 'MEMBER_ID')))).text()).toBe('0123456789');
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
    const record = records.find((record) => record.memberKey === pile.items[0]?.id);
    expect(record?.confirmed).toBe(4);
    expect(await bytes(await p.store.body(present(record)))).toEqual(await bytes(present(submitted.items[0]).body));
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
    const record = (await first.store.list(ACCOUNT, env.root)).find((record) => record.memberKey === pile.items[0]?.id);
    expect(record).toMatchObject({ confirmed: offset, session: expect.any(String), fileId: expect.any(String) });
    const generation = await first.store.captureForgetVersion(present(record));
    const reserved = present(present(record).fileId);
    first.queue.stop();
    first.vault.dispose();
    hold.open();
    await first.queue.idle();
    await first.vault.settled();
    if (staleOffset) await first.store.save({ ...present(record), confirmed: 0 }, generation);
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
    const calls = env.drive.resumableCalls.slice(from)
      .filter((call) => call.session === present(record).session || call.id === reserved);
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

/** Keep the first folder-declaration answer outstanding across the real resumed transfer. */
async function declarationArrivalCase(completeDuringRead: boolean): Promise<void> {
  const env = await environment();
  const hold = holdFirst(env, 4);
  const first = page(env);
  const entered = barrier();
  const declarationAnswer = barrier();
  let resumed: ReturnType<typeof holdFirst> | undefined;
  let second: Page | undefined;
  let readSpy: ReturnType<typeof vi.spyOn> | undefined;
  try {
    const submitted = input(1);
    const pile = await first.vault.addPile(submitted);
    expect(pile.path).toBeDefined();
    await hold.reached;
    const record = present((await first.store.list(ACCOUNT, env.root))
      .find((item) => item.memberKey === pile.items[0]?.id));
    expect(record).toMatchObject({ confirmed: 4, session: expect.any(String), fileId: expect.any(String) });
    first.queue.stop();
    first.vault.dispose();
    hold.open();
    await close(first);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toHaveLength(1);
    expect(await members(env, pile)).toEqual([]);
    const declaration = present((await env.drive.listAll(env.root)).find((file) =>
      file.appProperties?.[PROP.recordPile] === pile.id && file.appProperties?.[PROP.recordAnchor] === 'folder'));
    const readBytes = env.drive.readBytes.bind(env.drive);
    let initial = true;
    readSpy = vi.spyOn(env.drive, 'readBytes').mockImplementation(async (id) => {
      const body = await readBytes(id);
      if (id === declaration.id && initial) {
        initial = false;
        entered.open();
        await declarationAnswer.wait;
      }
      return body;
    });
    resumed = holdFirst(env, 4);
    second = page(env);
    const reading = second.vault.piles();
    await Promise.all([entered.wait, resumed.reached]);
    expect(await members(env, pile)).toEqual([]);
    expect(second.queue.items().find((item) => item.memberKey === record.memberKey)?.state).toBe('uploading');
    if (completeDuringRead) {
      resumed.open();
      await second.queue.idle();
      await arrived(env, pile, submitted);
      expect((await members(env, pile))[0]?.id).toBe(record.fileId);
      expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
      expect(second.queue.items().find((item) => item.memberKey === record.memberKey)?.state).toBe('done');
    }
    declarationAnswer.open();
    const row = present((await reading).find((item) => item.id === pile.id));
    expect({
      picker: row.items.filter((item) => item.id === record.memberKey && item.chooseAgain),
      notArrived: row.setAside === 'not-arrived',
    }, 'the first full read must account for the retained or just-arrived member').toEqual({
      picker: [], notArrived: false,
    });
    if (!completeDuringRead) {
      const pending = present(row.items.find((item) => item.id === record.memberKey));
      expect(pending.upload).toBeGreaterThanOrEqual(0);
      resumed.open();
      await second.queue.idle();
      await arrived(env, pile, submitted);
      expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
    }
  } finally {
    first.queue.stop();
    second?.queue.stop();
    hold.open();
    resumed?.open();
    declarationAnswer.open();
    await close(first);
    if (second) await close(second);
    readSpy?.mockRestore();
  }
}

it('upload-resume-after-reload: fix 1 control: a member still pending during the first declaration read needs no picker', async () => {
  await declarationArrivalCase(false);
});

it('upload-resume-after-reload: fix 1: a member that arrives during the first declaration read needs no picker', async () => {
  await declarationArrivalCase(true);
});

/** An actual owner finishes retained bytes; its bus wakes the non-owning real queue. */
async function otherTabDeclarationArrivalCase(resolveReadBack: boolean): Promise<void> {
  const env = await environment();
  const hold = holdFirst(env, 4);
  const first = page(env);
  const entered = barrier();
  const declarationAnswer = barrier();
  const readBackEntered = barrier();
  const readBackAnswer = barrier();
  const reconciled = barrier();
  let observer: Page | undefined;
  let owner: Page | undefined;
  let resumed: ReturnType<typeof holdFirst> | undefined;
  let unsubscribe = (): void => undefined;
  let onCompletion = (): void => undefined;
  let completionBroadcast = false;
  try {
    const submitted = input(1);
    const pile = await first.vault.addPile(submitted);
    expect(pile.path).toBeDefined();
    await hold.reached;
    const record = present((await first.store.list(ACCOUNT, env.root))
      .find((item) => item.memberKey === pile.items[0]?.id));
    expect(record).toMatchObject({ confirmed: 4, session: expect.any(String), fileId: expect.any(String) });
    first.queue.stop();
    first.vault.dispose();
    hold.open();
    await close(first);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toHaveLength(1);
    expect(await members(env, pile)).toEqual([]);
    const declaration = present((await env.drive.listAll(env.root)).find((file) =>
      file.appProperties?.[PROP.recordPile] === pile.id && file.appProperties?.[PROP.recordAnchor] === 'folder'));
    const readBytes = env.drive.readBytes.bind(env.drive);
    let initial = true;
    vi.spyOn(env.drive, 'readBytes').mockImplementation(async (id) => {
      const body = await readBytes(id);
      if (id === declaration.id && initial) {
        initial = false;
        entered.open();
        await declarationAnswer.wait;
      }
      return body;
    });
    const getUploaded = env.drive.getUploaded.bind(env.drive);
    vi.spyOn(env.drive, 'getUploaded').mockImplementation(async (id) => {
      // The owner uses the same real Drive read-back before broadcasting completion.
      // Only reconciliation in the non-owning queue is held here.
      if (id === record.fileId && completionBroadcast) {
        readBackEntered.open();
        await readBackAnswer.wait;
      }
      return getUploaded(id);
    });
    observer = page(env, storeFor(env), {
      locks: { request: async (_name, _options, callback) => callback(null) },
      bus: { post: () => undefined, listen: (listener) => { onCompletion = listener; } },
    });
    unsubscribe = observer.queue.subscribe(() => {
      if (observer?.queue.items().some((item) => item.memberKey === record.memberKey && item.file)) reconciled.open();
    });
    let firstResult: Pile[] | undefined;
    const reading = observer.vault.piles().then((rows) => { firstResult = rows; return rows; });
    await entered.wait;
    expect(await observer.queue.start(ACCOUNT, env.root)).toBe('other-tab');
    expect(observer.queue.items().find((item) => item.memberKey === record.memberKey))
      .toMatchObject({ state: 'waiting', fileId: record.fileId });
    resumed = holdFirst(env, 4);
    owner = page(env, storeFor(env), {
      bus: { post: () => { completionBroadcast = true; onCompletion(); }, listen: () => undefined },
    });
    expect(await owner.queue.start(ACCOUNT, env.root)).toBe('owner');
    await resumed.reached;
    expect(await members(env, pile)).toEqual([]);
    resumed.open();
    await owner.queue.idle();
    await readBackEntered.wait;
    await arrived(env, pile, submitted);
    expect((await members(env, pile))[0]?.id).toBe(record.fileId);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
    expect(firstResult).toBeUndefined();
    expect(observer.queue.items().find((item) => item.memberKey === record.memberKey)?.file).toBeUndefined();
    if (resolveReadBack) {
      readBackAnswer.open();
      await reconciled.wait;
      expect(observer.queue.items().find((item) => item.memberKey === record.memberKey)?.file?.id).toBe(record.fileId);
    }
    declarationAnswer.open();
    // A committed IDB transaction drains the listing's microtasks while read-back is still held.
    // A fix may either return a queued row now or wait for read-back and return the arrived row.
    expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
    const beforeReadBack = firstResult;
    readBackAnswer.open();
    await reconciled.wait;
    const rows = beforeReadBack ?? await reading;
    const row = present(rows.find((item) => item.id === pile.id));
    expect({
      picker: row.items.filter((item) => item.id === record.memberKey && item.chooseAgain),
      notArrived: row.setAside === 'not-arrived',
    }, 'completion broadcast must leave the member queued or seen as arrived on the first full read').toEqual({
      picker: [], notArrived: false,
    });
    const member = present(row.items.find((item) => item.id === record.memberKey || item.id === record.fileId));
    if (member.id === record.memberKey) expect(member.upload).toBeGreaterThanOrEqual(0);
    else expect(member.id).toBe(record.fileId);
    await reading;
    await arrived(env, pile, submitted);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
  } finally {
    first.queue.stop();
    observer?.queue.stop();
    owner?.queue.stop();
    hold.open();
    resumed?.open();
    declarationAnswer.open();
    readBackAnswer.open();
    unsubscribe();
    await close(first);
    if (observer) await close(observer);
    if (owner) await close(owner);
  }
}

it('upload-resume-after-reload: fix 2: other-tab completion with pending read-back', async () => {
  await otherTabDeclarationArrivalCase(false);
});

it('upload-resume-after-reload: fix 2: other-tab completion with resolved read-back', async () => {
  await otherTabDeclarationArrivalCase(true);
});

it('upload-resume-after-reload: fix 2: same-tab completion', async () => {
  await declarationArrivalCase(true);
});

/** Reload before/after the later sibling's reservation, then take the same queue into Use here. */
async function siblingTakeoverCase(hydrateBeforeReservation: boolean): Promise<void> {
  const env = await environment();
  const firstChunk = barrier();
  const releaseFirst = barrier();
  const laterChunk = barrier();
  const releaseLater = barrier();
  let firstSession: string | undefined;
  env.drive.beforeChunk = async (call) => {
    firstSession ??= call.session;
    if (call.start !== 4) return;
    if (call.session === firstSession) {
      firstChunk.open();
      await releaseFirst.wait;
    } else {
      laterChunk.open();
      await releaseLater.wait;
    }
  };
  let onCompletion: Parameters<NonNullable<UploadQueueDeps['bus']>['listen']>[0] = () => undefined;
  let ownerFinished = false;
  let completions = 0;
  const owner = page(env, storeFor(env), {
    bus: { post: (completion) => {
      completions += 1;
      ownerFinished = completions === 2;
      onCompletion(completion);
    }, listen: () => undefined },
  });
  let observer: Page | undefined;
  let canOwn = false;
  const firstReconciled = barrier();
  const readBackEntered = barrier();
  const readBackAnswer = barrier();
  const readBacks: string[] = [];
  let unsubscribe = (): void => undefined;
  try {
    const submitted = input(2);
    const pile = await owner.vault.addPile(submitted);
    await firstChunk.wait;
    const firstKey = present(pile.items[0]).id;
    const laterKey = present(pile.items[1]).id;
    const staged = await storeFor(env).list(ACCOUNT, env.root);
    expect(staged).toHaveLength(2);
    expect(present(staged.find((record) => record.memberKey === laterKey)).fileId).toBeNull();
    if (!hydrateBeforeReservation) {
      releaseFirst.open();
      await laterChunk.wait;
    }
    observer = page(env, storeFor(env), {
      locks: { request: async (name, _options, callback) => callback(canOwn ? { name } : null) },
      bus: { post: () => undefined, listen: (listener) => { onCompletion = listener; } },
    });
    await observer.vault.piles();
    expect(await observer.queue.start(ACCOUNT, env.root)).toBe('other-tab');
    const hydrated = present(observer.queue.items().find((item) => item.memberKey === laterKey));
    expect(hydrated).toMatchObject({ state: 'waiting', sent: hydrateBeforeReservation ? 0 : 4 });
    if (hydrateBeforeReservation) expect(hydrated.fileId).toBeNull();
    else expect(hydrated.fileId).toEqual(expect.any(String));
    unsubscribe = observer.queue.subscribe(() => {
      if (observer?.queue.items().some((item) => item.memberKey === firstKey && item.state === 'done')) {
        firstReconciled.open();
      }
    });
    if (hydrateBeforeReservation) {
      releaseFirst.open();
      await laterChunk.wait;
      await firstReconciled.wait;
      // Let the first completion's refresh settle before the owner removes the later record.
      await storeFor(env).list(ACCOUNT, env.root);
      expect(observer.queue.items().find((item) => item.memberKey === laterKey)?.fileId).toBeNull();
    }
    const reserved = present(present((await storeFor(env).list(ACCOUNT, env.root))
      .find((record) => record.memberKey === laterKey)).fileId);
    const getUploaded = env.drive.getUploaded.bind(env.drive);
    vi.spyOn(env.drive, 'getUploaded').mockImplementation(async (id) => {
      const observerRead = ownerFinished && id === reserved;
      if (observerRead) readBacks.push(id);
      const file = await getUploaded(id);
      if (observerRead) {
        readBackEntered.open();
        await readBackAnswer.wait;
      }
      return file;
    });
    releaseLater.open();
    await owner.queue.idle();
    await owner.vault.settled();
    await arrived(env, pile, submitted);
    expect((await members(env, pile)).find((file) => file.appProperties?.[PROP.item] === laterKey)?.id).toBe(reserved);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
    // Use here pauses the old generation and starts this same account/folder with retained queue entries.
    await close(owner);
    ownerFinished = true;
    observer.queue.pause();
    canOwn = true;
    const operations = env.drive.resumableCalls.length;
    expect(await observer.queue.start(ACCOUNT, env.root)).toBe('owner');
    // A committed IDB transaction checkpoints takeover without waiting on a missing read-back at HEAD.
    await storeFor(env).list(ACCOUNT, env.root);
    if (readBacks.includes(reserved)) await readBackEntered.wait;
    const beforeAnswer = present(observer.queue.items().find((item) => item.memberKey === laterKey));
    let offeredBeforeReadBack: Pile[] | undefined;
    const reading = observer.vault.piles().then((rows) => { offeredBeforeReadBack = rows; return rows; });
    await storeFor(env).list(ACCOUNT, env.root);
    const earlyRow = offeredBeforeReadBack?.find((item) => item.id === pile.id);
    readBackAnswer.open();
    await reading;
    await observer.queue.idle();
    const row = present((await observer.vault.piles()).find((item) => item.id === pile.id));
    const sibling = present(observer.queue.items().find((item) => item.memberKey === laterKey));
    expect({
      reconciledByMember: sibling.id === hydrated.id && sibling.file?.appProperties?.[PROP.item] === laterKey,
      confirmed: sibling.state === 'done' && sibling.file?.id === reserved && sibling.sent === sibling.size,
      readBackByReservedId: readBacks.includes(reserved),
      heldBeforeReadBack: !beforeAnswer.gone && beforeAnswer.error === undefined,
      picker: row.items.filter((item) => item.chooseAgain),
      notArrived: row.setAside === 'not-arrived',
      offeredPickerBeforeReadBack: earlyRow?.items.some((item) => item.chooseAgain) ?? false,
      offeredNotArrivedBeforeReadBack: earlyRow?.setAside === 'not-arrived',
      secondCreate: env.drive.resumableCalls.slice(operations).filter((call) => call.op === 'open' || call.op === 'generateIds'),
    }, 'member identity must recover the unseen reservation before takeover offers a picker or another create').toEqual({
      reconciledByMember: true, confirmed: true, readBackByReservedId: true, heldBeforeReadBack: true,
      picker: [], notArrived: false,
      offeredPickerBeforeReadBack: false, offeredNotArrivedBeforeReadBack: false, secondCreate: [],
    });
    await arrived(env, pile, submitted);
    expect(env.drive.resumableCalls.filter((call) => call.op === 'open')).toHaveLength(2);
    expect(await storeFor(env).list(ACCOUNT, env.root)).toEqual([]);
  } finally {
    owner.queue.stop();
    observer?.queue.stop();
    releaseFirst.open();
    releaseLater.open();
    readBackAnswer.open();
    unsubscribe();
    await close(owner);
    if (observer) await close(observer);
  }
}

it('upload-resume-after-reload: fix 3 control: two-tab reload after reservation needs no picker and no second create', async () => {
  await siblingTakeoverCase(false);
});

it('upload-resume-after-reload: fix 3: two-tab reload, completion and takeover need no picker and no second create', async () => {
  await siblingTakeoverCase(true);
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
    const p = page(env, { ...real, add: async (...args) => {
      entered.open();
      await commit.wait;
      await real.add(...args);
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
