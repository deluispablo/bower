/**
 * The report barrier (TL-P3-22 point 2; ARCHITECTURE invariant 6: persist the report before publishing success),
 * shared by the fake run service and the runner (TL-P3-21 point 2: extracted, not ported). After a run's last
 * operation checkpoint, the report files the worker contract lists are brought up to date in `.bower`:
 * `questions.json`, `suggestions.json`, `requests.json` and `hashes.json` (shapes in `vault/layout.ts`), then
 * `last-run.json` last. Each write passes the modifiedTime it read; each file written is read back and its stored
 * checksum compared with the checksum of the bytes meant to be there (on Drive, `md5Checksum`). Only then may the
 * caller say `done`. A reply lost after a write landed is reconciled by the exact body, never written twice.
 *
 * - A report file is written only when it is missing or the run changes it (a question it asks); one already up to
 *   date is not written again, so saving twice (a redispatch) writes nothing.
 * - `last-run.json` replaces only a view the caller may replace (`mayReplace`); a later run's view is never written
 *   over, and a view it cannot replace stops the save.
 *
 * Reads come through the records' small read interface and writes through a `FencedDrive`; no I/O of its own.
 */
import type { DriveFile } from '../drive/drive-api';
import type { FencedDrive } from '../drive/fake-drive';
import { canonicalRecordJson } from '../contracts/record-json';
import { BowerError, type Question, type RunReport } from '../types';
import { SYSTEM, isRunnerFile, type LastRunFile, type RunnerFiles } from '../vault/layout';
import type { RecordReads } from './records';

/** A file's checksum as stored, and the same checksum of the bytes meant to be there. */
export interface Checksum {
  stored(id: string): Promise<string>;
  of(bytes: Uint8Array): Promise<string>;
}

export interface ReportSave {
  rootId: string;
  reads: RecordReads;
  checksum: Checksum;
  /** The fenced writes of the next write. */
  batch(): Promise<FencedDrive>;
  /** The run's report; null for a run that ended failed, which changes no report file. */
  report: RunReport | null;
  /** `last-run.json`'s text. */
  view: string;
  /** Whether the stored view (null when there is none) may be replaced by this one. */
  mayReplace(stored: string | null): Promise<boolean>;
}

type ReportFile = typeof SYSTEM.questions | typeof SYSTEM.suggestions | typeof SYSTEM.requests | typeof SYSTEM.hashes;

/** The report files, in the order they are written; `last-run.json` comes after them all. */
export const REPORT_FILES: readonly ReportFile[] = [SYSTEM.questions, SYSTEM.suggestions, SYSTEM.requests, SYSTEM.hashes];

const SAVE_FAILED = 'Bower could not save what it did. Try again later.';

const nameIn = (path: string): string => path.slice(SYSTEM.dir.length + 1);
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** A runner file's text, as the runner writes it. */
export function jsonText(body: unknown): string {
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** `last-run.json`'s text for a view. */
export function lastRunText(body: LastRunFile): string {
  return jsonText(body);
}

/** Brings the report files up to date, then writes `last-run.json` last; gives the paths written, in order. */
export async function saveReport(save: ReportSave): Promise<string[]> {
  const written: string[] = [];
  if (save.report) {
    for (const path of REPORT_FILES) {
      const found = await stored(save, path);
      const text = nextText(path, found ? found.text : null, save.report);
      if (text === null) continue;
      await write(save, path, found, text, (now) => now === text);
      written.push(path);
    }
  }
  const view = await stored(save, SYSTEM.lastRun);
  if (view && sameView(view.text, save.view)) return written;
  if (!(await save.mayReplace(view ? view.text : null))) {
    console.error(`${SYSTEM.lastRun} shows another run; it is not saved over`);
    throw new BowerError('conflict', SAVE_FAILED);
  }
  await write(save, SYSTEM.lastRun, view, save.view, (now) => sameView(now, save.view));
  written.push(SYSTEM.lastRun);
  return written;
}

/** Whether `last-run.json` shows run `runId` done, with its report (the runner's check before any write). */
export async function shownDone(reads: RecordReads, rootId: string, runId: string): Promise<boolean> {
  const view = await stored({ rootId, reads }, SYSTEM.lastRun);
  const value = view ? parsed(view.text) : undefined;
  return !!value && isRunnerFile(SYSTEM.lastRun, value) && value.run.id === runId && value.run.phase === 'done' && value.run.report !== undefined;
}

/**
 * Whether a run's view may replace the stored one: there is none, or it is a view of another run asked for
 * earlier. Never this run's own view with another body, a later run's, or one that cannot be read.
 */
export function olderView(stored: string | null, run: { id: string; requestedAt: number }): boolean {
  if (stored === null) return true;
  const value = parsed(stored);
  if (!isRunnerFile(SYSTEM.lastRun, value)) return false;
  return value.run.id !== run.id && value.run.requestedAt < run.requestedAt;
}

/** Whether two view texts hold the same body, compared in canonical form (key order and spacing aside). */
export function sameView(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const canon = (text: string): string | null => {
    const value = parsed(text);
    if (value === undefined) return null;
    const bytes = canonicalRecordJson(value);
    return bytes.ok ? decode(bytes.value) : null;
  };
  const x = canon(a);
  return x !== null && x === canon(b);
}

/**
 * A report with its keys in one fixed order, whatever object it came from (in memory, or parsed back from a
 * canonical record with its keys sorted), so a view written again is byte-identical.
 */
export function fixedReport(r: RunReport): RunReport {
  const out: RunReport = {
    filed: r.filed.map((f) => ({ name: f.name, title: f.title, kind: f.kind, to: f.to, ...(f.note !== undefined ? { note: f.note } : {}) })),
    created: r.created.map((c) => ({ path: c.path, what: c.what })),
    updated: r.updated.map((u) => ({ path: u.path, what: u.what })),
    setAside: r.setAside.map((a) => ({ name: a.name, why: a.why })),
    questions: r.questions.map(fixedQuestion),
  };
  if (r.yourChanges !== undefined) out.yourChanges = r.yourChanges;
  if (r.requests !== undefined) out.requests = [...r.requests];
  if (r.rulesWorded !== undefined) out.rulesWorded = r.rulesWorded;
  return out;
}

function fixedQuestion(q: Question): Question {
  return { id: q.id, text: q.text, yes: q.yes, no: q.no, ...(q.about !== undefined ? { about: q.about } : {}), askedAt: q.askedAt };
}

/**
 * A report file's next text, or null when it stays as it is. Questions the run asked join the open ones (by id,
 * once); a file that is missing is made in its shape. A file that cannot be read is replaced only when the run
 * has something to put in it, and is otherwise left for the app's own repair.
 */
function nextText(path: ReportFile, now: string | null, report: RunReport): string | null {
  const value = now === null ? undefined : parsed(now);
  const readable = now !== null && isRunnerFile(path, value);
  if (path === SYSTEM.questions) {
    const open = readable && isRunnerFile(SYSTEM.questions, value) ? value.questions : [];
    const fresh = report.questions.filter((q) => !open.some((o) => o.id === q.id)).map(fixedQuestion);
    if (now !== null && !fresh.length) return null;
    if (now !== null && !readable) console.error(`${path} could not be read; the questions this run asked replace it`);
    return jsonText({ v: 1, questions: [...open, ...fresh] } satisfies RunnerFiles[typeof SYSTEM.questions]);
  }
  if (now !== null) return null;
  switch (path) {
    case SYSTEM.suggestions: return jsonText({ v: 1, suggestions: [] } satisfies RunnerFiles[typeof SYSTEM.suggestions]);
    case SYSTEM.requests: return jsonText({ v: 1, done: [] } satisfies RunnerFiles[typeof SYSTEM.requests]);
    case SYSTEM.hashes: return jsonText({ v: 1, hashes: {} } satisfies RunnerFiles[typeof SYSTEM.hashes]);
  }
}

interface Stored {
  file: DriveFile;
  text: string;
}

/** The `.bower` folder and the file at `path` in it, from one listing. */
async function where(save: Pick<ReportSave, 'rootId' | 'reads'>, path: string): Promise<{ sys: DriveFile | null; file: DriveFile | null }> {
  const listing = await save.reads.listAll(save.rootId);
  const sys = listing.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === save.rootId) ?? null;
  const file = sys ? listing.find((f) => !f.folder && f.name === nameIn(path) && f.parents[0] === sys.id) ?? null : null;
  return { sys, file };
}

async function stored(save: Pick<ReportSave, 'rootId' | 'reads'>, path: string): Promise<Stored | null> {
  const { file } = await where(save, path);
  return file ? { file, text: decode(await save.reads.readBytes(file.id)) } : null;
}

/**
 * Writes one file with the modifiedTime it read (or makes it), then reads it back: the stored checksum must be the
 * checksum of these bytes. A write whose answer was lost is done when `landed` holds for what is there.
 */
async function write(save: ReportSave, path: string, found: Stored | null, text: string, landed: (now: string) => boolean): Promise<void> {
  const w = await save.batch();
  try {
    if (found) await w.writeText(found.file.id, text, found.file.modifiedTime);
    else await w.createText(await system(save, w), nameIn(path), text);
  } catch (e) {
    const now = await stored(save, path);
    if (!now || !landed(now.text)) throw e;
    // It landed and only its answer was lost: the same file, not a second one.
    console.error(e);
  }
  const { file } = await where(save, path);
  if (!file) {
    console.error(`${path} is not there after it was written`);
    throw new BowerError('unknown', SAVE_FAILED);
  }
  const [now, meant] = await Promise.all([save.checksum.stored(file.id), save.checksum.of(encode(text))]);
  if (now !== meant && !landed(decode(await save.reads.readBytes(file.id)))) {
    console.error(`${path} could not be read back as it was written`);
    throw new BowerError('unknown', SAVE_FAILED);
  }
}

/** The `.bower` folder, made when missing; a lost reply finds the folder that landed. */
async function system(save: ReportSave, w: FencedDrive): Promise<string> {
  const { sys } = await where(save, SYSTEM.dir);
  if (sys) return sys.id;
  try {
    return (await w.createFolder(save.rootId, SYSTEM.dir)).id;
  } catch (e) {
    const landed = (await where(save, SYSTEM.dir)).sys;
    if (!landed) throw e;
    console.error(e);
    return landed.id;
  }
}

/** A runner file's value; undefined, said once in the log, when it is not JSON. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    console.error(e);
    return undefined;
  }
}
