/// <reference types="node" />
/**
 * One write-once rule with two cases (ARCHITECTURE, mechanism map; c2-create-by-id): a create carries an id Drive
 * reserved for it (`files.generateIds`), an update or a move carries the `bowerOp` stamp plus the checksum.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module, the rule ESLint runs
import { ALLOWED, ALLOWED_MAX, reservationConfig, SELECTORS } from '../../../scripts/eslint-reservation.mjs';
import { FakeDrive } from '../drive/fake-drive';
import { driveError, driveFailure, type DriveFile } from '../drive/drive-api';
import { DriveVault } from '../vault/drive-vault';
import { seedFakeDrive } from '../fake/seed';
import * as home from './write-once';
import { makeOnce, sentAs, updateByStamp, type Holder, type Sent } from './write-once';

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
    // An app write to a file is sent only by the helper, with its stamp: `(op) => ...`, or `(op, fence) => ...` when
    // it also takes the fence for a resend (TL-P4-24 finding 1).
    expect(calls(UPDATES, /\.(trash|untrash|update|writeText)\(/, /\(op(, fence)?\) =>/)).toEqual([]);
    // The run engine and the Worker make theirs through the helper itself.
    // The Worker's repair of Rules.md is sent by the helper too.
    expect(read('api/src/vault.ts').some((line) => line.includes('updateByStamp('))).toBe(true);
    expect(read('src/data/spine/engine.ts').some((line) => line.includes('createById(')), 'engine.ts').toBe(true);
    // The Worker's template, as the fake Worker's: each create through the home's makers, its id kept on the holder.
    for (const maker of ['makeOnce(', 'makeFolder(', 'makeText(']) expect(read('api/src/vault.ts').some((line) => line.includes(maker)), maker).toBe(true);
    for (const p of CREATES) expect(read(p).some((line) => /from '[./a-z]*spine\/write-once(\.js)?'|from '\.\/write-once'/.test(line)), p).toBe(true);
  });
});

/**
 * Who may reserve a Drive id outside the home is an ESLint rule (scripts/eslint-reservation.mjs, run by `pnpm lint` over
 * every file, TL-P4-17 addendum 4). These tests feed the rule sample source and read its allowlist; none scans the repo.
 */
const flagged = (text: string, filename = 'src/data/vault/sample.ts'): string[] =>
  new Linter({ configType: 'flat' })
    .verify(text, [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser }, rules: { 'no-restricted-syntax': ['error', ...(SELECTORS as { selector: string; message: string }[])] } }], { filename })
    .map((m) => `${m.line} ${m.message.slice(0, m.message.indexOf(':'))}`);

describe('one home for an intended create', () => {
  it('only the write-once home and the ruled batch sites reserve Drive ids', () => {
    // A site outside the home is found; the rule is off only for the files its allowlist names, and that list only shrinks.
    expect(flagged('export const ids = (d: Drive) => d.generateIds(1);\n')).toEqual(['1 calls for ids']);
    const lists = ALLOWED as Record<string, string[]>;
    const config = (pkg: string): { ignores: string[] } => reservationConfig(pkg) as { ignores: string[] };
    for (const pkg of ['root', 'api', 'runner']) for (const path of lists[pkg] ?? []) expect(config(pkg).ignores, `${pkg}/${path}`).toContain(path);
    const paths = Object.entries(lists).flatMap(([pkg, files]) => files.map((f) => (pkg === 'root' ? f : `${pkg}/${f}`)));
    expect(paths.filter((p) => !existsSync(join(ROOT, p))), 'A file that is gone: delete its line from ALLOWED').toEqual([]);
    expect(paths.length, 'The allowlist may only shrink: lower ALLOWED_MAX with it').toBeLessThanOrEqual(ALLOWED_MAX as number);
    expect(ALLOWED_MAX).toBeLessThanOrEqual(7);
  });

  it('the rule targets the primitive, not the names of what holds an id', () => {
    expect((SELECTORS as { selector: string }[]).map((r) => r.selector).join(' ')).not.toMatch(/Holder|Intended|JournalRecord|Sending|reserved/);
    // Each spelling of a reserve or a create by a reserved id is found, whatever holds the id.
    expect(flagged("export const go = (w: Gate, id: string) => createById(id, send, find);\n")).toEqual(['1 calls for ids']);
    expect(flagged("export const go = async (w: Gate) => (await reserveId(w));\n")).toEqual(['1 calls for ids']);
    expect(flagged("export class Whatever {\n  private kept = new Map<string, Anything>();\n  async go(d: Gate): Promise<string[]> { return d.generateIds(1); }\n}\n")).toEqual(['3 calls for ids']);
  });

  it('a renamed intent map, an id set or stored by hand, or the call for ids by another name is found by what it does', () => {
    // The drift at journal.ts:166, renamed: a map of lines kept outside the home still has to call for its ids.
    expect(flagged("import type { Renamed } from './journal';\nexport class Journal {\n  private intents = new Map<string, Renamed>();\n  async ids(d: Gate, n: number): Promise<string[]> { return d.generateIds(n); }\n}\n")).toEqual(['4 calls for ids']);
    // A renamed holder, with its slot named anything, cannot hide the call for ids or the create by hand.
    expect(flagged("export class Ids {\n  private readonly idFor = new Map<string, { kept?: string }>();\n  async keep(intent: string, d: Gate): Promise<void> { this.idFor.set(intent, { kept: (await d.generateIds(1))[0] }); }\n}\n")).toEqual(['3 calls for ids']);
    // The call by any spelling, and by an alias or a destructured name.
    expect(flagged("export function hand(d: { generateIds(n: number): Promise<string[]> }): void {\n  const more = d['generateIds'];\n  const { generateIds } = d;\n  void more; void generateIds;\n}\n")).toEqual(['2 calls for ids', '3 takes the call for ids']);
    // Not a reservation: the home's own makers and a map made for one call.
    expect(flagged("import { makeOnce, makeText, reserveFor } from '../spine/write-once';\nexport async function fine(h: { reserved?: string }, w: Gate): Promise<void> {\n  await reserveFor(w, [h]);\n  await makeOnce(h, w, (id) => makeText(w, w, { parent: id, name: 'a' }, ''));\n}\n")).toEqual([]);
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

/**
 * c4-undo-withdraw (TL-P4-24 finding 3, option (a); defect undo-drops-reserved-create): a withdrawn intended create
 * never leaves a live file. Every keeper of the Holder port, every create outcome, every withdrawal, always against a
 * memoised listing (as drive-vault's cached index). Once a withdrawal resolves, the reserved id is a 404 or in the Bin
 * (or goes with a folder in the Bin); when Drive does not answer the read, the withdrawal is refused (its own code)
 * and the holder keeps its id.
 * Red before the fix: "landed, answer lost" (lone link pile, pile folder) and every "unknown" cell; the
 * port cells (`withdraw` on an upload record) did not exist. The others are guards.
 */
describe('a withdrawn intended create never leaves a live file', () => {
  type Outcome = 'unsent' | 'not landed' | 'landed, answer lost' | 'landed and confirmed' | 'refused 4xx';

  /** Drive as one outcome makes it, for the creates `match` picks; reads by the ids in `deaf` find no network. */
  function rig(drive: FakeDrive, match: (name: string) => boolean) {
    const at: { outcome: Outcome } = { outcome: 'landed and confirmed' };
    const sent: string[] = [];
    const deaf = new Map<string, number>();
    const ids = drive.generateIds.bind(drive);
    drive.generateIds = async (n) => {
      if (at.outcome === 'unsent') throw driveError('offline');
      return ids(n);
    };
    const fate = async (id: string | undefined, make: () => Promise<DriveFile>): Promise<DriveFile> => {
      if (id) sent.push(id);
      if (at.outcome === 'not landed' || at.outcome === 'unsent') throw driveError('offline');
      if (at.outcome === 'refused 4xx') throw driveFailure('unknown', 'permanent');
      const f = await make();
      if (at.outcome === 'landed, answer lost') {
        // Its answer and its read-back are both lost.
        deaf.set(f.id, 1);
        throw driveError('offline');
      }
      return f;
    };
    const text = drive.createText.bind(drive);
    drive.createText = (parent, name, words, props, id) => (match(name) ? fate(id, () => text(parent, name, words, props, id)) : text(parent, name, words, props, id));
    const folder = drive.createFolder.bind(drive);
    drive.createFolder = (parent, name, props, id) => (match(name) ? fate(id, () => folder(parent, name, props, id)) : folder(parent, name, props, id));
    const get = drive.get.bind(drive);
    drive.get = async (id, o) => {
      const left = deaf.get(id) ?? 0;
      if (left > 0) {
        deaf.set(id, left - 1);
        throw driveError('offline');
      }
      return get(id, o);
    };
    return { at, sent, deaf, unreachable: () => sent.forEach((id) => deaf.set(id, Infinity)) };
  }

  /** The reserved id is withdrawn: Drive keeps no file under it, or it is in the Bin, or inside a folder in the Bin. */
  async function withdrawn(drive: FakeDrive, id: string): Promise<boolean> {
    const f = await drive.get(id, { binned: true }).catch(() => null);
    if (!f || f.trashed) return true;
    for (let up = f.parents[0]; up; ) {
      const folder = await drive.get(up, { binned: true }).catch(() => null);
      if (!folder) return false;
      if (folder.trashed) return true;
      up = folder.parents[0];
    }
    return false;
  }
  describe('keepers of drive-vault: Sending (a link), Intended (a pile folder), withdrawn by removePile and trash', () => {
    async function vaultOf(): Promise<{ drive: FakeDrive; vault: DriveVault; root: string }> {
      localStorage.clear();
      const drive = new FakeDrive();
      const root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
      return { drive, root, vault: new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() }) };
    }
    const LINK = { name: 'insurer.example/renewal', kind: 'link' as const, origin: 'A link you pasted', url: 'https://insurer.example/renewal' };

    it.each(['landed, answer lost', 'landed and confirmed', 'refused 4xx', 'not landed'] as const)('removePile, a lone link: %s', async (outcome) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { drive, vault } = await vaultOf();
      await vault.piles();
      const r = rig(drive, (name) => name.endsWith('.url'));
      r.at.outcome = outcome;
      const p = await vault.addPile({ text: '', items: [LINK] });
      await vault.settled();
      r.at.outcome = 'landed and confirmed';
      await expect(vault.removePile(p.id)).resolves.toBeUndefined();
      expect(r.sent.length).toBeGreaterThan(0);
      for (const id of r.sent) expect(await withdrawn(drive, id), id).toBe(true);
    });

    it('removePile, a lone link whose create may have landed, with Drive not answering: refused, and the pile stays', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { drive, vault } = await vaultOf();
      await vault.piles();
      const r = rig(drive, (name) => name.endsWith('.url'));
      r.at.outcome = 'landed, answer lost';
      const p = await vault.addPile({ text: '', items: [LINK] });
      await vault.settled();
      r.unreachable();
      await expect(vault.removePile(p.id)).rejects.toMatchObject({ name: 'BowerError', code: 'unreached' });
      expect((await vault.piles()).map((x) => x.id)).toContain(p.id);
      r.deaf.clear();
      await expect(vault.removePile(p.id)).resolves.toBeUndefined();
      for (const id of r.sent) expect(await withdrawn(drive, id), id).toBe(true);
    });

    it('a pile removed while its link create is in flight never leaves a live file', async () => {
      // Round 2, review 2 (TL-P4-24 addendum 11): the removal finds the link's create on its way and waits for it to
      // settle; it lands with its answer and read-back lost, and the removal bins it rather than letting its id go.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { drive, vault } = await vaultOf();
      await vault.piles();
      const r = rig(drive, (name) => name.endsWith('.url'));
      r.at.outcome = 'landed, answer lost';
      const text = drive.createText.bind(drive);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((done) => (release = done));
      let began: () => void = () => undefined;
      const on = new Promise<void>((done) => (began = done));
      drive.createText = async (...x) => {
        if (x[1].endsWith('.url')) { began(); await gate; }
        return text(...x);
      };
      const p = await vault.addPile({ text: '', items: [LINK] });
      await on;
      const removing = vault.removePile(p.id);
      const outcome = removing.then(() => 'removed', () => 'refused');
      // Long enough for a removal that does not wait to end before the create lands.
      for (let i = 0; i < 5; i++) await new Promise((done) => setTimeout(done, 0));
      release();
      await expect(removing).resolves.toBeUndefined();
      expect(await outcome).toBe('removed');
      await vault.settled();
      expect(r.sent).toHaveLength(1);
      for (const id of r.sent) expect(await withdrawn(drive, id), id).toBe(true);
    });

    it('trash of a pile folder: its link, landed with its answer lost, goes with it and comes back once on Undo', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { drive, vault, root } = await vaultOf();
      await vault.piles();
      const r = rig(drive, (name) => name.endsWith('.url'));
      r.at.outcome = 'landed, answer lost';
      const p = await vault.addPile({ text: 'Car insurance', items: [LINK] });
      await vault.settled();
      r.at.outcome = 'landed and confirmed';
      const path = (await vault.piles()).find((x) => x.id === p.id)?.path ?? '';
      await vault.trash(path);
      for (const id of r.sent) expect(await withdrawn(drive, id), id).toBe(true);
      await vault.restore(path);
      await vault.settled();
      expect((await drive.listAll(root)).filter((f) => f.name.startsWith('insurer.example') && f.name.endsWith('.url'))).toHaveLength(1);
    });

    it('removePile, a lone thing whose new pile folder (Intended) landed with its answer lost', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { drive, vault } = await vaultOf();
      await vault.piles();
      const p = await vault.addPile({ text: '', items: [LINK] });
      await vault.settled();
      await vault.piles();
      const r = rig(drive, (name) => !name.endsWith('.url') && !name.endsWith('.json'));
      r.at.outcome = 'landed, answer lost';
      await expect(vault.updatePile(p.id, 'Car insurance')).rejects.toBeTruthy();
      r.at.outcome = 'landed and confirmed';
      expect(r.sent.length).toBeGreaterThan(0);
      await expect(vault.removePile(p.id)).resolves.toBeUndefined();
      for (const id of r.sent) expect(await withdrawn(drive, id), id).toBe(true);
    });
  });

  describe('the port: withdraw, for a keeper that stores the id in its own shape (an upload record)', () => {
    it.each([
      ['refused (403)', () => driveFailure('unknown', 'permanent')],
      ['signed out (401)', () => driveError('auth')],
    ] as const)('a read of the reserved id %s is unknown: refused as unreached, the id kept', async (_label, fail) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const drive = new FakeDrive();
      const root = (await drive.createFolder('root', 'Bower')).id;
      const [id = ''] = await drive.generateIds(1);
      await drive.createText(root, 'scan.url', 'x', undefined, id);
      let fileId: string | null = id;
      const record = home.heldAs(fileId, async () => {
        fileId = null;
      });
      drive.get = async () => {
        throw fail();
      };
      await expect(home.withdraw(record, drive)).rejects.toMatchObject({ name: 'BowerError', code: 'unreached' });
      expect(fileId).toBe(id);
      expect(record.reserved).toBe(id);
    });

    it.each(['unsent', '404', 'in the Bin', 'live', 'unknown'] as const)('%s', async (state) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const drive = new FakeDrive();
      const root = (await drive.createFolder('root', 'Bower')).id;
      const [id = ''] = await drive.generateIds(1);
      if (state === 'in the Bin' || state === 'live' || state === 'unknown') await drive.createText(root, 'scan.url', 'x', undefined, id);
      if (state === 'in the Bin') await drive.trash(id);
      let fileId: string | null = state === 'unsent' ? null : id;
      const record = home.heldAs(fileId, async () => {
        fileId = null;
      });
      const { withdraw } = home;
      if (state === 'unknown') {
        drive.offline = true;
        await expect(withdraw(record, drive)).rejects.toMatchObject({ code: 'unreached' });
        expect(fileId).toBe(id);
        expect(record.reserved).toBe(id);
        drive.offline = false;
        return;
      }
      await withdraw(record, drive);
      expect(fileId).toBeNull();
      expect(record.reserved).toBeUndefined();
      if (state !== 'unsent') expect(await withdrawn(drive, id)).toBe(true);
    });
  });
});

describe('c4-create-landed: the intent kept with a reserved id', () => {
  it('a retry resends the intent first sent; a 404 lets the intent go and keeps the id', async () => {
    const drive = new FakeDrive();
    const h: Holder = {};
    const sends: Sent[] = [];
    const lost = (e: unknown) => async (_id: string, sent: Sent): Promise<never> => {
      sends.push(sent);
      throw e;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(makeOnce(h, drive, sentAs('p1', 'Untitled.md', ''), lost(driveError('offline')))).rejects.toMatchObject({ code: 'offline' });
    const id = h.reserved;
    // Tried again with a name picked anew: the one first sent goes, with the same id.
    await expect(makeOnce(h, drive, sentAs('p1', 'Untitled 2.md', ''), lost(driveError('offline')))).rejects.toMatchObject({ code: 'offline' });
    expect(sends.map((x) => x.name)).toEqual(['Untitled.md', 'Untitled.md']);
    expect(h.reserved).toBe(id);
    // Its folder is gone (a 404): nothing was made there; the id stays and the next try is sent where its place is now.
    await expect(makeOnce(h, drive, sentAs('p1', 'Untitled.md', ''), lost(driveError('not-found')))).rejects.toMatchObject({ code: 'not-found' });
    expect({ reserved: h.reserved, sent: h.sent }).toEqual({ reserved: id, sent: undefined });
    await expect(makeOnce(h, drive, sentAs('p2', 'Untitled.md', ''), lost(driveError('offline')))).rejects.toMatchObject({ code: 'offline' });
    expect(sends.at(-1)?.parent).toBe('p2');
  });
});
