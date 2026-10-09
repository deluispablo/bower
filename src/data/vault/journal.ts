/**
 * The change journal (spec, "The change journal"): one small JSON file in
 * `.bower/changes/` for each thing you did in the app, so the next tidy-up
 * knows what happened and where to look. One file per change, so two
 * devices never write the same file; Drive cannot append. Files never
 * change once written, so normal reads are kept (the one read cache, by
 * id and modifiedTime); acknowledging a waiting copy always checks Drive afresh.
 */
import type { DriveApi, DriveFile } from '../drive/drive-api';
import { ReadCache } from '../drive/read-cache';
import type { ChangeKind } from '../types';
import { BowerError } from '../types';
import { byId, holds, Intended, makeOnce, makeText, reserveFor, updateByStamp, type Holder } from '../spine/write-once';
import { afterNotFound, isNoAnswer, type FailureKind } from '../drive/transport';
import { checkStillAsSeen } from '../contracts/still-as-seen';
import type { FailedChange } from '../sources';

export type { JournalExtra, JournalRecord } from '../contracts/journal-record';
import type { JournalExtra, JournalRecord } from '../contracts/journal-record';
import { isJournalRecord } from '../contracts/journal-record';

export interface JournalPlace {
  /** The id of `.bower/changes/`, made if missing. */
  folder: () => Promise<string>;
  /** The Bower folder's id: whose journal this is. */
  owner: () => Promise<string>;
  /** All copies of the journal, before paths are disambiguated. */
  files: () => Promise<DriveFile[]>;
  /** The vault's read cache, so a Home load reads each change once; a journal of its own when not given. */
  reads?: ReadCache;
  /** Told about each file the journal writes or bins, so a listing cache stays true. */
  wrote?: (f: DriveFile) => void;
  removed?: (id: string) => void;
  /** A change is kept only on this page; refresh the screen before reporting it. */
  waiting?: () => void;
  /** Drive no longer knows the changes folder it named (a 404): list the folder again before the next send. */
  stale?: () => void;
  /** A waiting line was refused for good and kept among what failed: refresh what the screen shows. */
  failed?: () => void;
}


/** What the person is told, once, when Drive refuses a line for good (it is made, but not noted for the next tidy-up). */
const REFUSED_LINE = "Your change was made, but Bower couldn't make a note of it.";

/**
 * What is true when Drive refuses a line for good: a rule, a request or an answer is the line itself, so nothing was
 * kept; any other change was made in Drive, and only its note for the next tidy-up is missing.
 */
function refusedSentence(rec: JournalRecord): string {
  if (rec.kind === 'rule') return rec.removes !== undefined ? "Bower couldn't take that rule out." : "Bower couldn't keep that rule.";
  if (rec.kind === 'request') return "Bower couldn't keep that request.";
  if (rec.kind === 'answer') return "Bower couldn't keep your answer.";
  return REFUSED_LINE;
}

/** The kinds of change made in Drive before their line is written; a rule, a request or an answer is the line itself. */
const madeInDrive = (kind: ChangeKind): boolean => kind !== 'rule' && kind !== 'request' && kind !== 'answer';

/**
 * What the person is told when a line waits for them to act (a full Drive, `wait` in the transport's table): what is in
 * the way, then what became of the change; the line keeps its id and goes on a later try.
 */
const waitSentence = (inTheWay: string, rec: JournalRecord): string =>
  `${inTheWay} ${madeInDrive(rec.kind) ? 'Your change was made; Bower will note it later.' : 'Bower kept this and will send it later.'}`;

/** How a send of one line ended: sent, waiting for a later try, refused for good, or waiting on the person (`waits`). */
type Sent = 'sent' | 'later' | 'refused' | { waits: string };

/**
 * The lines Drive refused for good while nobody waited on them (a send at start, back online, or before another
 * change), per Bower folder: each is shown once among what failed, until it is put away. Forgotten at sign-out
 * (`device.ts`). Where storage refuses, they are kept in this page's memory.
 */
export const FAILED_KEY = 'bower:failed-lines';
const failedInMemory = new Map<string, FailedChange[]>();

/** Sign-out (`device.ts`): what failed and was kept only in this page's memory is forgotten with the rest. */
export function forgetFailedInMemory(): void {
  failedInMemory.clear();
}

const isFailed = (v: unknown): v is FailedChange =>
  typeof v === 'object' && v !== null && ['id', 'what', 'sentence'].every((k) => typeof (v as Record<string, unknown>)[k] === 'string') &&
  ((v as FailedChange).seen === true || (v as FailedChange).seen === undefined);

function readFailed(): Record<string, FailedChange[]> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FAILED_KEY) ?? '{}');
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('Unreadable failed changes');
    const out: Record<string, FailedChange[]> = {};
    for (const [k, list] of Object.entries(v)) out[k] = Array.isArray(list) ? list.filter(isFailed) : [];
    return out;
  } catch (e) {
    console.error(e);
    return {};
  }
}

function failedOf(folder: string): FailedChange[] {
  return failedInMemory.get(folder) ?? readFailed()[folder] ?? [];
}

function keepFailed(folder: string, list: FailedChange[]): void {
  const all = Object.fromEntries(Object.entries({ ...readFailed(), [folder]: list }).filter(([, l]) => l.length));
  try {
    if (Object.keys(all).length) localStorage.setItem(FAILED_KEY, JSON.stringify(all));
    else localStorage.removeItem(FAILED_KEY);
    failedInMemory.delete(folder);
  } catch (e) {
    console.error(e);
    failedInMemory.set(folder, list);
  }
}

/** This device's unsent lines, per Bower folder, so one person's never reach another's. */
/** Where this device keeps a folder's change outbox (live sources read it to know lines wait). */
export const outboxKey = (folder: string): string => `bower:outbox:${folder}`;

/**
 * A line waiting to be sent, the holder of the id Drive reserved for its file once one was (`spine/write-once.ts`, the
 * outbox port): kept with the line until its create is confirmed, so a line whose answer was lost is sent again with the
 * same id and found by it, after a reload too, never written twice. An outbox from before keeps bare lines; each gets its
 * id before it is sent.
 */
interface Waiting extends Holder { line: JournalRecord; notFound?: true }

const isWaiting = (v: unknown): v is Waiting =>
  typeof v === 'object' && v !== null && isJournalRecord((v as Waiting).line) && (typeof (v as Waiting).reserved === 'string' || (v as Waiting).reserved === undefined) &&
  ((v as Waiting).notFound === true || (v as Waiting).notFound === undefined);

function readOutbox(key: string): Waiting[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(v)) throw new Error('Unreadable change outbox');
    return v.map((x: unknown): Waiting => {
      if (isWaiting(x)) return x;
      if (isJournalRecord(x)) return { line: x };
      throw new Error('Unreadable change outbox');
    });
  } catch (e) {
    console.error(e);
    throw new BowerError('unknown', 'Bower cannot read your waiting changes; keep this page open.');
  }
}

function writeOutbox(key: string, recs: Waiting[]): boolean {
  try {
    if (recs.length) localStorage.setItem(key, JSON.stringify(recs));
    else localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/** Isolated by Drive as well as folder: simulated Drives may reuse ids after a reset. */
const volatile = new WeakMap<DriveApi, Map<string, Waiting[]>>();

export class Journal {
  private readonly volatile: Map<string, Waiting[]>;
  private readonly reads: ReadCache;
  /** Drive files per record id (a line written twice has two), as last read or written, for remove. */
  private filesOf = new Map<string, DriveFile[]>();
  /** The line each intended create made while it waits, by the caller's intent (`write-once.ts`): sent again, it is that line. */
  private readonly intended = new Intended<Waiting>();
  /** Two changes in one millisecond still keep their order. */
  private lastAt = 0;
  /** Writes go one at a time, so a line is never sent twice nor dropped from the outbox by another write. */
  private queue: Promise<unknown> = Promise.resolve();

  private serial<T>(work: () => Promise<T>): Promise<T> {
    // expected: an earlier write's failure went to its own caller; this one runs anyway.
    const next = this.queue.then(work, work);
    // expected: the caller gets this failure through `next`; the queue only keeps the order.
    this.queue = next.catch(() => undefined);
    return next;
  }

  constructor(
    private readonly drive: DriveApi,
    private readonly place: JournalPlace,
    private readonly device: string,
    private readonly current: () => boolean = () => true,
    memoryDrive: DriveApi = drive,
  ) {
    this.reads = place.reads ?? new ReadCache();
    this.volatile = volatile.get(memoryDrive) ?? new Map();
    volatile.set(memoryDrive, this.volatile);
  }

  private checkCurrent(): void {
    if (!this.current()) throw new BowerError('unknown', 'Bower is no longer open on this page.');
  }

  dispose(): void {
    this.filesOf.clear();
    // Folder-keyed waiting records survive every session, including storage failures.
  }

  private waiting(key: string): Waiting[] {
    const byId = new Map(readOutbox(key).map((r) => [r.line.id, r]));
    for (const r of this.volatile.get(key) ?? []) byId.set(r.line.id, { ...byId.get(r.line.id), ...r });
    return [...byId.values()];
  }

  private keep(key: string, records: Waiting[]): boolean {
    // Memory is kept first: quota or blocked storage must never discard the current line.
    const previous = this.volatile.get(key) ?? [];
    this.volatile.set(key, records);
    if (!writeOutbox(key, records)) {
      // A failed removal did not take the change back; keep its memory copy too.
      const retained = new Map(previous.map((r) => [r.line.id, r]));
      for (const r of records) retained.set(r.line.id, r);
      this.volatile.set(key, [...retained.values()]);
      return false;
    }
    this.volatile.delete(key);
    return true;
  }

  /**
   * Writes the line of a change already done in Drive. When Drive does not
   * answer, the line waits in this device's outbox and goes with the next
   * one. If device storage also refuses it, its line is kept only on this
   * page's Drive instance: the caller gets an honest warning, with the
   * applied destination when the content change already happened. Closing
   * or resetting the page can lose such a line; it is never called saved.
   */
  async record(kind: ChangeKind, what: string, extra: JournalExtra = {}, intent?: string): Promise<JournalRecord> {
    // The same intended create sent again (a person's retry): the line kept for it, never a second one.
    const kept = intent === undefined ? undefined : this.intended.holder(intent);
    const rec: JournalRecord = kept?.line ?? this.newLine(kind, what, extra);
    const line: Waiting = kept ?? { line: rec };
    // Capture the original owner before queue admission, including post-effect bookkeeping.
    const owner = await this.place.owner();
    const key = outboxKey(owner);
    return this.serial(async () => {
      if (!this.current()) {
        if (extra.fileId && kind !== 'rule' && kind !== 'request' && kind !== 'answer') {
          let previous = this.volatile.get(key) ?? [];
          let readable = true;
          try { previous = this.waiting(key); } catch (e) { console.error(e); readable = false; }
          if (readable) this.keep(key, [...previous, line]);
          else this.volatile.set(key, [...previous, line]);
        }
        this.checkCurrent();
      }
      // Nothing waiting (the usual case): no lock to take, so the change answers at once.
      let readable = true;
      try {
        if (this.waiting(key).length) await this.acrossTabs(key, () => this.sendWaiting(key));
      } catch (e) {
        console.error(e);
        readable = false;
      }
      let w = line;
      if (kept && intent !== undefined) {
        const pending = this.pendingLine(key, rec.id);
        if (pending === null) {
          // Sent with the others meanwhile, or ended among what failed: done either way, and said so once.
          this.intended.forget(intent);
          if (failedOf(owner).some((f) => f.id === rec.id)) throw new BowerError('unknown', refusedSentence(rec));
          return rec;
        }
        // Under the id reserved for it (`spine/write-once.ts`): found by it if an earlier try landed.
        w = pending ?? line;
      }
      const sentNow = await this.send(w);
      if (intent !== undefined) {
        if (sentNow === 'sent' || sentNow === 'refused') this.intended.forget(intent);
        else this.intended.keep(intent, w);
      }
      if (kept && (sentNow === 'sent' || sentNow === 'refused')) this.drop(key, rec.id);
      // What the screen follows: where the thing is now, made in Drive whatever became of its line.
      const where = { path: kind === 'trash' ? null : (extra.path ?? null) };
      if (sentNow === 'refused') {
        this.checkCurrent();
        // Told now, to the person who made it; the line no longer exists, so there is nothing to take back.
        throw new BowerError('unknown', refusedSentence(rec), madeInDrive(kind) && extra.fileId ? where : undefined);
      }
      if (sentNow !== 'sent') {
        let previous = this.volatile.get(key) ?? [];
        if (readable) {
          try { previous = this.waiting(key); } catch (e) { console.error(e); readable = false; }
        }
        const records = previous.some((r) => r.line.id === rec.id) ? previous.map((r) => (r.line.id === rec.id ? w : r)) : [...previous, w];
        const saved = readable ? this.keep(key, records) : false;
        if (!readable) this.volatile.set(key, records);
        const applied = !!extra.fileId && madeInDrive(kind);
        if (!saved) {
          this.place.waiting?.();
          throw new BowerError('unknown', applied ? 'Your change was made; keep this page open so Bower can remember it.' : 'This is not safely saved; keep this page open.', applied ? { ...where, changeId: rec.id } : undefined);
        }
        if (sentNow !== 'later') {
          this.checkCurrent();
          throw new BowerError('unknown', waitSentence(sentNow.waits, rec), applied ? { ...where, changeId: rec.id } : undefined);
        }
      }
      this.checkCurrent();
      return rec;
    });
  }

  private newLine(kind: ChangeKind, what: string, extra: JournalExtra): JournalRecord {
    const at = (this.lastAt = Math.max(Date.now(), this.lastAt + 1));
    const id = `${new Date(at).toISOString().replace(/:/g, '-')}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    return { v: 1, id, at, kind, what, device: this.device, ...extra };
  }

  /** The waiting line with this id: null when it no longer waits, undefined when the outbox cannot be read. */
  private pendingLine(key: string, id: string): Waiting | null | undefined {
    try {
      return this.waiting(key).find((r) => r.line.id === id) ?? null;
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  /** A line that went (or ended) leaves the outbox; one that cannot be taken out is found sent by its id next time. */
  private drop(key: string, id: string): void {
    try {
      this.keep(key, this.waiting(key).filter((r) => r.line.id !== id));
    } catch (e) {
      console.error(e);
    }
  }

  /** Sends what waits in the outbox (before a tidy-up, back online, at start); what still cannot go stays. */
  async flush(): Promise<void> {
    const key = outboxKey(await this.place.owner());
    return this.serial(() => this.acrossTabs(key, () => this.sendWaiting(key, true)));
  }

  /** Two tabs of this browser share one outbox: one sends it at a time (Web Locks, where the browser has them). */
  private async acrossTabs<T>(key: string, work: () => Promise<T>): Promise<T> {
    this.checkCurrent();
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return work();
    return locks.request(key, () => { this.checkCurrent(); return work(); });
  }

  private async sendWaiting(key: string, required = false): Promise<void> {
    this.checkCurrent();
    const waiting = this.waiting(key);
    if (!waiting.length) return;
    // A line whose answer was lost may be in Drive already, archived by a run or not: never write it twice. It is sent
    // again with the id reserved for it, and Drive refuses a second file with that id, so it is found by it. Lines with
    // none yet get theirs from the home in one request, kept in the outbox before any is sent.
    const bare = waiting.filter((r) => r.reserved === undefined);
    if (bare.length) {
      try {
        await reserveFor(this.drive, bare);
      } catch (e) {
        console.error(e);
        if (required) throw new BowerError('offline', 'Your changes must arrive before Bower can tidy up.');
        return;
      }
      this.checkCurrent();
      // Each line read again is kept as the holder the home gave its id to.
      const held = new Map(bare.map((r) => [r.line.id, r]));
      this.keep(key, this.waiting(key).map((r) => {
        const h = held.get(r.line.id);
        return r.reserved === undefined && h ? { ...r, ...h } : r;
      }));
    }
    const sent = new Set<string>();
    const refused: FailedChange[] = [];
    for (const r of waiting) {
      this.checkCurrent();
      const out = await this.send(r);
      if (out === 'sent' || out === 'refused') sent.add(r.line.id);
      if (out === 'refused') refused.push({ id: r.line.id, what: r.line.what, sentence: refusedSentence(r.line) });
    }
    // Only what was sent, or ended as failed, leaves; anything added meanwhile stays, and a 404 met is kept with its line.
    this.checkCurrent();
    const metNotFound = new Set(waiting.filter((r) => r.notFound).map((r) => r.line.id));
    this.keep(key, this.waiting(key).filter((r) => !sent.has(r.line.id)).map((r) => (metNotFound.has(r.line.id) ? { ...r, notFound: true as const } : r)));
    // Nobody waits on a line that waited: it is kept among what failed, shown once until put away, never sent again.
    if (refused.length) {
      const folder = await this.place.owner();
      const known = failedOf(folder);
      keepFailed(folder, [...known, ...refused.filter((f) => !known.some((k) => k.id === f.id))]);
      this.place.failed?.();
    }
    if (required && sent.size !== waiting.length) throw new BowerError('offline', 'Your changes must arrive before Bower can tidy up.');
  }

  /**
   * Sends one line with the id the home keeps on it (`spine/write-once.ts`), reserved now when it has none: a lost answer
   * is found again by that id, now or on a later try, after a reload too; a refusal lets it go.
   */
  private async send(w: Waiting): Promise<Sent> {
    const rec = w.line;
    // The kind of a failed create, once it was sent (`kindOf`, told once); a failure before it is not the line's.
    const tried: { kind?: FailureKind } = {};
    try {
      this.checkCurrent();
      const folder = await this.place.folder();
      this.checkCurrent();
      const text = `${JSON.stringify(rec)}\n`;
      const f = await makeOnce(w, this.drive, (id) => makeText(this.drive, this.drive, { parent: folder, name: `${rec.id}.json`, id }, text), (e) => (tried.kind = this.kindOf(w, e)));
      if (this.current()) {
        this.reads.wrote(f, text);
        this.filesOf.set(rec.id, [...(this.filesOf.get(rec.id) ?? []), f]);
        this.place.wrote?.(f);
      }
      return 'sent';
    } catch (e) {
      console.error(e);
      // One table tells what becomes of it (`transport.ts`): tried again later, waiting on the person, or refused for good.
      if (tried.kind === 'retry') return 'later';
      if (tried.kind === 'wait') return { waits: e instanceof BowerError ? e.message : '' };
      // Refused for good: the line leaves the outbox with its id. A conflict whose read-back found no file under that id
      // is permanent here too; the home keeps the id then (unsettled), but this line is never sent again, so no second file.
      if (tried.kind === 'permanent') return 'refused';
      // Its place or id could not be had: the line itself was not refused, so it waits (on the person, when they must
      // act); only a place still not found after a fresh listing ends it.
      const kind = this.kindOf(w, e);
      if (kind === 'permanent' && w.notFound && e instanceof BowerError && e.code === 'not-found') return 'refused';
      return kind === 'wait' && e instanceof BowerError ? { waits: e.message } : 'later';
    }
  }

  /**
   * The table's kind for a failed try of `w`. A 404 (a stale changes folder, deleted elsewhere) is listed again before
   * the one more try, which makes the folder anew if gone; a second 404 for the line is permanent (`afterNotFound`).
   */
  private kindOf(w: Waiting, e: unknown): FailureKind {
    const kind = afterNotFound(e, w.notFound === true);
    if (e instanceof BowerError && e.code === 'not-found' && !w.notFound) {
      w.notFound = true;
      this.place.stale?.();
    }
    return kind;
  }

  /** The lines Drive refused for good while nobody waited on them, not yet put away. */
  async failed(): Promise<FailedChange[]> {
    return failedOf(await this.place.owner());
  }

  /** The screen turned to a line that failed (once per failure): it is kept seen, so no later load turns to it again. */
  async markSeen(id: string): Promise<void> {
    const folder = await this.place.owner();
    keepFailed(folder, failedOf(folder).map((f) => (f.id === id ? { ...f, seen: true as const } : f)));
  }

  /** The person has seen a line that failed: it is not shown again. */
  async putAway(id: string): Promise<void> {
    const folder = await this.place.owner();
    keepFailed(folder, failedOf(folder).filter((f) => f.id !== id));
  }

  /** Every change since the last tidy-up, oldest first, each once (Drive and this device's outbox). */
  async list(): Promise<JournalRecord[]> {
    this.checkCurrent();
    const key = outboxKey(await this.place.owner());
    const files = (await this.place.files()).filter((f) => !f.folder && f.name.endsWith('.json'));
    const byId = new Map<string, JournalRecord>();
    const seenFiles = new Map<string, DriveFile[]>();
    // The lines are asked for together (a dozen at 300 ms each are one wait, not a dozen); each version is read once.
    const records = await Promise.all(files.map(async (f) => {
      try {
        const v: unknown = JSON.parse(await this.reads.text(f, () => this.drive.readText(f.id)));
        if (!isJournalRecord(v)) throw new BowerError('unknown', 'Bower could not read your changes.');
        return v;
      } catch (e) {
        console.error(e);
        if (e instanceof SyntaxError) throw new BowerError('unknown', 'Bower could not read your changes.');
        throw e;
      }
    }));
    this.checkCurrent();
    files.forEach((f, i) => {
      const rec = records[i];
      if (!rec) return;
      byId.set(rec.id, rec);
      seenFiles.set(rec.id, [...(seenFiles.get(rec.id) ?? []), f]);
    });
    this.checkCurrent();
    for (const [rid, ids] of seenFiles) this.filesOf.set(rid, ids);
    for (const { line } of this.waiting(key)) if (!byId.has(line.id)) byId.set(line.id, line);
    return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }

  /** Takes a change back (an Undo): its file goes to the Bin, or it leaves the outbox. */
  async remove(id: string): Promise<void> {
    const key = outboxKey(await this.place.owner());
    return this.serial(() => this.removeNow(id, key));
  }

  private async removeNow(id: string, key: string): Promise<void> {
    this.checkCurrent();
    const waiting = this.waiting(key);
    if (waiting.some((r) => r.line.id === id) && !this.keep(key, waiting.filter((r) => r.line.id !== id))) {
      this.volatile.set(key, waiting);
      throw new BowerError('unknown', 'Bower could not take that change back; keep this page open.');
    }
    if (!this.filesOf.has(id)) await this.list();
    for (const file of this.filesOf.get(id) ?? []) {
      this.checkCurrent();
      // Still as listed (the one fence, `checkStillAsSeen`): moved, renamed or binned elsewhere, nothing is sent; already
      // in the Bin by this very Undo (its answer lost), it landed. Then sent once with its stamp: a lost answer is found
      // again by reading the file by its id.
      const landed = await checkStillAsSeen({ id: file.id, name: file.name, parents: file.parents }, () => byId(this.drive, file.id), 'This changed somewhere else. Look again and try once more.', { unanswered: isNoAnswer, landed: (now) => holds(file, 'bin', now) });
      if (!landed) await updateByStamp(this.drive, file, 'bin', (op) => this.drive.trash(file.id, op));
      this.place.removed?.(file.id);
    }
    this.filesOf.delete(id);
  }
}
