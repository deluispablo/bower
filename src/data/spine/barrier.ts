/**
 * The report barrier (TL-P3-22 point 2; ARCHITECTURE invariant 6: persist the report before publishing success),
 * shared by the fake run service and the runner (TL-P3-21 point 2: extracted, not ported). After a run's last
 * operation checkpoint, the report files the worker contract lists are brought up to date in `.bower`:
 * `questions.json`, `suggestions.json`, `requests.json` and `hashes.json` (shapes in `vault/layout.ts`), then
 * `last-run.json` last. Each write passes the modifiedTime it read, carries its stamp and is confirmed by the checksum
 * its answer gives (`write-once.ts`). Only then may the caller say `done`. A reply lost after a write landed is found
 * again by its stamp, never written twice.
 *
 * - A report file is written only when it is missing or the run changes it (a question it asks); one already up to
 *   date is not written again, so saving twice (a redispatch) writes nothing.
 * - `last-run.json` replaces only a view the caller may replace (`mayReplace`); a later run's view is never written
 *   over, and a view it cannot replace stops the save.
 *
 * Reads come through the records' small read interface and writes through a `FencedDrive`; no I/O of its own.
 */
import type { DriveFile, FencedDrive } from '../drive/drive-api';
import { canonicalRecordJson } from '../contracts/record-json';
import { BowerError, type Question, type RunReport } from '../types';
import { SYSTEM, isRunnerFile, type LastRunFile, type RunnerFiles } from '../vault/layout';
import type { Checkpoint } from '../contracts/run-checkpoint';
import type { AdmissionManifest } from './admission';
import { canonical, checkpointName, nextCheckpoint, reportName, type AttemptMark, type CheckpointPatch, type RecordReads, type RunManifest, type RunRecords } from './records';
import { makeFolder, makeText, updateByStamp } from './write-once';
import { dispositionsFor, itemDispositions, materialize, reportContradictions, type ItemDisposition } from './report';

export interface ReportSave {
  rootId: string;
  reads: RecordReads;
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
  // What is stored of each file is read together (reads only, of different files); the writes then go one at a time,
  // in order, each on what it read of its own file.
  const paths: readonly string[] = [...(save.report ? REPORT_FILES : []), SYSTEM.lastRun];
  const before = new Map(await Promise.all(paths.map(async (path) => [path, await stored(save, path)] as const)));
  if (save.report) {
    for (const path of REPORT_FILES) {
      const found = before.get(path) ?? null;
      const text = nextText(path, found ? found.text : null, save.report);
      if (text === null) continue;
      await write(save, path, found, text);
      written.push(path);
    }
  }
  const view = before.get(SYSTEM.lastRun) ?? null;
  // Already there (a restarted run): nothing more to write.
  if (view && sameView(view.text, save.view)) return written;
  if (!(await save.mayReplace(view ? view.text : null))) {
    console.error(`${SYSTEM.lastRun} shows another run; it is not saved over`);
    throw new BowerError('conflict', SAVE_FAILED);
  }
  await write(save, SYSTEM.lastRun, view, save.view);
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
    filed: r.filed.map((f) => ({ name: f.name, title: f.title, kind: f.kind, to: f.to, ...(f.note !== undefined ? { note: f.note } : {}), ...(f.area !== undefined ? { area: f.area } : {}) })),
    created: r.created.map((c) => ({ path: c.path, what: c.what })),
    updated: r.updated.map((u) => ({ path: u.path, what: u.what, ...(['op', 'line', 'lines', 'md5', 'stamp'] as const).reduce((o, k) => (u[k] === undefined ? o : { ...o, [k]: u[k] }), {}) })),
    setAside: r.setAside.map((a) => ({ name: a.name, why: a.why })),
    questions: r.questions.map(fixedQuestion),
  };
  if (r.yourChanges !== undefined) out.yourChanges = r.yourChanges;
  if (r.leftAsWritten?.length) out.leftAsWritten = r.leftAsWritten.map((r) => ({ name: r.name, why: r.why, ...(r.fileId ? { fileId: r.fileId } : {}) }));
  if (r.requests !== undefined) out.requests = [...r.requests];
  if (r.rulesWorded !== undefined) out.rulesWorded = r.rulesWorded;
  if (r.nothingReady) out.nothingReady = true;
  if (r.alreadySaved?.length) out.alreadySaved = r.alreadySaved.map((a) => ({ name: a.name, as: a.as, ...(a.notes !== undefined ? { notes: a.notes } : {}) }));
  if (r.unconfirmed?.length) out.unconfirmed = r.unconfirmed.map((a) => ({ name: a.name, why: a.why }));
  if (r.kept?.length) out.kept = r.kept.map((a) => ({ name: a.name, why: a.why }));
  if (r.answered?.length) out.answered = r.answered.map((a) => ({ questionId: a.questionId, kind: a.kind, outcome: a.outcome, why: a.why, ...(a.note !== undefined ? { note: a.note } : {}) }));
  if (r.waiting) out.waiting = r.waiting;
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
 * Writes one file with the modifiedTime it read (or makes it by its reserved id), stamped by the version it replaces
 * and its bytes, and confirmed by its answer's checksum (`write-once.ts`).
 */
async function write(save: ReportSave, path: string, found: Stored | null, text: string): Promise<void> {
  const w = await save.batch();
  if (!found) await makeText(w, save.reads, { parent: await system(save, w), name: nameIn(path) }, text);
  else await updateByStamp(save.reads, found.file, { text }, (op) => w.writeText(found.file.id, text, found.file.modifiedTime, op));
}

/** The `.bower` folder, made when missing; a lost reply finds the folder that landed by its reserved id. */
async function system(save: ReportSave, w: FencedDrive): Promise<string> {
  const { sys } = await where(save, SYSTEM.dir);
  return (sys ?? (await makeFolder(w, save.reads, { parent: save.rootId, name: SYSTEM.dir }))).id;
}

/** A runner file's value; undefined, said once in the log, when it is not JSON. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A parser's message quotes the text: say only that it is not JSON.
    console.error('A runner file is not valid JSON');
    return undefined;
  }
}

/**
 * Ending a settled run (`finishRun`), for the runner and the fake run service alike: the report barrier (TL-P3-22
 * point 2; ARCHITECTURE invariant 6), after the last operation checkpoint:
 *
 * 1. The report, made from the fixed plan and the settled outcomes, is committed in the chain as pending: "effects
 *    done, report pending". From here a run that stops stays in `saving`, and a redispatch resumes here: every
 *    operation is settled, so no effect is applied again.
 * 2. The report is checked against where every admitted item ended (`reportContradictions`): one that contradicts
 *    them stops the run here, in `saving`, with nothing more written. The report record goes in the run's folder, confirmed by its answer, and each declared pile filed whole gets its consumed
 *    disposition in `.bower/piles`. Then `dispositions.json` in the run's folder: one line for every admitted item,
 *    journal lines included, filed, set aside or waiting (`itemDispositions`); one already there is left as it is.
 * 3. The report files, then `.bower/last-run.json` last, through the shared barrier (`src/data/spine/barrier.ts`),
 *    each confirmed by its answer's checksum.
 * 4. Only then is the report published and the run done in the chain; the caller reports `done` after this.
 *
 * Every write is the same on a second try: a record already there with these bytes, or a file that already says
 * it, is not written again; the view's times come from the chain, so a redispatch writes the same view.
 */
export interface BarrierRun {
  rootId: string;
  runId: string;
  attempt: number;
  records: RunRecords;
  /** Reads of `.bower` (the report files) and the run's records. */
  reads: RecordReads;
  /** The fenced writes of the next batch (the adapter's `batch()`, which checks the attempt first). */
  batch(): Promise<FencedDrive>;
  /**
   * The same fenced writes with no attempt read of their own, for a write right after a `batch()`: each fenced write
   * reads the attempt again right before it is sent. Without it, every write asks `batch()`.
   */
  fenced?(): FencedDrive;
  /** What the run was admitted to take; null when the Worker kept none. */
  admission: AdmissionManifest | null;
  clock(): number;
  newId(): string;
  /** Called once "effects done, report pending" is in the chain, with it (the runner reports `saving` then). */
  onPending?(chain: Checkpoint[]): Promise<void>;
  /** Whether the stored view may be replaced; a view of an earlier run (`olderView`) when not given. */
  mayReplace?(stored: string | null): Promise<boolean>;
}

/** Where every admitted item ended, in the run's folder. */
export const DISPOSITIONS = 'dispositions.json';

/** `dispositions.json`: one line per admitted item. */
export interface DispositionsFile {
  v: 1;
  runId: string;
  items: ItemDisposition[];
}

export interface Finished {
  chain: Checkpoint[];
  /** The report files written, in order, `last-run.json` last. */
  written: string[];
  /** One for every admitted item; empty with no admission manifest. */
  dispositions: ItemDisposition[];
  /**
   * Whether a "Write it" the person granted was refused by a clash at the write itself: its answer stays in your
   * changes, and the run's end says so, so the Worker starts the run that asks again (TL-P4-19 addendum 15). Only a
   * clash: the run after it asks the person again, which needs a new answer; any other refusal would be tried again
   * with nothing changed, a loop (addendum 16).
   */
  answersStayed: boolean;
}

/** Whether an operation of `manifest` writes a Current state the person granted, and was refused by a clash (`Finished`). */
function grantedClashed(manifest: RunManifest, outcomes: Checkpoint['outcomes']): boolean {
  return manifest.operations.some((o, i) => {
    const out = outcomes[i];
    return o.effect.kind === 'edit-text' && o.effect.changes.some((c) => c.kind === 'state-rewrite' && c.granted !== undefined) && out?.state === 'rejected' && out.failure.code === 'conflict';
  });
}

const UNRESOLVED = 'Bower could not check one of the things it moved. It will look again later.';

/** Ends a settled run: the report saved and confirmed, then done in the chain. Throws, leaving it in `saving`, when it cannot. */
export async function finishRun(run: BarrierRun, manifest: RunManifest, manifestHash: string, settled: Checkpoint[]): Promise<Finished> {
  let chain = settled;
  let at = chain.at(-1);
  if (!at) throw new BowerError('unknown', SAVE_FAILED);
  const where = { runId: run.runId };
  const mark: AttemptMark = { attemptId: run.newId(), epoch: run.attempt };
  const dispositions = (outcomes: Checkpoint['outcomes']): ItemDisposition[] => (run.admission ? itemDispositions(run.admission, manifest, outcomes) : []);
  if (at.phase === 'done') return { chain, written: [], dispositions: dispositions(at.outcomes), answersStayed: grantedClashed(manifest, at.outcomes) };
  if (at.phase === 'failed') throw new BowerError('unknown', SAVE_FAILED);

  const commit = async (patch: CheckpointPatch): Promise<Checkpoint> => {
    const head = chain.at(-1);
    if (!head) throw new BowerError('unknown', SAVE_FAILED);
    const next = nextCheckpoint(head, (await canonical(head)).hash, mark, patch);
    const c = await canonical(next);
    await run.records.putNew(await run.batch(), where, checkpointName(next.revision, c.hash), c.text);
    chain = [...chain, next];
    return next;
  };

  // 1. Effects done, report pending.
  if (at.report.state === 'not-ready') {
    const body = materialize(manifest, manifestHash, at.outcomes);
    if (!body) {
      console.error(`Run ${run.runId} has an operation not settled at its report`);
      throw new BowerError('unknown', UNRESOLVED);
    }
    at = await commit({ phase: 'saving', phaseAt: run.clock(), report: { state: 'pending', reportHash: (await canonical(body)).hash, body } });
  }
  const pending = chain.find((c) => c.report.state === 'pending');
  if (pending?.report.state !== 'pending') throw new BowerError('unknown', SAVE_FAILED);
  await run.onPending?.(chain);
  const body = pending.report.body;
  const r = await canonical(body);
  if (r.hash !== pending.report.reportHash) throw new BowerError('unknown', SAVE_FAILED);
  // Never a summary that contradicts where the items ended (TL-P3-24 point 1): the run stops here, in `saving`.
  const wrong = run.admission ? reportContradictions(run.admission, manifest, at.outcomes, dispositions(at.outcomes)) : [];
  if (wrong.length) {
    console.error(`Run ${run.runId}: its dispositions contradict its report`, wrong);
    throw new BowerError('unknown', SAVE_FAILED);
  }

  // The attempt is asked once for the report's writes; every fenced write asks it again right before it is sent.
  let asked = false;
  const writes = async (): Promise<FencedDrive> => {
    if (asked && run.fenced) return run.fenced();
    asked = true;
    return run.batch();
  };

  // 2. The report record, confirmed by its answer, and the consumed dispositions.
  await run.records.put(await writes(), where, reportName(r.hash), r.text);
  for (const d of dispositionsFor(manifest, at.outcomes, r.hash)) await run.records.putDisposition(await writes(), d);
  if ((await run.records.read(where, DISPOSITIONS)) === null) {
    const file: DispositionsFile = { v: 1, runId: run.runId, items: dispositions(at.outcomes) };
    // A fenced create, confirmed by its answer; a reply lost after it landed is not a second file.
    await run.records.put(await writes(), where, DISPOSITIONS, jsonText(file));
  }

  // 3. The report files, then last-run.json last, each confirmed. The view's times are those of the pending report.
  const finishedAt = pending.phaseAt;
  const report = fixedReport(body.report);
  const view = lastRunText({
    v: 1,
    run: { id: manifest.runId, scope: manifest.runScope, phase: 'done', requestedAt: manifest.requestedAt, phaseAt: finishedAt, total: manifest.capture.members.length, finishedAt, report },
  });
  const written = await saveReport({
    rootId: run.rootId,
    reads: run.reads,
    batch: writes,
    report,
    view,
    mayReplace: run.mayReplace ?? (async (stored) => olderView(stored, { id: manifest.runId, requestedAt: manifest.requestedAt })),
  });

  // 4. Published and done, only now, with the piles kept where a Bin of their anchor was refused.
  const outcomes = at.outcomes;
  const retainedPileIds = manifest.operations.flatMap((o, i) => {
    const e = o.effect;
    return e.kind === 'bin' && outcomes[i]?.state === 'rejected' ? manifest.capture.piles.filter((p) => p.anchor?.fileId === e.before.fileId).map((p) => p.pileId) : [];
  });
  at = await commit({ phase: 'done', phaseAt: finishedAt, report: { state: 'published', reportHash: r.hash }, retainedPileIds });
  return { chain, written, dispositions: dispositions(at.outcomes), answersStayed: grantedClashed(manifest, at.outcomes) };
}
