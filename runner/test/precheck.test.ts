import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { driveError } from '../../src/data/drive/drive-api';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { serializeRules } from '../../src/data/contracts/rules-format';

/**
 * production-precheck-tool (P4-E production-precheck): one read-only pass over a Bower folder that lists every note,
 * rule and pile Bower reads, with each parse refusal and its reason. Made-up data only (Alex, FOLDER_ID).
 */

type Owner = 'bower' | 'person';
interface PrecheckReport {
  notes: Array<{ path: string; owner: Owner; refused: string | null }>;
  rules: Array<{ path: string; rules: number; ownText: boolean; refused: string | null }>;
  piles: Array<{ path: string; things: number; words: boolean }>;
}
type Drive = Pick<FakeDrive, 'listAll' | 'get' | 'readText' | 'readBytes' | 'readPrefix' | 'binnedByItem' | 'getUploaded'>;
interface Deps { drive?: (token: string) => Drive; out?: (text: string) => void; err?: (text: string) => void }
interface PrecheckModule {
  precheck(drive: Drive, rootId: string): Promise<PrecheckReport>;
  readOnly(drive: FakeDrive): Drive;
  main(argv: string[], env: Record<string, string | undefined>, deps?: Deps): Promise<number>;
}

/** The module under test, missing today: an assertion fails, never the suite's loading. */
async function load(): Promise<PrecheckModule> {
  const path = new URL('../src/precheck.ts', import.meta.url).pathname;
  const mod = await import(/* @vite-ignore */ path).catch(() => null) as Partial<PrecheckModule> | null;
  expect(typeof mod?.precheck, 'runner/src/precheck.ts exports precheck').toBe('function');
  return mod as PrecheckModule;
}

const WRITES = ['createFolder', 'createText', 'upload', 'writeText', 'update', 'trash', 'untrash', 'generateIds', 'openResumable', 'putChunk', 'fenced'] as const;
const BEGIN = '<!-- bower:ownership/2 begin rules-added -->';
const END = '<!-- bower:ownership/2 end rules-added -->';
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A Bower folder with every kind the report names; returns the drive and the root. */
async function folder(): Promise<{ drive: FakeDrive; root: string }> {
  const drive = new FakeDrive({ clock: () => Date.UTC(2026, 9, 16) });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const made = new Map<string, string>();
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive', '.bower']) made.set(name, (await drive.createFolder(root, name)).id);
  const id = (name: string): string => made.get(name) ?? '';
  const garden = (await drive.createFolder(id('Areas'), 'Garden')).id;
  await drive.createText(garden, 'Garden plot.md', "---\nsummary: Alex's garden plot.\nby: bower\n---\nAlex grows mint.\n");
  await drive.createText(garden, 'Planting diary.md', '---\nsummary: My diary.\n---\nAlex planted garlic.\n');
  await drive.createText(id('Projects'), 'Broken.md', `Alex keeps notes.\n\n## Rules added in Bower\n${BEGIN}\n## Rules\n`);
  await drive.upload(id('Resources'), 'Not text.md', new Blob([new Uint8Array([0x41, 0xff, 0x0a])]));
  await drive.createText(id('Resources'), 'Lease.pdf', '%PDF made up');
  await drive.createText(id('.bower'), 'index.md', '# Index\n');
  await drive.createText(root, 'About me.md', '---\nsummary: About Alex.\nby: bower\n---\nAlex lives near Larkspur Lane.\n');
  await drive.createText(root, 'Rules.md', `Alex keeps paper letters for a year.\n\n## Rules added in Bower\n${BEGIN}\n## Rules\n\n- Keep receipts together. <!-- since 2026-10-13 -->\n${END}\n`);
  const pile = (await drive.createFolder(id('Inbox'), 'Flat papers')).id;
  await drive.createText(pile, 'Pile note.md', 'The deposit and the lease for the flat.');
  await drive.createText(pile, 'deposit.pdf', '%PDF made up');
  await drive.createText(pile, 'lease.pdf', '%PDF made up');
  await drive.createText(id('Inbox'), 'receipt.pdf', '%PDF made up');
  return { drive, root };
}

/** The ownership parser's own reason for these bytes, so the test never spells a second list of reasons. */
const reasonOf = (bytes: Uint8Array): string => {
  const own = parseOwnership(bytes);
  return own.status === 'invalid' ? own.reason : 'none';
};

/** Every call reaching the drive, by method name; write methods also fail, so a write could not pass unseen. */
function watched(drive: FakeDrive): { drive: FakeDrive; calls: string[] } {
  const calls: string[] = [];
  const proxy = new Proxy(drive, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        calls.push(String(key));
        if ((WRITES as readonly string[]).includes(String(key))) throw new Error(`write ${String(key)} reached the drive`);
        return Reflect.apply(value, target, args);
      };
    },
  });
  return { drive: proxy, calls };
}

describe('production-precheck-tool: what Bower reads in a folder, read only', () => {
  it('AC1 precheck-notes: every note with its owner and refusal reason, outside .bower and the inbox, by path', async () => {
    const { precheck } = await load();
    const { drive, root } = await folder();
    const report = await precheck(drive, root);
    expect(report.notes).toEqual([
      { path: 'About me.md', owner: 'bower', refused: null },
      { path: 'Areas/Garden/Garden plot.md', owner: 'bower', refused: null },
      { path: 'Areas/Garden/Planting diary.md', owner: 'person', refused: null },
      { path: 'Projects/Broken.md', owner: 'person', refused: reasonOf(enc(`Alex keeps notes.\n\n## Rules added in Bower\n${BEGIN}\n## Rules\n`)) },
      { path: 'Resources/Not text.md', owner: 'person', refused: reasonOf(new Uint8Array([0x41, 0xff, 0x0a])) },
      { path: 'Rules.md', owner: 'person', refused: null },
    ]);
    // The fixture's refusals are real ones, so the comparison above is meaningful.
    expect(report.notes.map((n) => n.refused)).not.toContain('none');
  });

  it('AC2 precheck-rules: each root rules note with its rules added in Bower and whether it holds the person\'s own text', async () => {
    const { precheck } = await load();
    const personal = await folder();
    expect((await precheck(personal.drive, personal.root)).rules).toEqual([{ path: 'Rules.md', rules: 1, ownText: true, refused: null }]);
    // Bower's own rules note: its rules, no text of the person's.
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    await drive.createText(root, 'Rules.md', serializeRules([
      { id: 'r1', text: 'Keep receipts together.', since: Date.UTC(2026, 9, 3) },
      { id: 'r2', text: 'Scans of letters go in Documents.', since: Date.UTC(2026, 9, 4) },
    ]));
    expect((await precheck(drive, root)).rules).toEqual([{ path: 'Rules.md', rules: 2, ownText: false, refused: null }]);
    // Two rules notes at the root are both listed, so the ambiguity shows (rules-added-region R8).
    await drive.createText(root, 'Rules.md', 'Alex keeps letters.\n');
    expect((await precheck(drive, root)).rules).toHaveLength(2);
  });

  it('AC3 precheck-piles: each pile and loose thing in the inbox, with its things and whether it has words', async () => {
    const { precheck } = await load();
    const { drive, root } = await folder();
    expect((await precheck(drive, root)).piles).toEqual([
      { path: 'Inbox/Flat papers', things: 2, words: true },
      { path: 'Inbox/receipt.pdf', things: 1, words: false },
    ]);
  });

  it('AC4 precheck-read-only: a pretend Drive that counts writes sees none, and its contents are unchanged', async () => {
    const { precheck } = await load();
    const { drive, root } = await folder();
    const before = await drive.snapshot();
    const plain = await precheck(drive, root);
    const seen = watched(drive);
    const report = await precheck(seen.drive, root);
    expect(seen.calls.filter((c) => (WRITES as readonly string[]).includes(c))).toEqual([]);
    expect(seen.calls.length, 'the check reads the drive').toBeGreaterThan(0);
    expect(report).toEqual(plain);
    expect(await drive.snapshot()).toBe(before);
  });

  it('AC4 precheck-read-only-guard: the drive the command builds offers no write at all', async () => {
    const { readOnly } = await load();
    const { drive } = await folder();
    const seen = watched(drive);
    const guarded = readOnly(seen.drive) as unknown as Record<string, unknown>;
    for (const name of WRITES) {
      const method = guarded[name];
      if (typeof method === 'function') await expect(Promise.resolve().then(() => (method as () => unknown)())).rejects.toThrow();
    }
    expect(seen.calls.filter((c) => (WRITES as readonly string[]).includes(c))).toEqual([]);
  });

  it('AC5 precheck-corpus-folder: a corpus case\'s starting folder reads with no refusal', async () => {
    const { precheck } = await load();
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const base = new URL('../../testing/corpus/c04-offer-and-flat/folder', import.meta.url).pathname;
    const ids = new Map<string, string>([['', root]]);
    const walk = async (dir: string): Promise<void> => {
      for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        const parent = ids.get(relative(base, dir)) ?? root;
        if (statSync(full).isDirectory()) {
          ids.set(relative(base, full), (await drive.createFolder(parent, name)).id);
          await walk(full);
        } else await drive.createText(parent, name, readFileSync(full, 'utf8'));
      }
    };
    await walk(base);
    const report = await precheck(drive, root);
    expect(report.notes.map((n) => n.path)).toEqual(['Projects/Flat hunt/Flat hunt.md', 'Projects/Job hunt/Job hunt.md']);
    expect(report.notes.every((n) => n.refused === null)).toBe(true);
  });

  it('AC6 precheck-command: the command prints the report as JSON, needs a token and a folder id, and never prints the token', async () => {
    const { main, precheck } = await load();
    const { drive, root } = await folder();
    let out = '';
    let err = '';
    const deps: Deps = { drive: () => drive, out: (t) => { out += t; }, err: (t) => { err += t; } };
    expect(await main([root], { BOWER_DRIVE_TOKEN: 'token-made-up-123' }, deps)).toBe(0);
    expect(JSON.parse(out)).toEqual(await precheck(drive, root));
    expect(out + err).not.toContain('token-made-up-123');
    for (const [argv, env] of [[[root], {}], [[], { BOWER_DRIVE_TOKEN: 'token-made-up-123' }], [['-x'], { BOWER_DRIVE_TOKEN: 'token-made-up-123' }]] as const) {
      out = '';
      err = '';
      expect(await main([...argv], { ...env }, deps), JSON.stringify(argv)).toBe(2);
      expect(out).toBe('');
      expect(err.trim().split('\n'), 'one sentence').toHaveLength(1);
      expect(err).not.toContain('token-made-up-123');
    }
  });

  it('R6 precheck-read-error: a read that fails stops the check with an error, never a report that leaves the file out', async () => {
    const { main, precheck } = await load();
    const { drive, root } = await folder();
    const files = await drive.listAll(root);
    const diary = files.find((f) => f.name === 'Planting diary.md');
    const readBytes = drive.readBytes.bind(drive);
    const readText = drive.readText.bind(drive);
    drive.readBytes = async (id) => { if (id === diary?.id) throw driveError('offline'); return readBytes(id); };
    drive.readText = async (id) => { if (id === diary?.id) throw driveError('offline'); return readText(id); };
    await expect(precheck(drive, root)).rejects.toThrow();
    let out = '';
    expect(await main([root], { BOWER_DRIVE_TOKEN: 'token-made-up-123' }, { drive: () => drive, out: (t) => { out += t; }, err: () => undefined })).toBe(1);
    expect(out).toBe('');
  });
});
