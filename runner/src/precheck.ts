/**
 * The production precheck: one read-only pass over a Bower folder that lists what Bower would read there (each note
 * with its owner, the rules notes, the inbox's piles) and what it would refuse, with the reason, changing nothing.
 *
 *   BOWER_DRIVE_TOKEN=<token> pnpm -C runner precheck <folder id>
 *
 * Read only twice over: `PrecheckDrive` has the read methods alone (a write does not typecheck), and `main` hands the
 * check `readOnly(drive)`, whose every other member throws before the Drive is reached. Notes are read by the
 * ownership parser and `parseNote`, rules by `managedRules`, piles by `listedPiles`: no second parser lives here.
 *
 * Exit codes: 0 the folder was checked (a refusal is a finding, not a failure); 1 a read failed, or a pile's note could
 * not be read now (`notChecked`: the report is still printed, so what was read is not lost); 2 the arguments or the
 * token are wrong. Stdout is the report as JSON, nothing else. Stderr's first line is one sentence for the person;
 * a failure's details follow it, with the token replaced by `[token]`. Nothing is kept: no file, no cache.
 */
import { pathToFileURL } from 'node:url';
import { format } from 'node:util';
import { BowerError } from '../../src/data/types';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { indexedFront, parseNote } from '../../src/data/contracts/note-format';
import { managedRules } from '../../src/data/contracts/rules-format';
import { kindOf } from '../../src/data/contracts/tree';
import type { DriveApi, ResumableDrive } from '../../src/data/drive/drive-api';
import { DriveHttp } from '../../src/data/drive/drive-http';
import { SET_ASIDE_TEXT } from '../../src/data/pile-readiness';
import { listedPiles } from '../../src/data/spine/plan';
import { driveRead } from '../../src/data/spine/read';
import { PROP } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';

/** The reads the check makes, and no write. */
export type PrecheckDrive = Pick<DriveApi, 'listAll' | 'get' | 'readText' | 'readBytes' | 'binnedByItem'> & Pick<ResumableDrive, 'getUploaded'>;

/** A pile whose note Bower will not parse carries `refused`; one whose note could not be read now carries `notChecked`, and its `words` are not known. */
export interface PrecheckReport {
  notes: Array<{ path: string; owner: 'bower' | 'person'; refused: string | null }>;
  rules: Array<{ path: string; rules: number; ownText: boolean; refused: string | null }>;
  piles: Array<{ path: string; things: number; words: boolean | null; refused?: string; notChecked?: string }>;
}

export interface PrecheckDeps {
  drive?: (token: string) => PrecheckDrive;
  out?: (text: string) => void;
  err?: (text: string) => void;
  /** The check itself; a test sees there what `main` hands it. */
  check?: typeof precheck;
}

const READS: readonly string[] = ['listAll', 'get', 'readText', 'readBytes', 'binnedByItem', 'getUploaded'];
const USAGE = 'Give one Drive folder id and set BOWER_DRIVE_TOKEN to a Drive token (read-only is enough).';
const NOT_CHECKED = 'Part of the folder could not be read, so it was not fully checked.';
const FAILED = 'Bower could not finish the check.';
const FOLDER_ID = /^\w[\w-]*$/;
/** `.bower/` is the runner's, and the inbox's notes are pile notes. */
const ELSEWHERE = /^(?:\.bower|Inbox)(?:\/|$)/;
const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** The drive with its reads only: any other member throws a `BowerError` before the Drive is reached. */
export function readOnly(drive: PrecheckDrive): PrecheckDrive {
  return new Proxy(drive, {
    get(target, key) {
      // A symbol or `then` is asked by the runtime (inspect, await), never a write.
      if (typeof key !== 'string' || key === 'then') return undefined;
      if (READS.includes(key)) return (...args: unknown[]): unknown => Reflect.apply(Reflect.get(target, key) as (...a: unknown[]) => unknown, target, args);
      return (): never => {
        throw new BowerError('unknown', 'This check only reads, so it never changes your folder.');
      };
    },
  });
}

/** What Bower reads in the folder and what it would refuse. A read that fails rejects: a report never leaves a file out. */
export async function precheck(drive: PrecheckDrive, rootId: string): Promise<PrecheckReport> {
  const listing = await drive.listAll(rootId);
  const ix = VaultIndex.build(rootId, listing);
  const notes: PrecheckReport['notes'] = [];
  const rules: PrecheckReport['rules'] = [];
  // shortcut: one note at a time, so a large folder takes a while; read ahead only if a real folder is too slow.
  for (const f of listing) {
    const path = ix.pathOf(f.id);
    if (path === undefined || f.folder || kindOf(f.name) !== 'note' || ELSEWHERE.test(path)) continue;
    const bytes = await drive.readBytes(f.id);
    const own = parseOwnership(bytes);
    const refused = own.status === 'invalid' ? own.reason : null;
    const text = new TextDecoder().decode(bytes);
    const parsed = refused === null ? parseNote(path, text) : null;
    // A note Bower refuses to parse is Bower's by what Drive marks (as the explorer lists it) or its front matter's `by` as the index reads it.
    const byBower = f.appProperties?.[PROP.by] === 'bower' || (parsed ? parsed.byBower : indexedFront(text).owner === 'bower');
    notes.push({ path, owner: byBower ? 'bower' : 'person', refused });
    if (f.parents[0] === rootId && f.name === 'Rules.md') {
      rules.push({ path, rules: parsed ? managedRules(text, byBower).length : 0, ownText: !byBower && parsed !== null && parsed.body.trim() !== '', refused });
    }
  }
  // The listing already made is the one the piles are read from, so the report is of one moment.
  const piles = (await listedPiles({ ...driveRead(drive), listAll: async () => listing }, rootId)).map((p): PrecheckReport['piles'][number] => {
    const path = p.path ?? p.id;
    const things = p.items.length;
    if (p.setAside === undefined) return { path, things, words: p.text !== '' };
    // `listedPiles` sets a pile aside for its note alone: unreadable now, or not parsed.
    return p.setAside === 'not-checked' ? { path, things, words: null, notChecked: SET_ASIDE_TEXT[p.setAside] } : { path, things, words: null, refused: SET_ASIDE_TEXT[p.setAside] };
  });
  return { notes: notes.sort(byPath), rules: rules.sort(byPath), piles: piles.sort(byPath) };
}

/** The command: the report as JSON on stdout. Returns the exit code. */
export async function main(argv: string[], env: Record<string, string | undefined>, deps: PrecheckDeps = {}): Promise<number> {
  const out = deps.out ?? ((text: string): void => void process.stdout.write(text));
  const err = deps.err ?? ((text: string): void => void process.stderr.write(text));
  const token = env.BOWER_DRIVE_TOKEN?.trim();
  const [rootId, ...more] = argv;
  if (!token || rootId === undefined || more.length || !FOLDER_ID.test(rootId)) {
    err(`${USAGE}\n`);
    return 2;
  }
  // shortcut: only the token as given is hidden, not an encoded form of it; Drive never echoes a token in its answers.
  const hide = (text: string): string => text.split(token).join('[token]');
  const logged = console.error;
  console.error = (...args: unknown[]): void => logged(hide(format(...args)));
  try {
    const drive = deps.drive ?? ((t: string) => new DriveHttp({
      // A fixed token has no refresh: a 401 ends the check.
      token: async (fresh) => {
        if (fresh) throw new BowerError('auth', 'Drive refused the token. Make a new one and run the check again.');
        return t;
      },
      context: 'headless',
    }));
    const report = await (deps.check ?? precheck)(readOnly(drive(token)), rootId);
    out(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.piles.some((p) => p.notChecked !== undefined)) return 0;
    err(`${NOT_CHECKED}\n`);
    return 1;
  } catch (error) {
    err(`${hide(error instanceof BowerError ? error.message : FAILED)}\n`);
    console.error(error);
    return 1;
  } finally {
    console.error = logged;
  }
}

// Run as the bundle's entry (`pnpm -C runner precheck`), never when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv.slice(2), process.env).then((code) => {
    process.exitCode = code;
  });
}
