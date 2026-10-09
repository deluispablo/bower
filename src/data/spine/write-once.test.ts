/// <reference types="node" />
/**
 * One write-once rule with two cases (ARCHITECTURE, mechanism map; c2-create-by-id): a create carries an id Drive
 * reserved for it (`files.generateIds`), an update or a move carries the `bowerOp` stamp plus the checksum.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { driveError } from '../drive/drive-api';
import { updateByStamp } from './write-once';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string): string[] => readFileSync(join(ROOT, p), 'utf8').split('\n');

/** Every module that writes to the person's Drive: the app's, the run engine and its records, and the Worker's. */
const CREATES = ['src/data/vault/drive-vault.ts', 'src/data/vault/journal.ts', 'src/data/spine/engine.ts', 'src/data/spine/records.ts', 'src/data/spine/barrier.ts', 'api/src/vault.ts', 'src/data/fake/fake-worker.ts'];
/** The app's writers, the fake Worker's and the runner's repairs: each change is sent once with its stamp. */
const UPDATES = ['src/data/vault/drive-vault.ts', 'src/data/vault/journal.ts', 'src/data/fake/fake-worker.ts', 'runner/src/rules-repair.ts', 'runner/src/spine/retention.ts'];

describe('one write-once rule', () => {
  it('the app, runner and Worker write through one create-by-id and update-by-stamp helper', () => {
    const calls = (paths: string[], what: RegExp, through: RegExp): string[] =>
      paths.flatMap((p) => read(p).flatMap((line, i) => (what.test(line) && !through.test(line) ? [`${p}:${i + 1}`] : [])));
    // A create is sent only with the id reserved for it (`createById`, `makeFolder`, `makeText`).
    expect(calls(CREATES, /\.(createFolder|createText)\(/, /\bid\)/)).toEqual([]);
    // An app write to a file is sent only by the helper, with its stamp: `(op) => ...`.
    expect(calls(UPDATES, /\.(trash|untrash|update|writeText)\(/, /\(op\) =>/)).toEqual([]);
    // The run engine and the Worker make theirs through the helper itself.
    // The Worker's repair of Rules.md is sent by the helper too.
    expect(read('api/src/vault.ts').some((line) => line.includes('updateByStamp('))).toBe(true);
    for (const p of ['src/data/spine/engine.ts', 'api/src/vault.ts']) expect(read(p).some((line) => line.includes('createById(')), p).toBe(true);
    for (const p of CREATES) expect(read(p).some((line) => /from '[./a-z]*spine\/write-once(\.js)?'|from '\.\/write-once'/.test(line)), p).toBe(true);
  });
});

describe('a stamp read back', () => {
  it('a Bin after a restore in Drive is not taken as landed from its stamp alone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const f = await drive.createText(root, 'Lease.md', 'Words.');
    const lost = async (): Promise<never> => {
      throw driveError('offline');
    };
    // Binned by Bower, then restored in Drive's own page, which keeps Bower's stamp on it.
    await updateByStamp(drive, f, 'bin', (op) => drive.trash(f.id, op));
    await drive.untrash(f.id);
    // The same Bin sent again from a page that read the note before, with no answer and never landed: not landed.
    await expect(updateByStamp(drive, f, 'bin', lost)).rejects.toMatchObject({ code: 'offline' });
    // And a restore: restored by Bower, binned again in Drive's own page, then a restore that never landed.
    await drive.trash(f.id);
    const restored = await drive.get(f.id, { binned: true });
    await updateByStamp(drive, restored, 'unbin', (op) => drive.untrash(f.id, op));
    await drive.trash(f.id);
    await expect(updateByStamp(drive, restored, 'unbin', lost)).rejects.toMatchObject({ code: 'offline' });
  });
});
