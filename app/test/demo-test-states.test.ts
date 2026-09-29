/**
 * The demo's test states (#735): an empty folder, an empty inbox, a tree of
 * more than 150 rows and a run in each state.
 */

import { describe, expect, it } from 'vitest';

import {
  DEMO_RUN_STATES,
  EMPTY_FOLDER,
  EMPTY_INBOX_FILES,
  FIXTURE_FILES,
  FIXTURE_FOLDERS,
  LONG_TREE_FILES,
  LONG_TREE_FOLDER,
} from '../src/demo/fixture.js';
import { pendingCount } from '../src/navigation.js';
import type { DriveFile } from '../src/drive.js';

function asDriveFile(path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id: path, name, path, mimeType: 'text/markdown' } as DriveFile;
}

describe('demo test states', () => {
  it('has a folder with nothing in it', () => {
    expect(FIXTURE_FOLDERS).toContain(EMPTY_FOLDER);
    expect(
      FIXTURE_FILES.some((file) => file.path.startsWith(`${EMPTY_FOLDER}/`)),
    ).toBe(false);
  });

  it('has an inbox with nothing waiting, and the normal one still has items', () => {
    expect(
      pendingCount(FIXTURE_FILES.map((file) => asDriveFile(file.path))),
    ).toBeGreaterThan(0);
    expect(
      pendingCount(EMPTY_INBOX_FILES.map((file) => asDriveFile(file.path))),
    ).toBe(0);
    expect(EMPTY_INBOX_FILES.length).toBeGreaterThan(20);
  });

  it('has a tree over 150 rows', () => {
    expect(LONG_TREE_FILES.length).toBeGreaterThan(150);
    expect(
      LONG_TREE_FILES.every((file) =>
        file.path.startsWith(`${LONG_TREE_FOLDER}/`),
      ),
    ).toBe(true);
    const paths = LONG_TREE_FILES.map((file) => file.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('holds a run running, done, partly done and failed', () => {
    expect(DEMO_RUN_STATES.running.state).toBe('running');
    expect(DEMO_RUN_STATES.running.phase).toBeDefined();
    expect(DEMO_RUN_STATES.done.state).toBe('done');
    expect(DEMO_RUN_STATES.partial.state).toBe('failed');
    expect(DEMO_RUN_STATES.partial.items?.length).toBeGreaterThan(0);
    expect(DEMO_RUN_STATES.failed.state).toBe('failed');
    expect(DEMO_RUN_STATES.failed.items).toBeUndefined();
  });
});
