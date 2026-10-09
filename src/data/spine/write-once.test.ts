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
