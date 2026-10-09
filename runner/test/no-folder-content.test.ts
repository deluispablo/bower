import { afterEach, describe, expect, it, vi } from 'vitest';
import { driveEffects } from '../../src/data/spine/engine';
import type { RunnerDrive } from '../src/drive';
import type { Checkpoint } from '../../src/data/contracts/run-checkpoint';
import type { OperationV2 } from '../../src/data/contracts/run-manifest';
import type { RunManifest } from '../../src/data/spine/records';

afterEach(() => vi.restoreAllMocks());

const NOTE_PATH = 'Projects/Secret plan for Alex/Trip.md';

describe('a log holds no folder content', () => {
  it('a failed read-back logs no note path', async () => {
    const lines: string[] = [];
    const log = (...args: unknown[]): void => void lines.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    vi.spyOn(console, 'error').mockImplementation(log);
    vi.spyOn(console, 'log').mockImplementation(log);
    vi.spyOn(console, 'warn').mockImplementation(log);
    const file = { id: 'FILE_1', name: 'Trip.md', folder: false, parents: ['FOLDER_ID'], modifiedTime: '2026-10-07T09:00:00.000Z', createdTime: '2026-10-07T09:00:00.000Z' };
    const drive = {
      evidence: async () => {
        throw new Error(`Drive did not answer for file ${file.id}`);
      },
    } as unknown as RunnerDrive;
    const op = {
      operationId: 'a'.repeat(64),
      ordinal: 4,
      dependsOn: [],
      effect: {
        kind: 'edit-text',
        before: { fileId: 'FILE_1', name: 'Trip.md', parents: ['FOLDER_ID'], modifiedTime: file.modifiedTime },
        path: NOTE_PATH,
        beforeContent: { encoding: 'utf8', size: 1, sha256: 'y' },
        changes: [],
        text: 'new text',
        content: { encoding: 'utf8', size: 8, sha256: 'z' },
      },
    } as unknown as OperationV2;
    const head = { runId: 'run-1', outcomes: [] } as unknown as Checkpoint;
    expect((await driveEffects(drive).readBack(op, head, { operations: [op] } as unknown as RunManifest)).state).toBe('unreadable');
    expect(lines.length).toBeGreaterThan(0);
    const all = lines.join('\n');
    expect(all).not.toContain('Secret plan');
    expect(all).not.toContain('Trip');
    expect(all).not.toContain('Projects/');
  });
});
