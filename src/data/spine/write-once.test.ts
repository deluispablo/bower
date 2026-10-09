/// <reference types="node" />
/**
 * One write-once rule with two cases (ARCHITECTURE, mechanism map; c2-create-by-id): a create carries an id Drive
 * reserved for it (`files.generateIds`), an update or a move carries the `bowerOp` stamp plus the checksum.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
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

/** Every source file under `dir` (tests aside), relative to the repository root. */
const sources = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(join(ROOT, p)).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) ? [p] : [];
  });

/**
 * Who may reserve a Drive id (TL-P4-17 addendum 1): the write-once home, the ruled batch sites (TL-P4-14 addendum 11)
 * and the upload queue until c3-reservation-upload moves it (this list may only shrink). The Drive adapters only define
 * or pass the call on.
 */
const RESERVES = new Set([
  'src/data/spine/write-once.ts',
  'src/data/spine/engine.ts', // one batch for a run's creates
  'runner/src/drive.ts', // a per-attempt pool none outlives
  'src/data/fake/fake-worker.ts', // the template's batch
  'api/src/vault.ts', // the Worker's template, which fake-worker stands in for
  'src/data/upload-queue.ts', // until c3-reservation-upload
  'src/data/drive/drive-api.ts',
  'src/data/drive/drive-http.ts',
  'src/data/drive/fake-drive.ts',
  'src/data/drive/seen-files.ts',
  'src/data/fake/fake-run-drive.ts',
]);

describe('one home for an intended create', () => {
  it('only the write-once home and the ruled batch sites reserve Drive ids', () => {
    // A reservation is a call for ids, an id set on a holder by hand, or an intent map kept outside the home.
    const reserves = /\bgenerateIds\(|\breserveId\(|\.reserved\s*(\?\?=|=(?!=))|\bintended\s*=\s*new Map\b/;
    const found = ['src', 'runner/src', 'api/src']
      .flatMap(sources)
      .filter((p) => !RESERVES.has(p))
      .flatMap((p) => read(p).flatMap((line, i) => (reserves.test(line) && !/^\s*(\*|\/\/)/.test(line) ? [`${p}:${i + 1}`] : [])));
    expect(found, 'Reserve an id for an intended create through write-once (makeOnce, Intended, reserveFor), keeping it on its holder').toEqual([]);
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
