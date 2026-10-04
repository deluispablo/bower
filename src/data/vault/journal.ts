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
}

export type JournalRecord = ChangeEntry & JournalExtra & { v: 1; device: string };

export interface JournalPlace {
  /** The id of `.bower/changes/`, made if missing. */
  folder: () => Promise<string>;
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

export class Journal {
  private read = new Map<string, JournalRecord | null>();
  /** Drive file id per record id, for remove. */
  private fileOf = new Map<string, string>();
  /** Two changes in one millisecond still keep their order. */
  private lastAt = 0;

  constructor(
    private readonly drive: DriveApi,
    private readonly place: JournalPlace,
    private readonly device: string,
  ) {}

  async record(kind: ChangeKind, what: string, extra: JournalExtra = {}): Promise<JournalRecord> {
    const at = (this.lastAt = Math.max(Date.now(), this.lastAt + 1));
    const id = `${new Date(at).toISOString().replace(/:/g, '-')}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    const rec: JournalRecord = { v: 1, id, at, kind, what, device: this.device, ...extra };
    const write = async (): Promise<DriveFile> => this.drive.createText(await this.place.folder(), `${id}.json`, `${JSON.stringify(rec)}\n`);
    // The change itself is done in Drive: try its line twice before saying it failed.
    const f = await write().catch((e: unknown) => {
      console.error(e);
      return write();
    });
    this.read.set(f.id, rec);
    this.fileOf.set(id, f.id);
    this.place.wrote?.(f);
    return rec;
  }

  /** Every change since the last tidy-up, oldest first. */
  async list(): Promise<JournalRecord[]> {
    const files = (await this.place.files()).filter((f) => !f.folder && f.name.endsWith('.json'));
    const out: JournalRecord[] = [];
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
        out.push(rec);
        this.fileOf.set(rec.id, f.id);
      }
    }
    return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }

  /** Takes a change back (an Undo): its file goes to the Bin. */
  async remove(id: string): Promise<void> {
    if (!this.fileOf.has(id)) await this.list();
    const fileId = this.fileOf.get(id);
    if (!fileId) return;
    await this.drive.trash(fileId);
    this.place.removed?.(fileId);
    this.fileOf.delete(id);
    this.read.delete(fileId);
  }
}
