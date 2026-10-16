import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { driveError } from '../../src/data/drive/drive-api';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { serializeRules } from '../../src/data/contracts/rules-format';
import { SET_ASIDE_TEXT } from '../../src/data/pile-readiness';
import { BowerError } from '../../src/data/types';
import { PROP } from '../../src/data/vault/layout';
import type { PrecheckDrive } from '../src/precheck';

/**
 * production-precheck-tool (P4-E production-precheck): one read-only pass over a Bower folder that lists every note,
 * rule and pile Bower reads, with each parse refusal and its reason. Made-up data only (Alex, FOLDER_ID).
 */

type Owner = 'bower' | 'person';
interface PrecheckReport {
  notes: Array<{ path: string; owner: Owner; refused: string | null }>;
  rules: Array<{ path: string; rules: number; ownText: boolean; refused: string | null }>;
  piles: Array<{ path: string; things: number; words: boolean | null; refused?: string; notChecked?: string }>;
}
type Drive = Pick<FakeDrive, 'listAll' | 'get' | 'readText' | 'readBytes' | 'readPrefix' | 'binnedByItem' | 'getUploaded'>;
interface Deps { drive?: (token: string) => Drive; out?: (text: string) => void; err?: (text: string) => void; check?: (drive: Drive, rootId: string) => Promise<PrecheckReport> }
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

const TOKEN = 'token-made-up-123';
const DAMAGED = `Alex keeps notes.\n\n## Rules added in Bower\n${BEGIN}\n## Rules\n`;
const NEWER = "---\nbower_format: ownership/3\nby: bower\n---\nAlex's plot.\n";

/** The id of the file with this name, anywhere under the root. */
const idNamed = async (drive: FakeDrive, root: string, name: string): Promise<string | undefined> => (await drive.listAll(root)).find((f) => f.name === name)?.id;

/** Every read of one file fails with `error`, as a Drive that goes offline or loses the file would. */
function breaking(drive: FakeDrive, id: string | undefined, error: Error): FakeDrive {
  const readBytes = drive.readBytes.bind(drive);
  const readText = drive.readText.bind(drive);
  drive.readBytes = async (target) => { if (target === id) throw error; return readBytes(target); };
  drive.readText = async (target) => { if (target === id) throw error; return readText(target); };
  return drive;
}

/** The command over this drive: its exit code and what it printed on stdout and on its stderr. */
async function run(drive: Drive, root: string): Promise<{ code: number; out: string; err: string }> {
  const { main } = await load();
  let out = '';
  let err = '';
  const code = await main([root], { BOWER_DRIVE_TOKEN: TOKEN }, { drive: () => drive, out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}

/** A pretend Drive with a root and a pile folder holding one note and one thing; the note's id too. */
async function pileOf(note: string): Promise<{ drive: FakeDrive; root: string; noteId: string | undefined }> {
  const drive = new FakeDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  const pile = (await drive.createFolder(inbox, 'Flat papers')).id;
  await drive.createText(pile, 'Pile note.md', note);
  await drive.createText(pile, 'lease.pdf', '%PDF made up');
  return { drive, root, noteId: await idNamed(drive, root, 'Pile note.md') };
}

describe('production-precheck-tool: refusals, what could not be read, and what is printed', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('AC1 precheck-refused-owner: a note Bower refuses is still Bower\'s by what Drive marks or by its own front matter', async () => {
    const { precheck } = await load();
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const asBower = `---\nsummary: Alex's plot.\nby: bower\n---\n${DAMAGED}`;
    // Neither of the first three parses as a note, so `parseNote` cannot tell whose it is.
    await drive.createText(root, 'Marked by Drive.md', DAMAGED, { [PROP.by]: 'bower' });
    await drive.createText(root, 'Front matter.md', asBower);
    await drive.createText(root, 'Newer format.md', NEWER);
    await drive.createText(root, 'Personal.md', DAMAGED);
    const damaged = reasonOf(enc(DAMAGED));
    const newer = reasonOf(enc(NEWER));
    expect([damaged, newer], 'two different refusals, both real ones').not.toContain('none');
    expect(newer).not.toBe(damaged);
    expect(reasonOf(enc(asBower))).toBe(damaged);
    expect((await precheck(drive, root)).notes).toEqual([
      { path: 'Front matter.md', owner: 'bower', refused: damaged },
      { path: 'Marked by Drive.md', owner: 'bower', refused: damaged },
      { path: 'Newer format.md', owner: 'bower', refused: newer },
      { path: 'Personal.md', owner: 'person', refused: damaged },
    ]);
  });

  it('AC2 R5 precheck-rules-refused: a rules note Bower refuses shows no rules, no own text and the reason', async () => {
    const { precheck } = await load();
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    await drive.createText(root, 'Rules.md', DAMAGED);
    expect(reasonOf(enc(DAMAGED))).not.toBe('none');
    expect((await precheck(drive, root)).rules).toEqual([{ path: 'Rules.md', rules: 0, ownText: false, refused: reasonOf(enc(DAMAGED)) }]);
    // Bower's own rules note, marked by Drive with no `by` of its own: its lines are rules, never the person's text.
    const marked = new FakeDrive();
    const rootId = (await marked.createFolder('root', 'Bower')).id;
    await marked.createText(rootId, 'Rules.md', '## Rules\n\n- Keep receipts together. <!-- since 2026-10-13 -->\n', { [PROP.by]: 'bower' });
    expect((await precheck(marked, rootId)).rules).toEqual([{ path: 'Rules.md', rules: 1, ownText: false, refused: null }]);
  });

  it('AC3 precheck-piles-refused: a pile whose note Bower will not parse shows the Inbox\'s own reason, and the command still succeeds', async () => {
    const { precheck } = await load();
    const cases = [[DAMAGED, SET_ASIDE_TEXT['note-damaged']], [NEWER, SET_ASIDE_TEXT['note-format']]] as const;
    for (const [note, reason] of cases) {
      const { drive, root } = await pileOf(note);
      expect(reasonOf(enc(note)), 'the pile note is refused for real').not.toBe('none');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const expected = [{ path: 'Inbox/Flat papers', things: 1, words: null, refused: reason }];
      expect((await precheck(drive, root)).piles).toEqual(expected);
      const ran = await run(drive, root);
      expect(ran.code, 'a refusal is a finding, not a failure').toBe(0);
      expect((JSON.parse(ran.out) as PrecheckReport).piles).toEqual(expected);
    }
  });

  it.each([['offline'], ['not-found'], ['unknown']] as const)('R6 precheck-inbox-%s: a pile note that cannot be read is reported as not checked, and the command fails', async (code) => {
    const { precheck } = await load();
    const { drive, root, noteId } = await pileOf('The deposit and the lease for the flat.');
    await drive.createText((await idNamed(drive, root, 'Inbox')) ?? '', 'receipt.pdf', '%PDF made up');
    breaking(drive, noteId, driveError(code));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const expected = [
      { path: 'Inbox/Flat papers', things: 1, words: null, notChecked: SET_ASIDE_TEXT['not-checked'] },
      { path: 'Inbox/receipt.pdf', things: 1, words: false },
    ];
    expect((await precheck(drive, root)).piles, 'never a pile that was read').toEqual(expected);
    const ran = await run(drive, root);
    expect(ran.code).toBe(1);
    expect((JSON.parse(ran.out) as PrecheckReport).piles).toEqual(expected);
    expect(ran.err.trim().split('\n'), 'one sentence').toHaveLength(1);
    expect(logged, 'the details go to the console').toHaveBeenCalled();
  });

  it('R6 precheck-inbox-auth: a refused sign-in in the inbox stops the check, with nothing printed', async () => {
    const { precheck } = await load();
    const { drive, root, noteId } = await pileOf('The deposit and the lease for the flat.');
    breaking(drive, noteId, driveError('auth'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(precheck(drive, root)).rejects.toThrow();
    const ran = await run(drive, root);
    expect(ran.code).toBe(1);
    expect(ran.out).toBe('');
    expect(ran.err.trim().split('\n')).toHaveLength(1);
  });

  it('R9 precheck-token-never-printed: a failing read that names the token leaves it out of stdout, stderr and the console', async () => {
    const named = [
      new Error(`GET https://example.test/files?access_token=${TOKEN} failed`),
      new BowerError('unknown', `Drive said no to ${TOKEN}.`, undefined, { cause: new Error(`Bearer ${TOKEN}`) }),
    ];
    const places = [['a note in the garden', folder, 'Planting diary.md'], ['the note of a pile', () => pileOf('The deposit and the lease for the flat.'), 'Pile note.md']] as const;
    for (const error of named) {
      for (const [where, build, file] of places) {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const mine = await build();
        const ran = await run(breaking(mine.drive, await idNamed(mine.drive, mine.root, file), error), mine.root);
        const details = logged.mock.calls.flat().map(String).join('\n');
        expect(ran.code, where).toBe(1);
        expect([ran.out, ran.err, details].join('\n'), where).not.toContain(TOKEN);
        expect(details, `${where}: the details are logged, with the token hidden`).toContain('[token]');
        vi.restoreAllMocks();
      }
    }
  });

  it('AC4 precheck-main-read-only: the drive `main` hands the check refuses every write', async () => {
    const { main } = await load();
    const { drive, root } = await folder();
    const seen = watched(drive);
    let handed: Record<string, unknown> = {};
    const check = async (given: Drive): Promise<PrecheckReport> => { handed = given as unknown as Record<string, unknown>; return { notes: [], rules: [], piles: [] }; };
    expect(await main([root], { BOWER_DRIVE_TOKEN: TOKEN }, { drive: () => seen.drive, out: () => undefined, err: () => undefined, check })).toBe(0);
    for (const name of WRITES) expect(() => (handed[name] as () => unknown)(), name).toThrow(BowerError);
    expect(seen.calls).toEqual([]);
  });

  it('R1 precheck-types: the drive the check takes has no write method', async () => {
    const { readOnly } = await load();
    const { drive } = await folder();
    const guarded = readOnly(drive) as unknown as PrecheckDrive;
    // @ts-expect-error a write is not on the type, so it does not typecheck
    expect(typeof guarded.createText).toBe('function');
    expect(typeof guarded.listAll).toBe('function');
  });
});

const RUNNER = resolve(import.meta.dirname, '..');
const FOLDER_KIND = 'application/vnd.google-apps.folder';
const AT = '2026-10-16T00:00:00.000Z';
const entry = (id: string, name: string, parents: string[], more: Record<string, string> = {}): Record<string, unknown> => ({ id, name, parents, modifiedTime: AT, createdTime: AT, ...more });
/** A made-up folder as Drive v3 would list it: one note in the garden, one loose thing in the inbox. */
const TREE = [
  entry('AREAS', 'Areas', ['ROOT'], { mimeType: FOLDER_KIND }),
  { ...entry('PLAN', 'Plan.md', ['AREAS'], { size: '23' }), content: 'Alex plans the garden.\n' },
  entry('INBOX', 'Inbox', ['ROOT'], { mimeType: FOLDER_KIND }),
  { ...entry('RECEIPT', 'receipt.pdf', ['INBOX'], { size: '12', mimeType: 'application/pdf' }), content: '%PDF made up' },
];
/** Stands in for Google Drive: Node's `fetch` answers from the tree, and every request is logged (method, path, headers). */
const STUB = `
import { appendFileSync, readFileSync } from 'node:fs';
const tree = JSON.parse(readFileSync(process.env.STUB_TREE, 'utf8'));
const answer = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  appendFileSync(process.env.STUB_LOG, (init.method ?? 'GET') + ' ' + u.pathname + ' ' + JSON.stringify(init.headers ?? {}) + '\\n');
  if (process.env.STUB_FAIL) return answer(Number(process.env.STUB_FAIL), {});
  if (u.pathname.endsWith('/files')) {
    const parents = [...(u.searchParams.get('q') ?? '').matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
    return answer(200, { files: tree.filter((f) => f.parents.some((p) => parents.includes(p))).map(({ content, ...meta }) => meta) });
  }
  const file = tree.find((f) => f.id === u.pathname.split('/').pop());
  return file ? answer(200, file.content ?? '') : answer(404, {});
};
`;

describe('production-precheck-tool: the built command, run as a process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bower-precheck-'));
  const stub = join(dir, 'stub.mjs');
  const log = join(dir, 'requests.log');
  writeFileSync(stub, STUB);
  writeFileSync(join(dir, 'tree.json'), JSON.stringify(TREE));
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
  // The script itself, with no folder id and no token: it builds the bundle every test below runs, then prints the usage.
  let built: SpawnSyncReturns<string>;
  beforeAll(() => {
    rmSync(join(RUNNER, 'dist', 'precheck.mjs'), { force: true });
    built = spawnSync('pnpm', ['-C', RUNNER, 'precheck'], { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }, encoding: 'utf8', timeout: 60000 });
  }, 90000);

  /** `node dist/precheck.mjs` with Drive stood in for, and only this environment (never the machine's own token). */
  const start = (args: string[], env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string; requests: string[] } => {
    writeFileSync(log, '');
    const ran = spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, join(RUNNER, 'dist', 'precheck.mjs'), ...args], {
      env: { PATH: process.env.PATH ?? '', STUB_TREE: join(dir, 'tree.json'), STUB_LOG: log, ...env }, encoding: 'utf8', timeout: 20000,
    });
    return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr, requests: readFileSync(log, 'utf8').split('\n').filter(Boolean) };
  };
  const oneSentence = (stderr: string): void => { expect(stderr.trim().split('\n'), stderr).toHaveLength(1); };

  it('R10 precheck-script: `pnpm -C runner precheck` bundles the check with esbuild and runs it; the runner build stays as it was', () => {
    const scripts = (JSON.parse(readFileSync(join(RUNNER, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts.precheck).toMatch(/^esbuild src\/precheck\.ts --bundle .*--outfile=dist\/precheck\.mjs && node dist\/precheck\.mjs$/);
    expect(scripts.build).not.toContain('precheck');
    expect(readFileSync(resolve(RUNNER, '..', 'knip.jsonc'), 'utf8')).toContain('"src/precheck.ts!"');
    expect(built.error).toBeUndefined();
    expect(existsSync(join(RUNNER, 'dist', 'precheck.mjs'))).toBe(true);
    expect(built.status).not.toBe(0);
    expect(built.stderr).toContain('BOWER_DRIVE_TOKEN');
  });

  it('AC6 precheck-process-usage: no token, no folder id, a flag or a second argument end with exit 2, one sentence and no request', () => {
    for (const [args, env] of [[['ROOT'], {}], [[], { BOWER_DRIVE_TOKEN: TOKEN }], [['-x'], { BOWER_DRIVE_TOKEN: TOKEN }], [['ROOT', 'OTHER'], { BOWER_DRIVE_TOKEN: TOKEN }], [['ROOT'], { BOWER_DRIVE_TOKEN: '  ' }]] as const) {
      const ran = start([...args], { ...env });
      expect(ran.status, JSON.stringify(args)).toBe(2);
      expect(ran.stdout).toBe('');
      oneSentence(ran.stderr);
      expect(ran.stderr).toContain('BOWER_DRIVE_TOKEN');
      expect(ran.stderr).not.toContain(TOKEN);
      expect(ran.requests).toEqual([]);
    }
  });

  it('AC6 precheck-process-report: a folder id and the token print the report as JSON and exit 0, over reads that carry the token', () => {
    const ran = start(['ROOT'], { BOWER_DRIVE_TOKEN: TOKEN });
    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');
    expect(ran.stdout).toBe(`${JSON.stringify({
      notes: [{ path: 'Areas/Plan.md', owner: 'person', refused: null }],
      rules: [],
      piles: [{ path: 'Inbox/receipt.pdf', things: 1, words: false }],
    }, null, 2)}\n`);
    expect(ran.stdout).not.toContain(TOKEN);
    expect(ran.requests.length).toBeGreaterThan(0);
    expect(ran.requests.every((r) => r.startsWith('GET ')), 'only reads reach Drive').toBe(true);
    expect(ran.requests.every((r) => r.includes(`Bearer ${TOKEN}`))).toBe(true);
  });

  it.each([['404', "That isn't in your Bower folder any more."], ['401', 'Drive refused the token. Make a new one and run the check again.']] as const)('R6 precheck-process-%s: Drive refuses the read, so nothing is printed and the exit is 1 with one sentence first', (status, sentence) => {
    const ran = start(['ROOT'], { BOWER_DRIVE_TOKEN: TOKEN, STUB_FAIL: status });
    expect(ran.status).toBe(1);
    expect(ran.stdout).toBe('');
    expect(ran.stderr.split('\n')[0]).toBe(sentence);
    expect(ran.stderr).not.toContain(TOKEN);
  });
});
