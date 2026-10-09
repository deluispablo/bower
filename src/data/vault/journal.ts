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
import { makeText, updateByStamp } from '../spine/write-once';
import { isNoAnswer, isUnconfirmedWrite } from '../drive/transport';

export type { JournalExtra, JournalRecord } from '../contracts/journal-record';
export { isJournalRecord } from '../contracts/journal-record';
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
}


/** What the person is told, once, when Drive refuses a line for good (it is made, but not noted for the next tidy-up). */
const REFUSED_LINE = "Your change was made, but Bower couldn't make a note of it.";

/**
 * A refusal that will not change on a later try: a 4xx other than the 409 that proves a create landed (Drive's
 * "Resolve errors" guide, https://developers.google.com/workspace/drive/api/guides/handle-errors). No answer, a 5xx, a
 * sign-in or a conflict are retryable; the id stays with the line only for those.
 */
const refusedForGood = (e: unknown): boolean =>
  e instanceof BowerError && !isNoAnswer(e) && !isUnconfirmedWrite(e) && (e.code === 'unknown' || e.code === 'not-found');

/** This device's unsent lines, per Bower folder, so one person's never reach another's. */
/** Where this device keeps a folder's change outbox (live sources read it to know lines wait). */
export const outboxKey = (folder: string): string => `bower:outbox:${folder}`;

/**
 * A line waiting to be sent, with the id Drive reserved for its file once one was (`spine/write-once.ts`): kept with
 * the line until its create is confirmed, so a line whose answer was lost is sent again with the same id and found by
 * it, never written twice. An outbox from before keeps bare lines; each gets its id before it is sent.
 */
type Waiting = { line: JournalRecord; reserved?: string };

const isWaiting = (v: unknown): v is Waiting =>
  typeof v === 'object' && v !== null && isJournalRecord((v as Waiting).line) && (typeof (v as Waiting).reserved === 'string' || (v as Waiting).reserved === undefined);

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
  async record(kind: ChangeKind, what: string, extra: JournalExtra = {}): Promise<JournalRecord> {
    const at = (this.lastAt = Math.max(Date.now(), this.lastAt + 1));
    const id = `${new Date(at).toISOString().replace(/:/g, '-')}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    const rec: JournalRecord = { v: 1, id, at, kind, what, device: this.device, ...extra };
    const line: Waiting = { line: rec };
    // Capture the original owner before queue admission, including post-effect bookkeeping.
    const key = outboxKey(await this.place.owner());
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
      const sentNow = await this.send(line);
      if (sentNow === 'refused') {
        this.checkCurrent();
        throw new BowerError('unknown', REFUSED_LINE, { path: kind === 'trash' ? null : (extra.path ?? null), changeId: rec.id });
      }
      if (sentNow === 'later') {
        let previous = this.volatile.get(key) ?? [];
        if (readable) {
          try { previous = this.waiting(key); } catch (e) { console.error(e); readable = false; }
        }
        const records = [...previous, line];
        const saved = readable ? this.keep(key, records) : false;
        if (!readable) this.volatile.set(key, records);
        if (!saved) {
          this.place.waiting?.();
          const applied = !!extra.fileId && kind !== 'rule' && kind !== 'request' && kind !== 'answer';
          throw new BowerError('unknown', applied ? 'Your change was made; keep this page open so Bower can remember it.' : 'This is not safely saved; keep this page open.', applied ? { path: kind === 'trash' ? null : (extra.path ?? null), changeId: rec.id } : undefined);
        }
      }
      this.checkCurrent();
      return rec;
    });
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
    // none yet get theirs in one request, kept in the outbox before any is sent.
    const bare = waiting.filter((r) => r.reserved === undefined);
    if (bare.length) {
      try {
        const ids = await this.drive.generateIds(bare.length);
        bare.forEach((r, i) => (r.reserved = ids[i]));
      } catch (e) {
        console.error(e);
        if (required) throw new BowerError('offline', 'Your changes must arrive before Bower can tidy up.');
        return;
      }
      this.checkCurrent();
      const ids = new Map(bare.map((r) => [r.line.id, r.reserved]));
      this.keep(key, this.waiting(key).map((r) => (r.reserved === undefined && ids.has(r.line.id) ? { ...r, reserved: ids.get(r.line.id) } : r)));
    }
    const sent = new Set<string>();
    let refused = 0;
    for (const r of waiting) {
      this.checkCurrent();
      const out = await this.send(r);
      if (out !== 'later') sent.add(r.line.id);
      if (out === 'refused') refused++;
    }
    // Only what was sent, or ended as failed, leaves; anything added meanwhile stays.
    this.checkCurrent();
    this.keep(key, this.waiting(key).filter((r) => !sent.has(r.line.id)));
    // Told once: the line is gone from the outbox, so the next try does not say it again.
    if (refused && required) throw new BowerError('unknown', REFUSED_LINE);
    if (required && sent.size !== waiting.length) throw new BowerError('offline', 'Your changes must arrive before Bower can tidy up.');
  }

  /** Sends one line with the id reserved for it, reserved now when it has none and kept on `w` for a later try. */
  private async send(w: Waiting): Promise<'sent' | 'later' | 'refused'> {
    const rec = w.line;
    try {
      this.checkCurrent();
      const folder = await this.place.folder();
      this.checkCurrent();
      const text = `${JSON.stringify(rec)}\n`;
      w.reserved ??= (await this.drive.generateIds(1))[0];
      return await this.create(w, folder, text);
    } catch (e) {
      console.error(e);
      return 'later';
    }
  }

  private async create(w: Waiting, folder: string, text: string): Promise<'sent' | 'later' | 'refused'> {
    const rec = w.line;
    try {
      // Made by its reserved id (`spine/write-once.ts`): a lost answer is found again by that id, now or on a later try.
      const f = await makeText(this.drive, this.drive, { parent: folder, name: `${rec.id}.json`, ...(w.reserved ? { id: w.reserved } : {}) }, text);
      if (this.current()) {
        this.reads.wrote(f, text);
        this.filesOf.set(rec.id, [...(this.filesOf.get(rec.id) ?? []), f]);
        this.place.wrote?.(f);
      }
      return 'sent';
    } catch (e) {
      console.error(e);
      if (!refusedForGood(e)) return 'later';
      // Refused for good: the line ends as failed and its id is let go, never waiting for a try that cannot work.
      delete w.reserved;
      return 'refused';
    }
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
      // Sent once with its stamp: a lost answer is found again by reading the file by its id.
      await updateByStamp(this.drive, file, 'bin', (op) => this.drive.trash(file.id, op));
      this.place.removed?.(file.id);
    }
    this.filesOf.delete(id);
  }
}
