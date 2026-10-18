import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { UNCONFIRMED_WRITE_MESSAGE, unconfirmedWriteError } from '../drive/drive-api';
import { DemoWorld } from '../demo/world';
import type { Scenario } from '../demo/scenario';
import { seedFakeDrive } from '../fake/seed';
import { BowerError } from '../types';
import { DriveVault } from './drive-vault';

// The new methods by name only, so this file collects before they exist.
type Step = 'added' | 'started' | 'reviewed';
type Progress = Record<Step, boolean>;
interface Marks { firstTidy(): Promise<Progress>; markFirstTidy(step: Step): Promise<Progress> }
const read = (v: unknown): Promise<Progress> => Promise.resolve().then(() => (v as Marks).firstTidy());
const mark = (v: unknown, step: Step): Promise<Progress> => Promise.resolve().then(() => (v as Marks).markFirstTidy(step));

const NONE: Progress = { added: false, started: false, reviewed: false };
const ADDED: Progress = { added: true, started: false, reviewed: false };
const STARTED: Progress = { added: true, started: true, reviewed: false };
const ALL: Progress = { added: true, started: true, reviewed: true };
const GONE = { code: 'not-found', message: 'Your Bower folder is not there any more.' };
const SAVE_FAILED = 'Your first tidy-up progress could not be saved. Try again.';
const NOW = Date.parse('2026-10-01T10:00:00Z');

const vaults: DriveVault[] = [];
const worlds: DemoWorld[] = [];

afterEach(() => {
  vaults.splice(0).forEach((v) => v.dispose());
  worlds.splice(0).forEach((w) => w.dispose());
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function vaultOver(drive: FakeDrive, root: string): DriveVault {
  const v = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  vaults.push(v);
  return v;
}

function spies(drive: FakeDrive) {
  return {
    update: vi.spyOn(drive, 'update'),
    createFolder: vi.spyOn(drive, 'createFolder'),
    createText: vi.spyOn(drive, 'createText'),
    writeText: vi.spyOn(drive, 'writeText'),
    trash: vi.spyOn(drive, 'trash'),
    untrash: vi.spyOn(drive, 'untrash'),
    generateIds: vi.spyOn(drive, 'generateIds'),
  };
}

const untouched = (s: ReturnType<typeof spies>): void => {
  for (const spy of Object.values(s)) expect(spy).not.toHaveBeenCalled();
};

async function fixture() {
  const drive = new FakeDrive();
  const root = (await drive.createFolder('root', 'Bower', { by: 'bower', keep: 'x' })).id;
  return { drive, root, vault: vaultOver(drive, root) };
}

const props = async (drive: FakeDrive, id: string) => (await drive.get(id)).appProperties ?? {};

async function lastRun(drive: FakeDrive, root: string, phase: 'reading' | 'failed' | 'done'): Promise<void> {
  const sys = (await drive.createFolder(root, '.bower')).id;
  const run = {
    id: 'run-1', scope: 'all', phase, requestedAt: NOW - 1000, phaseAt: NOW,
    ...(phase === 'failed' ? { failure: 'Something went wrong.' } : {}),
    ...(phase === 'done' ? { finishedAt: NOW, report: { filed: [], created: [], updated: [], setAside: [], questions: [] } } : {}),
  };
  await drive.createText(sys, 'last-run.json', `${JSON.stringify({ v: 1, run })}\n`);
}

describe('first tidy-up progress kept with the folder', () => {
  it('a new folder reads as incomplete', async () => {
    const { vault } = await fixture();
    await expect(read(vault)).resolves.toEqual(NONE);
  });

  it('marking a step twice is marking it once', async () => {
    const { drive, root, vault } = await fixture();
    const update = vi.spyOn(drive, 'update');
    await expect(mark(vault, 'added')).resolves.toEqual(ADDED);
    await expect(mark(vault, 'added')).resolves.toEqual(ADDED);
    expect(update).toHaveBeenCalledTimes(1);
    expect(await props(drive, root)).toMatchObject({ bowerFirstAdded: '1' });
  });

  it('a later step keeps earlier steps and unrelated properties', async () => {
    const { drive, root, vault } = await fixture();
    await expect(mark(vault, 'added')).resolves.toEqual(ADDED);
    await expect(mark(vault, 'reviewed')).resolves.toEqual(ALL);
    expect(await props(drive, root)).toMatchObject({ by: 'bower', keep: 'x', bowerFirstAdded: '1', bowerFirstReviewed: '1' });
  });

  it('out of order from a second device, both steps survive', async () => {
    const { drive, root, vault: a } = await fixture();
    const b = vaultOver(drive, root);
    await expect(mark(a, 'reviewed')).resolves.toEqual(ALL);
    await expect(mark(b, 'added')).resolves.toEqual(ALL);
    expect(await props(drive, root)).toMatchObject({ bowerFirstAdded: '1', bowerFirstReviewed: '1' });
    await expect(read(a)).resolves.toEqual(ALL);
    await expect(read(b)).resolves.toEqual(ALL);
  });

  it('a second vault reads saved progress after device storage is cleared', async () => {
    const { drive, root, vault } = await fixture();
    await expect(mark(vault, 'started')).resolves.toEqual(STARTED);
    localStorage.clear();
    sessionStorage.clear();
    await expect(read(vaultOver(drive, root))).resolves.toEqual(STARTED);
    const keys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
    expect(keys.filter((k) => /first.?tidy|bowerFirst/i.test(k))).toEqual([]);
  });

  it('a different root starts independently', async () => {
    const { drive, vault } = await fixture();
    const other = (await drive.createFolder('root', 'Bower')).id;
    await expect(mark(vault, 'added')).resolves.toEqual(ADDED);
    await expect(read(vaultOver(drive, other))).resolves.toEqual(NONE);
  });

  it('reads never create a folder', async () => {
    const drive = new FakeDrive();
    const binned = (await drive.createFolder('root', 'Bower', { by: 'bower' })).id;
    await drive.trash(binned);
    for (const root of [binned, 'no-such-folder']) {
      const vault = vaultOver(drive, root);
      const before = (await drive.listAll('root')).length;
      const s = spies(drive);
      await expect(read(vault)).rejects.toMatchObject(GONE);
      await expect(mark(vault, 'added')).rejects.toMatchObject(GONE);
      untouched(s);
      expect((await drive.listAll('root')).length).toBe(before);
      vi.restoreAllMocks();
    }
  });

  it('existing piles and a recorded run establish steps 1–2 with no write', async () => {
    const { drive, root, vault } = await fixture();
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    await drive.createText(inbox, 'Receipt.md', 'A made-up receipt.\n');
    await lastRun(drive, root, 'reading');
    const before = await props(drive, root);
    const s = spies(drive);
    await expect(read(vault)).resolves.toEqual(STARTED);
    untouched(s);
    expect(await props(drive, root)).toEqual(before);
  });

  it('a failed run alone does not establish step 3', async () => {
    const { drive, root, vault } = await fixture();
    await lastRun(drive, root, 'failed');
    await expect(read(vault)).resolves.toEqual(STARTED);
  });

  it('a completed last run does not establish step 3', async () => {
    const { drive, root, vault } = await fixture();
    await lastRun(drive, root, 'done');
    await expect(read(vault)).resolves.toEqual(STARTED);
    await expect(mark(vault, 'reviewed')).resolves.toEqual(ALL);
  });

  it('known errors keep their sentence; unknown ones say the progress sentence', async () => {
    const { drive, root, vault } = await fixture();
    const lost = new BowerError('auth', 'Sign in again to keep going.');
    vi.spyOn(drive, 'get').mockRejectedValueOnce(lost);
    await expect(mark(vault, 'added')).rejects.toBe(lost);

    const refused = new BowerError('conflict', 'Drive refused that change.');
    vi.spyOn(drive, 'update').mockRejectedValueOnce(refused);
    await expect(mark(vault, 'added')).rejects.toBe(refused);
    expect(await props(drive, root)).not.toHaveProperty('bowerFirstAdded');

    const boom = new Error('boom');
    vi.spyOn(drive, 'update').mockRejectedValueOnce(boom);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(mark(vault, 'added')).rejects.toMatchObject({ code: 'unknown', message: SAVE_FAILED });
    expect(logged).toHaveBeenCalledWith(boom);
  });

  it('an unconfirmed write is read back before claiming success (lost answer)', async () => {
    const { drive, vault } = await fixture();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const update = vi.spyOn(drive, 'update');
    drive.loseNextReply();
    await expect(mark(vault, 'started')).resolves.toMatchObject({ started: true });
    expect(update).toHaveBeenCalledTimes(1);
    await expect(mark(vault, 'started')).resolves.toMatchObject({ started: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('an unconfirmed write is read back before claiming success (read fails)', async () => {
    const { drive, vault } = await fixture();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const get = drive.get.bind(drive);
    const apply = drive.update.bind(drive);
    let sent = false;
    vi.spyOn(drive, 'get').mockImplementation(async (id, opts) => {
      if (sent) throw new Error('read lost');
      return get(id, opts);
    });
    vi.spyOn(drive, 'update').mockImplementation(async (id, patch) => {
      await apply(id, patch);
      sent = true;
      throw unconfirmedWriteError();
    });
    await expect(mark(vault, 'started')).rejects.toMatchObject({ message: UNCONFIRMED_WRITE_MESSAGE });
  });

  it('demo and fake read each scenario alike', async () => {
    const table: Array<[Scenario, Progress]> = [['default', ADDED], ['fail-run', ADDED], ['empty', NONE], ['back', STARTED]];
    for (const [scenario, expected] of table) {
      const world = new DemoWorld({ scenario, scale: 'instant', latency: 0, now: NOW });
      worlds.push(world);
      const drive = new FakeDrive();
      const root = await seedFakeDrive(drive, scenario, NOW);
      expect(root).not.toBeNull();
      await expect(read(world.sources().vault), scenario).resolves.toEqual(expected);
      await expect(read(vaultOver(drive, root ?? '')), scenario).resolves.toEqual(expected);
    }
    const first = new DemoWorld({ scenario: 'first', scale: 'instant', latency: 0, now: NOW });
    worlds.push(first);
    const { session, vault } = first.sources();
    await expect(read(vault)).rejects.toMatchObject(GONE);
    await session.createFolder(() => {});
    await expect(read(vault)).resolves.toEqual(NONE);
    const drive = new FakeDrive();
    await expect(read(vaultOver(drive, (await drive.createFolder('root', 'Bower')).id))).resolves.toEqual(NONE);
  });

  it('the demo marks once and in any order', async () => {
    const world = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0, now: NOW });
    worlds.push(world);
    const { vault } = world.sources();
    const heard = vi.fn();
    vault.subscribe(heard);
    await expect(mark(vault, 'reviewed')).resolves.toEqual(ALL);
    expect(heard).toHaveBeenCalledTimes(1);
    await expect(mark(vault, 'added')).resolves.toEqual(ALL);
    expect(heard).toHaveBeenCalledTimes(2);
    await expect(mark(vault, 'added')).resolves.toEqual(ALL);
    expect(heard).toHaveBeenCalledTimes(2);
    await expect(read(vault)).resolves.toEqual(ALL);
  });
});
