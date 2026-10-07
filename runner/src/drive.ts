/** The runner's fenced Drive (stub). */
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FaultHook, FencedDrive } from '../../src/data/drive/fake-drive';
import type { RunnerToken } from './token';

export interface RunnerDriveOptions {
  token: RunnerToken;
  /** This runner's attempt, from its dispatch. */
  attempt: number;
  fetch?: typeof fetch;
}

export class RunnerDrive {
  fault: FaultHook | null = null;

  constructor(readonly opts: RunnerDriveOptions) {}

  async get(id: string): Promise<DriveFile> {
    return { id, name: '', folder: false, parents: [], modifiedTime: '', createdTime: '' };
  }

  async list(_parentId: string): Promise<DriveFile[]> {
    return [];
  }

  async readText(_id: string): Promise<string> {
    return '';
  }

  async md5(_id: string): Promise<string> {
    return '';
  }

  async batch(): Promise<FencedDrive> {
    const none = (id: string): DriveFile => ({ id, name: '', folder: false, parents: [], modifiedTime: '', createdTime: '' });
    return {
      createFolder: async () => none(''),
      createText: async () => none(''),
      update: async (id) => none(id),
      trash: async () => undefined,
      writeText: async (id) => none(id),
    };
  }
}
