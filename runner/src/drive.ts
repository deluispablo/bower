/**
 * The runner's fenced Drive: `FencedDrive` on real Drive, built on the one Drive
 * transport (`DriveHttp`, headless: its token refresh, retry policy, errors and
 * wire type) with Node's `fetch` and the run ticket's token route (TL-P3-19).
 * What is left here is the fence and the attempt check.
 *
 * Two checks guard every write, and both are PRECHECKS, NOT COMPARE-AND-SWAP
 * (ARCHITECTURE, "Safety at the actual storage boundary"):
 *
 * - Still as seen: right before each write, the target (or, for a create, its
 *   folder; for a move, the folder it goes into too) is read again and compared
 *   with what this run read (`SeenFiles`).
 *   Drive v3 has no conditional write on files, so another client can still
 *   change the file in the window between that read and the write; the
 *   window is kept short (each write has its own fence) but it is not closed.
 * - Attempt: at each write batch (`batch()`) and again right before each
 *   fenced write, the token route is asked again and its `attempt` must equal
 *   this runner's (TL-P3-23). An old attempt woken after a takeover sends no
 *   write; only a takeover inside the window between that read and the write
 *   itself can still let one land (a precheck, not a lock), and that attempt's
 *   next status report is refused (409 `stale-attempt`).
 *
 * Every write is confirmed by its own answer, which carries the stored content's
 * checksums (`DriveHttp`, `spine/write-once.ts`); nothing is kept of it here.
 *
 * Faults for tests come through the fetch: `fault` sees each fenced write's
 * request once, as the fake's `FaultHook` does (`refuse`: nothing is sent;
 * `lose-reply`: the write lands, then its answer is lost).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { POOL } from '../../src/data/spine/schedule';
import { BowerError } from '../../src/data/types';
import type { DriveFile, DrivePatch, FaultAction, Fence, FaultHook, FencedCall, FencedDrive, RunDrive, StoredEvidence } from '../../src/data/drive/drive-api';
import type { Pacing } from '../../src/data/drive/transport';
import { DriveHttp, FIELDS, quote, toFile, type WireFile } from '../../src/data/drive/drive-http';
import type { SpineRead } from '../../src/data/spine/plan';
import type { AdmissionScope } from '../../src/data/spine/admission';
import { admissionRead, limiter, type AdmissionRead } from '../../src/data/spine/read';
import { sha256 } from '../../src/data/contracts/hashes';
import { ReadCache } from '../../src/data/drive/read-cache';
import { destinationOf, SeenFiles, targetOf, type FenceTarget, type StoredNow } from '../../src/data/drive/seen-files';
import { staleAttempt, type RunnerToken } from './token';
import { LedgerExhausted, type RunTiming } from './timing';
import { decodePrefix } from '../../src/data/drive/drive-api';
import { indexedFront, type IndexedFront } from '../../src/data/contracts/note-format';

export interface RunnerDriveOptions {
  token: RunnerToken;
  /** This runner's attempt, from its dispatch. */
  attempt: number;
  fetch?: typeof fetch;
  /** The transport's waits between tries; the real backoff when absent. */
  pacing?: Partial<Pacing>;
  /** Counts each Drive call and its bytes under the phase running (`timing.ts`). */
  timing?: RunTiming;
}

const API = 'https://www.googleapis.com/drive/v3';
/** Ids reserved at once for a run's creates: C04 makes 17 (records and things), so one request covers a run. */
const ID_POOL = 50;
/** What one of this run's own writes did to a folder listing: the file as Drive answered, or the file put in the Bin. */
export type Change = { file: DriveFile } | { gone: string };
type PlanningRead = Omit<SpineRead, 'listAll'> & { scope: AdmissionScope; listAll(rootId: string, opts?: { readAhead: boolean }): Promise<DriveFile[]>; indexedFront(file: DriveFile): Promise<IndexedFront | undefined>; handoff(rootId: string, files: readonly DriveFile[]): void };

export class RunnerDrive implements RunDrive {
  readonly provenance = 'adapter-read';
  /** Sees, and may refuse or lose the reply of, every fenced write. */
  fault: FaultHook | null = null;
  private readonly http: DriveHttp;
  private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  private readonly token: RunnerToken;
  private readonly attempt: number;
  private readonly seen = new SeenFiles();
  private readonly writes: FencedDrive;
  /** The fenced write whose request is in flight, and what the fault hook said of it. */
  private readonly current = new AsyncLocalStorage<{ call: FencedCall; action: FaultAction | null; answered: boolean }>();
  private readonly limit = limiter(POOL);
  /** Rises when a fenced write is about to be sent and again when it ends: a listing read at one value is current at it. */
  generation = 0;
  /** How many fenced writes have requests out now. */
  private writing = 0;
  /** Each fenced write that ended, with the generation it ended at: what it did (null: not known, e.g. a lost answer). */
  private readonly ended: Array<{ end: number; change: Change | null }> = [];
  /** What the plan read of each file, by id and the modifiedTime its listing gave (the one read cache, `read-cache.ts`). */
  private readonly reads = new ReadCache();
  private planning: PlanningRead | undefined;
  /** Ids Drive reserved for this attempt's creates and not used yet (`reserve`). */
  private readonly ids: string[] = [];
  /** The record folders this run made (`ownFolder`). */
  private readonly records = new Set<string>();

  constructor(opts: RunnerDriveOptions) {
    this.token = opts.token;
    this.attempt = opts.attempt;
    const send = opts.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
    this.fetchFn = opts.timing ? opts.timing.meter(send) : send;
    // Headless: a request with no answer is never worded as offline; a lost write's answer is still read back (`isNoAnswer`).
    this.http = new DriveHttp({ token: (fresh) => this.token.token(fresh), fetch: (url, init) => this.hooked(url, init), context: 'headless', ...(opts.pacing ? { pacing: opts.pacing } : {}) });
    this.writes = {
      // One reservation for this attempt's creates, records and things alike, after the attempt is read again (a fenced
      // write); the transport asks Drive at most 1000 ids a request (`DriveHttp.generateIds`). An id left unused names
      // nothing, and none outlives the attempt.
      generateIds: async (count) => {
        if (this.ids.length < count) {
          await this.seen.read(this.stillCurrent());
          this.ids.push(...(await this.http.generateIds(Math.max(count, ID_POOL))));
        }
        return this.ids.splice(0, count);
      },
      createFolder: (parentId, name, appProperties, id) =>
        this.fenced({ op: 'create-folder', parentId, name, ...(appProperties ? { appProperties } : {}), ...(id ? { reserved: id } : {}) }, () => this.http.createFolder(parentId, name, appProperties, id)),
      createText: (parentId, name, text, appProperties, id) =>
        this.fenced({ op: 'create-text', parentId, name, text, ...(appProperties ? { appProperties } : {}), ...(id ? { reserved: id } : {}) }, () => this.http.createText(parentId, name, text, appProperties, id)),
      update: (id: string, patch: DrivePatch) => this.fenced({ op: 'update', id, patch }, (fence) => this.http.update(id, patch, { fence })),
      trash: (id, appProperties) => this.fenced({ op: 'trash', id, ...(appProperties ? { appProperties } : {}) }, (fence) => this.http.trash(id, appProperties, { fence })),
      writeText: (id, text, ifModified, appProperties) =>
        this.fenced({ op: 'write-text', id, text, ifModified, ...(appProperties ? { appProperties } : {}) }, (fence, peeked) =>
          this.http.writeText(id, text, ifModified, appProperties, { fence, ...(peeked?.id === id ? { current: peeked } : {}) })),
    };
  }

  /**
   * The writes of one batch, after the attempt route confirms this runner's
   * attempt is still the current one. Call it again for each batch.
   */
  async batch(): Promise<FencedDrive> {
    await this.stillCurrent();
    return this.seen.wrap(this.writes);
  }

  /**
   * The same fenced writes with no attempt read of their own: for a write whose caller ran `batch()` moments before (or
   * has no other read to guard), since every fenced write reads the attempt again right before it is sent.
   */
  fencedWrites(): FencedDrive {
    return this.seen.wrap(this.writes);
  }

  /**
   * What this runner's own writes did since a listing was taken at `generation`, in order, so the listing can be
   * brought up to date from their answers instead of being read again. Null when it cannot be: a write is out now, or
   * one ended with no answer (a lost reply, a refusal), so what Drive holds is not known.
   */
  changesSince(generation: number): Change[] | null {
    if (this.writing) return null;
    const out: Change[] = [];
    for (const w of this.ended) {
      if (w.end <= generation) continue;
      if (!w.change) return null;
      out.push(w.change);
    }
    return out;
  }

  /**
   * The Worker's attempt is still this runner's; otherwise a newer attempt took the run over. Asked of the light
   * attempt route, which fetches no token (TL-P4-04); the Drive token is kept until near its expiry (`token.ts`).
   */
  private async stillCurrent(): Promise<void> {
    const current = await this.token.attempt();
    if (current !== this.attempt) {
      console.error(`Attempt ${this.attempt} was taken over by attempt ${current}`);
      throw staleAttempt();
    }
  }

  // --- Evidence reads: each file read is what later writes are checked against. ---

  /** A record folder as this runner made it, kept in the one read cache by id and modifiedTime (`read-cache.ts`). */
  private kept(id: string): Promise<DriveFile> | undefined {
    return this.reads.keptFile<DriveFile>({ id, modifiedTime: this.seen.version(id) });
  }

  /**
   * One of this run's own record folders (`.bower/runs`, the run's folder), as its create answered: it stands for the
   * read the fence would make before a record goes into it, since only Bower writes there. Every other folder a create
   * or a move goes into, one this run made for the person's things too, is read from Drive right before the write.
   */
  private async ownFolder(id: string): Promise<StoredNow | null> {
    const kept = this.records.has(id) ? this.kept(id) : undefined;
    return kept ? { file: await kept, trashed: false } : null;
  }

  /** A file as it is now for an effect's check, read from Drive; null when it is gone or in the Bin. */
  async recheck(id: string): Promise<DriveFile | null> {
    try {
      return await this.get(id);
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
  }

  async get(id: string, opts?: { checksums?: boolean; binned?: boolean }): Promise<DriveFile> {
    return this.seen.note(await this.http.get(id, opts));
  }

  /**
   * What the plan saw of a file an effect changes, as the fence must find it right before the send: its name and place
   * (a move, a Bin) and, with `withTime`, its modifiedTime too (a content write, which carries it).
   */
  expectSeen(seenByPlan: { fileId: string; name: string; parents: string[]; folder: boolean; modifiedTime: string }, withTime = false): void {
    this.seen.expectPlace({ id: seenByPlan.fileId, name: seenByPlan.name, parents: seenByPlan.parents, folder: seenByPlan.folder, modifiedTime: seenByPlan.modifiedTime, createdTime: '' }, withTime);
  }

  /** A folder's live children, every page. */
  async list(parentId: string): Promise<DriveFile[]> {
    return (await this.http.query(`${quote(parentId)} in parents and trashed = false`)).map((f) => this.seen.note(f));
  }

  getStartPageToken(): Promise<string> { return this.http.getStartPageToken(); }
  listChanges(token: string) { return this.http.listChanges(token); }
  listAll(rootId: string): Promise<DriveFile[]> { return this.http.listAll(rootId, { checksums: true }); }
  /** Warm listed versions need only Range media; cold discovery retains the metadata precheck. */
  readPrefix(file: DriveFile, cold = false): Promise<string | null> {
    return this.reads.prefix(file, async () => {
      const text = this.reads.keptText(file);
      return text ? decodePrefix(new TextEncoder().encode(await text)) : this.http.readPrefix(file.id, { precheck: cold });
    });
  }

  /** Reuse this exact version's ordinary index prefix or provider text; never discover by fetching. */
  keptPrefix(file: DriveFile): Promise<string | null> | undefined {
    const prefix = this.reads.keptPrefix(file);
    if (prefix) return prefix;
    const text = this.reads.keptText(file);
    return text?.then((value) => decodePrefix(new TextEncoder().encode(value)));
  }

  /** Maintenance shares the planner's versioned content; live fence reads remain fresh. */
  readListedText(file: DriveFile): Promise<string> {
    return this.reads.text(file, () => this.http.readText(file.id));
  }

  async readText(id: string): Promise<string> {
    return this.http.readText(id);
  }

  /**
   * The plan's reads: the shared Drive reads of the Worker's admission (`spine/read.ts` `admissionRead`, TL-P4-04) over
   * this adapter's Drive. Reads only; a plan is fixed before any write, and every write later reads its target again (`get`).
   *
   * - **One listing per level of folders,** with `sha256Checksum` among the fields (Drive v3, partial responses via `fields`:
   *   https://developers.google.com/workspace/drive/api/guides/fields-parameter and "Improve performance",
   *   https://developers.google.com/workspace/drive/api/guides/performance), so a file's stored size and hash come from the
   *   listing and not from one `files.get` each.
   * - **The files the plan will read are started together,** at most `READ_AHEAD` (8) at a time, once the folder is
   *   listed; the plan then takes each from here. Which files depend on the run's `scope`, set by the provider.
   * - **Each file read once per version** (`read-cache.ts`): its text, bytes and digest are kept by id and the
   *   modifiedTime the latest listing gave, however long the plan takes (a model's turn takes minutes). The listing is
   *   kept until this runner sends a write (`generation`), then read again; a file it shows changed is read afresh.
   *   Nothing here stands in for the fence's read before a write (`fenced`).
   */
  planReads(): PlanningRead {
    if (this.planning) return this.planning;
    let listed: { generation: number; scope: AdmissionScope; reads: AdmissionRead; listings: Map<string, Promise<DriveFile[]>>; warmed: Set<string> } | null = null;
    /** The modifiedTime each file had in the latest listing: the version its reads are kept under. */
    const versions = new Map<string, string>();
    const at = (id: string): { id: string; modifiedTime: string | undefined } => ({ id, modifiedTime: versions.get(id) });
    const reader = (): AdmissionRead => admissionRead({
      listAll: (rootId, opts) => this.http.listAll(rootId, opts),
      readText: (id) => this.reads.text(at(id), () => this.http.readText(id)),
      readBytes: async (id) => {
        const version = at(id);
        const bytes = await this.reads.bytes(version, () => this.http.readBytes(id));
        void this.reads.prefix(version, () => Promise.resolve(decodePrefix(bytes)));
        return bytes;
      },
      get: (id, opts) => this.http.get(id, opts),
      getUploaded: (id) => this.http.getUploaded(id),
      binnedByItem: (rootId, keys, budget) => this.http.binnedByItem(rootId, keys, budget),
    }, out.scope, undefined, (error) => error instanceof LedgerExhausted);
    const current = (): NonNullable<typeof listed> => {
      if (!listed || listed.generation !== this.generation) listed = { generation: this.generation, scope: out.scope, reads: reader(), listings: new Map(), warmed: new Set() };
      return listed;
    };
    const out: PlanningRead = {
      scope: 'all',
      handoff: (rootId, files) => {
        const now = current();
        // Reset admission's id-only read-ahead; full bodies still reuse the one versioned ReadCache.
        now.reads = reader();
        now.scope = out.scope;
        now.listings.set(rootId, Promise.resolve([...files]));
        now.warmed.delete(rootId);
        versions.clear();
        for (const file of files) versions.set(file.id, file.modifiedTime);
      },
      indexedFront: async (file) => {
        const text = await this.keptPrefix(file);
        return text === undefined || text === null ? undefined : indexedFront(text);
      },
      listAll: async (rootId, opts) => {
        const now = current();
        let listing = now.listings.get(rootId);
        if (!listing) {
          listing = now.reads.listAll(rootId, { readAhead: false });
          now.listings.set(rootId, listing);
          listing.then((files) => { for (const f of files) versions.set(f.id, f.modifiedTime); }, () => now.listings.delete(rootId));
        }
        const files = await listing;
        if (opts?.readAhead !== false && !now.warmed.has(rootId)) {
          // The metadata probe ran before scope aiming; warm the same listing under the provider's scope.
          if (now.scope !== out.scope) {
            now.reads = reader();
            now.scope = out.scope;
          }
          now.reads.warmListing(rootId, files);
          now.warmed.add(rootId);
        }
        return [...files];
      },
      readBytes: (id) => current().reads.readBytes(id),
      readText: (id) => current().reads.readText(id),
      // By version: a file changed since (a newer modifiedTime in the listing) is never paired with an older digest.
      digest: (file) => this.reads.digest(file, () => current().reads.digest(file)),
      // The Bin is asked fresh each time, only for a declared member missing from the listing.
      binnedByItem: (rootId, keys) => current().reads.binnedByItem(rootId, keys),
      // Asked fresh, only for a pair note gone from the listing when its answered row is made.
      binned: (id) => current().reads.binned(id),
      // The plan's own hint that it is about to read these: started together, kept for the reads that follow. A read
      // that fails here is met again, as it failed, by the read of its own.
      warm: (wanted) => {
        for (const w of wanted) {
          if (w.as === 'text') void out.readText(w.id).catch(() => undefined);
          else void out.readBytes(w.id).catch(() => undefined);
        }
      },
    };
    this.planning = out;
    return out;
  }

  /**
   * What Drive stores for a file now, as evidence of an effect: its metadata, whether it is in the Bin, and its
   * content's size and SHA-256 (`sha256Checksum`, or the bytes read when Drive keeps none). Null when it is gone.
   */
  async evidence(id: string): Promise<StoredEvidence | null> {
    let w: WireFile;
    try {
      w = (await this.read(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS},sha256Checksum`)) as typeof w;
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
    // The checksum goes in the evidence, not on the file, as before.
    const file = toFile({ ...w, sha256Checksum: undefined });
    this.seen.note(file);
    if (file.folder) return { file, trashed: w.trashed === true, content: null };
    if (w.sha256Checksum !== undefined && file.size !== undefined) return { file, trashed: w.trashed === true, content: { size: file.size, sha256: w.sha256Checksum } };
    const bytes = await this.http.readBytes(id);
    return { file, trashed: w.trashed === true, content: { size: bytes.byteLength, sha256: await sha256(new Blob([bytes.slice()])) } };
  }

  /** The bytes of a file. */
  async readBytes(id: string): Promise<Uint8Array> {
    return this.http.readBytes(id);
  }

  /**
   * One fenced write: at most POOL at once, each after its own still-as-seen read. A write to a file that exists gets the same fence
   * for the transport (`WriteOptions`), which runs it again right before any resend, so a takeover or a change during
   * a rate limit's wait sends nothing more (TL-P4-24 finding 1). A create by its reserved id is resent as it is.
   */
  private fenced(call: FencedCall, write: (fence: Fence, peeked: DriveFile | null) => Promise<DriveFile>): Promise<DriveFile> {
    return this.limit(() => this.current.run({ call, action: null, answered: false }, async () => {
      // The attempt again, right before this write: a runner that stalled after its batch began and woke after a
      // takeover sends nothing more (TL-P3-23).
      // and the target read again (still as seen). Both must pass before anything is sent; neither waits for the other.
      const target = targetOf(call);
      // Every read of the fence goes through the one cannot-read handling (`SeenFiles.read`): a read that gets no
      // answer is no change found, thrown as not read, so the attempt stops for recovery.
      const into = destinationOf(call);
      let peeked: DriveFile | null = null;
      const fence: Fence = async () => {
        const { now, intoNow } = await this.seen.read(this.fenceReads(target, into));
        if (into) this.seen.assert(into, intoNow);
        this.seen.assert(target, now);
        peeked = now?.file ?? null;
      };
      await fence();
      this.generation++;
      this.writing++;
      let change: Change | null = null;
      try {
        const answer = await write(fence, peeked);
        change = call.op === 'trash' ? { gone: call.id } : { file: answer };
        if (call.op !== 'trash') {
          // Noted here too, before a later write asks: the wrap notes it only after this promise has resolved.
          this.seen.note(answer);
          // A record folder this run made (a folder with no create key of the person's), kept by the version its create answered.
          if (call.op === 'create-folder' && call.appProperties?.bowerItem === undefined) {
            this.reads.keep(answer);
            this.records.add(answer.id);
          }
        }
        return answer;
      } finally {
        this.writing--;
        this.generation++;
        this.ended.push({ end: this.generation, change });
      }
    }));
  }

  /**
   * The fence's reads, right before the send, never from an earlier read: the attempt, the target, and the folder a
   * move goes into. Only a record going into one of this run's own record folders takes that folder as its create
   * answered (`ownFolder`).
   */
  private async fenceReads(target: FenceTarget, into: FenceTarget | null): Promise<{ now: StoredNow | null; intoNow: StoredNow | null }> {
    const own = target.part === 'parent' ? await this.ownFolder(target.id) : null;
    const [, now, intoNow] = await Promise.all([this.stillCurrent(), own ?? this.peek(target.id), into ? this.peek(into.id) : null]);
    return { now, intoNow };
  }

  private async peek(id: string): Promise<StoredNow | null> {
    try {
      return { file: await this.http.get(id), trashed: false };
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
  }

  /** The fetch `DriveHttp` uses: a fenced write's own request meets the fault hook once. */
  private async hooked(url: string, init?: RequestInit): Promise<Response> {
    const now = this.current.getStore();
    // Reads, and writes outside a fence, go as they are: the transport bounds, retries and words them (`transport.ts`).
    if ((init?.method ?? 'GET').toUpperCase() === 'GET' || !now || now.answered) return this.fetchFn(url, init);
    now.action ??= this.fault?.before?.(now.call) ?? 'pass';
    // A TypeError is how fetch fails with no network; the transport reads it as no answer (`isNoAnswer`).
    if (now.action === 'refuse') throw new TypeError('A fault refused this write.');
    const res = await this.fetchFn(url, init);
    // Any refusal goes back as Drive gave it: the transport's one table tells its kind (a 5xx write is unconfirmed).
    if (!res.ok) return res;
    now.answered = true;
    this.fault?.applied?.(now.call);
    if (now.action === 'lose-reply') throw new TypeError('A fault lost the answer to this write.');
    return res;
  }

  /** A read through the transport: the token, its one refresh, the retry policy and the error mapping (`DriveHttp.call`). */
  private async read(url: string): Promise<unknown> {
    return (await this.http.call(url)).json();
  }
}
