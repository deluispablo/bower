/**
 * TL-P4-14 `c1-still-as-seen`: every path that checks a file is still as it was read before a write (the runner's
 * fence, the runner's admission re-read, the fake run adapter's boundary, the app's moves and renames) gives the
 * same answer for the same change, and a refusal says why by a typed reason (`cause`), never by its words.
 *
 * Drive v3's `parents` is a list of folder ids with no meaning in its order (and, since 2020, one folder at most):
 * https://developers.google.com/workspace/drive/api/guides/ref-single-parent. So a reorder is no move, and any
 * other folder in the list, first or not, is one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SeenFiles } from '../drive/seen-files';
import { takeAdmitted } from '../../../runner/src/spine/admitted';
import type { DriveFile } from '../drive/drive-api';
import { FakeDrive } from '../drive/fake-drive';
import { FakeRunDrive } from '../fake/fake-run-drive';
import type { AdmissionManifest } from '../spine/admission';
import { DriveVault } from '../vault/drive-vault';
import { BowerError } from './types';

const ROOT = join(__dirname, '..', '..', '..');

interface Folder {
  drive: FakeDrive;
  root: string;
  p1: string;
  p2: string;
  p3: string;
  id: string;
}

/** A file in two folders, as a listing gives it: `[p1, p2]`. */
async function folder(): Promise<Folder> {
  const drive = new FakeDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const [p1, p2, p3] = await Promise.all(['Home', 'Papers', 'Work'].map(async (n) => (await drive.createFolder(root, n)).id));
  if (!p1 || !p2 || !p3) throw new Error('no folders');
  const id = (await drive.createText(p1, 'Lease.pdf', '%PDF lease')).id;
  await drive.update(id, { addParent: p2 });
  return { drive, root, p1, p2, p3, id };
}

/** What happened to the file between the read and the write, and the reason the one check gives (null: still as seen). */
const SCENARIOS: Array<{ name: string; seen?: (f: DriveFile) => DriveFile; change?: (x: Folder) => Promise<void>; reason: string | null }> = [
  { name: 'unchanged', reason: null },
  { name: 'its parents listed in another order', seen: (f) => ({ ...f, parents: [...f.parents].reverse() }), reason: null },
  { name: 'its text changed elsewhere (a move or Bin carries no modifiedTime)', change: async (x) => x.drive.touch(x.id), reason: null },
  { name: 'put in a third folder too', change: async (x) => void (await x.drive.update(x.id, { addParent: x.p3 })), reason: 'parents' },
  { name: 'its second folder replaced', change: async (x) => void (await x.drive.update(x.id, { removeParent: x.p2, addParent: x.p3 })), reason: 'parents' },
  { name: 'its first folder replaced', change: async (x) => void (await x.drive.update(x.id, { removeParent: x.p1, addParent: x.p3 })), reason: 'parents' },
  { name: 'renamed', change: async (x) => void (await x.drive.update(x.id, { name: 'Lease 2.pdf' })), reason: 'name' },
  { name: 'put in the Bin', change: async (x) => void (await x.drive.trash(x.id)), reason: 'gone' },
];

interface Verdict {
  refused: boolean;
  /** The typed reason on the refusal's `cause`; 'untyped' when it has none. */
  reason: string | null;
}

const reasonOf = (e: unknown): string => {
  const cause: unknown = e instanceof BowerError ? e.cause : undefined;
  if (typeof cause === 'object' && cause !== null && (cause as { kind?: unknown }).kind === 'not-as-seen') return String((cause as { reason?: unknown }).reason);
  // A Drive read that finds it gone or in the Bin is the gone reason, as Drive says it (404).
  if (e instanceof BowerError && e.code === 'not-found') return 'gone';
  return 'untyped';
};

const thrown = async (act: () => unknown): Promise<Verdict> => {
  try {
    await act();
    return { refused: false, reason: null };
  } catch (e) {
    return { refused: true, reason: reasonOf(e) };
  }
};

class MovesAndRenames extends DriveVault {
  probe(f: DriveFile): Promise<void> {
    return this.stillAsSeen(f);
  }
}

const PATHS: Record<string, { write: boolean; check: (x: Folder, seen: DriveFile) => Promise<Verdict> }> = {
  'runner fence': {
    write: true,
    check: async (x, seen) => {
      const s = new SeenFiles();
      s.expectPlace(seen);
      const ev = await x.drive.evidence(x.id);
      return thrown(() => s.assert({ id: x.id, part: 'target' }, ev ? { file: ev.file, trashed: ev.trashed } : null));
    },
  },
  'runner admission': {
    write: false,
    check: async (x, seen) => {
      const anchor = { fileId: seen.id, name: seen.name, parents: seen.parents, modifiedTime: seen.modifiedTime };
      const manifest: AdmissionManifest = { v: 1, id: 'admission-1', rootId: x.root, scope: 'all', at: 1, piles: [{ pileId: 'p-lease', anchor, declaration: null, items: [] }], journal: [] };
      const out = await takeAdmitted(manifest, { get: (id) => x.drive.get(id) });
      return { refused: out.deferred.length > 0, reason: out.deferred[0]?.why ?? null };
    },
  },
  'fake run adapter': {
    write: true,
    check: async (x, seen) => {
      // The engine's adapter on the pretend Drive: the runner's expectation, checked in the step of the change.
      const d = new FakeRunDrive(x.drive, () => undefined);
      d.expectSeen({ fileId: seen.id, name: seen.name, parents: seen.parents, folder: seen.folder, modifiedTime: seen.modifiedTime });
      return thrown(() => d.fenced().trash(x.id));
    },
  },
  'app moves and renames': {
    write: true,
    check: async (x, seen) => {
      const vault = new MovesAndRenames({ drive: x.drive, rootId: async () => x.root, runningPiles: () => new Set() });
      return thrown(() => vault.probe(seen));
    },
  },
};

/** The write paths that once compared parents or recognised a refusal on their own. */
const WRITE_PATHS = [
  'src/data/drive/seen-files.ts',
  'runner/src/spine/admitted.ts',
  'src/data/spine/engine.ts',
  'src/data/fake/fake-run-drive.ts',
  'src/data/fake/fake-run-service.ts',
  'src/data/vault/drive-vault.ts',
  'src/data/contracts/note-edit.ts',
];

describe('every write checks one still-as-seen expectation', () => {
  for (const s of SCENARIOS) {
    it(`gives one answer on every path when the file was ${s.name}`, async () => {
      const got: Record<string, Verdict> = {};
      const want: Record<string, Verdict> = {};
      for (const [path, p] of Object.entries(PATHS)) {
        const x = await folder();
        const read = await x.drive.get(x.id);
        const seen = s.seen ? s.seen(read) : read;
        await s.change?.(x);
        const v = await p.check(x, seen);
        // Admission waits a changed pile for the next run with its own words (`changed`, `gone`); only refusals of a write carry a reason.
        got[path] = p.write ? v : { refused: v.refused, reason: null };
        want[path] = { refused: s.reason !== null, reason: p.write ? s.reason : null };
      }
      expect(got).toEqual(want);
    });
  }

  it('no write path compares parents on its own or tells a refusal by its words', () => {
    const OWN = /parents\.every\(|const sameParents|const samePlace|parents\[0\] [!=]== f\.parents\[0\]|\.message === /;
    const offenders = WRITE_PATHS.filter((p) => OWN.test(readFileSync(join(ROOT, p), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('audit-move-destination', () => {
  it('AC2 audit-move-destination-one-home: a write goes only into a folder that is there and out of the Bin', async () => {
    const { openFolder } = (await import('./still-as-seen')) as unknown as { openFolder?: (now: { folder: boolean; trashed?: boolean } | null) => boolean };
    expect(openFolder).toBeTypeOf('function');
    if (!openFolder) return;
    expect(openFolder({ folder: true })).toBe(true);
    expect(openFolder({ folder: true, trashed: false })).toBe(true);
    expect(openFolder({ folder: true, trashed: true })).toBe(false);
    expect(openFolder({ folder: false })).toBe(false);
    expect(openFolder(null)).toBe(false);
  });
});
