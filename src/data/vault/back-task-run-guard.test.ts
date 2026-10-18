import { afterEach, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import type { DriveApi } from '../drive/drive-api';
import { BowerError } from '../types';
import { DriveVault } from './drive-vault';

const PATH = 'Tasks.md';
const RAW = '- [ ] Call Alex\n- [x] Buy milk\n';
const vaults: DriveVault[] = [];

afterEach(() => {
  vaults.splice(0).forEach((vault) => vault.dispose());
  vi.restoreAllMocks();
  localStorage.clear();
});

async function fixture() {
  const drive = new FakeDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const file = await drive.createText(root, PATH, RAW);
  const running = new Set<string>();
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => running });
  vaults.push(vault);
  const writes = vi.spyOn(drive, 'writeText');
  const creates = vi.spyOn(drive, 'createText');
  return { drive, file, running, vault, writes, creates };
}

it.each(['*', 'unrelated-pile'])('refuses task edits during any run (%s), then ticks after it ends', async (pile) => {
  const { drive, file, running, vault, writes, creates } = await fixture();
  running.add(pile);
  await expect(vault.toggleTask(PATH, 0)).rejects.toMatchObject(new BowerError('conflict', 'Wait for the tidy-up to end.'));
  expect(writes).not.toHaveBeenCalled();
  expect(creates).not.toHaveBeenCalled();
  expect(await drive.readText(file.id)).toBe(RAW);
  expect(await vault.changes()).toEqual([]);
  running.clear();
  await vault.toggleTask(PATH, 0);
  expect(await drive.readText(file.id)).toBe(RAW.replace('[ ]', '[x]'));
});

it.each(['readText', 'get'] as const)('refuses a run starting during the awaited %s before sending a write', async (method) => {
  const { drive, file, running, vault, writes, creates } = await fixture();
  await vault.tree();
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  if (method === 'readText') {
    const original = drive.readText.bind(drive);
    vi.spyOn(drive, 'readText').mockImplementationOnce(async (id) => {
      enter();
      await held;
      return original(id);
    });
  } else {
    const original = drive.get.bind(drive);
    vi.spyOn(drive, 'get').mockImplementationOnce(async (id, opts) => {
      enter();
      await held;
      return original(id, opts);
    });
  }
  const pending = vault.toggleTask(PATH, 0);
  await entered;
  running.add('*');
  release();
  await expect(pending).rejects.toMatchObject(new BowerError('conflict', 'Wait for the tidy-up to end.'));
  expect(writes).not.toHaveBeenCalled();
  expect(creates).not.toHaveBeenCalled();
  expect(await drive.readText(file.id)).toBe(RAW);
  expect(await vault.changes()).toEqual([]);
});

it('checks the run again after the transport resend fence reads', async () => {
  const { drive, file, running, vault } = await fixture();
  const port: DriveApi = drive;
  const send = vi.fn(drive.writeText.bind(drive));
  vi.spyOn(port, 'writeText').mockImplementationOnce(async (id, text, modified, props, opts) => {
    const original = drive.get.bind(drive);
    vi.spyOn(drive, 'get').mockImplementationOnce(async (...args) => {
      const read = await original(...args);
      running.add('*');
      return read;
    });
    expect(opts?.fence).toBeTypeOf('function');
    await opts?.fence?.();
    return send(id, text, modified, props);
  });
  await expect(vault.toggleTask(PATH, 0)).rejects.toMatchObject(new BowerError('conflict', 'Wait for the tidy-up to end.'));
  expect(send).not.toHaveBeenCalled();
  expect(await drive.readText(file.id)).toBe(RAW);
  expect(await vault.changes()).toEqual([]);
});

it('keeps a task write that was sent before the run started', async () => {
  const { drive, file, running, vault, writes } = await fixture();
  const original = drive.writeText.bind(drive);
  writes.mockImplementationOnce(async (...args) => {
    const written = await original(...args);
    running.add('*');
    return written;
  });
  await vault.toggleTask(PATH, 0);
  expect(await drive.readText(file.id)).toBe(RAW.replace('[ ]', '[x]'));
  expect(await vault.changes()).toHaveLength(1);
});
