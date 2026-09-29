import { describe, expect, it, vi } from 'vitest';

import {
  folderState,
  isRecoverReason,
  putItBack,
  stateOfError,
  stateOfFile,
} from '../src/folder-state.js';

const OK = {
  id: 'FOLDER_ID',
  trashed: false,
  capabilities: { canAddChildren: true },
};

describe('stateOfFile', () => {
  it('reads a live folder as ok', () => {
    expect(stateOfFile(OK)).toBe('ok');
  });
  it('reads trashed as trashed, before anything else', () => {
    expect(stateOfFile({ ...OK, trashed: true, driveId: 'D' })).toBe('trashed');
  });
  it('reads canAddChildren false as no-access', () => {
    expect(
      stateOfFile({ ...OK, capabilities: { canAddChildren: false } }),
    ).toBe('no-access');
  });
  it('reads a driveId (a shared drive) as no-access', () => {
    expect(stateOfFile({ ...OK, driveId: 'DRIVE_ID' })).toBe('no-access');
  });
  it('reads a body it cannot use as unknown', () => {
    expect(stateOfFile(null)).toBe('unknown');
  });
});

describe('stateOfError', () => {
  it('maps 404 to missing', () => {
    expect(stateOfError({ status: 404 })).toBe('missing');
  });
  it.each([403, 500, 503, 0])('maps %i to unknown', (status) => {
    expect(stateOfError({ status })).toBe('unknown');
  });
});

describe('folderState', () => {
  it('asks Drive for the folder and reads the answer', async () => {
    const get = vi.fn().mockResolvedValue(OK);
    expect(await folderState('FOLDER_ID', get)).toBe('ok');
    expect(get).toHaveBeenCalledWith('FOLDER_ID');
  });
  it('404 is missing', async () => {
    const get = vi.fn().mockRejectedValue({ status: 404 });
    expect(await folderState('FOLDER_ID', get)).toBe('missing');
  });
  it('403, 5xx and offline are unknown, never thrown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const status of [403, 502, 0]) {
      const get = vi.fn().mockRejectedValue({ status });
      expect(await folderState('FOLDER_ID', get)).toBe('unknown');
    }
  });
});

describe('putItBack', () => {
  it('un-trashes, re-reads, and answers ok', async () => {
    const untrash = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue(OK);
    expect(await putItBack('FOLDER_ID', { untrash, get })).toBe('ok');
    expect(untrash).toHaveBeenCalledWith('FOLDER_ID');
  });
  it('stays missing when the folder is still gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const untrash = vi.fn().mockRejectedValue({ status: 404 });
    const get = vi.fn();
    expect(await putItBack('FOLDER_ID', { untrash, get })).toBe('missing');
    expect(get).not.toHaveBeenCalled();
  });
  it('stays trashed when the untrash fails otherwise', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const untrash = vi.fn().mockRejectedValue({ status: 500 });
    expect(await putItBack('FOLDER_ID', { untrash })).toBe('trashed');
  });
  it('does not answer ok when the re-read still says trashed', async () => {
    const untrash = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ ...OK, trashed: true });
    expect(await putItBack('FOLDER_ID', { untrash, get })).toBe('trashed');
  });
});

describe('isRecoverReason', () => {
  it('knows the three reasons only', () => {
    expect(isRecoverReason('trashed')).toBe(true);
    expect(isRecoverReason('ok')).toBe(false);
  });
});
