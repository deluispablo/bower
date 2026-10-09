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

/** A source file to look through: its path from the repository root and its text. */
type Source = { path: string; text: string };

const HOME = 'src/data/spine/write-once.ts';
/** Drive's own call for ids (`files.generateIds`) and the home's call for one. */
const RESERVING = new Set(['generateIds', 'reserveId']);

/**
 * Where a reservation for an intended create is made or kept by hand, read from the code's syntax (TypeScript's own
 * parser), never from a field's name: the home's ports (its exported interfaces) say what the id's slot is called.
 * 1. a call for ids, or the call passed on (`generateIds`, `reserveId`), by any receiver or alias;
 * 2. the slot set, cleared or given by hand (`h.reserved = id`, `h['reserved'] = id`, `delete h.reserved`, `{ reserved: id }`);
 * 3. a store kept beyond one call (a class field or a module's own) that maps a key to an intended create: a Map whose
 *    values are a holder (a type with a slot for an id, or built on a port) or what a holder always carries (a line);
 * 4. the slot's id put in a store by hand (`ids.set(key, h.reserved)`).
 */
function reservationSites(files: readonly Source[]): string[] {
  // The line rule as it stood (P4-39): a call for ids, an id set on a holder, or a field named `intended`.
  const reserves = /\bgenerateIds\(|\breserveId\(|\.reserved\s*(\?\?=|=(?!=))|\bintended\s*=\s*new Map\b/;
  return files.filter((f) => f.path !== HOME).flatMap((f) => f.text.split('\n').flatMap((line, i) => (reserves.test(line) && !/^\s*(\*|\/\/)/.test(line) ? [`${f.path}:${i + 1} reserves`] : [])));
}

/** Every source file Bower runs, tests aside. */
const ALL = (): Source[] => ['src', 'runner/src', 'api/src'].flatMap(sources).map((path) => ({ path, text: read(path).join('\n') }));
/** How many reservation sites each file has, from `reservationSites`. */
const count = (sites: readonly string[]): Record<string, number> =>
  sites.reduce<Record<string, number>>((n, s) => {
    const p = s.slice(0, s.indexOf(':'));
    n[p] = (n[p] ?? 0) + 1;
    return n;
  }, {});

/**
 * Who may reserve a Drive id outside the home (TL-P4-17 addendum 1), and at how many sites: the ruled batch sites
 * (TL-P4-14 addendum 11), the Drive adapters that pass the call on, and the upload queue until c3-reservation-upload.
 * A ratchet, as the duplication baseline: a site more fails, and a site fewer fails until its number is lowered here.
 * This list may only shrink.
 */
const ALLOWED: Record<string, number> = {
  'src/data/spine/engine.ts': 2, // one batch for a run's creates; one id for a create the batch did not cover
  'runner/src/drive.ts': 3, // a per-attempt pool none outlives, and the fenced create that carries its id
  'src/data/fake/fake-worker.ts': 1, // the template's batch
  'api/src/vault.ts': 5, // the Worker's template, which fake-worker stands in for (the lead rules on it)
  'src/data/upload-queue.ts': 4, // until c3-reservation-upload
  'src/data/drive/seen-files.ts': 1, // passes the call on
  'src/data/fake/fake-run-drive.ts': 1, // passes the call on
  'src/data/drive/fake-drive.ts': 6, // the pretend Drive: its reserved ids and the creates that carry them
};

describe('one home for an intended create', () => {
  it('only the write-once home and the ruled batch sites reserve Drive ids', () => {
    const sites = reservationSites(ALL());
    const outside = sites.filter((s) => !(s.slice(0, s.indexOf(':')) in ALLOWED));
    expect(outside, 'Reserve an id for an intended create through write-once (makeOnce, Intended, reserveFor), keeping it on its holder').toEqual([]);
    expect(count(sites), 'A ratchet: a site more fails; a site fewer, lower its number in ALLOWED').toEqual(ALLOWED);
  });

  it('a renamed intent map, an id set or stored by hand, or the call for ids by another name is found by what it does', () => {
    const fixture = (path: string, text: string): string[] =>
      reservationSites([...ALL(), { path, text }]).filter((s) => s.startsWith(`${path}:`)).map((s) => s.slice(path.length + 1));
    // The drift at journal.ts:166, renamed: an intent -> line map kept outside the home.
    expect(fixture('src/data/vault/renamed.ts', "import type { JournalRecord } from './journal';\nexport class Journal {\n  private intents = new Map<string, JournalRecord>();\n}\n")).toEqual(['3 keeps intended creates outside the home']);
    // An intent -> id map, filled from a holder's slot.
    expect(fixture('src/data/vault/ids.ts', "import type { Holder } from '../spine/write-once';\nexport class Ids {\n  private readonly idFor = new Map<string, string>();\n  keep(intent: string, h: Holder): void { this.idFor.set(intent, h.reserved ?? ''); }\n}\n")).toEqual(['4 stores an id by hand']);
    // The slot set or cleared by hand, by any spelling, and the call for ids by an alias.
    expect(fixture('src/data/vault/hand.ts', "export function hand(w: { reserved?: string }, id: string, d: { generateIds(n: number): Promise<string[]> }): void {\n  w['reserved'] = id;\n  delete w.reserved;\n  const more = d['generateIds'];\n  void more;\n}\n")).toEqual(['2 sets an id by hand', '3 lets an id go by hand', '4 calls for ids']);
    // Not a reservation: a map of numbers named `intended`, a map made for one call, the slot read.
    expect(fixture('src/data/vault/fine.ts', "import type { JournalRecord } from './journal';\nexport class Fine {\n  private intended = new Map<string, number>();\n  list(all: JournalRecord[], h: { reserved?: string }): number {\n    const byId = new Map<string, JournalRecord>(all.map((r) => [r.id, r]));\n    return byId.size + (h.reserved ? 1 : 0) + this.intended.size;\n  }\n}\n")).toEqual([]);
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
