/**
 * The change journal (spec, "The change journal"): one small JSON file in
 * `.bower/changes/` for each thing you did in the app, so the next tidy-up
 * knows what happened and where to look. One file per change, so two
 * devices never write the same file; Drive cannot append. Files never
 * change once written, so normal reads are kept; acknowledging a waiting
 * copy always checks Drive afresh.
 */
import type { DriveApi, DriveFile } from '../drive/drive-api';
import type { ChangeEntry, ChangeKind } from '../types';
import { BowerError } from '../types';

export interface JournalExtra {
  path?: string;
  /** Where a move or rename came from. */
  from?: string;
  /** Your words: a rule, a request, an answer. */
  text?: string;
  questionId?: string;
  /** The Drive file the change is about, so the runner finds it whatever its path became. */
  fileId?: string;
  /** A rule taken out: its wording, as Rules.md has it. */
  removes?: string;
}

export type JournalRecord = ChangeEntry & JournalExtra & { v: 1; device: string };

export interface JournalPlace {
  /** The id of `.bower/changes/`, made if missing. */
  folder: () => Promise<string>;
  /** The Bower folder's id: whose journal this is. */
  owner: () => Promise<string>;
  /** All copies of the journal, before paths are disambiguated. A fresh
   * listing with archives also acknowledges a write processed elsewhere.
   */
  files: (fresh?: boolean, archived?: boolean) => Promise<DriveFile[]>;
  /** Told about each file the journal writes or bins, so a listing cache stays true. */
  wrote?: (f: DriveFile) => void;
  removed?: (id: string) => void;
  /** A change is kept only on this page; refresh the screen before reporting it. */
  waiting?: () => void;
}

const KINDS: readonly ChangeKind[] = ['rule', 'request', 'move', 'rename', 'create', 'trash', 'task', 'answer'];

export function isJournalRecord(v: unknown): v is JournalRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.v === 1 && typeof r.id === 'string' && !!r.id && typeof r.device === 'string' && !!r.device && typeof r.at === 'number' && Number.isFinite(r.at) && typeof r.what === 'string' && KINDS.includes(r.kind as ChangeKind) && ['path', 'from', 'text', 'questionId', 'fileId', 'removes'].every((key) => r[key] === undefined || typeof r[key] === 'string');
}

/** This device's unsent lines, per Bower folder, so one person's never reach another's. */
/** Where this device keeps a folder's change outbox (live sources read it to know lines wait). */
export const outboxKey = (folder: string): string => `bower:outbox:${folder}`;

function readOutbox(key: string): JournalRecord[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(v) || !v.every(isJournalRecord)) throw new Error('Unreadable change outbox');
    return v;
  } catch (e) {
    console.error(e);
    throw new BowerError('unknown', 'Bower cannot read your waiting changes; keep this page open.');
  }
}

function writeOutbox(key: string, recs: JournalRecord[]): boolean {
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
const volatile = new WeakMap<DriveApi, Map<string, JournalRecord[]>>();

export class Journal {
  private readonly volatile: Map<string, JournalRecord[]>;
  private read = new Map<string, JournalRecord | null>();
  /** Drive file ids per record id (a line written twice has two), for remove. */
  private filesOf = new Map<string, string[]>();
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
    this.volatile = volatile.get(memoryDrive) ?? new Map();
    volatile.set(memoryDrive, this.volatile);
  }

  private checkCurrent(): void {
    if (!this.current()) throw new BowerError('unknown', 'Bower is no longer open on this page.');
  }

  dispose(): void {
    this.read.clear();
    this.filesOf.clear();
    // Folder-keyed waiting records survive every session, including storage failures.
  }

  private waiting(key: string): JournalRecord[] {
    const byId = new Map(readOutbox(key).map((r) => [r.id, r]));
    for (const r of this.volatile.get(key) ?? []) byId.set(r.id, r);
    return [...byId.values()];
  }

  private keep(key: string, records: JournalRecord[]): boolean {
    // Memory is kept first: quota or blocked storage must never discard the current line.
    const previous = this.volatile.get(key) ?? [];
    this.volatile.set(key, records);
    if (!writeOutbox(key, records)) {
      // A failed removal did not take the change back; keep its memory copy too.
      const retained = new Map(previous.map((r) => [r.id, r]));
      for (const r of records) retained.set(r.id, r);
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
    // Capture the original owner before queue admission, including post-effect bookkeeping.
    const key = outboxKey(await this.place.owner());
    return this.serial(async () => {
      if (!this.current()) {
        if (extra.fileId && kind !== 'rule' && kind !== 'request' && kind !== 'answer') {
          let previous = this.volatile.get(key) ?? [];
          let readable = true;
          try { previous = this.waiting(key); } catch (e) { console.error(e); readable = false; }
          if (readable) this.keep(key, [...previous, rec]);
          else this.volatile.set(key, [...previous, rec]);
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
      if (!(await this.send(rec))) {
        let previous = this.volatile.get(key) ?? [];
        if (readable) {
          try { previous = this.waiting(key); } catch (e) { console.error(e); readable = false; }
        }
        const records = [...previous, rec];
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
    // A line whose answer was lost may be in Drive already: never write it twice. The folder
    // itself is asked (a cached listing never saw a file whose answer was lost).
    let there: DriveFile[];
    try {
      there = await this.place.files(true, true);
    } catch (e) {
      console.error(e);
      if (required) throw new BowerError('offline', 'Your changes must arrive before Bower can tidy up.');
      return;
    }
    const sent = new Set<string>();
    for (const r of waiting) {
      this.checkCurrent();
      const copies = there.filter((f) => f.name === `${r.id}.json`);
      for (const f of copies) {
        try {
          const v: unknown = JSON.parse(await this.drive.readText(f.id));
          if (!isJournalRecord(v)) throw new Error(`Unreadable change ${f.id}`);
          // Compare every stored field, independently of JSON key order and whitespace.
          const expected = new Map(Object.entries(r).filter(([, value]) => value !== undefined));
          const actual = Object.entries(v);
          if (actual.length !== expected.size || !actual.every(([key, value]) => expected.has(key) && expected.get(key) === value)) throw new Error(`Change ${f.id} does not match waiting change ${r.id}`);
        } catch (e) {
          console.error(e);
          throw new BowerError('unknown', 'Bower could not confirm your waiting changes.');
        }
      }
      if (copies.length || (await this.send(r))) sent.add(r.id);
    }
    // Only what was sent leaves; anything added meanwhile stays.
    this.checkCurrent();
    this.keep(key, this.waiting(key).filter((r) => !sent.has(r.id)));
    if (required && sent.size !== waiting.length) throw new BowerError('offline', 'Your changes must arrive before Bower can tidy up.');
  }

  private async send(rec: JournalRecord): Promise<boolean> {
    try {
      this.checkCurrent();
      const folder = await this.place.folder();
      this.checkCurrent();
      const f = await this.drive.createText(folder, `${rec.id}.json`, `${JSON.stringify(rec)}\n`);
      if (this.current()) {
        this.read.set(f.id, rec);
        this.filesOf.set(rec.id, [...(this.filesOf.get(rec.id) ?? []), f.id]);
        this.place.wrote?.(f);
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  /** Every change since the last tidy-up, oldest first, each once (Drive and this device's outbox). */
  async list(): Promise<JournalRecord[]> {
    this.checkCurrent();
    const key = outboxKey(await this.place.owner());
    const files = (await this.place.files()).filter((f) => !f.folder && f.name.endsWith('.json'));
    const byId = new Map<string, JournalRecord>();
    const seenFiles = new Map<string, string[]>();
    for (const f of files) {
      if (!this.read.has(f.id)) {
        let rec: JournalRecord;
        try {
          const v: unknown = JSON.parse(await this.drive.readText(f.id));
          if (!isJournalRecord(v)) throw new BowerError('unknown', 'Bower could not read your changes.');
          rec = v;
        } catch (e) {
          console.error(e);
          if (e instanceof SyntaxError) throw new BowerError('unknown', 'Bower could not read your changes.');
          throw e;
        }
        this.checkCurrent();
        this.read.set(f.id, rec);
      }
      const rec = this.read.get(f.id);
      if (rec) {
        byId.set(rec.id, rec);
        seenFiles.set(rec.id, [...(seenFiles.get(rec.id) ?? []), f.id]);
      }
    }
    this.checkCurrent();
    for (const [rid, ids] of seenFiles) this.filesOf.set(rid, ids);
    for (const r of this.waiting(key)) if (!byId.has(r.id)) byId.set(r.id, r);
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
    if (waiting.some((r) => r.id === id) && !this.keep(key, waiting.filter((r) => r.id !== id))) {
      this.volatile.set(key, waiting);
      throw new BowerError('unknown', 'Bower could not take that change back; keep this page open.');
    }
    if (!this.filesOf.has(id)) await this.list();
    for (const fileId of this.filesOf.get(id) ?? []) {
      this.checkCurrent();
      await this.drive.trash(fileId);
      this.place.removed?.(fileId);
      this.read.delete(fileId);
    }
    this.filesOf.delete(id);
  }
}
