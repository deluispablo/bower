/**
 * The change journal (spec, "The change journal"): one small JSON file in
 * `.bower/changes/` for each thing you did in the app, so the next tidy-up
 * knows what happened and where to look. One file per change, so two
 * devices never write the same file; Drive cannot append. Files never
 * change once written, so each is read once and kept.
 */
import type { DriveApi, DriveFile } from '../drive/drive-api';
import type { ChangeEntry, ChangeKind } from '../types';

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
  /** The files in it now (not its archive). */
  files: () => Promise<DriveFile[]>;
  /** Told about each file the journal writes or bins, so a listing cache stays true. */
  wrote?: (f: DriveFile) => void;
  removed?: (id: string) => void;
}

const KINDS: readonly ChangeKind[] = ['rule', 'request', 'move', 'rename', 'create', 'trash', 'task', 'answer'];

function isRecord(v: unknown): v is JournalRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.v === 1 && typeof r.id === 'string' && typeof r.at === 'number' && typeof r.what === 'string' && KINDS.includes(r.kind as ChangeKind);
}

/** This device's unsent lines, per Bower folder, so one person's never reach another's. */
const outboxKey = (folder: string): string => `bower:outbox:${folder}`;

function readOutbox(key: string): JournalRecord[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter(isRecord) : [];
  } catch {
    // expected: no storage, or an old shape; nothing waits to be sent.
    return [];
  }
}

function writeOutbox(key: string, recs: JournalRecord[]): void {
  try {
    if (recs.length) localStorage.setItem(key, JSON.stringify(recs));
    else localStorage.removeItem(key);
  } catch (e) {
    console.error(e);
  }
}

export class Journal {
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
  ) {}

  /**
   * Writes the line of a change already done in Drive. When Drive does not
   * answer, the line waits in this device's outbox and goes with the next
   * one; the change is never reported as failed for its line alone.
   */
  async record(kind: ChangeKind, what: string, extra: JournalExtra = {}): Promise<JournalRecord> {
    const at = (this.lastAt = Math.max(Date.now(), this.lastAt + 1));
    const id = `${new Date(at).toISOString().replace(/:/g, '-')}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    const rec: JournalRecord = { v: 1, id, at, kind, what, device: this.device, ...extra };
    return this.serial(async () => {
      await this.acrossTabs(() => this.sendWaiting());
      const key = outboxKey(await this.place.owner());
      if (!(await this.send(rec))) writeOutbox(key, [...readOutbox(key), rec]);
      return rec;
    });
  }

  /** Sends what waits in the outbox (before a tidy-up, back online, at start); what still cannot go stays. */
  flush(): Promise<void> {
    return this.serial(() => this.acrossTabs(() => this.sendWaiting()));
  }

  /** Two tabs of this browser share one outbox: one sends it at a time (Web Locks, where the browser has them). */
  private async acrossTabs<T>(work: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return work();
    return locks.request(outboxKey(await this.place.owner()), work);
  }

  private async sendWaiting(): Promise<void> {
    const key = outboxKey(await this.place.owner());
    const waiting = readOutbox(key);
    if (!waiting.length) return;
    // A line whose answer was lost may be in Drive already: never write it twice. The folder
    // itself is asked (a cached listing never saw a file whose answer was lost).
    let there: Set<string>;
    try {
      there = new Set((await this.drive.listAll(await this.place.folder())).map((f) => f.name));
    } catch (e) {
      console.error(e);
      return;
    }
    const sent = new Set<string>();
    for (const r of waiting) if (there.has(`${r.id}.json`) || (await this.send(r))) sent.add(r.id);
    // Only what was sent leaves; anything added meanwhile stays.
    writeOutbox(key, readOutbox(key).filter((r) => !sent.has(r.id)));
  }

  private async send(rec: JournalRecord): Promise<boolean> {
    try {
      const f = await this.drive.createText(await this.place.folder(), `${rec.id}.json`, `${JSON.stringify(rec)}\n`);
      this.read.set(f.id, rec);
      this.filesOf.set(rec.id, [...(this.filesOf.get(rec.id) ?? []), f.id]);
      this.place.wrote?.(f);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  /** Every change since the last tidy-up, oldest first, each once (Drive and this device's outbox). */
  async list(): Promise<JournalRecord[]> {
    const files = (await this.place.files()).filter((f) => !f.folder && f.name.endsWith('.json'));
    const byId = new Map<string, JournalRecord>();
    const seenFiles = new Map<string, string[]>();
    for (const f of files) {
      if (!this.read.has(f.id)) {
        let rec: JournalRecord | null = null;
        try {
          const v: unknown = JSON.parse(await this.drive.readText(f.id));
          rec = isRecord(v) ? v : null;
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
        this.read.set(f.id, rec);
      }
      const rec = this.read.get(f.id);
      if (rec) {
        byId.set(rec.id, rec);
        seenFiles.set(rec.id, [...(seenFiles.get(rec.id) ?? []), f.id]);
      }
    }
    for (const [rid, ids] of seenFiles) this.filesOf.set(rid, ids);
    for (const r of readOutbox(outboxKey(await this.place.owner()))) if (!byId.has(r.id)) byId.set(r.id, r);
    return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }

  /** Takes a change back (an Undo): its file goes to the Bin, or it leaves the outbox. */
  remove(id: string): Promise<void> {
    return this.serial(() => this.removeNow(id));
  }

  private async removeNow(id: string): Promise<void> {
    const key = outboxKey(await this.place.owner());
    const waiting = readOutbox(key);
    if (waiting.some((r) => r.id === id)) writeOutbox(key, waiting.filter((r) => r.id !== id));
    if (!this.filesOf.has(id)) await this.list();
    for (const fileId of this.filesOf.get(id) ?? []) {
      await this.drive.trash(fileId);
      this.place.removed?.(fileId);
      this.read.delete(fileId);
    }
    this.filesOf.delete(id);
  }
}
